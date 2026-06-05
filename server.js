/**
 * Open Course Builder — backend server
 * Express + atomic JSON writes + simple-git + multer file uploads.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const multerPkg = multer;
const multerFactory = multerPkg && multerPkg.default ? multerPkg.default : multerPkg;
const fse = require('fs-extra');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const simpleGit = require('simple-git');

const ROOT = __dirname;
const DB_DIR = path.join(ROOT, 'db');
const OFFLINE_FILES_DIR = path.join(ROOT, 'offline-files');
const ENV_FILE = path.join(ROOT, '.env');
const PORT = parseInt(process.env.PORT || '3000', 10);

const FILES = {
  courseInfo: path.join(DB_DIR, 'course-info.json'),
  stats: path.join(DB_DIR, 'stats.json'),
  createTemp: path.join(DB_DIR, 'create-temp.json'),
  modifyTemp: path.join(DB_DIR, 'modify-temp.json'),
};

const SCHEMAS = {
  courseInfo: {
    schema_version: '1.0.0',
    last_modified: null,
    course: null,
  },
  stats: {
    schema_version: '1.0.0',
    last_modified: null,
    progress: {
      total_topics: 0,
      completed_topics: 0,
      completion_percentage: 0,
      module_progress: {},
    },
    streak: { current: 0, longest: 0, last_activity_date: null },
    heatmap: {},
    weekly_study: {},
    sessions: [],
    upcoming_lessons: [],
  },
  createTemp: {
    schema_version: '1.0.0',
    is_active: false,
    last_saved: null,
    course: { name: '', description: '', modules: [] },
  },
  modifyTemp: {
    schema_version: '1.0.0',
    is_active: false,
    last_saved: null,
    original_course_id: null,
    course: null,
  },
};

const ALLOWED_EXTENSIONS = new Set([
  'mp4', 'mkv', 'webm', 'avi', 'mov', 'm4v',
  'mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac',
  'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'heif', 'heic', 'avif',
  'pdf',
  'md', 'txt', 'doc', 'docx',
  'html', 'htm',
]);

// ---------- Per-file async locks ----------
const locks = {};
async function withLock(key, fn) {
  while (locks[key]) await new Promise((r) => setTimeout(r, 30));
  locks[key] = true;
  try {
    return await fn();
  } finally {
    locks[key] = false;
  }
}

// ---------- Atomic JSON write ----------
async function safeWriteJSON(filepath, data) {
  const tmpPath = filepath + '.tmp';
  const backupPath = filepath + '.backup';
  try {
    await fse.writeJSON(tmpPath, data, { spaces: 2 });
    const verify = await fse.readJSON(tmpPath);
    if (verify === null || verify === undefined) throw new Error('Verification returned null');
    if (await fse.pathExists(filepath)) {
      await fse.copy(filepath, backupPath, { overwrite: true });
    }
    await fse.move(tmpPath, filepath, { overwrite: true });
    return true;
  } catch (err) {
    if (await fse.pathExists(backupPath)) {
      try {
        await fse.copy(backupPath, filepath, { overwrite: true });
      } catch (_) {}
    }
    if (await fse.pathExists(tmpPath)) {
      try {
        await fse.remove(tmpPath);
      } catch (_) {}
    }
    throw new Error(`JSON write failed for ${filepath}: ${err.message}`);
  }
}

async function readJSON(filepath) {
  return fse.readJSON(filepath);
}

// ---------- Date utilities ----------
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayAbbrev(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  // Copy date so don't modify original
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const week = 1 + Math.ceil((firstThursday - target) / 604800000);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function daysBetween(a, b) {
  // a, b are YYYY-MM-DD
  const d1 = new Date(a + 'T00:00:00');
  const d2 = new Date(b + 'T00:00:00');
  return Math.round((d2 - d1) / 86400000);
}

// ---------- Sanitization ----------
function sanitizeFolderName(name) {
  return String(name || 'topic')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100) || 'topic';
}

function isValidUUID(s) {
  return typeof s === 'string' && /^[a-f0-9-]{1,64}$/i.test(s);
}

function validateFilePath(topicId, filename) {
  const safeTopic = path.basename(topicId);
  const safeFile = path.basename(filename);
  const resolved = path.resolve(OFFLINE_FILES_DIR, safeTopic, safeFile);
  const base = path.resolve(OFFLINE_FILES_DIR);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error('Path traversal attempt detected');
  }
  return { resolved, safeTopic, safeFile };
}

// ---------- Recompute stats from course ----------
function recomputeStatsFromCourse(course) {
  const moduleProgress = {};
  let total = 0;
  let completed = 0;
  const upcoming = [];

  const allTopics = [];
  if (course && Array.isArray(course.modules)) {
    for (const m of course.modules) {
      const modTotal = m.topics ? m.topics.length : 0;
      const modCompleted = m.topics ? m.topics.filter((t) => t.is_completed).length : 0;
      moduleProgress[m.id] = {
        total: modTotal,
        completed: modCompleted,
        percentage: modTotal > 0 ? Math.round((modCompleted / modTotal) * 1000) / 10 : 0,
      };
      total += modTotal;
      completed += modCompleted;
      if (m.topics) {
        for (const t of m.topics) {
          allTopics.push(t);
          if (!t.is_completed) upcoming.push(t.id);
        }
      }
    }
  }
  return {
    total_topics: total,
    completed_topics: completed,
    completion_percentage: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
    module_progress: moduleProgress,
    upcoming_lessons: upcoming.slice(0, 5),
  };
}

// ---------- Streak update ----------
function updateStreak(streak, today) {
  const last = streak.last_activity_date;
  if (last === today) {
    return streak;
  }
  if (!last) {
    return { current: 1, longest: Math.max(1, streak.longest || 0), last_activity_date: today };
  }
  const diff = daysBetween(last, today);
  if (diff === 1) {
    const newCur = (streak.current || 0) + 1;
    return {
      current: newCur,
      longest: Math.max(newCur, streak.longest || 0),
      last_activity_date: today,
    };
  }
  if (diff > 1) {
    return { current: 1, longest: Math.max(1, streak.longest || 0), last_activity_date: today };
  }
  // diff < 1 (shouldn't happen) — keep as is
  return { ...streak, last_activity_date: today };
}

// ---------- Startup: ensure DB files + reconcile ----------
async function ensureDB() {
  await fse.ensureDir(DB_DIR);
  await fse.ensureDir(OFFLINE_FILES_DIR);

  for (const [key, filepath] of Object.entries(FILES)) {
    if (!(await fse.pathExists(filepath))) {
      await safeWriteJSON(filepath, SCHEMAS[key]);
      continue;
    }
    try {
      await fse.readJSON(filepath);
    } catch (err) {
      const corruptPath = `${filepath}.corrupt.${Date.now()}`;
      await fse.move(filepath, corruptPath, { overwrite: true });
      console.error(`[startup] Corrupt JSON moved to ${corruptPath}: ${err.message}`);
      await safeWriteJSON(filepath, SCHEMAS[key]);
    }
  }

  // Reconcile stats with course
  const courseData = await readJSON(FILES.courseInfo);
  const statsData = await readJSON(FILES.stats);
  const expected = recomputeStatsFromCourse(courseData.course);

  let drift = false;
  if (statsData.progress.total_topics !== expected.total_topics) drift = true;
  if (statsData.progress.completed_topics !== expected.completed_topics) drift = true;
  if (JSON.stringify(statsData.progress.module_progress) !== JSON.stringify(expected.module_progress)) drift = true;
  if (JSON.stringify(statsData.upcoming_lessons) !== JSON.stringify(expected.upcoming_lessons)) drift = true;

  if (drift) {
    statsData.progress = expected;
    statsData.last_modified = new Date().toISOString();
    await safeWriteJSON(FILES.stats, statsData);
    console.log('[startup] stats.json reconciled with course-info.json');
  }

  // Streak: if last activity more than 1 day old and no activity today, reset current to 0
  const today = todayStr();
  if (statsData.streak.last_activity_date) {
    const diff = daysBetween(statsData.streak.last_activity_date, today);
    if (diff > 1) {
      statsData.streak.current = 0;
      statsData.last_modified = new Date().toISOString();
      await safeWriteJSON(FILES.stats, statsData);
      console.log('[startup] streak reset to 0 (no activity in >1 day)');
    }
  }
}

// ---------- Multer setup ----------
const storage = multerFactory.diskStorage({
  destination: (req, file, cb) => {
    const topicId = (req.body && req.body.topic_id) || '';
    if (!isValidUUID(topicId) && !/^[a-zA-Z0-9_\-]{1,64}$/.test(topicId)) {
      return cb(new Error('Invalid topic_id'));
    }
    const dest = path.join(OFFLINE_FILES_DIR, topicId);
    fse.ensureDir(dest).then(() => cb(null, dest)).catch((err) => cb(err));
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().replace('.', '');
    const base = path.basename(file.originalname, path.extname(file.originalname));
    let safeBase = base.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').slice(0, 80) || 'file';
    let name = `${safeBase}.${ext}`;
    const topicId = req.body.topic_id;
    const dest = path.join(OFFLINE_FILES_DIR, topicId);
    if (fs.existsSync(path.join(dest, name))) {
      name = `${safeBase}_${Date.now()}.${ext}`;
    }
    cb(null, name);
  },
});

const upload = multerFactory({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

// In-memory multer for routes that need to read the file contents into memory
// (e.g. course import). Avoids the per-route diskStorage destination validation
// that requires a `topic_id` body field.
const uploadMemory = multerFactory({
  storage: multerFactory.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ---------- Express app ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static: index.html, app.js
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

// Static: public assets (js, css, etc.)
app.use(
  '/public',
  express.static(path.join(ROOT, 'public'), {
    etag: false,
    lastModified: true,
    setHeaders: (res) => {
      res.set('Cache-Control', 'no-store');
    },
  })
);

// Convenience: also serve JS at top-level for backward-compat with /js/* paths
app.use(
  '/js',
  express.static(path.join(ROOT, 'public', 'js'), {
    etag: false,
    lastModified: true,
    setHeaders: (res) => {
      res.set('Cache-Control', 'no-store');
    },
  })
);

// Static: offline files (with range support for video/audio)
app.use(
  '/files',
  express.static(OFFLINE_FILES_DIR, {
    acceptRanges: true,
    etag: false,
    lastModified: true,
    setHeaders: (res) => {
      res.set('Cache-Control', 'no-store');
    },
  })
);

// Mirror offline files at /offline-files/* for topic viewer references
app.use(
  '/offline-files',
  express.static(OFFLINE_FILES_DIR, {
    acceptRanges: true,
    etag: false,
    lastModified: true,
    setHeaders: (res) => {
      res.set('Cache-Control', 'no-store');
    },
  })
);

// ---------- Helpers ----------
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function nowISO() {
  return new Date().toISOString();
}

// ---------- Routes ----------

// CONFIG
app.get(
  '/api/config',
  asyncHandler(async (req, res) => {
    res.json({
      port: PORT,
      hasGitRemote: !!process.env.GIT_REMOTE_URL && process.env.GIT_REMOTE_URL.length > 0,
      gitUserName: process.env.GIT_USER_NAME || '',
      gitUserEmail: process.env.GIT_USER_EMAIL || '',
    });
  })
);

// COURSE
app.get(
  '/api/course',
  asyncHandler(async (req, res) => {
    const data = await readJSON(FILES.courseInfo);
    res.json(data);
  })
);

// STATS
app.get(
  '/api/stats',
  asyncHandler(async (req, res) => {
    const data = await readJSON(FILES.stats);
    res.json(data);
  })
);

// TOPICS: complete (alias below handles the {completed}/{is_completed} shim)

// TOPICS: notes
app.patch(
  '/api/topics/:topicId/notes',
  asyncHandler(async (req, res) => {
    const { topicId } = req.params;
    const { notes } = req.body;
    if (typeof notes !== 'string') {
      return res.status(400).json({ error: 'notes (string) is required' });
    }
    await withLock('course-info', async () => {
      const courseData = await readJSON(FILES.courseInfo);
      let found = false;
      for (const m of courseData.course?.modules || []) {
        for (const t of m.topics) {
          if (t.id === topicId) {
            t.notes = notes;
            t.updated_at = nowISO();
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) {
        const err = new Error('Topic not found');
        err.status = 404;
        throw err;
      }
      courseData.last_modified = nowISO();
      await safeWriteJSON(FILES.courseInfo, courseData);
    });
    res.json({ success: true });
  })
);

// SESSION start
app.post(
  '/api/session/start',
  asyncHandler(async (req, res) => {
    const sessionId = uuidv4();
    await withLock('stats', async () => {
      const statsData = await readJSON(FILES.stats);
      statsData.sessions.push({
        session_id: sessionId,
        started_at: nowISO(),
        ended_at: null,
        duration_seconds: 0,
        topics_interacted: [],
        date: todayStr(),
      });
      statsData.last_modified = nowISO();
      await safeWriteJSON(FILES.stats, statsData);
    });
    res.json({ session_id: sessionId });
  })
);

// SESSION heartbeat
app.patch(
  '/api/session/:sessionId/heartbeat',
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { duration_seconds, topics_interacted } = req.body;
    const dur = Number(duration_seconds) || 0;
    const topics = Array.isArray(topics_interacted) ? topics_interacted : [];

    await withLock('stats', async () => {
      const statsData = await readJSON(FILES.stats);
      const session = statsData.sessions.find((s) => s.session_id === sessionId);
      if (!session) {
        const err = new Error('Session not found');
        err.status = 404;
        throw err;
      }
      session.duration_seconds = dur;
      // Merge topics
      const set = new Set([...(session.topics_interacted || []), ...topics]);
      session.topics_interacted = Array.from(set);

      const today = todayStr();
      if (!statsData.heatmap[today]) {
        statsData.heatmap[today] = { study_time_seconds: 0, topics_completed: 0, topics_viewed: [] };
      }
      statsData.heatmap[today].study_time_seconds = Math.max(
        statsData.heatmap[today].study_time_seconds || 0,
        dur
      );
      for (const tid of topics) {
        if (!statsData.heatmap[today].topics_viewed.includes(tid)) {
          statsData.heatmap[today].topics_viewed.push(tid);
        }
      }

      const weekKey = isoWeekKey(today);
      if (!statsData.weekly_study[weekKey]) {
        statsData.weekly_study[weekKey] = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
      }
      const dayName = dayAbbrev(today);
      statsData.weekly_study[weekKey][dayName] = Math.max(
        statsData.weekly_study[weekKey][dayName] || 0,
        dur
      );

      statsData.last_modified = nowISO();
      await safeWriteJSON(FILES.stats, statsData);
    });
    res.json({ success: true });
  })
);

// SESSION end
app.post(
  '/api/session/:sessionId/end',
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { duration_seconds, topics_interacted } = req.body || {};
    const dur = Number(duration_seconds) || 0;
    const topics = Array.isArray(topics_interacted) ? topics_interacted : [];

    await withLock('stats', async () => {
      const statsData = await readJSON(FILES.stats);
      const session = statsData.sessions.find((s) => s.session_id === sessionId);
      if (!session) return; // idempotent
      session.ended_at = nowISO();
      session.duration_seconds = dur;
      const set = new Set([...(session.topics_interacted || []), ...topics]);
      session.topics_interacted = Array.from(set);

      const today = todayStr();
      if (!statsData.heatmap[today]) {
        statsData.heatmap[today] = { study_time_seconds: 0, topics_completed: 0, topics_viewed: [] };
      }
      statsData.heatmap[today].study_time_seconds = Math.max(
        statsData.heatmap[today].study_time_seconds || 0,
        dur
      );
      for (const tid of topics) {
        if (!statsData.heatmap[today].topics_viewed.includes(tid)) {
          statsData.heatmap[today].topics_viewed.push(tid);
        }
      }
      const weekKey = isoWeekKey(today);
      if (!statsData.weekly_study[weekKey]) {
        statsData.weekly_study[weekKey] = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
      }
      const dayName = dayAbbrev(today);
      statsData.weekly_study[weekKey][dayName] = Math.max(
        statsData.weekly_study[weekKey][dayName] || 0,
        dur
      );

      // Keep last 365 sessions
      if (statsData.sessions.length > 365) {
        statsData.sessions = statsData.sessions.slice(-365);
      }

      statsData.last_modified = nowISO();
      await safeWriteJSON(FILES.stats, statsData);
    });
    res.json({ success: true });
  })
);

// TEMP CREATE
app.get(
  '/api/temp/create',
  asyncHandler(async (req, res) => {
    const data = await readJSON(FILES.createTemp);
    res.json(data);
  })
);

app.put(
  '/api/temp/create',
  asyncHandler(async (req, res) => {
    const { course } = req.body || {};
    if (!course || typeof course !== 'object') {
      return res.status(400).json({ error: 'course object is required' });
    }
    await withLock('create-temp', async () => {
      const data = await readJSON(FILES.createTemp);
      data.is_active = true;
      data.last_saved = nowISO();
      data.course = {
        name: course.name || '',
        description: course.description || '',
        modules: Array.isArray(course.modules) ? course.modules : [],
      };
      await safeWriteJSON(FILES.createTemp, data);
    });
    const updated = await readJSON(FILES.createTemp);
    res.json({ success: true, last_saved: updated.last_saved });
  })
);

app.delete(
  '/api/temp/create',
  asyncHandler(async (req, res) => {
    await withLock('create-temp', async () => {
      await safeWriteJSON(FILES.createTemp, JSON.parse(JSON.stringify(SCHEMAS.createTemp)));
    });
    res.json({ success: true });
  })
);

// TEMP MODIFY
app.get(
  '/api/temp/modify',
  asyncHandler(async (req, res) => {
    const data = await readJSON(FILES.modifyTemp);
    res.json(data);
  })
);

app.post(
  '/api/temp/modify/start',
  asyncHandler(async (req, res) => {
    let result;
    await withLock('modify-temp', async () => {
      const data = await readJSON(FILES.modifyTemp);
      // If existing active modify, keep
      if (!data.is_active || !data.course) {
        const courseData = await readJSON(FILES.courseInfo);
        data.is_active = true;
        data.last_saved = nowISO();
        data.original_course_id = courseData.course ? courseData.course.id : null;
        data.course = courseData.course ? JSON.parse(JSON.stringify(courseData.course)) : null;
        await safeWriteJSON(FILES.modifyTemp, data);
      }
      result = data;
    });
    res.json({ success: true, course: result.course });
  })
);

app.put(
  '/api/temp/modify',
  asyncHandler(async (req, res) => {
    const { course } = req.body || {};
    if (!course) return res.status(400).json({ error: 'course object is required' });
    await withLock('modify-temp', async () => {
      const data = await readJSON(FILES.modifyTemp);
      data.is_active = true;
      data.last_saved = nowISO();
      data.course = course;
      await safeWriteJSON(FILES.modifyTemp, data);
    });
    const updated = await readJSON(FILES.modifyTemp);
    res.json({ success: true, last_saved: updated.last_saved });
  })
);

// Commit the active modify-temp into course-info.json. Preserves prior
// per-topic state (is_completed, completed_at, notes, created_at) for
// any topics that still exist by id, and reconciles stats. Must be
// called from inside `withLock('course-info', ...)`.
async function commitModifyTempToCourse() {
  const modifyData = await readJSON(FILES.modifyTemp);
  if (!modifyData.is_active || !modifyData.course) {
    const err = new Error('No active modification to save');
    err.status = 400;
    throw err;
  }
  const courseData = await readJSON(FILES.courseInfo);
  const oldCourse = courseData.course || { modules: [] };

  // Build map of previous topic data by id
  const prevTopicMap = {};
  for (const m of oldCourse.modules || []) {
    for (const t of m.topics || []) {
      prevTopicMap[t.id] = {
        is_completed: t.is_completed,
        completed_at: t.completed_at,
        notes: t.notes,
        created_at: t.created_at,
      };
    }
  }
  const prevModuleMap = {};
  for (const m of oldCourse.modules || []) {
    prevModuleMap[m.id] = { created_at: m.created_at };
  }

  const newCourse = JSON.parse(JSON.stringify(modifyData.course));
  // Generate IDs and merge preserved fields
  if (!newCourse.id) newCourse.id = uuidv4();
  newCourse.created_at = oldCourse.id === newCourse.id && oldCourse.created_at ? oldCourse.created_at : nowISO();
  newCourse.updated_at = nowISO();
  newCourse.modules = Array.isArray(newCourse.modules) ? newCourse.modules : [];

  for (let i = 0; i < newCourse.modules.length; i++) {
    const m = newCourse.modules[i];
    if (!m.id) m.id = uuidv4();
    m.order = i + 1;
    m.created_at = prevModuleMap[m.id] ? prevModuleMap[m.id].created_at : nowISO();
    m.updated_at = nowISO();
    m.topics = Array.isArray(m.topics) ? m.topics : [];
    for (let j = 0; j < m.topics.length; j++) {
      const t = m.topics[j];
      if (!t.id) t.id = uuidv4();
      t.order = j + 1;
      const prev = prevTopicMap[t.id];
      if (prev) {
        t.is_completed = prev.is_completed;
        t.completed_at = prev.completed_at;
        t.notes = prev.notes;
        t.created_at = prev.created_at;
      } else {
        t.is_completed = false;
        t.completed_at = null;
        t.notes = t.notes || '';
        t.created_at = nowISO();
      }
      t.updated_at = nowISO();
      if (typeof t.notes !== 'string') t.notes = '';
    }
  }

  courseData.course = newCourse;
  courseData.last_modified = nowISO();
  await safeWriteJSON(FILES.courseInfo, courseData);

  // Reconcile stats
  await withLock('stats', async () => {
    const statsData = await readJSON(FILES.stats);
    const expected = recomputeStatsFromCourse(newCourse);
    // Remove module_progress entries for deleted modules
    const newModuleIds = new Set(newCourse.modules.map((m) => m.id));
    for (const id of Object.keys(statsData.progress.module_progress)) {
      if (!newModuleIds.has(id)) {
        delete statsData.progress.module_progress[id];
      }
    }
    statsData.progress = {
      total_topics: expected.total_topics,
      completed_topics: expected.completed_topics,
      completion_percentage: expected.completion_percentage,
      module_progress: { ...statsData.progress.module_progress, ...expected.module_progress },
    };
    statsData.upcoming_lessons = expected.upcoming_lessons;
    statsData.last_modified = nowISO();
    await safeWriteJSON(FILES.stats, statsData);
  });

  // Clear modify-temp
  await withLock('modify-temp', async () => {
    await safeWriteJSON(FILES.modifyTemp, JSON.parse(JSON.stringify(SCHEMAS.modifyTemp)));
  });

  const finalCourse = await readJSON(FILES.courseInfo);
  const finalStats = await readJSON(FILES.stats);
  return { course: finalCourse, stats: finalStats };
}

app.post(
  '/api/temp/modify/save',
  asyncHandler(async (req, res) => {
    let responseData;
    await withLock('course-info', async () => {
      responseData = await commitModifyTempToCourse();
    });
    res.json({ success: true, course: responseData.course, stats: responseData.stats });
  })
);

app.delete(
  '/api/temp/modify',
  asyncHandler(async (req, res) => {
    await withLock('modify-temp', async () => {
      const data = await readJSON(FILES.modifyTemp);
      data.is_active = false;
      // Preserve course per spec
      await safeWriteJSON(FILES.modifyTemp, data);
    });
    res.json({ success: true });
  })
);

// COURSE CREATE
app.post(
  '/api/course/create',
  asyncHandler(async (req, res) => {
    const { course } = req.body || {};
    if (!course || typeof course !== 'object') {
      return res.status(400).json({ error: 'course object is required' });
    }
    if (!course.name || !String(course.name).trim()) {
      return res.status(400).json({ error: 'Course name is required' });
    }
    if (!Array.isArray(course.modules) || course.modules.length === 0) {
      return res.status(400).json({ error: 'At least one module is required' });
    }
    for (const m of course.modules) {
      if (!m.name || !String(m.name).trim()) {
        return res.status(400).json({ error: 'Each module must have a name' });
      }
    }

    let result;
    await withLock('course-info', async () => {
      const now = nowISO();
      const newCourse = {
        id: course.id || uuidv4(),
        name: String(course.name).trim(),
        description: course.description || '',
        created_at: now,
        updated_at: now,
        modules: course.modules.map((m, i) => ({
          id: m.id || uuidv4(),
          name: String(m.name).trim(),
          order: i + 1,
          created_at: m.created_at || now,
          updated_at: now,
          topics: (m.topics || []).map((t, j) => ({
            id: t.id || uuidv4(),
            name: String(t.name || '').trim(),
            description: t.description || '',
            order: j + 1,
            content_type: t.content_type || 'website',
            url: t.url || '',
            local_file_path: t.local_file_path || '',
            local_file_name: t.local_file_name || '',
            text_content: t.text_content || '',
            is_completed: false,
            completed_at: null,
            notes: '',
            created_at: t.created_at || now,
            updated_at: now,
          })),
        })),
      };
      const courseData = {
        schema_version: '1.0.0',
        last_modified: now,
        course: newCourse,
      };
      await safeWriteJSON(FILES.courseInfo, courseData);

      // Initialize fresh stats
      await withLock('stats', async () => {
        const statsData = JSON.parse(JSON.stringify(SCHEMAS.stats));
        statsData.last_modified = now;
        statsData.progress = recomputeStatsFromCourse(newCourse);
        await safeWriteJSON(FILES.stats, statsData);
      });

      // Clear create-temp
      await withLock('create-temp', async () => {
        await safeWriteJSON(FILES.createTemp, JSON.parse(JSON.stringify(SCHEMAS.createTemp)));
      });

      result = {
        course: await readJSON(FILES.courseInfo),
        stats: await readJSON(FILES.stats),
      };
    });
    res.json({ success: true, course: result.course, stats: result.stats });
  })
);

// COURSE IMPORT
app.post(
  '/api/course/import',
  uploadMemory.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    let parsed;
    try {
      const raw = req.file.buffer.toString('utf-8');
      parsed = JSON.parse(raw);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid JSON file' });
    }
    if (!parsed.course || !parsed.course.name || !Array.isArray(parsed.course.modules)) {
      return res.status(400).json({ error: 'Invalid course structure (need course.name and course.modules)' });
    }

    let result;
    await withLock('course-info', async () => {
      const now = nowISO();
      const imported = parsed.course;
      const newCourse = {
        id: uuidv4(),
        name: String(imported.name).trim(),
        description: imported.description || '',
        created_at: now,
        updated_at: now,
        modules: imported.modules.map((m, i) => ({
          id: uuidv4(),
          name: String(m.name || 'Untitled Module').trim(),
          order: i + 1,
          created_at: now,
          updated_at: now,
          topics: (m.topics || []).map((t, j) => ({
            id: uuidv4(),
            name: String(t.name || 'Untitled Topic').trim(),
            description: t.description || '',
            order: j + 1,
            content_type: t.content_type || 'website',
            url: t.url || '',
            local_file_path: '', // do not import local file references
            local_file_name: '',
            text_content: t.text_content || '',
            is_completed: false,
            completed_at: null,
            notes: '',
            created_at: now,
            updated_at: now,
          })),
        })),
      };
      const courseData = {
        schema_version: '1.0.0',
        last_modified: now,
        course: newCourse,
      };
      await safeWriteJSON(FILES.courseInfo, courseData);

      // Initialize progress fields but keep heatmap + sessions
      await withLock('stats', async () => {
        const statsData = await readJSON(FILES.stats);
        const nowStats = nowISO();
        const expected = recomputeStatsFromCourse(newCourse);
        statsData.progress = expected;
        statsData.upcoming_lessons = expected.upcoming_lessons;
        statsData.last_modified = nowStats;
        await safeWriteJSON(FILES.stats, statsData);
      });

      result = await readJSON(FILES.courseInfo);
    });
    res.json({ success: true, course: result });
  })
);

// COURSE EXPORT
app.get(
  '/api/course/export',
  asyncHandler(async (req, res) => {
    const includeStats = req.query.include_stats === 'true';
    const courseData = await readJSON(FILES.courseInfo);
    const exportData = JSON.parse(JSON.stringify(courseData));
    if (!exportData.course) {
      return res.status(400).json({ error: 'No course to export' });
    }
    if (!includeStats) {
      for (const m of exportData.course.modules) {
        for (const t of m.topics) {
          t.is_completed = false;
          t.completed_at = null;
          t.notes = '';
        }
      }
    }
    const safeName = sanitizeFolderName(exportData.course.name || 'course');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-export.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  })
);

// FILES upload
app.post(
  '/api/files/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const topicId = (req.body && req.body.topic_id) || '';
    if (!isValidUUID(topicId) && !/^[a-zA-Z0-9_\-]{1,64}$/.test(topicId)) {
      try { await fse.remove(req.file.path); } catch (_) {}
      return res.status(400).json({ error: 'Invalid topic_id' });
    }
    const ext = (path.extname(req.file.originalname) || '').toLowerCase().replace('.', '');
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      try { await fse.remove(req.file.path); } catch (_) {}
      return res.status(400).json({ error: `File type not supported: .${ext}` });
    }
    // Zero-byte check
    if (req.file.size === 0) {
      try { await fse.remove(req.file.path); } catch (_) {}
      return res.status(400).json({ error: 'Uploaded file is empty' });
    }
    const filename = req.file.filename;
    res.json({
      success: true,
      file_name: filename,
      file_path: `offline-files/${topicId}/${filename}`,
      url_path: `/files/${topicId}/${filename}`,
      size: req.file.size,
    });
  })
);

// FILES list
app.get(
  '/api/files/list/:topicId',
  asyncHandler(async (req, res) => {
    const { topicId } = req.params;
    if (!/^[a-zA-Z0-9_\-]{1,64}$/.test(topicId)) {
      return res.status(400).json({ error: 'Invalid topicId' });
    }
    const dir = path.join(OFFLINE_FILES_DIR, topicId);
    if (!(await fse.pathExists(dir))) {
      return res.json({ files: [] });
    }
    const entries = await fse.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const e of entries) {
      if (!e.isFile()) continue;
      const full = path.join(dir, e.name);
      const stat = await fse.stat(full);
      files.push({
        name: e.name,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        url_path: `/files/${topicId}/${e.name}`,
      });
    }
    res.json({ files });
  })
);

// FILES delete
app.delete(
  '/api/files/:topicId/:filename',
  asyncHandler(async (req, res) => {
    const { topicId, filename } = req.params;
    let resolved;
    try {
      resolved = validateFilePath(topicId, filename);
    } catch (err) {
      return res.status(403).json({ error: err.message });
    }
    if (!(await fse.pathExists(resolved.resolved))) {
      return res.status(404).json({ error: 'File not found' });
    }
    await fse.remove(resolved.resolved);
    // Remove empty folder
    const dir = path.dirname(resolved.resolved);
    try {
      const remaining = await fse.readdir(dir);
      if (remaining.length === 0) await fse.remove(dir);
    } catch (_) {}
    res.json({ success: true });
  })
);

// Multer error handler for file size etc.
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 500MB)' });
  }
  if (err && err.message && /File type not supported/.test(err.message)) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// GIT
app.get(
  '/api/git/status',
  asyncHandler(async (req, res) => {
    const configured = !!process.env.GIT_REMOTE_URL;
    let branch = null;
    let has_remote = false;
    let remote_url = process.env.GIT_REMOTE_URL || null;
    let uncommitted = false;
    try {
      if (fs.existsSync(path.join(ROOT, '.git'))) {
        const git = simpleGit(ROOT);
        try {
          const status = await git.status();
          branch = status.current || null;
          uncommitted = !status.isClean();
        } catch (_) {}
        try {
          const remotes = await git.getRemotes(true);
          has_remote = remotes.some((r) => r.name === 'origin');
        } catch (_) {}
      }
    } catch (_) {}
    res.json({
      configured,
      has_remote: has_remote || configured,
      branch,
      uncommitted_changes: uncommitted,
      remote_url,
    });
  })
);

app.get(
  '/api/git/config',
  asyncHandler(async (req, res) => {
    // Frontend's GitModal._loadConfig() reads { repo, branch, token, enabled,
    // author_name, author_email, last_status }. The server only persists
    // remote_url, user_name, user_email via .env; we project them onto the
    // shape the SPA expects, leaving the fields it owns locally (token,
    // enabled, last_status) as null/false.
    let last_status = null;
    try {
      const dbStats = await readJSON(FILES.stats);
      if (dbStats && dbStats.git_last_status) last_status = dbStats.git_last_status;
    } catch (_) {}
    res.json({
      repo: process.env.GIT_REMOTE_URL || '',
      branch: 'main',
      token: '',
      enabled: !!process.env.GIT_REMOTE_URL,
      author_name: process.env.GIT_USER_NAME || '',
      author_email: process.env.GIT_USER_EMAIL || '',
      last_status,
    });
  })
);

app.post(
  '/api/git/config',
  asyncHandler(async (req, res) => {
    const { remote_url, user_name, user_email } = req.body || {};
    if (!remote_url || typeof remote_url !== 'string') {
      return res.status(400).json({ error: 'remote_url is required' });
    }
    if (!/^https:\/\//i.test(remote_url)) {
      return res.status(400).json({ error: 'Only https:// remote URLs are allowed' });
    }
    // Update .env
    const envLines = [];
    envLines.push(`PORT=${process.env.PORT || 3000}`);
    envLines.push(`GIT_REMOTE_URL=${remote_url}`);
    envLines.push(`GIT_USER_NAME=${user_name || ''}`);
    envLines.push(`GIT_USER_EMAIL=${user_email || ''}`);
    await fse.writeFile(ENV_FILE, envLines.join('\n') + '\n');
    process.env.GIT_REMOTE_URL = remote_url;
    process.env.GIT_USER_NAME = user_name || '';
    process.env.GIT_USER_EMAIL = user_email || '';

    // Init repo if needed
    if (!fs.existsSync(path.join(ROOT, '.git'))) {
      const git = simpleGit(ROOT);
      await git.init();
      await git.addConfig('user.name', user_name || 'Open Course Builder');
      await git.addConfig('user.email', user_email || 'user@local');
    }
    const git = simpleGit(ROOT);
    await git.addConfig('user.name', user_name || 'Open Course Builder');
    await git.addConfig('user.email', user_email || 'user@local');

    const remotes = await git.getRemotes();
    if (remotes.find((r) => r.name === 'origin')) {
      await git.remote(['set-url', 'origin', remote_url]);
    } else {
      await git.addRemote('origin', remote_url);
    }
    res.json({ success: true });
  })
);

function buildCommitMessage(oldCourseData, newCourseData, oldStats, newStats) {
  const lines = [];
  try {
    if (oldCourseData && newCourseData) {
      const oldTopics = {};
      for (const m of oldCourseData.modules || []) {
        for (const t of m.topics || []) oldTopics[t.id] = t;
      }
      const newTopics = {};
      for (const m of newCourseData.modules || []) {
        for (const t of m.topics || []) newTopics[t.id] = t;
      }
      // Newly completed
      const completedNames = [];
      let extra = 0;
      for (const id of Object.keys(newTopics)) {
        const nt = newTopics[id];
        const ot = oldTopics[id];
        if (nt.is_completed && ot && !ot.is_completed) {
          if (completedNames.length < 3) completedNames.push(nt.name);
          else extra++;
        }
      }
      if (completedNames.length > 0) {
        let msg = `Completed: ${completedNames.join(', ')}`;
        if (extra > 0) msg += ` +${extra} more`;
        lines.push(msg);
      }
      // Notes updates
      for (const id of Object.keys(newTopics)) {
        const nt = newTopics[id];
        const ot = oldTopics[id];
        if (ot && (nt.notes || '') !== (ot.notes || '')) {
          lines.push(`Updated notes for ${nt.name}`);
          break;
        }
      }
      // Module added
      const oldModIds = new Set((oldCourseData.modules || []).map((m) => m.id));
      for (const m of newCourseData.modules || []) {
        if (!oldModIds.has(m.id)) {
          lines.push(`Added module: ${m.name}`);
          break;
        }
      }
      // Name change
      if (oldCourseData.name !== newCourseData.name) {
        lines.push(`Renamed course to ${newCourseData.name}`);
      }
    }
    if (oldStats && newStats) {
      const oldStreak = oldStats.streak?.current || 0;
      const newStreak = newStats.streak?.current || 0;
      for (const milestone of [7, 14, 30, 50, 100, 365]) {
        if (oldStreak < milestone && newStreak >= milestone) {
          lines.push(`🔥 ${milestone}-day streak milestone!`);
          break;
        }
      }
    }
  } catch (_) {}
  if (lines.length === 0) {
    lines.push(`Progress update: ${todayStr()}`);
  }
  let msg = lines.join('; ');
  if (msg.length > 72) msg = msg.slice(0, 69) + '...';
  return msg;
}

app.post(
  '/api/git/save',
  asyncHandler(async (req, res) => {
    if (!process.env.GIT_REMOTE_URL) {
      return res.status(400).json({ success: false, error: 'Git remote not configured', step_failed: 'config' });
    }
    if (!fs.existsSync(path.join(ROOT, '.git'))) {
      const git = simpleGit(ROOT);
      await git.init();
      await git.addConfig('user.name', process.env.GIT_USER_NAME || 'Open Course Builder');
      await git.addConfig('user.email', process.env.GIT_USER_EMAIL || 'user@local');
      // Initial commit if nothing committed yet
      try {
        await git.add('.gitignore');
        await git.commit('Initial commit');
      } catch (_) {}
    }
    const git = simpleGit(ROOT);
    await git.addConfig('user.name', process.env.GIT_USER_NAME || 'Open Course Builder');
    await git.addConfig('user.email', process.env.GIT_USER_EMAIL || 'user@local');

    // Check if there are changes to db files
    let status;
    try {
      status = await git.status();
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message, step_failed: 'status' });
    }
    const changed = [
      ...(status.modified || []),
      ...(status.created || []),
      ...(status.not_added || []),
      ...(status.deleted || []),
    ];
    const relevant = changed.filter((f) => f === 'db/course-info.json' || f === 'db/stats.json');
    if (relevant.length === 0) {
      return res.json({ success: true, message: 'Nothing to sync' });
    }

    // Build commit message
    const oldCourseData = (await readJSON(FILES.courseInfo)).course || { modules: [] };
    // For "old" comparison, use git HEAD version
    let oldCourseFromGit = { modules: [] };
    try {
      const show = await git.show(['HEAD:db/course-info.json']);
      oldCourseFromGit = JSON.parse(show).course || { modules: [] };
    } catch (_) {}
    let oldStatsFromGit = null;
    try {
      const show = await git.show(['HEAD:db/stats.json']);
      oldStatsFromGit = JSON.parse(show);
    } catch (_) {}
    const newCourse = (await readJSON(FILES.courseInfo)).course || { modules: [] };
    const newStats = await readJSON(FILES.stats);

    const commitMessage = buildCommitMessage(oldCourseFromGit, newCourse, oldStatsFromGit, newStats);

    try {
      await git.add(['db/course-info.json', 'db/stats.json']);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message, step_failed: 'add' });
    }
    try {
      await git.commit(commitMessage);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message, step_failed: 'commit' });
    }
    // Determine branch
    let branch = status.current;
    if (!branch) {
      try {
        const bs = await git.status();
        branch = bs.current || 'main';
      } catch (_) {
        branch = 'main';
      }
    }
    try {
      await git.push('origin', branch);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message, step_failed: 'push' });
    }
    res.json({ success: true, commit_message: commitMessage, timestamp: nowISO() });
  })
);

// PROXY check embeddable
app.post(
  '/api/proxy/check-embeddable',
  express.json({ limit: '64kb' }),
  asyncHandler(async (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return res.json({ embeddable: false, reason: 'invalid_url' });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const resp = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
      clearTimeout(timeout);
      const xfo = (resp.headers.get('x-frame-options') || '').toUpperCase();
      const csp = (resp.headers.get('content-security-policy') || '').toLowerCase();
      let blocked = false;
      if (xfo === 'DENY' || xfo === 'SAMEORIGIN') blocked = true;
      if (csp.includes('frame-ancestors') && !csp.includes('frame-ancestors *')) blocked = true;
      if (blocked) {
        return res.json({ embeddable: false, reason: 'x_frame_options_or_csp' });
      }
      return res.json({ embeddable: true, reason: null });
    } catch (err) {
      clearTimeout(timeout);
      return res.json({ embeddable: false, reason: 'check_failed' });
    }
  })
);

// ---------- Frontend compat aliases ----------
// The multi-file SPA uses a plural REST style and a few path renames.
// These thin aliases forward to the canonical handlers above so the
// frontend and the original CLI/automation API consumers both work.

app.get(
  '/api/settings',
  asyncHandler(async (req, res) => {
    const configured = !!process.env.GIT_REMOTE_URL;
    res.json({
      port: PORT,
      has_git_remote: configured,
      git_user: process.env.GIT_USER_NAME || '',
      git_email: process.env.GIT_USER_EMAIL || '',
      version: '1.0.0',
    });
  })
);

app.get(
  '/api/courses',
  asyncHandler(async (req, res) => {
    const courseData = await readJSON(FILES.courseInfo);
    const statsData = await readJSON(FILES.stats);
    res.json({ course: courseData.course, stats: statsData });
  })
);

app.put(
  '/api/courses',
  asyncHandler(async (req, res) => {
    const incoming = req.body;
    if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.modules)) {
      return res.status(400).json({ error: 'Course object with modules[] is required' });
    }
    // Stage the incoming course as the active modify-temp, then commit
    // it. This routes through the same id-preservation / stats-reconcile
    // path as the modify modal.
    await withLock('modify-temp', async () => {
      const data = await readJSON(FILES.modifyTemp);
      const courseData = await readJSON(FILES.courseInfo);
      data.is_active = true;
      data.last_saved = nowISO();
      data.original_course_id = courseData.course ? courseData.course.id : (incoming.id || null);
      // Keep IDs from the incoming course as-is (they are the live ones);
      // commitModifyTempToCourse will reconcile prevTopicMap against them.
      data.course = JSON.parse(JSON.stringify(incoming));
      await safeWriteJSON(FILES.modifyTemp, data);
    });
    let result;
    await withLock('course-info', async () => {
      result = await commitModifyTempToCourse();
    });
    res.json({ success: true, course: result.course, stats: result.stats });
  })
);

app.post(
  '/api/courses',
  asyncHandler(async (req, res) => {
    // Create-from-draft. The frontend sends either the draft root
    // ({ name, description, modules: [...] }) or a wrapped shape.
    const incoming = req.body || {};
    const draft = incoming.course && Array.isArray(incoming.course.modules) ? incoming.course : incoming;
    if (!draft || typeof draft !== 'object') {
      return res.status(400).json({ error: 'Course object is required' });
    }
    if (!draft.name || !String(draft.name).trim()) {
      return res.status(400).json({ error: 'Course name is required' });
    }
    if (!Array.isArray(draft.modules) || draft.modules.length === 0) {
      return res.status(400).json({ error: 'At least one module is required' });
    }
    for (const m of draft.modules) {
      if (!m.name || !String(m.name).trim()) {
        return res.status(400).json({ error: 'Each module must have a name' });
      }
    }

    let result;
    await withLock('course-info', async () => {
      const now = nowISO();
      const newCourse = {
        id: draft.id || uuidv4(),
        name: String(draft.name).trim(),
        description: draft.description || '',
        created_at: now,
        updated_at: now,
        modules: draft.modules.map((m, i) => ({
          id: m.id || uuidv4(),
          name: String(m.name).trim(),
          order: i + 1,
          created_at: m.created_at || now,
          updated_at: now,
          topics: (m.topics || []).map((t, j) => ({
            id: t.id || uuidv4(),
            name: String(t.name || '').trim(),
            description: t.description || '',
            order: j + 1,
            content_type: t.content_type || 'website',
            url: t.url || '',
            local_file_path: t.local_file_path || '',
            local_file_name: t.local_file_name || '',
            text_content: t.text_content || '',
            is_completed: false,
            completed_at: null,
            notes: '',
            created_at: t.created_at || now,
            updated_at: now,
          })),
        })),
      };
      const courseData = {
        schema_version: '1.0.0',
        last_modified: now,
        course: newCourse,
      };
      await safeWriteJSON(FILES.courseInfo, courseData);

      await withLock('stats', async () => {
        const statsData = JSON.parse(JSON.stringify(SCHEMAS.stats));
        statsData.last_modified = now;
        statsData.progress = recomputeStatsFromCourse(newCourse);
        await safeWriteJSON(FILES.stats, statsData);
      });

      await withLock('create-temp', async () => {
        await safeWriteJSON(FILES.createTemp, JSON.parse(JSON.stringify(SCHEMAS.createTemp)));
      });

      result = {
        course: await readJSON(FILES.courseInfo),
        stats: await readJSON(FILES.stats),
      };
    });
    res.json({ success: true, course: result.course, stats: result.stats });
  })
);

// Create-temp aliases (the SPA uses /api/temp-course)
app.get(
  '/api/temp-course',
  asyncHandler(async (req, res) => {
    const data = await readJSON(FILES.createTemp);
    res.json(data);
  })
);

app.put(
  '/api/temp-course',
  asyncHandler(async (req, res) => {
    // Accept either { course: {...} } or { draft: {...} } from the SPA.
    const body = req.body || {};
    const draft = body.course || body.draft;
    if (!draft || typeof draft !== 'object') {
      return res.status(400).json({ error: 'course (or draft) object is required' });
    }
    await withLock('create-temp', async () => {
      const data = await readJSON(FILES.createTemp);
      data.is_active = true;
      data.last_saved = nowISO();
      data.course = {
        name: draft.name || '',
        description: draft.description || '',
        modules: Array.isArray(draft.modules) ? draft.modules : [],
      };
      await safeWriteJSON(FILES.createTemp, data);
    });
    const updated = await readJSON(FILES.createTemp);
    res.json({ success: true, last_saved: updated.last_saved });
  })
);

app.delete(
  '/api/temp-course',
  asyncHandler(async (req, res) => {
    await withLock('create-temp', async () => {
      await safeWriteJSON(FILES.createTemp, JSON.parse(JSON.stringify(SCHEMAS.createTemp)));
    });
    res.json({ success: true });
  })
);

// Topic visit: record that the user opened this topic, bump streak,
// and return the refreshed stats object.
app.post(
  '/api/topics/:topicId/visit',
  asyncHandler(async (req, res) => {
    const { topicId } = req.params;
    let updatedStats;
    await withLock('stats', async () => {
      const statsData = await readJSON(FILES.stats);
      const today = todayStr();
      if (!statsData.heatmap[today]) {
        statsData.heatmap[today] = { study_time_seconds: 0, topics_completed: 0, topics_viewed: [] };
      }
      if (!statsData.heatmap[today].topics_viewed.includes(topicId)) {
        statsData.heatmap[today].topics_viewed.push(topicId);
      }
      statsData.streak = updateStreak(statsData.streak, today);
      statsData.last_modified = nowISO();
      await safeWriteJSON(FILES.stats, statsData);
      updatedStats = statsData;
    });
    res.json({ success: true, stats: updatedStats });
  })
);

// Body-translation shim: SPA sends { completed: bool }, backend expects
// { is_completed: bool }. Implemented as a separate route that rewrites
// req.body in place before delegating via a small inline handler.
app.patch(
  '/api/topics/:topicId/complete',
  asyncHandler(async (req, res) => {
    const { topicId } = req.params;
    if (typeof req.body?.is_completed !== 'boolean') {
      if (typeof req.body?.completed === 'boolean') {
        req.body.is_completed = req.body.completed;
      } else {
        return res.status(400).json({ error: 'completed (boolean) is required' });
      }
    }
    let topic;
    let statsUpdate;
    await withLock('course-info', async () => {
      const courseData = await readJSON(FILES.courseInfo);
      let found = null;
      for (const m of courseData.course?.modules || []) {
        for (const t of m.topics) {
          if (t.id === topicId) { found = t; break; }
        }
        if (found) break;
      }
      if (!found) {
        const err = new Error('Topic not found');
        err.status = 404;
        throw err;
      }
      found.is_completed = !!req.body.is_completed;
      found.completed_at = found.is_completed ? nowISO() : null;
      found.updated_at = nowISO();
      topic = found;
      courseData.last_modified = nowISO();
      await safeWriteJSON(FILES.courseInfo, courseData);
    });
    await withLock('stats', async () => {
      const statsData = await readJSON(FILES.stats);
      const courseData = await readJSON(FILES.courseInfo);
      statsData.progress = recomputeStatsFromCourse(courseData.course);
      statsData.upcoming_lessons = statsData.progress.upcoming_lessons;
      statsData.last_modified = nowISO();
      await safeWriteJSON(FILES.stats, statsData);
      statsUpdate = { ...statsData.progress };
    });
    res.json({ success: true, topic, stats_progress: statsUpdate });
  })
);

// Git config + sync aliases (SPA uses PUT for config and POST /sync)
app.put(
  '/api/git/config',
  asyncHandler(async (req, res) => {
    const { remote_url, user_name, user_email } = req.body || {};
    if (!remote_url || typeof remote_url !== 'string') {
      return res.status(400).json({ error: 'remote_url is required' });
    }
    if (!/^https:\/\//i.test(remote_url)) {
      return res.status(400).json({ error: 'Only https:// remote URLs are allowed' });
    }
    const envLines = [];
    envLines.push(`PORT=${process.env.PORT || 3000}`);
    envLines.push(`GIT_REMOTE_URL=${remote_url}`);
    envLines.push(`GIT_USER_NAME=${user_name || ''}`);
    envLines.push(`GIT_USER_EMAIL=${user_email || ''}`);
    await fse.writeFile(ENV_FILE, envLines.join('\n') + '\n');
    process.env.GIT_REMOTE_URL = remote_url;
    process.env.GIT_USER_NAME = user_name || '';
    process.env.GIT_USER_EMAIL = user_email || '';

    if (!fs.existsSync(path.join(ROOT, '.git'))) {
      const git = simpleGit(ROOT);
      await git.init();
      await git.addConfig('user.name', user_name || 'Open Course Builder');
      await git.addConfig('user.email', user_email || 'user@local');
    }
    const git = simpleGit(ROOT);
    await git.addConfig('user.name', user_name || 'Open Course Builder');
    await git.addConfig('user.email', user_email || 'user@local');

    const remotes = await git.getRemotes();
    if (remotes.find((r) => r.name === 'origin')) {
      await git.remote(['set-url', 'origin', remote_url]);
    } else {
      await git.addRemote('origin', remote_url);
    }
    res.json({ success: true });
  })
);

app.post(
  '/api/git/sync',
  asyncHandler(async (req, res) => {
    if (!process.env.GIT_REMOTE_URL) {
      return res.status(400).json({ success: false, error: 'Git remote not configured', step_failed: 'config' });
    }
    if (!fs.existsSync(path.join(ROOT, '.git'))) {
      const git = simpleGit(ROOT);
      await git.init();
      await git.addConfig('user.name', process.env.GIT_USER_NAME || 'Open Course Builder');
      await git.addConfig('user.email', process.env.GIT_USER_EMAIL || 'user@local');
      try {
        await git.add('.gitignore');
        await git.commit('Initial commit');
      } catch (_) {}
    }
    const git = simpleGit(ROOT);
    await git.addConfig('user.name', process.env.GIT_USER_NAME || 'Open Course Builder');
    await git.addConfig('user.email', process.env.GIT_USER_EMAIL || 'user@local');

    let status;
    try {
      status = await git.status();
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message, step_failed: 'status' });
    }
    const changed = [
      ...(status.modified || []),
      ...(status.created || []),
      ...(status.not_added || []),
      ...(status.deleted || []),
    ];
    const relevant = changed.filter((f) => f === 'db/course-info.json' || f === 'db/stats.json');
    if (relevant.length === 0) {
      return res.json({ success: true, message: 'Nothing to sync' });
    }

    let oldCourseFromGit = { modules: [] };
    try {
      const show = await git.show(['HEAD:db/course-info.json']);
      oldCourseFromGit = JSON.parse(show).course || { modules: [] };
    } catch (_) {}
    let oldStatsFromGit = null;
    try {
      const show = await git.show(['HEAD:db/stats.json']);
      oldStatsFromGit = JSON.parse(show);
    } catch (_) {}
    const newCourse = (await readJSON(FILES.courseInfo)).course || { modules: [] };
    const newStats = await readJSON(FILES.stats);
    const commitMessage = buildCommitMessage(oldCourseFromGit, newCourse, oldStatsFromGit, newStats);

    try {
      await git.add(['db/course-info.json', 'db/stats.json']);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message, step_failed: 'add' });
    }
    try {
      await git.commit(commitMessage);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message, step_failed: 'commit' });
    }
    let branch = status.current;
    if (!branch) {
      try {
        const bs = await git.status();
        branch = bs.current || 'main';
      } catch (_) { branch = 'main'; }
    }
    try {
      await git.push('origin', branch);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message, step_failed: 'push' });
    }
    res.json({ success: true, commit_message: commitMessage, timestamp: nowISO() });
  })
);

// ---------- Global error handler ----------
app.use((err, req, res, next) => {
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error', details: err.details || null });
});

// ---------- Start ----------
(async () => {
  try {
    await ensureDB();
    app.listen(PORT, () => {
      console.log(`Open Course Builder running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
