import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { SEED_POSTS } from './data/seed-posts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '12mb' }));

// ---- Serve static files from public directory (HTML, CSS, JS, Assets) ----
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

/* ============================================================
   ADMIN AUTH + BLOG API
   - Blogs are stored server-side in data/blogs.json so every
     visitor sees the same posts.
   - Only a logged-in admin can create / update / delete posts.
   ============================================================ */

// Admin credentials (override with ADMIN_USER / ADMIN_PASS in .env)
const ADMIN_USERNAME = process.env.ADMIN_USER || 'gtec_admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASS || 'Gtec@2026!';

const SESSION_COOKIE = 'gtec_admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const sessions = new Map(); // token -> { expires }

const DATA_DIR = path.join(__dirname, 'data');
const BLOGS_FILE = path.join(DATA_DIR, 'blogs.json');

// Where uploaded blog images are stored (served from /uploads/...)
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg'
};

// ---- Data helpers ----
function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BLOGS_FILE)) {
    fs.writeFileSync(BLOGS_FILE, JSON.stringify(SEED_POSTS, null, 2), 'utf8');
  }
}

function readBlogs() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(BLOGS_FILE, 'utf8'));
  } catch (err) {
    console.error('Could not read blogs.json:', err.message);
    return [];
  }
}

function writeBlogs(posts) {
  ensureDataFile();
  fs.writeFileSync(BLOGS_FILE, JSON.stringify(posts, null, 2), 'utf8');
}

// ---- Session helpers ----
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > -1) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  });
  return out;
}

function isAuthenticated(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expires) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function requireAdmin(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'Unauthorized. Please log in as admin.' });
}

// ---- Auth routes ----
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { expires: Date.now() + SESSION_TTL_MS });
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
    );
    return res.json({ success: true, username: ADMIN_USERNAME });
  }
  return res.status(401).json({ error: 'Incorrect username or password.' });
});

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

app.post('/api/admin/logout', (req, res) => {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.json({ success: true });
});

// ---- Image upload (admin only) ----
// Receives a base64 data URL, saves the image to public/uploads,
// and returns its public URL to store on the blog post.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  const { dataUrl } = req.body || {};
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    return res.status(400).json({ error: 'No image data received.' });
  }

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ error: 'Unsupported image format.' });

  const mime = match[1].toLowerCase();
  const ext = IMAGE_EXTENSIONS[mime];
  if (!ext) return res.status(400).json({ error: 'Unsupported image type: ' + mime });

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) return res.status(400).json({ error: 'The image file is empty.' });
  if (buffer.length > MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: 'Image is too large (maximum 8 MB).' });
  }

  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const filename = 'img_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);

  res.status(201).json({ url: '/uploads/' + filename });
});

// ---- Blog routes (read = public, write = admin only) ----
app.get('/api/blogs', (req, res) => {
  res.json(readBlogs());
});

app.post('/api/blogs', requireAdmin, (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  const category = String(b.category || '').trim();
  const excerpt = String(b.excerpt || '').trim();
  const content = String(b.content || '').trim();

  if (!title || !category || !excerpt || !content) {
    return res.status(400).json({ error: 'Title, category, excerpt and content are required.' });
  }

  const post = {
    id: 'post_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
    title: title.slice(0, 180),
    category,
    author: String(b.author || 'G-TEC Admin').trim().slice(0, 80) || 'G-TEC Admin',
    excerpt: excerpt.slice(0, 400),
    content,
    image: String(b.image || '').trim(),
    icon: String(b.icon || '📝').trim().slice(0, 4) || '📝',
    date: new Date().toISOString().split('T')[0]
  };

  const posts = readBlogs();
  posts.unshift(post);
  writeBlogs(posts);
  res.status(201).json(post);
});

app.put('/api/blogs/:id', requireAdmin, (req, res) => {
  const posts = readBlogs();
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Post not found.' });

  const b = req.body || {};
  const current = posts[idx];
  const updated = {
    ...current,
    title: b.title !== undefined ? String(b.title).trim().slice(0, 180) : current.title,
    category: b.category !== undefined ? String(b.category).trim() : current.category,
    author: b.author !== undefined ? (String(b.author).trim().slice(0, 80) || 'G-TEC Admin') : current.author,
    excerpt: b.excerpt !== undefined ? String(b.excerpt).trim().slice(0, 400) : current.excerpt,
    content: b.content !== undefined ? String(b.content).trim() : current.content,
    image: b.image !== undefined ? String(b.image).trim() : current.image,
    icon: b.icon !== undefined ? (String(b.icon).trim().slice(0, 4) || '📝') : current.icon
  };

  if (!updated.title || !updated.category || !updated.excerpt || !updated.content) {
    return res.status(400).json({ error: 'Title, category, excerpt and content are required.' });
  }

  posts[idx] = updated;
  writeBlogs(posts);
  res.json(updated);
});

app.delete('/api/blogs/:id', requireAdmin, (req, res) => {
  const posts = readBlogs();
  const next = posts.filter(p => p.id !== req.params.id);
  if (next.length === posts.length) return res.status(404).json({ error: 'Post not found.' });
  writeBlogs(next);
  res.json({ success: true });
});

/* ============================================================
   AI PROXY ENDPOINTS (Flask server)
   Default: local Flask on port 5001.
   Production: set AI_BASE_URL to your Hugging Face Space URL, e.g.
       AI_BASE_URL=https://gtec-trainers-gtec-ai-server.hf.space
   ============================================================ */

const AI_BASE_URL_RAW = (process.env.AI_BASE_URL || 'http://127.0.0.1:5001').replace(/\/+$/, '');
// Render's `fromService: property: host` gives a bare hostname, so add https://
const AI_BASE_URL = /^https?:\/\//i.test(AI_BASE_URL_RAW)
  ? AI_BASE_URL_RAW
  : `https://${AI_BASE_URL_RAW}`;

// Proxy endpoints to the AI server
app.post('/api/predict', async (req, res) => {
  try {
    const aiResponse = await fetch(`${AI_BASE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await aiResponse.json();
    return res.status(aiResponse.status).json(data);
  } catch (err) {
    return res.status(503).json({
      error: 'AI Server is currently unavailable',
      fallback: true
    });
  }
});

// Proxy for multi-turn /chat endpoint (course recommendation flow)
app.post('/api/chat', async (req, res) => {
  try {
    const aiResponse = await fetch(`${AI_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await aiResponse.json();
    return res.status(aiResponse.status).json(data);
  } catch (err) {
    return res.status(503).json({
      error: 'AI Server is currently unavailable',
      fallback: true
    });
  }
});

// Course model: the 4 wizard answers -> recommended course
app.post('/api/recommend', async (req, res) => {
  try {
    const aiResponse = await fetch(`${AI_BASE_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await aiResponse.json();
    return res.status(aiResponse.status).json(data);
  } catch (err) {
    return res.status(503).json({
      error: 'AI Server is currently unavailable',
      fallback: true
    });
  }
});

// Course catalogue + wizard questions published with the model
app.get('/api/courses', async (req, res) => {
  try {
    const aiResponse = await fetch(`${AI_BASE_URL}/courses`);
    const data = await aiResponse.json();
    return res.status(aiResponse.status).json(data);
  } catch (err) {
    return res.status(503).json({
      error: 'AI Server is currently unavailable',
      fallback: true
    });
  }
});

// Intent -> page mapping published with the model on the Hugging Face Hub
app.get('/api/navigation', async (req, res) => {
  try {
    const aiResponse = await fetch(`${AI_BASE_URL}/navigation`);
    const data = await aiResponse.json();
    return res.status(aiResponse.status).json(data);
  } catch (err) {
    return res.status(503).json({
      error: 'AI Server is currently unavailable',
      fallback: true
    });
  }
});

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`G-TEC Website server running at http://localhost:${PORT}`);
});
