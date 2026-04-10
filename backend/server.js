/**
 * CP Arena — Express Backend
 * Run: node backend/server.js
 */
const express     = require('express');
const cors        = require('cors');
const jwt         = require('jsonwebtoken');
const bcrypt      = require('bcryptjs');
const { v4: uuid } = require('uuid');
const fs          = require('fs');
const path        = require('path');
const { OAuth2Client } = require('google-auth-library');

const app    = express();
const PORT   = 3001;
const SECRET = 'cp_arena_jwt_secret_change_me';
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID'; // Replace with your Google OAuth client ID

// ── DATA LAYER ──────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
  users:       path.join(DATA_DIR, 'users.json'),
  problems:    path.join(DATA_DIR, 'problems.json'),
  submissions: path.join(DATA_DIR, 'submissions.json'),
};

function read(f)    { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return []; } }
function write(f,d) { fs.writeFileSync(f, JSON.stringify(d, null, 2)); }

// Seed default admin on first run
(function seedAdmin() {
  const users = read(FILES.users);
  if (!users.find(u => u.username === 'admin')) {
    users.push({
      id: 'u_admin',
      username: 'admin',
      email: 'admin@cparena.local',
      password: bcrypt.hashSync('admin123', 10),
      role: 'admin',
      cfHandle: '', lcHandle: '', gfgHandle: '',
      avatar: '',
      createdAt: new Date().toISOString(),
    });
    write(FILES.users, users);
    console.log('✓ Admin user seeded (admin / admin123)');
  }
  if (!fs.existsSync(FILES.problems)) write(FILES.problems, []);
  if (!fs.existsSync(FILES.submissions)) write(FILES.submissions, []);
})();

// ── MIDDLEWARE ───────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' })); // large enough for base64 avatars
app.use(express.static(path.join(__dirname, '..'))); // serve frontend

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(h.replace('Bearer ', ''), SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ── AUTH ROUTES ──────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const users = read(FILES.users);
  const user = users.find(u => u.username === username || u.email === username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid username or password.' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '7d' });
  const { password: _, ...safe } = user;
  res.json({ ok: true, token, user: safe });
});

app.post('/api/auth/register', (req, res) => {
  const { username, email, password, role = 'student' } = req.body;
  const users = read(FILES.users);
  if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Username taken.' });
  if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already registered.' });
  const user = {
    id: 'u_' + uuid().replace(/-/g,'').slice(0,12),
    username, email,
    password: bcrypt.hashSync(password, 10),
    role,
    cfHandle: '', lcHandle: '', gfgHandle: '',
    avatar: '',
    createdAt: new Date().toISOString(),
  };
  users.push(user); write(FILES.users, users);
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '7d' });
  const { password: _, ...safe } = user;
  res.json({ ok: true, token, user: safe });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const users = read(FILES.users);
    let user = users.find(u => u.email === payload.email);
    if (!user) {
      user = {
        id: 'u_' + uuid().replace(/-/g,'').slice(0,12),
        username: payload.name.replace(/\s+/g, '_').toLowerCase(),
        email: payload.email,
        password: bcrypt.hashSync(uuid(), 10),
        role: 'student',
        cfHandle: '', lcHandle: '', gfgHandle: '',
        avatar: payload.picture || '',
        createdAt: new Date().toISOString(),
      };
      users.push(user); write(FILES.users, users);
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '7d' });
    const { password: _, ...safe } = user;
    res.json({ ok: true, token, user: safe });
  } catch (e) {
    res.status(401).json({ error: 'Google auth failed: ' + e.message });
  }
});

// ── USER ROUTES ──────────────────────────────────────────────
app.get('/api/users', auth, (req, res) => {
  const users = read(FILES.users).map(({ password, ...u }) => u);
  res.json(users);
});

app.get('/api/users/:id', auth, (req, res) => {
  const user = read(FILES.users).find(u => u.id === req.params.id || u.username === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, ...safe } = user;
  res.json(safe);
});

app.put('/api/users/:id/handles', auth, (req, res) => {
  if (req.user.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
  const users = read(FILES.users);
  const i = users.findIndex(u => u.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'User not found' });
  const { cfHandle, lcHandle, gfgHandle } = req.body;
  users[i] = { ...users[i], cfHandle, lcHandle, gfgHandle };
  write(FILES.users, users);
  const { password, ...safe } = users[i];
  res.json(safe);
});

app.put('/api/users/:id/avatar', auth, (req, res) => {
  if (req.user.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
  const users = read(FILES.users);
  const i = users.findIndex(u => u.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'User not found' });
  users[i].avatar = req.body.avatar; // base64 data URL
  write(FILES.users, users);
  res.json({ ok: true });
});

// ── PROBLEM ROUTES ───────────────────────────────────────────
app.get('/api/problems', auth, (req, res) => res.json(read(FILES.problems)));

app.post('/api/problems', auth, adminOnly, (req, res) => {
  const problems = read(FILES.problems);
  const maxNum = problems.reduce((m, p) => Math.max(m, p.number || 0), 0);
  const POINTS = { Easy: 10, Medium: 25, Hard: 50 };
  const p = {
    id: 'p_' + uuid().replace(/-/g,'').slice(0,12),
    number: maxNum + 1,
    ...req.body,
    points: POINTS[req.body.difficulty] || 10,
    createdAt: new Date().toISOString(), createdBy: req.user.username,
  };
  problems.push(p); write(FILES.problems, problems);
  res.json(p);
});

app.put('/api/problems/:id', auth, adminOnly, (req, res) => {
  const problems = read(FILES.problems);
  const i = problems.findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  const POINTS = { Easy: 10, Medium: 25, Hard: 50 };
  problems[i] = { ...problems[i], ...req.body, id: problems[i].id,
    points: POINTS[req.body.difficulty] || problems[i].points };
  write(FILES.problems, problems);
  res.json(problems[i]);
});

app.delete('/api/problems/:id', auth, adminOnly, (req, res) => {
  const problems = read(FILES.problems).filter(p => p.id !== req.params.id);
  write(FILES.problems, problems);
  res.json({ ok: true });
});

// ── SUBMISSION ROUTES ────────────────────────────────────────
app.get('/api/submissions', auth, (req, res) => {
  const subs = read(FILES.submissions);
  if (req.user.role === 'admin') return res.json(subs);
  res.json(subs.filter(s => s.userId === req.user.id));
});

app.post('/api/submissions', auth, (req, res) => {
  const subs = read(FILES.submissions);
  const sub = {
    id: 's_' + uuid().replace(/-/g,'').slice(0,12),
    userId: req.user.id, username: req.user.username,
    verdict: 'pending', score: 0, tcResults: null,
    submittedAt: new Date().toISOString(), reviewedAt: null,
    ...req.body,
  };
  subs.push(sub); write(FILES.submissions, subs);
  res.json(sub);
});

app.put('/api/submissions/:id/verdict', auth, adminOnly, (req, res) => {
  const subs = read(FILES.submissions);
  const i = subs.findIndex(s => s.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  const problems = read(FILES.problems);
  const prob = problems.find(p => p.id === subs[i].problemId);
  subs[i].verdict = req.body.verdict;
  subs[i].reviewedAt = new Date().toISOString();
  subs[i].score = req.body.verdict === 'accepted' && prob ? prob.points : 0;
  write(FILES.submissions, subs);
  res.json(subs[i]);
});

// ── LEADERBOARD ──────────────────────────────────────────────
app.get('/api/leaderboard', auth, (req, res) => {
  const users = read(FILES.users).filter(u => u.role !== 'admin');
  const subs  = read(FILES.submissions).filter(s => s.verdict === 'accepted');
  const map = {};
  users.forEach(u => { map[u.id] = { userId: u.id, username: u.username, solved: 0, score: 0, lastAccepted: null, _s: new Set() }; });
  subs.sort((a,b) => new Date(a.submittedAt) - new Date(b.submittedAt)).forEach(s => {
    if (!map[s.userId]) map[s.userId] = { userId: s.userId, username: s.username, solved: 0, score: 0, lastAccepted: null, _s: new Set() };
    const e = map[s.userId];
    if (!e._s.has(s.problemId)) { e._s.add(s.problemId); e.solved++; e.score += s.score; e.lastAccepted = s.submittedAt; }
  });
  res.json(Object.values(map).map(({ _s, ...r }) => r)
    .sort((a,b) => b.score - a.score || b.solved - a.solved));
});

app.listen(PORT, () => console.log(`✓ CP Arena API running on http://localhost:${PORT}`));
