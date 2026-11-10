/* =============================================
   G-TEC BLOG SYSTEM — blog.js
   Public viewing + admin login (server-verified)
   Admin CRUD is enforced by the server API.
   ============================================= */

'use strict';

// ---- API endpoints ----
const API = {
  blogs:   '/api/blogs',
  login:   '/api/admin/login',
  logout:  '/api/admin/logout',
  session: '/api/admin/session'
};

// ---- Secret admin access ----
// 1) Press Ctrl + Alt + A on the blog page, OR
// 2) Open the blog page with  #admin  in the URL (e.g. blog.html#admin).
// Normal visitors never see any login button.
const ADMIN_SHORTCUT = { code: 'KeyA', ctrl: true, alt: true };

// ---- State ----
let isAdmin = false;
let blogs = [];
let filteredBlogs = [];
let editingPostId = null;
let deletingPostId = null;
let activeCategory = 'All';
let searchQuery = '';

// ---- DOM References ----
const $ = id => document.getElementById(id);

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await checkSession();
  await loadBlogs();
  maybeOpenFromUrl();
  applyFilters();
  updateStats();
});

// Open the hidden login when the URL contains #admin or ?admin=1
function maybeOpenFromUrl() {
  const hash = (location.hash || '').toLowerCase();
  let query = '';
  try { query = (new URLSearchParams(location.search).get('admin') || '').toLowerCase(); } catch (e) { query = ''; }
  if (hash === '#admin' || query === '1' || query === 'true') {
    openLoginModal();
  }
}

// ---- Load posts from the server ----
async function loadBlogs() {
  try {
    const res = await fetch(API.blogs, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    blogs = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Could not load blog posts:', err);
    blogs = [];
    showToast('Blog posts are temporarily unavailable. Please try again shortly.', 'error');
  }
}

// ---- Session Management (server-verified) ----
async function checkSession() {
  try {
    const res = await fetch(API.session, { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = await res.json();
    if (data.authenticated) {
      isAdmin = true;
      setAdminUI(true);
    }
  } catch (err) {
    // Server unreachable — stay in normal visitor mode.
  }
}

function setAdminUI(on) {
  document.body.classList.toggle('is-admin', on);
  const adminBar = $('adminBar');
  if (adminBar) adminBar.classList.toggle('visible', on);
}

function showAdminMode() {
  setAdminUI(true);
  renderBlogGrid();
}

function hideAdminMode() {
  setAdminUI(false);
  renderBlogGrid();
}

// ---- Event Bindings ----
function bindEvents() {
  // Login trigger (only if a trigger element exists — hidden by default)
  const loginTrigger = $('adminLoginTrigger');
  if (loginTrigger) loginTrigger.addEventListener('click', openLoginModal);

  // Login modal close
  const loginClose = $('adminLoginClose');
  if (loginClose) loginClose.addEventListener('click', closeLoginModal);

  // Login form submit
  const loginForm = $('adminLoginForm');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  // Close modals on overlay click
  const loginOverlay = $('adminLoginOverlay');
  if (loginOverlay) loginOverlay.addEventListener('click', e => {
    if (e.target === loginOverlay) closeLoginModal();
  });

  const postOverlay = $('blogPostOverlay');
  if (postOverlay) postOverlay.addEventListener('click', e => {
    if (e.target === postOverlay) closeReadModal();
  });

  const writeOverlay = $('blogWriteOverlay');
  if (writeOverlay) writeOverlay.addEventListener('click', e => {
    if (e.target === writeOverlay) closeWriteModal();
  });

  // Admin bar buttons
  const newPostBtn = $('btnNewPost');
  if (newPostBtn) newPostBtn.addEventListener('click', () => openWriteModal(null));

  const logoutBtn = $('btnLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  // Write modal close & cancel
  const writeClose = $('blogWriteClose');
  if (writeClose) writeClose.addEventListener('click', closeWriteModal);

  const cancelWrite = $('cancelWriteBtn');
  if (cancelWrite) cancelWrite.addEventListener('click', closeWriteModal);

  // Featured image upload
  const imageInput = $('postImageFile');
  if (imageInput) imageInput.addEventListener('change', handleImageSelect);

  const imageRemove = $('blogImageRemove');
  if (imageRemove) imageRemove.addEventListener('click', clearImagePreview);

  // Post form submit
  const postForm = $('blogPostForm');
  if (postForm) postForm.addEventListener('submit', handlePostSubmit);

  // Read modal close
  const closeRead = $('closeReadBtn');
  if (closeRead) closeRead.addEventListener('click', closeReadModal);

  // Delete confirm
  const confirmDelete = $('confirmDeleteBtn');
  if (confirmDelete) confirmDelete.addEventListener('click', executeDelete);

  const cancelDelete = $('cancelDeleteBtn');
  if (cancelDelete) cancelDelete.addEventListener('click', closeConfirmModal);

  const confirmOverlay = $('blogConfirmOverlay');
  if (confirmOverlay) confirmOverlay.addEventListener('click', e => {
    if (e.target === confirmOverlay) closeConfirmModal();
  });

  // Search
  const searchInput = $('blogSearch');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value.toLowerCase().trim();
      applyFilters();
    });
  }

  // Secret mobile access: tap the "G-TEC Blog" badge 5 times quickly.
  // (Desktop users can keep using Ctrl+Alt+A, or open blog.html?admin=1.)
  bindSecretTapAccess();

  // Keyboard: secret admin shortcut + Escape to close modals
  document.addEventListener('keydown', e => {
    const isShortcut = e.ctrlKey && e.altKey &&
      ((e.code || '') === ADMIN_SHORTCUT.code || (e.key || '').toLowerCase() === 'a');
    if (isShortcut) {
      e.preventDefault();
      openLoginModal();
      return;
    }
    if (e.key === 'Escape') {
      closeLoginModal();
      closeReadModal();
      closeWriteModal();
      closeConfirmModal();
    }
  });
}

// ---- Secret touch access (for phones / tablets) ----
// Tap the "G-TEC Blog" badge 5 times quickly, OR press and hold it for
// about 1 second, to open the hidden admin login. No keyboard needed.
function bindSecretTapAccess() {
  const target = document.querySelector('.blog-hero-badge');
  if (!target) return;

  const REQUIRED_TAPS = 5;
  const RESET_MS = 2000;
  let taps = 0;
  let resetTimer = null;
  let pressTimer = null;

  const resetTaps = () => {
    taps = 0;
    if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
  };

  const clearPress = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  };

  const unlock = () => {
    resetTaps();
    clearPress();
    if (navigator.vibrate) { try { navigator.vibrate(35); } catch (e) { /* ignore */ } }
    openLoginModal();
  };

  // 1) Five quick taps
  target.addEventListener('click', () => {
    taps++;
    if (resetTimer) clearTimeout(resetTimer);
    if (taps >= REQUIRED_TAPS) { unlock(); return; }
    resetTimer = setTimeout(resetTaps, RESET_MS);
  });

  // 2) Press and hold (~1 second)
  target.addEventListener('touchstart', () => {
    clearPress();
    pressTimer = setTimeout(unlock, 1000);
  }, { passive: true });
  target.addEventListener('touchend', clearPress);
  target.addEventListener('touchcancel', clearPress);
  target.addEventListener('mousedown', () => {
    clearPress();
    pressTimer = setTimeout(unlock, 1000);
  });
  target.addEventListener('mouseup', clearPress);
  target.addEventListener('mouseleave', clearPress);

  // Keep it feeling like a plain badge (no blue tap highlight, no
  // selection, and no double-tap zoom that would swallow quick taps).
  target.style.webkitTapHighlightColor = 'transparent';
  target.style.userSelect = 'none';
  target.style.webkitUserSelect = 'none';
  target.style.touchAction = 'manipulation';
  target.addEventListener('contextmenu', e => e.preventDefault());
}

// ---- Filter Tabs ----
function setFilter(category) {
  activeCategory = category;
  document.querySelectorAll('.blog-filter-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.category === category);
  });
  applyFilters();
}

function applyFilters() {
  filteredBlogs = blogs.filter(post => {
    const matchCat = activeCategory === 'All' || post.category === activeCategory;
    const matchSearch = !searchQuery ||
      post.title.toLowerCase().includes(searchQuery) ||
      post.excerpt.toLowerCase().includes(searchQuery) ||
      post.content.toLowerCase().includes(searchQuery) ||
      post.category.toLowerCase().includes(searchQuery) ||
      (post.author || '').toLowerCase().includes(searchQuery);
    return matchCat && matchSearch;
  });
  renderBlogGrid();
}

// ---- Render Blog Grid ----
function renderBlogGrid() {
  const grid = $('blogGrid');
  if (!grid) return;

  const postsToShow = searchQuery || activeCategory !== 'All' ? filteredBlogs : [...blogs];

  if (postsToShow.length === 0) {
    grid.innerHTML = `
      <div class="blog-empty">
        <i class="fas fa-newspaper"></i>
        <p>${searchQuery ? 'No posts match your search.' : 'No posts published yet.'} ${isAdmin ? '<br>Click <strong>+ New Post</strong> to publish your first blog.' : ''}</p>
      </div>`;
    return;
  }

  grid.innerHTML = postsToShow.map((post, i) => buildCard(post, i)).join('');

  // Bind card buttons
  grid.querySelectorAll('.btn-read-more').forEach(btn => {
    btn.addEventListener('click', () => openReadModal(btn.dataset.id));
  });

  if (isAdmin) {
    grid.querySelectorAll('.btn-blog-edit').forEach(btn => {
      btn.addEventListener('click', () => openWriteModal(btn.dataset.id));
    });
    grid.querySelectorAll('.btn-blog-delete').forEach(btn => {
      btn.addEventListener('click', () => openConfirmModal(btn.dataset.id));
    });
  }
}

function buildCard(post, index) {
  const imgEl = post.image
    ? `<img src="${escHtml(post.image)}" alt="${escHtml(post.title)}" class="blog-card-img">`
    : `<div class="blog-card-img-placeholder">${post.icon || '📝'}</div>`;

  const initials = (post.author || 'G-TEC Admin').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const formattedDate = formatDate(post.date);
  const delay = (index % 6) * 0.06;

  return `
  <article class="blog-card" style="animation-delay:${delay}s">
    ${imgEl}
    <div class="blog-card-body">
      <div class="blog-card-meta">
        <span class="blog-card-category">${escHtml(post.category)}</span>
        <span class="blog-card-date"><i class="far fa-calendar-alt"></i> ${formattedDate}</span>
      </div>
      <h2 class="blog-card-title">${escHtml(post.title)}</h2>
      <p class="blog-card-excerpt">${escHtml(post.excerpt)}</p>
      <div class="blog-card-footer">
        <div class="blog-card-author">
          <div class="blog-card-author-avatar">${initials}</div>
          <span class="blog-card-author-name">${escHtml(post.author || 'G-TEC Admin')}</span>
        </div>
        <div class="blog-card-actions">
          <button class="btn-blog-edit" data-id="${post.id}" title="Edit Post" aria-label="Edit post">
            <i class="fas fa-pen"></i>
          </button>
          <button class="btn-blog-delete" data-id="${post.id}" title="Delete Post" aria-label="Delete post">
            <i class="fas fa-trash"></i>
          </button>
          <button class="btn-read-more" data-id="${post.id}" aria-label="Read full post">
            Read <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>
  </article>`;
}

// ---- Read Modal ----
function openReadModal(postId) {
  const post = blogs.find(p => p.id === postId);
  if (!post) return;

  const initials = (post.author || 'G-TEC Admin').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const imgEl = post.image
    ? `<img src="${escHtml(post.image)}" alt="${escHtml(post.title)}" class="blog-post-header-img">`
    : `<div class="blog-post-header-placeholder">${post.icon || '📝'}</div>`;

  $('blogPostModalContent').innerHTML = `
    ${imgEl}
    <div class="blog-post-content">
      <div class="blog-post-meta">
        <span class="blog-post-category">${escHtml(post.category)}</span>
        <span class="blog-post-date"><i class="far fa-calendar-alt"></i> ${formatDate(post.date)}</span>
      </div>
      <h2 class="blog-post-title">${escHtml(post.title)}</h2>
      <div class="blog-post-author-row">
        <div class="blog-post-author-avatar">${initials}</div>
        <div class="blog-post-author-info">
          <strong>${escHtml(post.author || 'G-TEC Admin')}</strong>
          <span>G-TEC Computer Education</span>
        </div>
      </div>
      <div class="blog-post-body">${escHtml(post.content)}</div>
      <button class="blog-post-close-btn" onclick="closeReadModal()">
        <i class="fas fa-times"></i> Close
      </button>
    </div>`;

  $('blogPostOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeReadModal() {
  const overlay = $('blogPostOverlay');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
}

// ---- Write / Edit Modal ----
function openWriteModal(postId) {
  if (!isAdmin) return;
  editingPostId = postId;

  const header = $('writeModalTitle');
  const form   = $('blogPostForm');
  if (!form) return;

  if (postId) {
    // Edit mode
    const post = blogs.find(p => p.id === postId);
    if (!post) return;
    header.innerHTML = '<i class="fas fa-pen-to-square"></i> Edit Blog Post';
    $('postTitle').value    = post.title;
    $('postCategory').value = post.category;
    $('postAuthor').value   = post.author;
    $('postExcerpt').value  = post.excerpt;
    $('postContent').value  = post.content;
    $('postIcon').value     = post.icon || '📝';
    setImagePreview(post.image || '');
  } else {
    // New post mode
    header.innerHTML = '<i class="fas fa-pen-nib"></i> Write New Blog Post';
    form.reset();
    $('postAuthor').value = 'G-TEC Admin';
    $('postIcon').value   = '📝';
    clearImagePreview();
  }

  $('blogWriteOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('postTitle').focus(), 300);
}

function closeWriteModal() {
  $('blogWriteOverlay').classList.remove('active');
  document.body.style.overflow = '';
  editingPostId = null;
}

// ---- Featured image (upload from device) ----
function setImagePreview(url) {
  const hidden = $('postImage');
  const wrap = $('blogImagePreview');
  const img = $('blogImagePreviewImg');
  if (hidden) hidden.value = url || '';
  if (!wrap || !img) return;
  if (url) {
    img.src = url;
    wrap.hidden = false;
  } else {
    img.removeAttribute('src');
    wrap.hidden = true;
  }
}

function clearImagePreview() {
  setImagePreview('');
  const file = $('postImageFile');
  if (file) file.value = '';
}

// Downscale large images so uploads and pages stay fast. Falls back to the original.
function prepareImage(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!/^data:image\/(jpeg|jpg|png|webp|bmp)/i.test(dataUrl)) return resolve(dataUrl);

      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        const MAX = 1600;
        const needsShrink = img.width > MAX || img.height > MAX || dataUrl.length > 1.5 * 1024 * 1024;
        if (!needsShrink) return resolve(dataUrl);
        try {
          const scale = Math.min(MAX / img.width, MAX / img.height, 1);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (e) {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

async function handleImageSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (!/^image\//.test(file.type)) {
    showToast('Please choose an image file.', 'error');
    clearImagePreview();
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    showToast('Image is too large. Please choose an image under 8 MB.', 'error');
    clearImagePreview();
    return;
  }

  const input = $('postImageFile');
  if (input) input.disabled = true;
  showToast('Uploading image…', 'info');

  try {
    const dataUrl = await prepareImage(file);
    if (!dataUrl) throw new Error('Could not read the image.');

    const res = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ dataUrl })
    });
    if (res.status === 401) {
      isAdmin = false;
      hideAdminMode();
      showToast('Your session expired. Please log in again.', 'error');
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Could not upload the image.');
    }
    const data = await res.json();
    setImagePreview(data.url);
    showToast('Image uploaded.', 'success');
  } catch (err) {
    clearImagePreview();
    showToast(err.message || 'Could not upload the image.', 'error');
  } finally {
    if (input) input.disabled = false;
  }
}

// ---- Post Form Submit (create / update via API) ----
async function handlePostSubmit(e) {
  e.preventDefault();
  if (!isAdmin) {
    showToast('Admin login required.', 'error');
    return;
  }

  const payload = {
    title:    $('postTitle').value.trim(),
    category: $('postCategory').value,
    author:   $('postAuthor').value.trim() || 'G-TEC Admin',
    excerpt:  $('postExcerpt').value.trim(),
    content:  $('postContent').value.trim(),
    image:    $('postImage').value.trim(),
    icon:     $('postIcon').value.trim() || '📝'
  };

  if (!payload.title || !payload.category || !payload.excerpt || !payload.content) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  const wasEditing = !!editingPostId;
  const publishBtn = document.querySelector('.btn-publish');
  if (publishBtn) publishBtn.disabled = true;

  try {
    const url = wasEditing ? `${API.blogs}/${encodeURIComponent(editingPostId)}` : API.blogs;
    const res = await fetch(url, {
      method: wasEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });

    if (res.status === 401) {
      isAdmin = false;
      hideAdminMode();
      showToast('Your session expired. Please log in again.', 'error');
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Could not save the post.', 'error');
      return;
    }

    closeWriteModal();
    await loadBlogs();
    applyFilters();
    updateStats();
    showToast(wasEditing ? 'Blog post updated successfully!' : 'Blog post published successfully!', 'success');
  } catch (err) {
    showToast('Could not save the post. Please try again.', 'error');
  } finally {
    if (publishBtn) publishBtn.disabled = false;
  }
}

// ---- Delete ----
function openConfirmModal(postId) {
  deletingPostId = postId;
  $('blogConfirmOverlay').classList.add('active');
}

function closeConfirmModal() {
  const overlay = $('blogConfirmOverlay');
  if (overlay) overlay.classList.remove('active');
  deletingPostId = null;
}

async function executeDelete() {
  if (!deletingPostId || !isAdmin) return;

  const confirmBtn = $('confirmDeleteBtn');
  if (confirmBtn) confirmBtn.disabled = true;

  try {
    const res = await fetch(`${API.blogs}/${encodeURIComponent(deletingPostId)}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    });

    if (res.status === 401) {
      isAdmin = false;
      closeConfirmModal();
      hideAdminMode();
      showToast('Your session expired. Please log in again.', 'error');
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Could not delete the post.', 'error');
      return;
    }

    closeConfirmModal();
    await loadBlogs();
    applyFilters();
    updateStats();
    showToast('Blog post deleted.', 'error');
  } catch (err) {
    showToast('Could not delete the post. Please try again.', 'error');
  } finally {
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

// ---- Admin Login (hidden — opened with Ctrl+Alt+A) ----
function openLoginModal() {
  if (isAdmin) return; // Already logged in
  const overlay = $('adminLoginOverlay');
  if (!overlay) return;
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  const err = $('adminLoginError');
  if (err) err.classList.remove('show');
  setTimeout(() => { const u = $('adminUsername'); if (u) u.focus(); }, 300);
}

function closeLoginModal() {
  const overlay = $('adminLoginOverlay');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
  const form = $('adminLoginForm');
  if (form) form.reset();
  const err = $('adminLoginError');
  if (err) err.classList.remove('show');
}

function showLoginError(message) {
  const err = $('adminLoginError');
  if (!err) return;
  err.textContent = message;
  err.classList.add('show');
  setTimeout(() => err.classList.remove('show'), 3500);
}

async function handleLogin(e) {
  e.preventDefault();
  const username = $('adminUsername').value.trim();
  const password = $('adminPassword').value;

  const submitBtn = document.querySelector('.admin-login-btn');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch(API.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password })
    });

    if (res.ok) {
      isAdmin = true;
      closeLoginModal();
      showAdminMode();
      showToast('Welcome back, Admin! 🎉', 'success');
    } else if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      showLoginError(data.error || 'Incorrect username or password. Please try again.');
    } else {
      showLoginError('Cannot reach the blog server. Open the site at http://localhost:3000/blog.html (the website server must be running).');
    }
  } catch (err) {
    showLoginError('Could not reach the server. Please try again.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function handleLogout() {
  try {
    await fetch(API.logout, { method: 'POST', credentials: 'same-origin' });
  } catch (err) {
    // Even if the call fails, drop local admin state.
  }
  isAdmin = false;
  hideAdminMode();
  showToast('Logged out successfully.', 'info');
}

// ---- Stats Bar ----
function updateStats() {
  const totalEl = $('totalPostsCount');
  if (totalEl) totalEl.textContent = blogs.length;

  const categories = [...new Set(blogs.map(p => p.category))].length;
  const catEl = $('totalCategoriesCount');
  if (catEl) catEl.textContent = categories;
}

// ---- Toast ----
function showToast(message, type = 'info') {
  const toast = $('blogToast');
  if (!toast) return;

  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
  toast.className = `blog-toast ${type}`;
  toast.innerHTML = `
    <i class="fas ${icons[type] || icons.info} blog-toast-icon"></i>
    <span class="blog-toast-text">${escHtml(message)}</span>`;

  void toast.offsetWidth; // force reflow
  toast.classList.add('show');

  setTimeout(() => toast.classList.remove('show'), 3200);
}

// ---- Utilities ----
function escHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

// ---- Expose functions used by inline HTML handlers ----
window.setFilter = setFilter;
window.closeReadModal = closeReadModal;
window.openLoginModal = openLoginModal;
