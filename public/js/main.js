// =========================================
//   G-TEC COMPUTER EDUCATION
//   Main JavaScript File
// =========================================

document.addEventListener('DOMContentLoaded', () => {

  // ---- Dark / Light Mode Toggle ----
  const themeToggle = document.getElementById('themeToggle');

  function getActiveTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function updateToggleUI(theme) {
    if (!themeToggle) return;
    const isDark = theme === 'dark';
    themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
    themeToggle.setAttribute('aria-checked', isDark ? 'true' : 'false');
  }

  function setTheme(theme, animate = false) {
    if (animate) {
      document.documentElement.classList.add('theme-transition');
      window.clearTimeout(window.__themeTransitionTimeout);
      window.__themeTransitionTimeout = window.setTimeout(() => {
        document.documentElement.classList.remove('theme-transition');
      }, 400);
    }
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gtec-theme', theme);
    updateToggleUI(theme);
  }

  // Initialize toggle button state: default to 'light' unless user explicitly switched and saved 'dark'
  const initialTheme = localStorage.getItem('gtec-theme') === 'dark' ? 'dark' : 'light';

  setTheme(initialTheme, false);

  if (themeToggle) {
    themeToggle.addEventListener('click', (e) => {
      e.preventDefault();
      const current = getActiveTheme();
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      setTheme(nextTheme, true);
    });

    themeToggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        themeToggle.click();
      }
    });
  }

  // ---- Navbar: scroll shrink & hamburger ----
  const navbar  = document.querySelector('.navbar');
  const hamburger = document.querySelector('.hamburger');
  const navMenu = document.querySelector('.nav-menu');

  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navMenu.classList.toggle('open');
    });
    // Close menu on nav link click
    navMenu.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('open');
      });
    });
  }

  // ---- Active nav link ----
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // ---- Back to Top ----
  const btt = document.querySelector('.back-to-top');
  if (btt) {
    window.addEventListener('scroll', () => {
      btt.classList.toggle('visible', window.scrollY > 400);
    });
    btt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // ---- Scroll Reveal ----
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length > 0) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    reveals.forEach(el => revealObserver.observe(el));
  }

  // ---- Animated Counter ----
  const counters = document.querySelectorAll('.count-up');
  if (counters.length > 0) {
    const countObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(el => countObserver.observe(el));
  }

  function animateCounter(el) {
    const target = parseFloat(el.dataset.target);
    const suffix = el.dataset.suffix || '';
    const decimals = el.dataset.decimals || 0;
    const duration = 2000;
    const step = target / (duration / 16);
    let current = 0;

    const timer = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      el.textContent = Number(current).toFixed(decimals) + suffix;
    }, 16);
  }

  // ---- Course Category Filter ----
  const catTabs = document.querySelectorAll('.cat-tab');
  const courseCards = document.querySelectorAll('.course-card[data-category]');

  if (catTabs.length > 0) {
    catTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        catTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const filter = tab.dataset.filter;

        courseCards.forEach(card => {
          if (filter === 'all' || card.dataset.category === filter) {
            card.style.display = 'flex';
            card.style.animation = 'fadeIn 0.4s ease';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }

  // ---- Testimonial Slider ----
  const track = document.querySelector('.testimonials-track');
  const dotsContainer = document.querySelector('.slider-dots');
  const prevBtn = document.querySelector('.slider-btn.prev');
  const nextBtn = document.querySelector('.slider-btn.next');

  if (track) {
    let current = 0;
    const cards = track.querySelectorAll('.testimonial-card');

    function getVisible() {
      return window.innerWidth > 900 ? 3 : window.innerWidth > 600 ? 2 : 1;
    }

    function getMax() {
      return Math.max(0, cards.length - getVisible());
    }

    function renderDots() {
      if (!dotsContainer) return;
      dotsContainer.innerHTML = '';
      const max = getMax();
      const dotCount = max + 1;
      for (let i = 0; i < dotCount; i++) {
        const dot = document.createElement('span');
        dot.className = `slider-dot ${i === current ? 'active' : ''}`;
        dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
        dot.addEventListener('click', () => goTo(i));
        dotsContainer.appendChild(dot);
      }
    }

    function goTo(idx) {
      if (cards.length === 0) return;
      const max = getMax();
      if (idx > max) {
        current = 0;
      } else if (idx < 0) {
        current = max;
      } else {
        current = idx;
      }

      const cardWidth = cards[0].offsetWidth;
      const gap = 28;
      track.style.transform = `translateX(-${current * (cardWidth + gap)}px)`;

      if (dotsContainer) {
        const dots = dotsContainer.querySelectorAll('.slider-dot');
        dots.forEach((d, i) => d.classList.toggle('active', i === current));
      }
    }

    if (prevBtn) prevBtn.addEventListener('click', () => goTo(current - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => goTo(current + 1));

    renderDots();

    window.addEventListener('resize', () => {
      renderDots();
      goTo(current);
    });

    // Auto play
    let autoplay = setInterval(() => goTo(current + 1), 5000);
    track.addEventListener('mouseenter', () => clearInterval(autoplay));
    track.addEventListener('mouseleave', () => {
      clearInterval(autoplay);
      autoplay = setInterval(() => goTo(current + 1), 5000);
    });

    // Touch swipe support for mobile
    let touchStartX = 0;
    let touchEndX = 0;
    track.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    track.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      if (touchStartX - touchEndX > 50) {
        goTo(current + 1);
      } else if (touchEndX - touchStartX > 50) {
        goTo(current - 1);
      }
    }, { passive: true });
  }

  // ---- Gallery Lightbox ----
  const galleryItems = document.querySelectorAll('.gallery-item');
  const lightbox = document.querySelector('.lightbox');
  const lightboxImg = document.querySelector('.lightbox img');
  const lightboxClose = document.querySelector('.lightbox-close');

  if (galleryItems.length > 0 && lightbox) {
    galleryItems.forEach(item => {
      item.addEventListener('click', () => {
        const src = item.querySelector('img').src;
        lightboxImg.src = src;
        lightbox.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });

    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

    function closeLightbox() {
      lightbox.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  // ---- Contact Form ----
  const contactForm = document.querySelector('#contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = contactForm.querySelector('.form-submit');
      const successMsg = document.querySelector('.form-success');

      btn.textContent = 'Sending...';
      btn.disabled = true;

      setTimeout(() => {
        btn.textContent = 'Message Sent!';
        if (successMsg) successMsg.style.display = 'block';
        contactForm.reset();

        setTimeout(() => {
          btn.textContent = 'Send Message';
          btn.disabled = false;
          if (successMsg) successMsg.style.display = 'none';
        }, 4000);
      }, 1500);
    });
  }

  // ---- Pre-select course from ?course= (sent by the Find My Course page) ----
  const courseSelect = document.querySelector('#course');
  if (courseSelect) {
    const params = new URLSearchParams(window.location.search);
    const wanted = (params.get('course') || '').trim();
    if (wanted) {
      const options = Array.from(courseSelect.options);
      const clean = (s) => s.trim().toLowerCase();

      // 1) exact match, 2) partial match, 3) fall back to "Other / Not sure yet"
      let match = options.find((o) => clean(o.value || o.textContent) === clean(wanted));
      if (!match) {
        match = options.find((o) => {
          const t = clean(o.value || o.textContent);
          return t && (t.includes(clean(wanted)) || clean(wanted).includes(t));
        });
      }
      if (!match) {
        match = options.find((o) => o.value === 'other');
      }

      if (match) {
        courseSelect.value = match.value || match.textContent;
      }
    }
  }

  // ---- Ticker duplicate for seamless loop ----
  const tickerItems = document.querySelector('.ticker-items');
  if (tickerItems) {
    const clone = tickerItems.cloneNode(true);
    tickerItems.parentElement.appendChild(clone);
  }

  // ---- Load GTEC Buddy AI Chatbot & Navigator ----
  if (!document.getElementById('gtecBuddyScript') && !window.GTECBuddyLoaded) {
    window.GTECBuddyLoaded = true;
    const buddyScript = document.createElement('script');
    buddyScript.id = 'gtecBuddyScript';
    buddyScript.src = 'js/buddy.js';
    document.body.appendChild(buddyScript);
  }

});

