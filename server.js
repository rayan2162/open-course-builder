// Open Course Builder - Express + JSON file DB
const express = require('express');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DB_PATH = path.join(ROOT, 'db.json');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const PORT = process.env.PORT || 3000;

// --- Ensure folders / db exist ---------------------------------------------
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ courses: [] }, null, 2));

// --- Helpers ---------------------------------------------------------------
function readDB() {
  let parsed;
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    parsed = JSON.parse(raw);
    if (!parsed.courses) parsed.courses = [];
  } catch (err) {
    console.error('Failed to read DB, resetting:', err.message);
    return { courses: [] };
  }
  // One-time heal: copy any raw local-path resources into uploads/ and rewrite.
  if (healLocalPaths(parsed)) {
    try { writeDB(parsed); } catch {}
  }
  return parsed;
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function findCourse(id) {
  return readDB().courses.find((c) => c.id === id);
}

function findLesson(course, lessonId) {
  return course.lessons.find((l) => l.id === lessonId);
}

// Detect resource type from URL or file extension
function detectType(input) {
  if (!input) return 'text';
  const value = String(input).trim();
  const lower = value.toLowerCase();

  // YouTube
  if (/youtube\.com|youtu\.be/.test(lower)) return 'youtube';

  // Web link (starts with http and not matching other known patterns)
  if (/^https?:\/\//.test(lower)) return 'website';

  // File path / extension
  const ext = path.extname(new URL(value, 'http://x').pathname).toLowerCase();
  if (['.pdf'].includes(ext)) return 'pdf';
  if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) return 'audio';
  if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) return 'video';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return 'image';
  if (['.md'].includes(ext)) return 'markdown';
  if (['.txt'].includes(ext)) return 'text';

  return 'article';
}

// --- Multer config ---------------------------------------------------------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${uuid().slice(0, 8)}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

// --- App -------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// --- Courses ---------------------------------------------------------------
app.get('/api/courses', (_req, res) => {
  res.json(readDB().courses);
});

app.get('/api/courses/:id', (req, res) => {
  const course = findCourse(req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  res.json(course);
});

app.post('/api/courses', (req, res) => {
  const { title = 'Untitled Course', description = '', lessons = [] } = req.body || {};
  if (!title.trim()) return res.status(400).json({ error: 'Title is required' });

  const now = new Date().toISOString();
  const course = {
    id: uuid(),
    title: title.trim(),
    description: description.trim(),
    createdAt: now,
    updatedAt: now,
    lessons: (Array.isArray(lessons) ? lessons : []).map((l) => normalizeLesson(l)),
  };

  const db = readDB();
  db.courses.push(course);
  writeDB(db);
  res.status(201).json(course);
});

app.put('/api/courses/:id', (req, res) => {
  const db = readDB();
  const idx = db.courses.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Course not found' });
  const current = db.courses[idx];
  const { title, description } = req.body || {};
  if (typeof title === 'string') current.title = title.trim() || current.title;
  if (typeof description === 'string') current.description = description.trim();
  current.updatedAt = new Date().toISOString();
  db.courses[idx] = current;
  writeDB(db);
  res.json(current);
});

app.delete('/api/courses/:id', (req, res) => {
  const db = readDB();
  const before = db.courses.length;
  db.courses = db.courses.filter((c) => c.id !== req.params.id);
  if (db.courses.length === before) return res.status(404).json({ error: 'Course not found' });
  writeDB(db);
  res.json({ ok: true });
});

// --- Lessons ---------------------------------------------------------------
function normalizeLesson(input) {
  const title = (input.title || 'Untitled lesson').toString().trim() || 'Untitled lesson';
  const notes = (input.notes || '').toString();
  // resource can be a string URL/path OR an object {type, value, name}
  let resource = input.resource ?? '';
  let type = (input.type || '').toString().toLowerCase();

  if (typeof resource === 'string') {
    if (!type) type = detectType(resource);
  } else if (resource && typeof resource === 'object') {
    type = (resource.type || type || 'text').toString().toLowerCase();
    resource = resource.value || resource.url || resource.path || '';
  }

  return {
    id: uuid(),
    title,
    type: type || 'text',
    resource: typeof resource === 'string' ? resource : '',
    notes,
    isCompleted: Boolean(input.isCompleted),
    completeDate: input.isCompleted ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
  };
}

app.post('/api/courses/:id/lessons', (req, res) => {
  const db = readDB();
  const course = db.courses.find((c) => c.id === req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const lesson = normalizeLesson(req.body || {});
  course.lessons.push(lesson);
  course.updatedAt = new Date().toISOString();
  writeDB(db);
  res.status(201).json(lesson);
});

app.put('/api/courses/:id/lessons/:lessonId', (req, res) => {
  const db = readDB();
  const course = db.courses.find((c) => c.id === req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const lesson = findLesson(course, req.params.lessonId);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  const { title, type, resource, notes, isCompleted } = req.body || {};
  if (typeof title === 'string' && title.trim()) lesson.title = title.trim();
  if (typeof notes === 'string') lesson.notes = notes;
  if (typeof isCompleted === 'boolean') {
    const was = lesson.isCompleted;
    lesson.isCompleted = isCompleted;
    // Only set a completeDate the first time the lesson flips true. Clearing
    // isCompleted wipes completeDate so the heatmap reflects the new state.
    if (isCompleted && !was) lesson.completeDate = new Date().toISOString();
    else if (!isCompleted) lesson.completeDate = null;
  }

  if (resource !== undefined) {
    if (resource && typeof resource === 'object') {
      lesson.type = (resource.type || lesson.type || 'text').toString().toLowerCase();
      lesson.resource = resource.value || resource.url || resource.path || '';
    } else {
      lesson.resource = String(resource);
      if (type) lesson.type = String(type).toLowerCase();
      else if (!lesson.resource) lesson.type = 'text';
      else lesson.type = detectType(lesson.resource);
    }
  } else if (type) {
    lesson.type = String(type).toLowerCase();
  }

  course.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(lesson);
});

app.patch('/api/courses/:id/lessons/:lessonId/toggle', (req, res) => {
  const db = readDB();
  const course = db.courses.find((c) => c.id === req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const lesson = findLesson(course, req.params.lessonId);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  lesson.isCompleted = !lesson.isCompleted;
  // Stamp completeDate when flipping on, clear it when flipping off.
  if (lesson.isCompleted) lesson.completeDate = new Date().toISOString();
  else lesson.completeDate = null;
  course.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(lesson);
});

app.delete('/api/courses/:id/lessons/:lessonId', (req, res) => {
  const db = readDB();
  const course = db.courses.find((c) => c.id === req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const before = course.lessons.length;
  course.lessons = course.lessons.filter((l) => l.id !== req.params.lessonId);
  if (course.lessons.length === before) return res.status(404).json({ error: 'Lesson not found' });
  course.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ ok: true });
});

// --- File upload -----------------------------------------------------------
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({
    name: req.file.originalname,
    path: `/uploads/${req.file.filename}`,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// --- Upload from a local file path (so users can paste C:\...\file.pdf) ---
// Body: { path: "C:\\Users\\you\\file.pdf" } or { path: "file:///..." } or { path: "/abs/path" }
app.post('/api/upload-path', (req, res) => {
  let raw = (req.body && req.body.path ? String(req.body.path) : '').trim();
  if (!raw) return res.status(400).json({ error: 'path is required' });

  // Strip a leading file:// (with optional drive letter like file:///C:/...)
  if (/^file:\/\/\//i.test(raw)) raw = raw.replace(/^file:\/\/\//i, '');
  else if (/^file:\/\//i.test(raw)) raw = raw.replace(/^file:\/\//i, '');

  // Decode percent-encoded chars (e.g. %20)
  try { raw = decodeURIComponent(raw); } catch {}

  // Normalize Windows backslashes -> forward slashes
  raw = raw.replace(/\\/g, '/');

  // Reject anything that still looks like a URL with a scheme (http/https/etc.)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return res.status(400).json({ error: 'Only local file paths are accepted here' });
  }

  // Make absolute. If user pasted "C:/foo/bar.pdf" -> "C:/foo/bar.pdf".
  // If relative, resolve against process cwd.
  const abs = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);

  if (!fs.existsSync(abs)) {
    return res.status(404).json({ error: `File not found on server: ${abs}` });
  }
  const stat = fs.statSync(abs);
  if (!stat.isFile()) return res.status(400).json({ error: 'Path is not a file' });
  if (stat.size > 200 * 1024 * 1024) return res.status(413).json({ error: 'File too large (>200MB)' });

  const original = path.basename(abs);
  const safe = original.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dest = path.join(UPLOAD_DIR, `${Date.now()}-${uuid().slice(0, 8)}-${safe}`);
  fs.copyFileSync(abs, dest);

  res.json({
    name: original,
    path: `/uploads/${path.basename(dest)}`,
    size: stat.size,
    mimetype: '', // browser infers from extension
    originalPath: abs,
  });
});

// --- Sync db.json to the remote (git add/commit/push) ---------------------
// Runs `git add db.json && git commit -m "synced" && git push origin main` from
// the server's cwd. Returns a small JSON report so the UI can toast the result.
// If there's nothing to commit, the commit step is skipped (no error). If the
// push fails (e.g. no network), the commit is kept locally and the error is
// reported back to the caller.
app.post('/api/sync', (_req, res) => {
  const { execFile } = require('child_process');

  function run(cmd, args) {
    return new Promise((resolve) => {
      execFile(cmd, args, { cwd: ROOT, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') });
      });
    });
  }

  (async () => {
    try {
      // Make sure git sees a change worth committing.
      const status = await run('git', ['status', '--porcelain', '--', 'db.json']);
      if (status.err) {
        return res.status(500).json({ ok: false, error: 'git status failed: ' + status.stderr.trim() });
      }
      const dirty = status.stdout.trim().length > 0;

      if (dirty) {
        const add = await run('git', ['add', 'db.json']);
        if (add.err) return res.status(500).json({ ok: false, error: 'git add failed: ' + add.stderr.trim() });

        const commit = await run('git', ['commit', '-m', 'synced']);
        // Non-zero exit from commit is usually "nothing to commit" (race) — treat as skip.
        if (commit.err && !/nothing to commit/i.test(commit.stderr + commit.stdout)) {
          return res.status(500).json({ ok: false, error: 'git commit failed: ' + (commit.stderr || commit.stdout).trim() });
        }
      }

      const push = await run('git', ['push', 'origin', 'main']);
      if (push.err) {
        return res.json({
          ok: false,
          committed: dirty,
          pushed: false,
          pushSkipped: false,
          error: 'git push failed: ' + (push.stderr || push.stdout).trim(),
        });
      }

      return res.json({
        ok: true,
        committed: dirty,
        commitSkipped: !dirty,
        pushed: true,
        pushSkipped: false,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  })();
});

// --- Heal existing lessons that still reference raw local paths ----------
// On every read, normalize any "C:\..." or "file:///..." resources to /uploads/...
// so old data becomes usable. This mutates db.json in place.
function healLocalPaths(db) {
  let changed = false;
  for (const course of db.courses) {
    for (const lesson of course.lessons || []) {
      const r = lesson.resource;
      if (!r) continue;
      if (/^https?:\/\//i.test(r) || r.startsWith('/uploads/')) continue;
      // Looks like a local path
      if (/^[a-z]:[\\/]/i.test(r) || r.startsWith('file:') || r.startsWith('/') || r.startsWith('\\')) {
        try {
          let abs = r;
          if (/^file:\/\//i.test(abs)) abs = abs.replace(/^file:\/\//i, '');
          abs = abs.replace(/\\/g, '/');
          if (!path.isAbsolute(abs)) abs = path.resolve(process.cwd(), abs);
          if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
            const original = path.basename(abs);
            const safe = original.replace(/[^a-zA-Z0-9._-]/g, '_');
            const dest = path.join(UPLOAD_DIR, `${Date.now()}-${uuid().slice(0, 8)}-${safe}`);
            fs.copyFileSync(abs, dest);
            lesson.resource = `/uploads/${path.basename(dest)}`;
            changed = true;
          }
        } catch (err) {
          // leave as-is; UI will show a clear error
        }
      }
    }
  }
  return changed;
}

// --- Fallback to index.html for client routes ------------------------------
app.get(/^\/(?!api|uploads).*/, (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Open Course Builder running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\nPort ${PORT} is already in use.\n` +
        `  - Find the process:  netstat -ano | findstr :${PORT}\n` +
        `  - Kill it:           taskkill /PID <pid> /F\n` +
        `  - Or use a different port:  set PORT=3001  (cmd)  /  $env:PORT=3001  (powershell), then npm start\n`
    );
    process.exit(1);
  }
  throw err;
});
