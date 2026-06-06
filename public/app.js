// Open Course Builder - frontend
(() => {
  'use strict';

  // ---------- State --------------------------------------------------------
  const state = {
    courses: [],
    activeCourseId: null,
    // course modal draft lessons (when creating a course in one go)
    courseDraftLessons: [],
    // lesson modal transient state
    lessonEditingId: null,
    lessonUploaded: null, // { name, path, size, mimetype } from /api/upload
  };

  // ---------- DOM refs -----------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const els = {
    coursesView: $('#coursesView'),
    coursesList: $('#coursesList'),
    courseCount: $('#courseCount'),
    emptyState: $('#emptyState'),
    emptyCreateBtn: $('#emptyCreateBtn'),
    newCourseBtn: $('#newCourseBtn'),
    toggleActionsBtn: $('#toggleActionsBtn'),
    syncProgressBtn: $('#syncProgressBtn'),
    streaksBtn: $('#streaksBtn'),
    streaksPanel: $('#streaksPanel'),
    streaksCloseBtn: $('#streaksCloseBtn'),
    streaksCurrent: $('#streaksCurrent'),
    streaksLongest: $('#streaksLongest'),
    streaksTotal: $('#streaksTotal'),
    streaksActiveDays: $('#streaksActiveDays'),
    streaksMonths: $('#streaksMonths'),
    streaksGrid: $('#streaksGrid'),

    detailView: $('#courseDetailView'),
    detailTitle: $('#detailTitle'),
    detailMeta: $('#detailMeta'),
    detailDescription: $('#detailDescription'),
    detailProgressBar: $('#detailProgressBar'),
    detailProgressTrack: $('#detailProgressTrack'),
    detailStatTotal: $('#detailStatTotal'),
    detailStatDone: $('#detailStatDone'),
    detailStatRemaining: $('#detailStatRemaining'),
    detailStatPct: $('#detailStatPct'),
    lessonsList: $('#lessonsList'),
    backToCourses: $('#backToCourses'),
    editCourseBtn: $('#editCourseBtn'),
    deleteCourseBtn: $('#deleteCourseBtn'),
    addLessonBtn: $('#addLessonBtn'),

    courseModalEl: $('#courseModal'),
    courseModalTitle: $('#courseModalTitle'),
    courseForm: $('#courseForm'),
    courseTitleInput: $('#courseTitleInput'),
    courseDescInput: $('#courseDescInput'),
    courseFormLessons: $('#courseFormLessons'),
    addLessonRowBtn: $('#addLessonRowBtn'),
    saveCourseBtn: $('#saveCourseBtn'),

    lessonModalEl: $('#lessonModal'),
    lessonModalTitle: $('#lessonModalTitle'),
    lessonForm: $('#lessonForm'),
    lessonTitleInput: $('#lessonTitleInput'),
    resourceTabs: $('#resourceTabs'),
    resourceLinkInput: $('#resourceLinkInput'),
    resourceFileInput: $('#resourceFileInput'),
    dropZone: $('#dropZone'),
    uploadedFileInfo: $('#uploadedFileInfo'),
    resourceNoteInput: $('#resourceNoteInput'),
    resourceMarkdownInput: $('#resourceMarkdownInput'),
    lessonNotesInput: $('#lessonNotesInput'),
    saveLessonBtn: $('#saveLessonBtn'),

    previewModalEl: $('#previewModal'),
    previewTitle: $('#previewTitle'),
    previewBody: $('#previewBody'),

    confirmModalEl: $('#confirmModal'),
    confirmTitle: $('#confirmTitle'),
    confirmMessage: $('#confirmMessage'),
    confirmOkBtn: $('#confirmOkBtn'),

    toastEl: $('#toast'),
    toastBody: $('#toastBody'),
  };

  const bs = {
    courseModal: new bootstrap.Modal(els.courseModalEl),
    lessonModal: new bootstrap.Modal(els.lessonModalEl),
    previewModal: new bootstrap.Modal(els.previewModalEl),
    confirmModal: new bootstrap.Modal(els.confirmModalEl),
    toast: new bootstrap.Toast(els.toastEl, { delay: 2500 }),
  };

  // ---------- Helpers ------------------------------------------------------
  function toast(msg) {
    els.toastBody.textContent = msg;
    bs.toast.show();
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Render raw markdown to sanitized HTML. marked + DOMPurify are loaded
  // via CDN; if they are missing, fall back to a <pre> with the raw text.
  function renderMarkdown(src) {
    const raw = String(src ?? '');
    if (typeof window.marked === 'undefined' || typeof window.DOMPurify === 'undefined') {
      return `<pre class="preview-text">${escapeHtml(raw)}</pre>`;
    }
    try {
      window.marked.setOptions({ gfm: true, breaks: true });
      const html = window.marked.parse(raw);
      return window.DOMPurify.sanitize(html, {
        ADD_ATTR: ['target', 'rel'],
      });
    } catch (err) {
      return `<pre class="preview-text">${escapeHtml(raw)}</pre>`;
    }
  }

  // True if the pasted string looks like a local filesystem path
  // (Windows drive letter, UNC path, file:// URL, or POSIX absolute path),
  // rather than a normal web URL.
  function isLocalFilePath(value) {
    if (!value) return false;
    const v = value.trim();
    if (/^file:\/\//i.test(v)) return true;          // file:///C:/... or file://...
    if (/^[a-z]:[\\/]/i.test(v)) return true;         // C:\... or C:/...
    if (/^[\\/]{2}[^\\/]/.test(v)) return true;       // \\server\share
    // POSIX absolute path: starts with / and doesn't look like a web path
    // (no scheme, no leading //). Exclude things like "/uploads/foo" the user
    // might paste, but those are handled by the existing logic anyway.
    if (v.startsWith('/') && !/^\/[a-z]+\//i.test(v.replace(/^\/+/, ''))) {
      // Heuristic: treat /Users/..., /home/..., /tmp/..., /var/... as local
      return /^\/(Users|home|tmp|var|root|opt|mnt|media|srv|etc)\//i.test(v);
    }
    return false;
  }

  function youtubeEmbed(url) {
    try {
      const u = new URL(url);
      let id = '';
      if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
      else id = u.searchParams.get('v') || '';
      if (!id) return null;
      return `https://www.youtube.com/embed/${id}`;
    } catch { return null; }
  }

  function typeIcon(type) {
    const map = {
      youtube: 'bi-youtube',
      article: 'bi-file-text',
      website: 'bi-link-45deg',
      pdf: 'bi-file-earmark-pdf',
      audio: 'bi-music-note-beamed',
      video: 'bi-camera-reels',
      image: 'bi-image',
      text: 'bi-journal-text',
      markdown: 'bi-markdown',
    };
    return map[type] || 'bi-link-45deg';
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function courseProgress(course) {
    if (!course.lessons || !course.lessons.length) return 0;
    const done = course.lessons.filter((l) => l.isCompleted).length;
    return Math.round((done / course.lessons.length) * 100);
  }

  async function api(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  }

  function confirmAction({ title = 'Are you sure?', message = '', okText = 'Confirm', danger = true } = {}) {
    return new Promise((resolve) => {
      els.confirmTitle.textContent = title;
      els.confirmMessage.textContent = message;
      els.confirmOkBtn.textContent = okText;
      els.confirmOkBtn.classList.toggle('btn-danger', danger);
      els.confirmOkBtn.classList.toggle('btn-primary', !danger);
      const handler = () => {
        els.confirmOkBtn.removeEventListener('click', handler);
        bs.confirmModal.hide();
        resolve(true);
      };
      els.confirmOkBtn.addEventListener('click', handler);
      bs.confirmModal.show();
    });
  }

  // ---------- View mode (hide create/edit/delete actions) -----------------
  // Toggles a `hidden-actions` class on <body> which the CSS uses to hide
  // every `.ocb-action-btn` button. The Open / Preview / View / Back buttons
  // are intentionally NOT marked as action buttons, so they stay visible.
  // The preference is persisted in localStorage so it survives reloads.
  const VIEW_MODE_KEY = 'ocb.viewMode';

  function isViewMode() {
    return document.body.classList.contains('hidden-actions');
  }

  function applyViewMode(enabled) {
    document.body.classList.toggle('hidden-actions', enabled);
    if (els.toggleActionsBtn) {
      els.toggleActionsBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      const icon = els.toggleActionsBtn.querySelector('i');
      const label = els.toggleActionsBtn.querySelector('span');
      if (icon) icon.className = enabled ? 'bi bi-eye-slash' : 'bi bi-eye';
      if (label) label.textContent = enabled ? 'Edit mode' : 'View mode';
      els.toggleActionsBtn.title = enabled
        ? 'Show create / edit / delete actions'
        : 'Hide create / edit / delete actions';
      els.toggleActionsBtn.classList.toggle('btn-primary', enabled);
      els.toggleActionsBtn.classList.toggle('btn-outline-secondary', !enabled);
    }
  }

  function toggleViewMode() {
    const next = !isViewMode();
    applyViewMode(next);
    try { localStorage.setItem(VIEW_MODE_KEY, next ? '1' : '0'); } catch {}
    toast(next ? 'View mode on — actions hidden' : 'Edit mode on — actions visible');
  }

  function initViewMode() {
    let saved = '0';
    try { saved = localStorage.getItem(VIEW_MODE_KEY) || '0'; } catch {}
    applyViewMode(saved === '1');
  }

  // ---------- Streaks (heatmap from lesson completeDate) ------------------
  // Renders a GitHub-style 12-month contribution heatmap inside the navbar
  // dropdown. The grid is built column-by-column (one column = one week)
  // starting from the Sunday at or before 12 months ago, ending at today's
  // column. Each cell is a day; intensity is bucketed from the count of
  // lessons completed that day. Streaks (current + longest) are computed
  // from the same set of active days.
  const STREAKS_WEEKS = 53; // ~12 months incl. the current partial week
  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Return YYYY-MM-DD in the user's local timezone for a Date instance.
  function dayKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Build a Map<dayKey, count> of lesson completions from state.courses.
  // We bucket on the local-time date so the heatmap matches what the user
  // actually sees on their wall clock.
  function collectCompletionDays() {
    const counts = new Map();
    let total = 0;
    for (const course of state.courses || []) {
      for (const lesson of course.lessons || []) {
        if (!lesson.isCompleted || !lesson.completeDate) continue;
        const d = new Date(lesson.completeDate);
        if (isNaN(d.getTime())) continue;
        const k = dayKey(d);
        counts.set(k, (counts.get(k) || 0) + 1);
        total += 1;
      }
    }
    return { counts, total };
  }

  // Compute current and longest streaks. "Active" = at least one completion
  // that day. Current streak counts back from today (or yesterday if today
  // is empty) so a single day off doesn't reset the streak.
  function computeStreaks(counts) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Longest streak: walk sorted keys.
    const sortedKeys = Array.from(counts.keys()).sort();
    let longest = 0;
    let run = 0;
    let prev = null;
    for (const k of sortedKeys) {
      const d = new Date(k + 'T00:00:00');
      if (prev) {
        const diff = Math.round((d - prev) / 86400000);
        run = (diff === 1) ? run + 1 : 1;
      } else {
        run = 1;
      }
      if (run > longest) longest = run;
      prev = d;
    }

    // Current streak: start at today; if today is empty, allow a one-day
    // grace and start from yesterday. Walk backwards while consecutive days
    // have completions.
    let current = 0;
    const cursor = new Date(today);
    if (!counts.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (counts.has(dayKey(cursor))) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return { current, longest };
  }

  // Map a count to a 0..4 intensity bucket. 0 stays level-0 (empty cell).
  function intensityFor(count, max) {
    if (!count) return 0;
    if (max <= 1) return 4;
    const ratio = count / max;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  }

  function renderStreaks() {
    if (!els.streaksGrid) return;
    const { counts, total } = collectCompletionDays();
    const { current, longest } = computeStreaks(counts);
    const max = counts.size ? Math.max(...counts.values()) : 0;
    const activeDays = counts.size;

    if (els.streaksCurrent) els.streaksCurrent.textContent = current;
    if (els.streaksLongest) els.streaksLongest.textContent = longest;
    if (els.streaksTotal) els.streaksTotal.textContent = total;
    if (els.streaksActiveDays) els.streaksActiveDays.textContent = activeDays;

    // Anchor: Sunday at or before (today - STREAKS_WEEKS weeks).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endCol = new Date(today);
    const start = new Date(endCol);
    start.setDate(start.getDate() - (STREAKS_WEEKS - 1) * 7);
    // Walk back to Sunday.
    start.setDate(start.getDate() - start.getDay());

    // Build cells column-by-column. Each column has 7 cells (Sun..Sat).
    // `cells[col][row]` = { date, count, intensity }.
    const cells = [];
    const monthLabels = []; // [{ col, label }]
    let lastMonth = -1;
    for (let c = 0; c < STREAKS_WEEKS; c++) {
      const col = [];
      for (let r = 0; r < 7; r++) {
        const d = new Date(start);
        d.setDate(d.getDate() + c * 7 + r);
        if (d > endCol) {
          col.push(null);
          continue;
        }
        const k = dayKey(d);
        const count = counts.get(k) || 0;
        col.push({ date: d, key: k, count, intensity: intensityFor(count, max) });
        if (r === 0 && d.getMonth() !== lastMonth) {
          monthLabels.push({ col: c, label: MONTH_LABELS[d.getMonth()] });
          lastMonth = d.getMonth();
        }
      }
      cells.push(col);
    }

    // Render month labels using a 53-column grid so they line up with weeks.
    if (els.streaksMonths) {
      const cellsPerCol = els.streaksMonths.children.length
        ? Array.from(els.streaksMonths.children).map(() => null)
        : [];
      // Rebuild from scratch each render — fast (53 nodes).
      let html = '';
      for (let c = 0; c < STREAKS_WEEKS; c++) html += '<span></span>';
      els.streaksMonths.innerHTML = html;
      const spans = els.streaksMonths.children;
      for (const m of monthLabels) {
        if (spans[m.col]) spans[m.col].textContent = m.label;
      }
    }

    // Render the grid.
    let html = '';
    for (let c = 0; c < cells.length; c++) {
      html += '<div class="streaks-col">';
      for (let r = 0; r < 7; r++) {
        const cell = cells[c][r];
        if (!cell) {
          html += '<span class="streaks-cell empty"></span>';
          continue;
        }
        const title = `${cell.count} lesson${cell.count === 1 ? '' : 's'} on ${cell.key}`;
        html += `<span class="streaks-cell lvl-${cell.intensity}" title="${escapeHtml(title)}" data-key="${cell.key}"></span>`;
      }
      html += '</div>';
    }
    els.streaksGrid.innerHTML = html;
  }

  function openStreaks() {
    if (!els.streaksPanel) return;
    renderStreaks();
    els.streaksPanel.classList.remove('d-none');
    els.streaksBtn.setAttribute('aria-expanded', 'true');
  }

  function closeStreaks() {
    if (!els.streaksPanel) return;
    els.streaksPanel.classList.add('d-none');
    els.streaksBtn.setAttribute('aria-expanded', 'false');
  }

  function toggleStreaks() {
    if (!els.streaksPanel) return;
    if (els.streaksPanel.classList.contains('d-none')) openStreaks();
    else closeStreaks();
  }

  // ---------- Sync progress (git add/commit/push db.json) ------------------
  // Calls the server endpoint which runs `git add db.json && git commit -m
  // "synced" && git push origin main`. Shows a toast with the result. While
  // the request is in flight the button is disabled and shows a spinner.
  async function syncProgress() {
    if (!els.syncProgressBtn) return;
    const btn = els.syncProgressBtn;
    const icon = btn.querySelector('i');
    const label = btn.querySelector('span');
    const originalIcon = icon ? icon.className : null;
    const originalLabel = label ? label.textContent : null;

    btn.disabled = true;
    if (icon) icon.className = 'bi bi-arrow-repeat ocb-spin';
    if (label) label.textContent = 'Syncing…';
    toast('Syncing progress to remote…');

    try {
      const res = await api('POST', '/api/sync');
      if (res && res.ok) {
        const parts = [];
        if (res.committed) parts.push('committed');
        else if (res.commitSkipped) parts.push('nothing to commit');
        if (res.pushed) parts.push('pushed');
        else if (res.pushSkipped) parts.push('push skipped');
        const detail = parts.length ? ` (${parts.join(' + ')})` : '';
        toast(`Synced${detail}`);
      } else {
        toast('Sync failed: ' + (res && res.error ? res.error : 'unknown error'));
      }
    } catch (err) {
      toast('Sync failed: ' + err.message);
    } finally {
      btn.disabled = false;
      if (icon && originalIcon) icon.className = originalIcon;
      if (label && originalLabel !== null) label.textContent = originalLabel;
    }
  }

  // ---------- Courses list -------------------------------------------------
  async function loadCourses() {
    try {
      state.courses = await api('GET', '/api/courses');
      renderCourses();
      if (els.streaksPanel && !els.streaksPanel.classList.contains('d-none')) renderStreaks();
    } catch (err) {
      toast('Failed to load courses: ' + err.message);
    }
  }

  function renderCourses() {
    const list = state.courses;
    els.courseCount.textContent = list.length ? `${list.length} course${list.length === 1 ? '' : 's'}` : '';

    if (!list.length) {
      els.emptyState.classList.remove('d-none');
      els.coursesList.innerHTML = '';
      return;
    }
    els.emptyState.classList.add('d-none');

    els.coursesList.innerHTML = list
      .map((c) => {
        const pct = courseProgress(c);
        const lessonsCount = (c.lessons || []).length;
        const doneCount = (c.lessons || []).filter((l) => l.isCompleted).length;
        const remaining = Math.max(lessonsCount - doneCount, 0);
        // Circular ring math: circumference for r=18 is ~113.1
        const radius = 18;
        const circumference = 2 * Math.PI * radius;
        const dash = (pct / 100) * circumference;
        const isComplete = lessonsCount > 0 && pct === 100;
        return `
          <div class="col-12 col-md-6 col-lg-4">
            <div class="course-card" data-id="${c.id}">
              <div class="course-card-head">
                <div class="course-card-head-text">
                  <h5 class="mb-1">${escapeHtml(c.title)}</h5>
                  ${c.description
                    ? `<p class="course-card-desc">${escapeHtml(c.description)}</p>`
                    : `<p class="course-card-desc is-muted">No description</p>`}
                </div>
                <div class="course-card-head-actions">
                  <div class="progress-ring ${isComplete ? 'is-complete' : ''}" role="img"
                       aria-label="${pct}% complete">
                    <svg width="48" height="48" viewBox="0 0 48 48">
                      <circle class="progress-ring-track" cx="24" cy="24" r="${radius}"/>
                      <circle class="progress-ring-fill" cx="24" cy="24" r="${radius}"
                              stroke-dasharray="${circumference.toFixed(2)}"
                              stroke-dashoffset="${(circumference - dash).toFixed(2)}"/>
                    </svg>
                    <span class="progress-ring-label">${pct}<i>%</i></span>
                  </div>
                  <button type="button" class="course-card-delete-btn ocb-action-btn"
                          data-course-id="${c.id}"
                          aria-label="Delete course ${escapeHtml(c.title)}"
                          title="Delete course">
                    <i class="bi bi-trash3"></i>
                  </button>
                </div>
              </div>
              <div class="course-card-stats">
                <span class="stat-chip stat-done" title="Completed lessons">
                  <i class="bi bi-check-circle-fill"></i>${doneCount} done
                </span>
                <span class="stat-chip stat-remaining" title="Remaining lessons">
                  <i class="bi bi-circle"></i>${remaining} to go
                </span>
                <span class="stat-chip stat-total" title="Total lessons">
                  <i class="bi bi-collection"></i>${lessonsCount} total
                </span>
              </div>
            </div>
          </div>`;
      })
      .join('');

    $$('.course-card').forEach((el) => {
      el.addEventListener('click', () => openCourse(el.dataset.id));
    });
    $$('.course-card-delete-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        deleteCourse(btn.dataset.courseId);
      });
    });
  }

  // ---------- Course detail -----------------------------------------------
  async function openCourse(id) {
    try {
      const course = await api('GET', `/api/courses/${id}`);
      state.activeCourseId = id;
      renderCourseDetail(course);
      els.coursesView.classList.add('d-none');
      els.detailView.classList.remove('d-none');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast('Failed to open course: ' + err.message);
    }
  }

  function backToList() {
    state.activeCourseId = null;
    els.detailView.classList.add('d-none');
    els.coursesView.classList.remove('d-none');
    loadCourses();
  }

  function renderCourseDetail(course) {
    els.detailTitle.textContent = course.title;
    els.detailMeta.textContent = `${course.lessons.length} lesson${course.lessons.length === 1 ? '' : 's'} · updated ${formatDate(course.updatedAt)}`;
    els.detailDescription.textContent = course.description || '';
    const lessons = course.lessons || [];
    const total = lessons.length;
    const done = lessons.filter((l) => l.isCompleted).length;
    const remaining = Math.max(total - done, 0);
    const pct = courseProgress(course);
    if (els.detailStatTotal) els.detailStatTotal.textContent = total;
    if (els.detailStatDone) els.detailStatDone.textContent = done;
    if (els.detailStatRemaining) els.detailStatRemaining.textContent = remaining;
    if (els.detailStatPct) els.detailStatPct.textContent = pct + '%';
    if (els.detailProgressBar) {
      // Force a reflow before setting the width so the transition replays.
      els.detailProgressBar.style.width = '0%';
      // eslint-disable-next-line no-unused-expressions
      els.detailProgressBar.offsetWidth;
      els.detailProgressBar.style.width = pct + '%';
    }
    if (els.detailProgressTrack) {
      els.detailProgressTrack.classList.toggle('is-complete', total > 0 && pct === 100);
    }

    if (!course.lessons.length) {
      els.lessonsList.innerHTML = `
        <div class="empty">
          <i class="bi bi-journal-plus display-6 d-block mb-2"></i>
          No lessons yet. Click <strong>Add lesson</strong> to get started.
        </div>`;
      return;
    }

    els.lessonsList.innerHTML = course.lessons
      .map((l) => {
        const resourceHref = l.resource || '#';
        const isExternal = /^https?:\/\//i.test(l.resource || '');
        const targetAttr = isExternal ? 'target="_blank" rel="noopener noreferrer"' : '';
        // Inline-able types: just a link/website. Everything else opens in the preview modal.
        const isInlineLink = (l.type === 'website' || l.type === 'article' || l.type === 'youtube') && l.resource;
        const previewable = ['pdf', 'image', 'video', 'audio', 'text', 'markdown'].includes(l.type);
        // For text/markdown we never render the body inline; it always opens in the modal.
        const inlineNote = (l.notes && l.type !== 'text' && l.type !== 'markdown')
          ? `<p class="mb-0 mt-2 small text-muted">${escapeHtml(l.notes)}</p>` : '';
        // Build a prominent action button (text/markdown always open in modal,
        // upload types preview, link types open externally).
        let actionHtml = '';
        if (isInlineLink) {
          actionHtml = `<a href="${escapeHtml(resourceHref)}" ${targetAttr} class="btn btn-sm btn-outline-primary lesson-open-btn">${isExternal ? '<i class="bi bi-box-arrow-up-right"></i> Open' : '<i class="bi bi-eye"></i> Preview'}</a>`;
        } else if (previewable) {
          const icon = l.type === 'text' ? 'bi-file-text'
                     : l.type === 'markdown' ? 'bi-markdown'
                     : 'bi-eye';
          const label = (l.type === 'text' || l.type === 'markdown') ? 'Open note' : 'Preview';
          actionHtml = `<a href="#" class="btn btn-sm btn-outline-primary lesson-open-btn open-preview"><i class="bi ${icon}"></i> ${label}</a>`;
        }
        // A short snippet preview of text/markdown body so users know what's inside.
        let snippetHtml = '';
        if (l.type === 'text' || l.type === 'markdown') {
          const raw = (l.notes || l.resource || '').trim();
          if (raw) {
            const snippet = raw.length > 140 ? raw.slice(0, 140) + '…' : raw;
            snippetHtml = `<p class="lesson-snippet">${escapeHtml(snippet)}</p>`;
          }
        }
        return `
          <div class="lesson-item ${l.isCompleted ? 'completed' : ''}" data-id="${l.id}">
            <input class="form-check-input lesson-toggle" type="checkbox" ${l.isCompleted ? 'checked' : ''} aria-label="Mark complete" />
            <div class="flex-grow-1">
              <p class="lesson-title ${previewable ? 'lesson-title-clickable' : ''}">${escapeHtml(l.title)}</p>
              <div class="lesson-meta">
                <span class="type-pill ${l.type}"><i class="bi ${typeIcon(l.type)}"></i> ${l.type}</span>
                ${actionHtml}
                <span class="text-muted-2">${formatDate(l.createdAt)}</span>
              </div>
              ${inlineNote}
              ${snippetHtml}
            </div>
            <div class="lesson-actions">
              <button class="btn btn-sm btn-outline-secondary edit-lesson ocb-action-btn" title="Edit"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger delete-lesson ocb-action-btn" title="Delete"><i class="bi bi-trash"></i></button>
              <button class="btn btn-sm btn-outline-primary open-lesson" title="Open"><i class="bi bi-box-arrow-up-right"></i> Open</button>
            </div>
          </div>`;
      })
      .join('');

    // Delegate clicks inside lessonsList
    els.lessonsList.querySelectorAll('.lesson-item').forEach((row) => {
      const id = row.dataset.id;
      const lesson = course.lessons.find((x) => x.id === id);
      row.querySelector('.lesson-toggle').addEventListener('change', () => toggleLesson(id));
      row.querySelector('.edit-lesson').addEventListener('click', (e) => {
        e.stopPropagation();
        openLessonModal(id);
      });
      row.querySelector('.delete-lesson').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteLesson(id);
      });
      const openBtn = row.querySelector('.open-lesson');
      if (openBtn && lesson) {
        openBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openPreview(lesson);
        });
      }
      // Preview on clicking the resource link
      const link = row.querySelector('.lesson-meta a');
      if (link && lesson) {
        const href = link.getAttribute('href') || '';
        const isExternal = /^https?:\/\//i.test(href);
        if (!isExternal) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            openPreview(lesson);
          });
        }
      }
      // Preview on clicking the title (for previewable types)
      const titleEl = row.querySelector('.lesson-title-clickable');
      if (titleEl && lesson) {
        titleEl.addEventListener('click', (e) => {
          e.preventDefault();
          openPreview(lesson);
        });
        titleEl.style.cursor = 'pointer';
      }
    });
  }

  // ---------- Course modal (create / edit) --------------------------------
  function openCourseCreateModal() {
    state.courseDraftLessons = [];
    els.courseModalTitle.textContent = 'New course';
    els.saveCourseBtn.textContent = 'Create course';
    els.courseTitleInput.value = '';
    els.courseDescInput.value = '';
    renderCourseFormLessons();
    bs.courseModal.show();
    setTimeout(() => els.courseTitleInput.focus(), 200);
  }

  function openCourseEditModal() {
    const course = state.courses.find((c) => c.id === state.activeCourseId);
    if (!course) return;
    els.courseModalTitle.textContent = 'Edit course';
    els.saveCourseBtn.textContent = 'Save changes';
    els.courseTitleInput.value = course.title;
    els.courseDescInput.value = course.description || '';
    state.courseDraftLessons = [];
    renderCourseFormLessons();
    bs.courseModal.show();
  }

  function renderCourseFormLessons() {
    if (!state.courseDraftLessons.length) {
      els.courseFormLessons.innerHTML = `<div class="text-muted small">No lessons added. You can add them now or later.</div>`;
      return;
    }
    const draftType = (l) => (l.type || (l.notes ? 'markdown' : (l.resource ? 'website' : 'text')));
    els.courseFormLessons.innerHTML = state.courseDraftLessons
      .map((l, idx) => {
        const t = draftType(l);
        return `
        <div class="resource-row" data-idx="${idx}">
          <div class="d-flex gap-2 mb-2">
            <input type="text" class="form-control form-control-sm lesson-draft-title" placeholder="Lesson title" value="${escapeHtml(l.title || '')}" />
            <select class="form-select form-select-sm lesson-draft-type" style="max-width:140px">
              <option value="website"${t === 'website' ? ' selected' : ''}>Link</option>
              <option value="markdown"${t === 'markdown' ? ' selected' : ''}>Markdown</option>
              <option value="text"${t === 'text' ? ' selected' : ''}>Text note</option>
            </select>
            <button type="button" class="btn btn-sm btn-outline-danger remove-draft"><i class="bi bi-x"></i></button>
          </div>
          <input type="text" class="form-control form-control-sm lesson-draft-link" placeholder="Resource link (optional)" value="${escapeHtml(l.resource || '')}" />
          <textarea class="form-control form-control-sm lesson-draft-notes mt-2" rows="3" placeholder="Notes / Markdown content (optional)">${escapeHtml(l.notes || '')}</textarea>
        </div>`;
      })
      .join('');

    els.courseFormLessons.querySelectorAll('.resource-row').forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.querySelector('.lesson-draft-title').addEventListener('input', (e) => {
        state.courseDraftLessons[idx].title = e.target.value;
      });
      row.querySelector('.lesson-draft-link').addEventListener('input', (e) => {
        state.courseDraftLessons[idx].resource = e.target.value;
      });
      row.querySelector('.lesson-draft-type').addEventListener('change', (e) => {
        state.courseDraftLessons[idx].type = e.target.value;
      });
      row.querySelector('.lesson-draft-notes').addEventListener('input', (e) => {
        state.courseDraftLessons[idx].notes = e.target.value;
      });
      row.querySelector('.remove-draft').addEventListener('click', () => {
        state.courseDraftLessons.splice(idx, 1);
        renderCourseFormLessons();
      });
    });
  }

  async function saveCourseFromModal() {
    const title = els.courseTitleInput.value.trim();
    if (!title) {
      els.courseTitleInput.classList.add('is-invalid');
      return;
    }
    els.courseTitleInput.classList.remove('is-invalid');

    const description = els.courseDescInput.value.trim();
    const lessons = state.courseDraftLessons
      .map((l) => ({ ...l, title: (l.title || '').trim() }))
      .filter((l) => l.title);

    try {
      if (state.activeCourseId && els.courseModalTitle.textContent === 'Edit course') {
        await api('PUT', `/api/courses/${state.activeCourseId}`, { title, description });
        // Add the draft lessons if any
        for (const l of lessons) {
          await api('POST', `/api/courses/${state.activeCourseId}/lessons`, l);
        }
        toast('Course updated');
      } else {
        const course = await api('POST', '/api/courses', { title, description, lessons });
        state.activeCourseId = course.id;
        toast('Course created');
      }
      bs.courseModal.hide();
      const refreshed = await api('GET', `/api/courses/${state.activeCourseId}`);
      renderCourseDetail(refreshed);
      els.coursesView.classList.add('d-none');
      els.detailView.classList.remove('d-none');
      loadCourses();
    } catch (err) {
      toast('Save failed: ' + err.message);
    }
  }

  // ---------- Lesson modal -------------------------------------------------
  function resetLessonModal() {
    els.lessonTitleInput.value = '';
    els.lessonNotesInput.value = '';
    els.resourceLinkInput.value = '';
    els.resourceNoteInput.value = '';
    els.resourceMarkdownInput.value = '';
    els.resourceFileInput.value = '';
    els.uploadedFileInfo.textContent = '';
    state.lessonUploaded = null;
    state.lessonEditingId = null;
    activateResourceTab('link');
  }

  function activateResourceTab(name) {
    $$('#resourceTabs .nav-link').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('[data-pane]').forEach((p) => p.classList.toggle('d-none', p.dataset.pane !== name));
  }

  function openLessonModal(lessonId) {
    resetLessonModal();
    const course = state.courses.find((c) => c.id === state.activeCourseId);
    if (!course) return;
    els.lessonModalTitle.textContent = lessonId ? 'Edit lesson' : 'Add lesson';

    if (lessonId) {
      const lesson = course.lessons.find((l) => l.id === lessonId);
      if (!lesson) return;
      state.lessonEditingId = lessonId;
      els.lessonTitleInput.value = lesson.title;
      els.lessonNotesInput.value = lesson.notes || '';

      if (['youtube', 'article', 'website'].includes(lesson.type) && /^https?:\/\//i.test(lesson.resource || '')) {
        els.resourceLinkInput.value = lesson.resource;
        activateResourceTab('link');
      } else if (lesson.type === 'text' && (!lesson.resource || !/^https?:\/\//i.test(lesson.resource))) {
        els.resourceNoteInput.value = lesson.notes || lesson.resource || '';
        activateResourceTab('note');
      } else if (lesson.type === 'markdown') {
        // Markdown is stored in `notes` (we keep `resource` empty for type=markdown).
        els.resourceMarkdownInput.value = lesson.notes || lesson.resource || '';
        activateResourceTab('markdown');
      } else {
        // Treat as uploaded file (path-based)
        activateResourceTab('upload');
        els.uploadedFileInfo.innerHTML = `Current file: <a href="${escapeHtml(lesson.resource)}" target="_blank" rel="noopener noreferrer">${escapeHtml(lesson.resource.split('/').pop())}</a>`;
      }
    }
    bs.lessonModal.show();
    setTimeout(() => els.lessonTitleInput.focus(), 200);
  }

  async function saveLessonFromModal() {
    const title = els.lessonTitleInput.value.trim();
    if (!title) {
      els.lessonTitleInput.classList.add('is-invalid');
      return;
    }
    els.lessonTitleInput.classList.remove('is-invalid');
    const notes = els.lessonNotesInput.value;

    const activeTab = $('#resourceTabs .nav-link.active').dataset.tab;
    let payload = { title, notes };

    if (activeTab === 'link') {
      const link = els.resourceLinkInput.value.trim();
      if (!link) {
        els.resourceLinkInput.classList.add('is-invalid');
        return;
      }
      els.resourceLinkInput.classList.remove('is-invalid');
      // If the user pasted a local file path (Windows: C:\... or file:///C:/...,
      // or an absolute path on any OS), ask the server to copy it into /uploads
      // so the browser can actually open it.
      if (isLocalFilePath(link)) {
        try {
          els.saveLessonBtn.disabled = true;
          els.saveLessonBtn.textContent = 'Importing...';
          const imported = await api('POST', '/api/upload-path', { path: link });
          payload.resource = imported.path;
        } catch (err) {
          toast('Local file import failed: ' + err.message);
          els.saveLessonBtn.disabled = false;
          els.saveLessonBtn.textContent = 'Save lesson';
          return;
        } finally {
          els.saveLessonBtn.disabled = false;
          els.saveLessonBtn.textContent = 'Save lesson';
        }
      } else {
        payload.resource = link;
      }
    } else if (activeTab === 'note') {
      const note = els.resourceNoteInput.value;
      payload.resource = ''; // text note only uses notes field; but we can also store in resource
      payload.type = 'text';
      // store the actual note text in `notes` for the editor; but keep `resource` empty so type is text
      payload.notes = note || notes;
    } else if (activeTab === 'markdown') {
      const md = els.resourceMarkdownInput.value;
      if (!md.trim()) {
        toast('Please write some markdown first');
        return;
      }
      payload.resource = '';
      payload.type = 'markdown';
      payload.notes = md;
    } else if (activeTab === 'upload') {
      if (!state.lessonUploaded) {
        toast('Please choose a file first');
        return;
      }
      payload.resource = state.lessonUploaded.path;
    }

    try {
      if (state.lessonEditingId) {
        await api('PUT', `/api/courses/${state.activeCourseId}/lessons/${state.lessonEditingId}`, payload);
        toast('Lesson updated');
      } else {
        await api('POST', `/api/courses/${state.activeCourseId}/lessons`, payload);
        toast('Lesson added');
      }
      bs.lessonModal.hide();
      const refreshed = await api('GET', `/api/courses/${state.activeCourseId}`);
      renderCourseDetail(refreshed);
      // Sync local cache
      const idx = state.courses.findIndex((c) => c.id === state.activeCourseId);
      if (idx >= 0) state.courses[idx] = refreshed;
      renderStreaks();
    } catch (err) {
      toast('Save failed: ' + err.message);
    }
  }

  // ---------- Lesson actions ----------------------------------------------
  async function toggleLesson(lessonId) {
    try {
      await api('PATCH', `/api/courses/${state.activeCourseId}/lessons/${lessonId}/toggle`);
      const refreshed = await api('GET', `/api/courses/${state.activeCourseId}`);
      const idx = state.courses.findIndex((c) => c.id === state.activeCourseId);
      if (idx >= 0) state.courses[idx] = refreshed;
      renderCourseDetail(refreshed);
      renderStreaks();
    } catch (err) {
      toast('Toggle failed: ' + err.message);
    }
  }

  async function deleteLesson(lessonId) {
    const ok = await confirmAction({
      title: 'Delete lesson?',
      message: 'This will remove the lesson from the course. Uploaded files are not deleted from disk.',
      okText: 'Delete',
    });
    if (!ok) return;
    try {
      await api('DELETE', `/api/courses/${state.activeCourseId}/lessons/${lessonId}`);
      const refreshed = await api('GET', `/api/courses/${state.activeCourseId}`);
      const idx = state.courses.findIndex((c) => c.id === state.activeCourseId);
      if (idx >= 0) state.courses[idx] = refreshed;
      renderCourseDetail(refreshed);
      renderStreaks();
      toast('Lesson deleted');
    } catch (err) {
      toast('Delete failed: ' + err.message);
    }
  }

  async function deleteCourse(id) {
    const targetId = id || state.activeCourseId;
    const course = state.courses.find((c) => c.id === targetId);
    if (!course) return;
    const ok = await confirmAction({
      title: `Delete "${course.title}"?`,
      message: 'The course and all its lessons will be permanently removed. Uploaded files are not deleted from disk.',
      okText: 'Delete course',
    });
    if (!ok) return;
    try {
      await api('DELETE', `/api/courses/${targetId}`);
      toast('Course deleted');
      // If we're inside the deleted course's detail view, go back to the list.
      if (!id && state.activeCourseId === targetId) backToList();
      else loadCourses();
    } catch (err) {
      toast('Delete failed: ' + err.message);
    }
  }

  // ---------- File upload --------------------------------------------------
  async function handleFileUpload(file) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    els.uploadedFileInfo.textContent = 'Uploading...';
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }
      const data = await res.json();
      state.lessonUploaded = data;
      els.uploadedFileInfo.innerHTML = `Uploaded: <strong>${escapeHtml(data.name)}</strong> (${Math.round(data.size / 1024)} KB)`;
    } catch (err) {
      state.lessonUploaded = null;
      els.uploadedFileInfo.innerHTML = `<span class="text-danger">${escapeHtml(err.message)}</span>`;
    }
  }

  // ---------- Preview ------------------------------------------------------
  function openPreview(lesson) {
    els.previewTitle.textContent = lesson.title;
    const body = els.previewBody;
    const type = lesson.type;
    const resource = lesson.resource || '';

    // Sync-rendered types (text/markdown) skip the loading flash; async/media types
    // show a brief "Loading..." placeholder while the iframe/img loads.
    const isSync = (type === 'text' || type === 'markdown');
    if (!isSync) {
      body.innerHTML = '<div class="text-center text-white-50 py-5">Loading...</div>';
    } else {
      body.innerHTML = '';
    }

    if (type === 'youtube') {
      const embed = youtubeEmbed(resource);
      if (embed) {
        body.innerHTML = `<iframe class="preview-frame" src="${embed}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
      } else {
        body.innerHTML = `<div class="p-4 text-white">Invalid YouTube URL.</div>`;
      }
    } else if (type === 'image') {
      body.innerHTML = `<img class="preview-image" src="${escapeHtml(resource)}" alt="${escapeHtml(lesson.title)}" />`;
    } else if (type === 'video') {
      body.innerHTML = `<video class="preview-frame" controls src="${escapeHtml(resource)}"></video>`;
    } else if (type === 'audio') {
      body.innerHTML = `<div class="p-4 text-white text-center"><i class="bi bi-music-note-beamed display-4 d-block mb-3"></i><audio controls src="${escapeHtml(resource)}" class="w-100"></audio></div>`;
    } else if (type === 'pdf') {
      body.innerHTML = `<iframe class="preview-frame" src="${escapeHtml(resource)}" title="${escapeHtml(lesson.title)}"></iframe>`;
    } else if (type === 'text') {
      const content = lesson.notes || resource || '(empty note)';
      body.innerHTML = `<pre class="preview-text">${escapeHtml(content)}</pre>`;
    } else if (type === 'markdown') {
      // Render raw markdown to sanitized HTML
      const md = lesson.notes || resource || '';
      body.innerHTML = `<div class="preview-markdown">${renderMarkdown(md)}</div>`;
    } else {
      // article / website / unknown
      body.innerHTML = `<iframe class="preview-frame" src="${escapeHtml(resource)}" referrerpolicy="no-referrer"></iframe>`;
    }
    bs.previewModal.show();
  }

  // ---------- Event wiring -------------------------------------------------
  function wireEvents() {
    els.newCourseBtn.addEventListener('click', openCourseCreateModal);
    els.toggleActionsBtn.addEventListener('click', toggleViewMode);
    if (els.syncProgressBtn) els.syncProgressBtn.addEventListener('click', syncProgress);
    if (els.streaksBtn) els.streaksBtn.addEventListener('click', toggleStreaks);
    if (els.streaksCloseBtn) els.streaksCloseBtn.addEventListener('click', closeStreaks);
    // Click anywhere outside the panel closes it.
    document.addEventListener('click', (e) => {
      if (!els.streaksPanel || els.streaksPanel.classList.contains('d-none')) return;
      if (els.streaksPanel.contains(e.target)) return;
      if (els.streaksBtn && els.streaksBtn.contains(e.target)) return;
      closeStreaks();
    });
    // Escape closes the panel.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.streaksPanel && !els.streaksPanel.classList.contains('d-none')) {
        closeStreaks();
      }
    });
    els.emptyCreateBtn.addEventListener('click', openCourseCreateModal);
    els.backToCourses.addEventListener('click', backToList);
    els.editCourseBtn.addEventListener('click', openCourseEditModal);
    els.deleteCourseBtn.addEventListener('click', deleteCourse);
    els.addLessonBtn.addEventListener('click', () => openLessonModal(null));

    els.addLessonRowBtn.addEventListener('click', () => {
      state.courseDraftLessons.push({ title: '', resource: '', type: 'website', notes: '' });
      renderCourseFormLessons();
    });

    els.saveCourseBtn.addEventListener('click', saveCourseFromModal);
    els.saveLessonBtn.addEventListener('click', saveLessonFromModal);

    // Resource tabs
    $$('#resourceTabs .nav-link').forEach((btn) => {
      btn.addEventListener('click', () => activateResourceTab(btn.dataset.tab));
    });

    els.resourceFileInput.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (f) handleFileUpload(f);
    });

    // Drag-and-drop on the styled drop zone. Click + keyboard (Enter/Space) open
    // the file picker. Drag events are prevented so the browser doesn't navigate
    // to the file when the user misses the target.
    if (els.dropZone) {
      const openPicker = () => els.resourceFileInput.click();
      els.dropZone.addEventListener('click', openPicker);
      els.dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPicker();
        }
      });
      ['dragenter', 'dragover'].forEach((evt) => {
        els.dropZone.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          els.dropZone.classList.add('is-dragover');
        });
      });
      ['dragleave', 'drop'].forEach((evt) => {
        els.dropZone.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (evt === 'dragleave' && e.target !== els.dropZone) return;
          els.dropZone.classList.remove('is-dragover');
        });
      });
      els.dropZone.addEventListener('drop', (e) => {
        const f = e.dataTransfer?.files?.[0];
        if (f) handleFileUpload(f);
      });
    }

    // Pressing Enter in title field submits
    [els.courseTitleInput, els.lessonTitleInput].forEach((inp) => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (inp === els.courseTitleInput ? els.saveCourseBtn : els.saveLessonBtn).click();
        }
      });
    });
  }

  // ---------- Init ---------------------------------------------------------
  function init() {
    wireEvents();
    initViewMode();
    loadCourses();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
