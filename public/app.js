// Open Course Builder - frontend
(() => {
  'use strict';

  // ---------- State --------------------------------------------------------
  const state = {
    courses: [],
    activeCourseId: null,
    // lesson modal transient state
    lessonEditingId: null,
    // task modal transient state
    taskEditingId: null,
    // task runner modal transient state
    taskRunnerTaskId: null,
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
    importCourseBtn: $('#importCourseBtn'),
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
    streaksMonthSel: $('#streaksMonthSel'),
    streaksYearSel: $('#streaksYearSel'),

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
    exportCourseBtn: $('#exportCourseBtn'),
    addLessonBtn: $('#addLessonBtn'),
    addTaskBtn: $('#addTaskBtn'),
    tasksList: $('#tasksList'),

    courseModalEl: $('#courseModal'),
    courseModalTitle: $('#courseModalTitle'),
    courseForm: $('#courseForm'),
    courseTitleInput: $('#courseTitleInput'),
    courseDescInput: $('#courseDescInput'),
    saveCourseBtn: $('#saveCourseBtn'),

    // New course metadata fields
    addAuthorRowBtn: $('#addAuthorRowBtn'),
    courseFormAuthors: $('#courseFormAuthors'),
    courseFormTags: $('#courseFormTags'),
    courseTagsInput: $('#courseTagsInput'),
    courseFormLanguages: $('#courseFormLanguages'),
    courseLanguagesInput: $('#courseLanguagesInput'),

    // Detail page blocks
    detailAuthors: $('#detailAuthors'),
    detailTags: $('#detailTags'),
    detailLanguages: $('#detailLanguages'),

    lessonModalEl: $('#lessonModal'),
    lessonModalTitle: $('#lessonModalTitle'),
    lessonForm: $('#lessonForm'),
    lessonTitleInput: $('#lessonTitleInput'),
    resourceTabs: $('#resourceTabs'),
    resourceLinkInput: $('#resourceLinkInput'),
    resourceNoteInput: $('#resourceNoteInput'),
    resourceMarkdownInput: $('#resourceMarkdownInput'),
    lessonNotesInput: $('#lessonNotesInput'),
    saveLessonBtn: $('#saveLessonBtn'),

    taskModalEl: $('#taskModal'),
    taskModalTitle: $('#taskModalTitle'),
    taskForm: $('#taskForm'),
    taskTitleInput: $('#taskTitleInput'),
    taskQuestionInput: $('#taskQuestionInput'),
    taskInstructionInput: $('#taskInstructionInput'),
    saveTaskBtn: $('#saveTaskBtn'),

    taskRunnerModalEl: $('#taskRunnerModal'),
    taskRunnerTitle: $('#taskRunnerTitle'),
    taskRunnerQuestion: $('#taskRunnerQuestion'),
    taskRunnerAnswer: $('#taskRunnerAnswer'),
    taskRunnerSubmit: $('#taskRunnerSubmit'),
    taskRunnerFeedback: $('#taskRunnerFeedback'),
    taskRunnerSpinner: $('#taskRunnerSpinner'),
    taskRunnerSubmissions: $('#taskRunnerSubmissions'),

    previewModalEl: $('#previewModal'),
    previewTitle: $('#previewTitle'),
    previewBody: $('#previewBody'),
    previewOpenExternalBtn: $('#previewOpenExternalBtn'),
    previewModal: $('#previewModal') ? new bootstrap.Modal($('#previewModal')) : null,

    // Lesson note pane (sits inside the preview modal)
    previewNotePane: $('#previewNotePane'),
    previewNoteEditBtn: $('#previewNoteEditBtn'),
    previewNoteViewBtn: $('#previewNoteViewBtn'),
    previewNoteEditWrap: $('#previewNoteEditWrap'),
    previewNoteViewWrap: $('#previewNoteViewWrap'),
    previewNoteInput: $('#previewNoteInput'),
    previewNoteRendered: $('#previewNoteRendered'),
    previewNoteEmpty: $('#previewNoteEmpty'),
    previewNoteStatus: $('#previewNoteStatus'),

    confirmModalEl: $('#confirmModal'),
    confirmTitle: $('#confirmTitle'),
    confirmMessage: $('#confirmMessage'),
    confirmOkBtn: $('#confirmOkBtn'),

    importModalEl: $('#importCourseModal'),
    importFileInput: $('#importCourseFile'),
    importJsonInput: $('#importCourseJson'),
    importError: $('#importCourseError'),
    importSubmitBtn: $('#importCourseSubmit'),

    toastEl: $('#toast'),
    toastBody: $('#toastBody'),

    // Theme dropdown (navbar)
    themeDropdownBtn: $('#themeDropdownBtn'),
    themeDropdownIcon: $('#themeDropdownIcon'),
    activeThemeLabel: $('#activeThemeLabel'),
    themeDropdownMenu: $('#themeDropdownMenu'),
    themeChoices: $$('[data-theme-choice]'),
  };

  const bs = {
    courseModal: new bootstrap.Modal(els.courseModalEl),
    lessonModal: new bootstrap.Modal(els.lessonModalEl),
    taskModal: els.taskModalEl ? new bootstrap.Modal(els.taskModalEl) : null,
    taskRunnerModal: els.taskRunnerModalEl ? new bootstrap.Modal(els.taskRunnerModalEl) : null,
    previewModal: new bootstrap.Modal(els.previewModalEl),
    confirmModal: new bootstrap.Modal(els.confirmModalEl),
    importModal: els.importModalEl ? new bootstrap.Modal(els.importModalEl) : null,
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

  // ---------- Course metadata helpers (authors / tags / languages) ---------
  function makeChip(text, onRemove) {
    const chip = document.createElement('span');
    chip.className = 'ocb-chip ocb-chip-removable';
    const label = document.createElement('span');
    label.className = 'ocb-chip-label';
    label.textContent = text;
    chip.appendChild(label);
    if (onRemove) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ocb-chip-remove';
      btn.setAttribute('aria-label', `Remove ${text}`);
      btn.innerHTML = '<i class="bi bi-x"></i>';
      btn.addEventListener('click', () => onRemove(chip));
      chip.appendChild(btn);
    }
    return chip;
  }

  function addChipToContainer(container, value) {
    if (!container) return null;
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;
    // Case-insensitive dedupe within a container.
    const existing = Array.from(container.querySelectorAll('.ocb-chip .ocb-chip-label'))
      .some((el) => (el.textContent || '').trim().toLowerCase() === trimmed.toLowerCase());
    if (existing) return null;
    const chip = makeChip(trimmed, (node) => node.remove());
    container.appendChild(chip);
    return chip;
  }

  function readChips(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('.ocb-chip .ocb-chip-label'))
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean);
  }

  function clearChips(container) {
    if (container) container.innerHTML = '';
  }

  function makeAuthorRow(name, link) {
    const row = document.createElement('div');
    row.className = 'author-row';
    row.innerHTML = `
      <input type="text" class="form-control form-control-sm author-name" placeholder="Author name" />
      <input type="url" class="form-control form-control-sm author-link" placeholder="Optional link (LinkedIn, X, portfolio, …)" />
      <button type="button" class="btn btn-sm btn-outline-danger author-remove" aria-label="Remove author">
        <i class="bi bi-x"></i>
      </button>`;
    const nameInput = row.querySelector('.author-name');
    const linkInput = row.querySelector('.author-link');
    nameInput.value = name || '';
    linkInput.value = link || '';
    row.querySelector('.author-remove').addEventListener('click', () => row.remove());
    return row;
  }

  function readAuthorRows(container) {
    if (!container) return [];
    const seen = new Set();
    const out = [];
    Array.from(container.querySelectorAll('.author-row')).forEach((row) => {
      const name = (row.querySelector('.author-name').value || '').trim();
      const link = (row.querySelector('.author-link').value || '').trim();
      if (!name) return;
      const key = `${name.toLowerCase()}|${link.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ authorName: name, authorLink: link });
    });
    return out;
  }

  function clearAuthorRows(container) {
    if (container) container.innerHTML = '';
  }

  // Collect authors / tags / languages from the course modal form.
  // - Authors must have a name; the link is optional.
  // - Tags / languages are pulled from the visible chip containers.
  function collectCourseMetadata() {
    return {
      authors: readAuthorRows(els.courseFormAuthors),
      tags: readChips(els.courseFormTags),
      courseLanguage: readChips(els.courseFormLanguages),
    };
  }

  function populateCourseMetadata(course) {
    clearAuthorRows(els.courseFormAuthors);
    clearChips(els.courseFormTags);
    clearChips(els.courseFormLanguages);
    const authors = Array.isArray(course && course.authors) ? course.authors : [];
    authors.forEach((a) => {
      if (!a || !a.authorName) return;
      els.courseFormAuthors.appendChild(makeAuthorRow(a.authorName, a.authorLink || ''));
    });
    const tags = Array.isArray(course && course.tags) ? course.tags : [];
    tags.forEach((t) => addChipToContainer(els.courseFormTags, t));
    const langs = Array.isArray(course && course.courseLanguage) ? course.courseLanguage : [];
    langs.forEach((l) => addChipToContainer(els.courseFormLanguages, l));
  }

  function resetCourseMetadata() {
    clearAuthorRows(els.courseFormAuthors);
    clearChips(els.courseFormTags);
    clearChips(els.courseFormLanguages);
    if (els.courseTagsInput) els.courseTagsInput.value = '';
    if (els.courseLanguagesInput) els.courseLanguagesInput.value = '';
  }

  // Render the read-only authors / tags / languages sections on the detail page.
  function renderDetailMetadata(course) {
    const authors = Array.isArray(course && course.authors) ? course.authors : [];
    const tags = Array.isArray(course && course.tags) ? course.tags : [];
    const langs = Array.isArray(course && course.courseLanguage) ? course.courseLanguage : [];

    if (els.detailAuthors) {
      els.detailAuthors.innerHTML = renderAuthorsInline(authors) || '';
      const block = document.getElementById('detailAuthorsBlock');
      if (block) block.classList.toggle('d-none', !authors.some((a) => a && a.authorName));
    }
    if (els.detailTags) {
      els.detailTags.innerHTML = renderChipList(tags);
      const block = document.getElementById('detailTagsBlock');
      if (block) block.classList.toggle('d-none', !tags.filter(Boolean).length);
    }
    if (els.detailLanguages) {
      els.detailLanguages.innerHTML = renderChipList(langs);
      const block = document.getElementById('detailLanguagesBlock');
      if (block) block.classList.toggle('d-none', !langs.filter(Boolean).length);
    }
  }

  // Render helpers for displaying authors / chips in read-only views.
  function renderAuthorsInline(authors) {
    const list = (authors || []).filter((a) => a && a.authorName);
    if (!list.length) return '';
    const items = list.map((a) => {
      const name = escapeHtml(a.authorName);
      const link = (a.authorLink || '').trim();
      if (link) {
        return `<span class="course-author">${name} <a class="course-author-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${name}'s link"><i class="bi bi-box-arrow-up-right"></i></a></span>`;
      }
      return `<span class="course-author">${name}</span>`;
    }).join('<span class="course-author-sep">·</span>');
    return `<div class="course-authors">${items}</div>`;
  }

  function renderChipList(values) {
    const list = (values || []).filter((v) => v && String(v).trim());
    if (!list.length) return '';
    const chips = list.map((v) => `<span class="ocb-chip"><span class="ocb-chip-label">${escapeHtml(v)}</span></span>`).join('');
    return `<div class="ocb-chip-list ocb-chip-list-static">${chips}</div>`;
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
  // Renders a single-month calendar (Sun..Sat columns, 5/6 rows) inside the
  // navbar dropdown. The user can pick any year/month that has completion
  // data, plus the current month. Intensity is bucketed from the count of
  // lessons completed on each day. All-time stats (current streak, longest
  // streak, total completions, active days) are computed once from the full
  // set of completion data and shown above the calendar.
  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Currently displayed year/month. Defaults to the current month on first
  // render and is preserved across live-refreshes.
  const streaksView = { year: 0, month: 0, initialized: false };

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

    // Build the list of (year, month) buckets that have at least one
    // completion, plus the current month as the default landing spot.
    const today = new Date();
    const buckets = new Set();
    for (const k of counts.keys()) {
      const d = new Date(k + 'T00:00:00');
      buckets.add(d.getFullYear() * 12 + d.getMonth());
    }
    const currentBucket = today.getFullYear() * 12 + today.getMonth();
    buckets.add(currentBucket);
    const sorted = Array.from(buckets).sort((a, b) => a - b);
    const yearsSet = new Set();
    for (const b of sorted) yearsSet.add(Math.floor(b / 12));

    // Default the view to the current month on first render, then keep it.
    if (!streaksView.initialized) {
      streaksView.year = today.getFullYear();
      streaksView.month = today.getMonth();
      streaksView.initialized = true;
    }

    // Populate year + month selects based on the available buckets.
    const yearSel = els.streaksYearSel;
    const monthSel = els.streaksMonthSel;
    if (yearSel) {
      const sortedYears = Array.from(yearsSet).sort((a, b) => b - a); // newest first
      // Preserve focus/selection if possible.
      const focusYear = streaksView.year || sortedYears[0];
      if (yearSel.options.length !== sortedYears.length) {
        yearSel.innerHTML = sortedYears
          .map(y => `<option value="${y}">${y}</option>`).join('');
      }
      yearSel.value = String(focusYear);
      streaksView.year = Number(yearSel.value);
    }
    if (monthSel) {
      // Months available for the currently selected year, ordered Jan..Dec.
      const monthsForYear = sorted
        .filter(b => Math.floor(b / 12) === streaksView.year)
        .map(b => b % 12);
      if (monthSel.options.length !== monthsForYear.length) {
        monthSel.innerHTML = monthsForYear.length
          ? monthsForYear
              .map(m => `<option value="${m}">${MONTH_LABELS[m]}</option>`)
              .join('')
          : `<option value="${streaksView.month}">${MONTH_LABELS[streaksView.month]}</option>`;
      }
      // If the selected month isn't available in this year, snap to the
      // closest one (prefer the current month, else the first available).
      const available = new Set(monthsForYear);
      if (!available.has(streaksView.month)) {
        streaksView.month = available.has(today.getMonth()) && today.getFullYear() === streaksView.year
          ? today.getMonth()
          : monthsForYear[monthsForYear.length - 1] ?? 0;
      }
      monthSel.value = String(streaksView.month);
    }

    // Build the calendar grid for streaksView.year / streaksView.month.
    const firstOfMonth = new Date(streaksView.year, streaksView.month, 1);
    const daysInMonth = new Date(streaksView.year, streaksView.month + 1, 0).getDate();
    const startWeekday = firstOfMonth.getDay(); // 0 = Sun
    const cells = [];
    // Leading blanks so the 1st lands under the correct weekday column.
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(streaksView.year, streaksView.month, d);
      const k = dayKey(date);
      const count = counts.get(k) || 0;
      cells.push({
        date,
        key: k,
        day: d,
        count,
        intensity: intensityFor(count, max),
        isToday: k === dayKey(today),
        isFuture: date > today,
      });
    }
    // Trailing blanks to fill the last week row.
    while (cells.length % 7 !== 0) cells.push(null);

    let html = '';
    for (const cell of cells) {
      if (!cell) {
        html += '<span class="streaks-cell empty"></span>';
        continue;
      }
      const classes = ['streaks-cell', `lvl-${cell.intensity}`];
      if (cell.isToday) classes.push('today');
      if (cell.isFuture) classes.push('future');
      const title = cell.count
        ? `${cell.count} lesson${cell.count === 1 ? '' : 's'} on ${cell.key}`
        : `No lessons on ${cell.key}`;
      html += `<span class="${classes.join(' ')}" title="${escapeHtml(title)}" data-key="${cell.key}"><span class="streaks-day">${cell.day}</span></span>`;
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
                  ${renderAuthorsInline(c.authors)}
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
    renderDetailMetadata(course);
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

    // Tasks list (rendered regardless of whether lessons exist, so an
    // empty course can still showcase tasks and vice versa).
    renderTasksList(course);

    if (!course.lessons.length) {
      els.lessonsList.innerHTML = `
        <div class="empty">
          <i class="bi bi-journal-plus display-6 d-block mb-2"></i>
          No lessons yet. Click <strong>Add lesson</strong> to get started.
        </div>`;
      return;
    }

    els.lessonsList.innerHTML = course.lessons
      .map((l, idx) => {
        const resourceHref = l.resource || '#';
        const isExternal = /^https?:\/\//i.test(l.resource || '');
        const targetAttr = isExternal ? 'target="_blank" rel="noopener noreferrer"' : '';
        // Inline-able types: just a link/website. Everything else opens in the preview modal.
        const isInlineLink = (l.type === 'link' || l.type === 'website' || l.type === 'article') && l.resource;
        const previewable = (l.type === 'text' || l.type === 'markdown');
        // For text/markdown we never render the body inline; it always opens in the modal.
        const inlineNote = (l.notes && l.type !== 'text' && l.type !== 'markdown')
          ? `<p class="mb-0 mt-2 small text-muted">${escapeHtml(l.notes)}</p>` : '';
        // Build a prominent action button (text/markdown always open in modal,
        // link types open externally).
        let actionHtml = '';
        if (isInlineLink) {
          actionHtml = `<a href="${escapeHtml(resourceHref)}" ${targetAttr} class="btn btn-sm btn-outline-primary lesson-open-btn">${isExternal ? '<i class="bi bi-box-arrow-up-right"></i> Open' : '<i class="bi bi-eye"></i> Preview'}</a>`;
        } else if (previewable) {
          const icon = l.type === 'text' ? 'bi-file-text' : 'bi-markdown';
          actionHtml = `<a href="#" class="btn btn-sm btn-outline-primary lesson-open-btn open-preview"><i class="bi ${icon}"></i> Open note</a>`;
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
              <div class="lesson-actions-col lesson-actions-col-view">
                <button class="btn btn-sm btn-outline-primary open-lesson" title="Open"><i class="bi bi-box-arrow-up-right"></i> Open</button>
                <button class="btn btn-sm ${l.isCompleted ? 'btn-success' : 'btn-outline-success'} mark-complete" title="${l.isCompleted ? 'Marked complete' : 'Mark complete'}">
                  <i class="bi ${l.isCompleted ? 'bi-check-circle-fill' : 'bi-check-circle'}"></i> ${l.isCompleted ? 'Marked complete' : 'Mark complete'}
                </button>
              </div>
              <div class="lesson-actions-col lesson-actions-col-edit ocb-action-btn">
                <button class="btn btn-sm btn-outline-secondary edit-lesson ocb-action-btn" title="Edit"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-outline-danger delete-lesson ocb-action-btn" title="Delete"><i class="bi bi-trash"></i></button>
              </div>
              <div class="lesson-actions-col lesson-actions-col-reorder ocb-action-btn">
                <button class="btn btn-sm btn-outline-secondary move-lesson-up ocb-action-btn" data-dir="up" title="Move up"${idx === 0 ? ' disabled' : ''}><i class="bi bi-arrow-up"></i></button>
                <button class="btn btn-sm btn-outline-secondary move-lesson-down ocb-action-btn" data-dir="down" title="Move down"${idx === course.lessons.length - 1 ? ' disabled' : ''}><i class="bi bi-arrow-down"></i></button>
              </div>
            </div>
          </div>`;
      })
      .join('');

    // Delegate clicks inside lessonsList
    els.lessonsList.querySelectorAll('.lesson-item').forEach((row) => {
      const id = row.dataset.id;
      const lesson = course.lessons.find((x) => x.id === id);
      row.querySelector('.mark-complete').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLesson(id);
      });
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
          openLessonResource(lesson);
        });
      }
      // Reorder buttons (up / down). Disabled buttons short-circuit in the
      // handler as well, since `disabled` attribute doesn't always suppress
      // the click event in older browsers.
      row.querySelectorAll('.move-lesson-up, .move-lesson-down').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (btn.disabled) return;
          moveLesson(id, btn.dataset.dir);
        });
      });
      // Preview on clicking the resource link
      const link = row.querySelector('.lesson-meta a');
      if (link && lesson) {
        const href = link.getAttribute('href') || '';
        const isExternal = /^https?:\/\//i.test(href);
        if (!isExternal) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            openLessonResource(lesson);
          });
        }
      }
      // Preview on clicking the title (for previewable types)
      const titleEl = row.querySelector('.lesson-title-clickable');
      if (titleEl && lesson) {
        titleEl.addEventListener('click', (e) => {
          e.preventDefault();
          openLessonResource(lesson);
        });
        titleEl.style.cursor = 'pointer';
      }
    });
  }

  // ---------- Course modal (create / edit) --------------------------------
  function openCourseCreateModal() {
    els.courseModalTitle.textContent = 'New course';
    els.saveCourseBtn.textContent = 'Create course';
    els.courseTitleInput.value = '';
    els.courseDescInput.value = '';
    resetCourseMetadata();
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
    populateCourseMetadata(course);
    bs.courseModal.show();
  }

  function openImportModal() {
    if (!els.importFileInput) return;
    resetImportForm();
    bs.importModal.show();
  }

  function resetImportForm() {
    if (els.importFileInput) els.importFileInput.value = '';
    if (els.importJsonInput) els.importJsonInput.value = '';
    if (els.importError) {
      els.importError.textContent = '';
      els.importError.classList.add('d-none');
    }
    if (els.importSubmitBtn) els.importSubmitBtn.disabled = false;
  }

  async function readImportFile(file) {
    if (!file) return '';
    if (!file.name.toLowerCase().endsWith('.json') && file.type && !file.type.includes('json')) {
      throw new Error('Please pick a .json file');
    }
    const text = await file.text();
    return text;
  }

  function showImportError(message) {
    if (!els.importError) return;
    els.importError.textContent = message;
    els.importError.classList.remove('d-none');
  }

  async function submitImportCourse() {
    if (els.importError) els.importError.classList.add('d-none');
    let raw = (els.importJsonInput && els.importJsonInput.value || '').trim();
    if (!raw && els.importFileInput && els.importFileInput.files && els.importFileInput.files[0]) {
      try {
        raw = (await readImportFile(els.importFileInput.files[0])).trim();
      } catch (err) {
        showImportError(err.message || 'Could not read file');
        return;
      }
    }
    if (!raw) {
      showImportError('Pick a .json file or paste a course JSON, then try again.');
      return;
    }
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      showImportError('That JSON is not valid: ' + err.message);
      return;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      showImportError('A course must be a single JSON object.');
      return;
    }
    if (els.importSubmitBtn) els.importSubmitBtn.disabled = true;
    try {
      const course = await api('POST', '/api/courses/import', payload);
      toast('Course imported');
      bs.importModal.hide();
      await loadCourses();
      // Open the freshly imported course so the user lands on it.
      if (course && course.id) {
        await openCourseById(course.id);
      }
    } catch (err) {
      showImportError(err.message || 'Import failed');
    } finally {
      if (els.importSubmitBtn) els.importSubmitBtn.disabled = false;
    }
  }

  async function openCourseById(id) {
    // Make sure the detail view is on-screen and shows the right course.
    try {
      const course = state.courses.find((c) => c.id === id) || (await api('GET', `/api/courses/${id}`));
      state.activeCourseId = id;
      renderCourseDetail(course);
      els.coursesView && els.coursesView.classList.add('d-none');
      els.detailView && els.detailView.classList.remove('d-none');
    } catch (err) {
      toast('Could not open imported course: ' + err.message);
    }
  }

  async function saveCourseFromModal() {
    const title = els.courseTitleInput.value.trim();
    if (!title) {
      els.courseTitleInput.classList.add('is-invalid');
      return;
    }
    els.courseTitleInput.classList.remove('is-invalid');

    const description = els.courseDescInput.value.trim();
    const metadata = collectCourseMetadata();

    try {
      if (state.activeCourseId && els.courseModalTitle.textContent === 'Edit course') {
        await api('PUT', `/api/courses/${state.activeCourseId}`, {
          title,
          description,
          authors: metadata.authors,
          tags: metadata.tags,
          courseLanguage: metadata.courseLanguage,
        });
        toast('Course updated');
      } else {
        const course = await api('POST', '/api/courses', {
          title,
          description,
          authors: metadata.authors,
          tags: metadata.tags,
          courseLanguage: metadata.courseLanguage,
        });
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
    state.lessonEditingId = null;
    activateResourceTab('link');
  }

  function activateResourceTab(name) {
    $$('#resourceTabs .nav-link').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('[data-pane]').forEach((p) => p.classList.toggle('d-none', p.dataset.pane !== name));
    // For "text note" and "markdown" tabs, the resource IS the note — the
    // separate "Notes (optional)" field would otherwise get clobbered by
    // the resource text on save. Hide it for those tabs.
    const hideNotes = (name === 'note' || name === 'markdown');
    const section = document.getElementById('lessonNotesSection');
    if (section) section.classList.toggle('d-none', hideNotes);
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
      // For text/markdown the resource content lives in `lesson.notes` — leave
      // the standalone "Notes (optional)" field empty so the user's notes
      // aren't overwritten by the resource text on save.
      const notesHoldResource = (lesson.type === 'text' || lesson.type === 'markdown');
      els.lessonNotesInput.value = notesHoldResource ? '' : (lesson.notes || '');

      if (['youtube', 'article', 'website', 'link'].includes(lesson.type) && /^https?:\/\//i.test(lesson.resource || '')) {
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
        // Unknown / legacy type — fall back to link tab so the resource URL is visible.
        els.resourceLinkInput.value = lesson.resource || '';
        activateResourceTab('link');
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
      payload.resource = link;
    } else if (activeTab === 'note') {
      // Text notes and markdown both store their content in `notes`. The
      // standalone "Notes (optional)" field is hidden for these tabs and
      // intentionally NOT merged in — otherwise typing in the resource box
      // would silently overwrite the user's separate notes.
      payload.resource = '';
      payload.type = 'text';
      payload.notes = els.resourceNoteInput.value;
    } else if (activeTab === 'markdown') {
      const md = els.resourceMarkdownInput.value;
      if (!md.trim()) {
        toast('Please write some markdown first');
        return;
      }
      payload.resource = '';
      payload.type = 'markdown';
      payload.notes = md;
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

  // ---------- Task actions -------------------------------------------------
  function renderTasksList(course) {
    if (!els.tasksList) return;
    const tasks = Array.isArray(course.tasks) ? course.tasks : [];
    if (!tasks.length) {
      els.tasksList.innerHTML = `
        <div class="task-empty">
          <i class="bi bi-question-circle display-6 d-block mb-2"></i>
          No tasks yet. Click <strong>Add task</strong> to create a practice question.
        </div>`;
      return;
    }
    els.tasksList.innerHTML = tasks
      .map((t) => {
        const subCount = (t.submissions || []).length;
        const meta = `${subCount} submission${subCount === 1 ? '' : 's'} · created ${formatDate(t.createdAt)}`;
        return `
          <div class="task-card" data-id="${t.id}">
            <div class="task-card-body">
              <p class="task-card-title">${escapeHtml(t.title)}</p>
              <div class="task-card-meta">${escapeHtml(meta)}</div>
            </div>
            <div class="d-flex gap-2 align-items-center">
              <button class="btn btn-sm btn-primary open-task" title="Open task">
                <i class="bi bi-play-fill me-1"></i> Open
              </button>
              <button class="btn btn-sm btn-outline-secondary edit-task ocb-action-btn" title="Edit">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger delete-task ocb-action-btn" title="Delete">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>`;
      })
      .join('');

    els.tasksList.querySelectorAll('.task-card').forEach((row) => {
      const id = row.dataset.id;
      const openBtn = row.querySelector('.open-task');
      if (openBtn) openBtn.addEventListener('click', () => openTaskRunner(id));
      const editBtn = row.querySelector('.edit-task');
      if (editBtn) editBtn.addEventListener('click', () => openTaskModal(id));
      const delBtn = row.querySelector('.delete-task');
      if (delBtn) delBtn.addEventListener('click', () => deleteTask(id));
    });
  }

  function resetTaskModal() {
    if (els.taskTitleInput) els.taskTitleInput.value = '';
    if (els.taskQuestionInput) els.taskQuestionInput.value = '';
    if (els.taskInstructionInput) els.taskInstructionInput.value = '';
    if (els.taskTitleInput) els.taskTitleInput.classList.remove('is-invalid');
  }

  function openTaskModal(taskId) {
    if (!bs.taskModal) return;
    resetTaskModal();
    const course = state.courses.find((c) => c.id === state.activeCourseId);
    if (!course) return;
    state.taskEditingId = null;
    els.taskModalTitle.textContent = 'Add task';
    els.saveTaskBtn.textContent = 'Create task';

    if (taskId) {
      const task = (course.tasks || []).find((t) => t.id === taskId);
      if (!task) return;
      state.taskEditingId = taskId;
      els.taskModalTitle.textContent = 'Edit task';
      els.saveTaskBtn.textContent = 'Save task';
      els.taskTitleInput.value = task.title || '';
      els.taskQuestionInput.value = task.question || '';
      els.taskInstructionInput.value = task.instruction || '';
    }
    bs.taskModal.show();
    setTimeout(() => els.taskTitleInput.focus(), 200);
  }

  async function saveTaskFromModal() {
    const title = els.taskTitleInput.value.trim();
    if (!title) {
      els.taskTitleInput.classList.add('is-invalid');
      return;
    }
    els.taskTitleInput.classList.remove('is-invalid');
    const payload = {
      title,
      question: els.taskQuestionInput.value,
      instruction: els.taskInstructionInput.value,
    };
    try {
      if (state.taskEditingId) {
        await api('PUT', `/api/courses/${state.activeCourseId}/tasks/${state.taskEditingId}`, payload);
        toast('Task updated');
      } else {
        await api('POST', `/api/courses/${state.activeCourseId}/tasks`, payload);
        toast('Task added');
      }
      bs.taskModal.hide();
      const refreshed = await api('GET', `/api/courses/${state.activeCourseId}`);
      const idx = state.courses.findIndex((c) => c.id === state.activeCourseId);
      if (idx >= 0) state.courses[idx] = refreshed;
      renderCourseDetail(refreshed);
    } catch (err) {
      toast('Save failed: ' + err.message);
    }
  }

  async function deleteTask(taskId) {
    const ok = await confirmAction({
      title: 'Delete task?',
      message: 'This will remove the task and all of its submissions from the course.',
      okText: 'Delete',
    });
    if (!ok) return;
    try {
      await api('DELETE', `/api/courses/${state.activeCourseId}/tasks/${taskId}`);
      const refreshed = await api('GET', `/api/courses/${state.activeCourseId}`);
      const idx = state.courses.findIndex((c) => c.id === state.activeCourseId);
      if (idx >= 0) state.courses[idx] = refreshed;
      renderCourseDetail(refreshed);
      toast('Task deleted');
    } catch (err) {
      toast('Delete failed: ' + err.message);
    }
  }

  function openTaskRunner(taskId) {
    if (!bs.taskRunnerModal) return;
    const course = state.courses.find((c) => c.id === state.activeCourseId);
    if (!course) return;
    const task = (course.tasks || []).find((t) => t.id === taskId);
    if (!task) return;
    state.taskRunnerTaskId = taskId;
    els.taskRunnerTitle.textContent = task.title || 'Task';
    els.taskRunnerQuestion.innerHTML = renderMarkdown(task.question || '');
    els.taskRunnerAnswer.value = '';
    els.taskRunnerAnswer.disabled = false;
    els.taskRunnerSubmit.disabled = false;
    if (els.taskRunnerSpinner) els.taskRunnerSpinner.classList.add('d-none');
    const last = (task.submissions && task.submissions.length)
      ? task.submissions[task.submissions.length - 1]
      : null;
    if (last && last.feedback) {
      els.taskRunnerFeedback.innerHTML = renderMarkdown(last.feedback);
    } else {
      els.taskRunnerFeedback.innerHTML = '<span class="text-muted">Submit your answer to receive feedback.</span>';
    }
    renderTaskSubmissions(task);
    bs.taskRunnerModal.show();
    setTimeout(() => els.taskRunnerAnswer.focus(), 200);
  }

  function renderTaskSubmissions(task) {
    if (!els.taskRunnerSubmissions) return;
    const subs = Array.isArray(task.submissions) ? task.submissions : [];
    if (!subs.length) {
      els.taskRunnerSubmissions.innerHTML = '';
      return;
    }
    const items = subs
      .slice()
      .reverse()
      .map((s) => `
        <details class="task-submission mb-2 border rounded p-2 bg-body">
          <summary class="d-flex justify-content-between align-items-center" style="cursor:pointer; list-style:none;">
            <span><i class="bi bi-chat-left-text me-1"></i> Submission from ${formatDate(s.createdAt)}</span>
            <span class="text-muted small">${escapeHtml(s.answer.slice(0, 60))}${s.answer.length > 60 ? '…' : ''}</span>
          </summary>
          <div class="mt-2">
            <div class="text-muted small mb-1"><strong>Your answer</strong></div>
            <pre class="mb-2" style="white-space:pre-wrap; word-break:break-word; font-family:inherit;">${escapeHtml(s.answer)}</pre>
            <div class="text-muted small mb-1"><strong>Feedback</strong></div>
            <div class="markdown-body">${renderMarkdown(s.feedback || '')}</div>
          </div>
        </details>`)
      .join('');
    els.taskRunnerSubmissions.innerHTML = `
      <div class="mt-3">
        <h6 class="mb-2"><i class="bi bi-clock-history me-1"></i> Past submissions</h6>
        ${items}
      </div>`;
  }

  async function submitTask() {
    const taskId = state.taskRunnerTaskId;
    if (!taskId) return;
    const answer = els.taskRunnerAnswer.value;
    if (!answer.trim()) {
      els.taskRunnerAnswer.classList.add('is-invalid');
      toast('Please write an answer first');
      return;
    }
    els.taskRunnerAnswer.classList.remove('is-invalid');
    els.taskRunnerSubmit.disabled = true;
    els.taskRunnerAnswer.disabled = true;
    if (els.taskRunnerSpinner) els.taskRunnerSpinner.classList.remove('d-none');
    els.taskRunnerFeedback.innerHTML = '<span class="text-muted">Asking the tutor…</span>';
    try {
      const result = await api('POST', `/api/courses/${state.activeCourseId}/tasks/${taskId}/submit`, { answer });
      const feedback = (result && result.submission && result.submission.feedback) || '';
      els.taskRunnerFeedback.innerHTML = renderMarkdown(feedback || '_No feedback returned._');
      const refreshed = await api('GET', `/api/courses/${state.activeCourseId}`);
      const idx = state.courses.findIndex((c) => c.id === state.activeCourseId);
      if (idx >= 0) state.courses[idx] = refreshed;
      const task = (refreshed.tasks || []).find((t) => t.id === taskId);
      if (task) renderTaskSubmissions(task);
    } catch (err) {
      els.taskRunnerFeedback.innerHTML = `<span class="text-danger">${escapeHtml('Feedback failed: ' + err.message)}</span>`;
      toast('Feedback failed: ' + err.message);
    } finally {
      els.taskRunnerSubmit.disabled = false;
      els.taskRunnerAnswer.disabled = false;
      if (els.taskRunnerSpinner) els.taskRunnerSpinner.classList.add('d-none');
    }
  }

  // Move a lesson one position up or down within the active course. The
  // server receives the new full order so the source of truth is `db.json`
  // — the page is re-rendered from the server's response to stay in sync.
  async function moveLesson(lessonId, direction) {
    const course = state.courses.find((c) => c.id === state.activeCourseId);
    if (!course) return;
    const i = course.lessons.findIndex((l) => l.id === lessonId);
    if (i < 0) return;
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= course.lessons.length) return;
    // Optimistically swap locally for snappier UX; the server response will
    // replace this with the canonical order regardless.
    const [moved] = course.lessons.splice(i, 1);
    course.lessons.splice(j, 0, moved);
    renderCourseDetail(course);
    try {
      const order = course.lessons.map((l) => l.id);
      const refreshed = await api('PATCH', `/api/courses/${state.activeCourseId}/lessons/reorder`, { order });
      const idx = state.courses.findIndex((c) => c.id === state.activeCourseId);
      if (idx >= 0) state.courses[idx] = refreshed;
      renderCourseDetail(refreshed);
    } catch (err) {
      toast('Reorder failed: ' + err.message);
      // Re-fetch to roll back the optimistic swap.
      try {
        const refreshed = await api('GET', `/api/courses/${state.activeCourseId}`);
        const idx = state.courses.findIndex((c) => c.id === state.activeCourseId);
        if (idx >= 0) state.courses[idx] = refreshed;
        renderCourseDetail(refreshed);
      } catch {}
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

  function exportActiveCourse() {
    const id = state.activeCourseId;
    if (!id) {
      toast('Open a course first, then export it.');
      return;
    }
    // Use a hidden anchor so the browser honours the server-supplied filename
    // (Content-Disposition). The authless GET is a plain download.
    const a = document.createElement('a');
    a.href = `/api/courses/${encodeURIComponent(id)}/export`;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 0);
  }

  // ---------- Preview ------------------------------------------------------
  // Entry point used by the "Open" button, the title click, and the inline
  // resource link on each lesson row. For types that embed cleanly in the
  // modal (text / markdown) we open the preview modal inline. For
  // everything else â€"`link``, `website`, `article`, or any resource that is
  // a plain external URL â€" we open the resource in a new
  // browser tab instead. This sidesteps the X-Frame-Options /
  // Content-Security-Policy: frame-ancestors headers that many sites send
  // (e.g. w3schools, GitHub, Facebook) which forbid embedding and would
  // otherwise just show a blank iframe or a "can't be embedded" error page.
  function openLessonResource(lesson) {
    const type = lesson && lesson.type;
    const resource = (lesson && lesson.resource) || '';
    const modalTypes = new Set(['text', 'markdown']);
    if (type && modalTypes.has(type)) {
      openPreview(lesson);
      return;
    }
    // Link-based / external / unknown types → open the resource in a new tab
    // AND open the preview modal so the user can still take a lesson note.
    // The modal's content area is hidden for these types (see
    // `noContentTypes` inside `openPreview`) and the note pane takes the full
    // modal width.
    if (resource) {
      window.open(resource, '_blank', 'noopener,noreferrer');
    }
    openPreview(lesson);
  }

  // ---------- Lesson note pane -------------------------------------------
  // Per-lesson markdown note that lives in the preview modal. Edit mode =
  // raw <textarea> in monospace; View mode = sanitized GitHub-flavored
  // markdown. Saves to the lesson's `lessonNote` field in real time (debounced).
  const lessonNoteState = {
    courseId: null,
    lessonId: null,
    saveTimer: null,
    inflight: null,
    lastSavedValue: '',
    mode: 'edit', // 'edit' | 'view'
    bound: false,
  };

  const LESSON_NOTE_SAVE_DEBOUNCE_MS = 400;

  function setNoteStatus(state, msg, icon) {
    if (!els.previewNoteStatus) return;
    els.previewNoteStatus.classList.remove('is-saving', 'is-error', 'is-saved');
    if (state) els.previewNoteStatus.classList.add(`is-${state}`);
    const iconClass = icon || (
      state === 'is-saving' ? 'bi-arrow-repeat spin-anim' :
      state === 'is-error'  ? 'bi-exclamation-triangle' :
      state === 'is-saved'  ? 'bi-cloud-check' : 'bi-cloud-check'
    );
    els.previewNoteStatus.innerHTML = `<i class="bi ${iconClass}"></i> ${escapeHtml(msg)}`;
  }

  function renderLessonNoteView() {
    const raw = els.previewNoteInput ? els.previewNoteInput.value : '';
    const trimmed = (raw || '').trim();
    if (!trimmed) {
      els.previewNoteRendered.innerHTML = '';
      els.previewNoteRendered.classList.add('d-none');
      els.previewNoteEmpty.classList.remove('d-none');
      return;
    }
    els.previewNoteRendered.classList.remove('d-none');
    els.previewNoteEmpty.classList.add('d-none');
    els.previewNoteRendered.innerHTML = renderMarkdown(raw);
  }

  function setLessonNoteMode(mode) {
    lessonNoteState.mode = mode === 'view' ? 'view' : 'edit';
    const isView = lessonNoteState.mode === 'view';
    els.previewNoteEditWrap.classList.toggle('d-none', isView);
    els.previewNoteViewWrap.classList.toggle('d-none', !isView);
    els.previewNoteEditBtn.classList.toggle('active', !isView);
    els.previewNoteViewBtn.classList.toggle('active', isView);
    if (isView) renderLessonNoteView();
  }

  function scheduleLessonNoteSave() {
    if (!lessonNoteState.courseId || !lessonNoteState.lessonId) return;
    if (lessonNoteState.saveTimer) clearTimeout(lessonNoteState.saveTimer);
    setNoteStatus('is-saving', 'Saving…', 'bi-arrow-repeat spin-anim');
    lessonNoteState.saveTimer = setTimeout(flushLessonNoteSave, LESSON_NOTE_SAVE_DEBOUNCE_MS);
  }

  async function flushLessonNoteSave() {
    if (!lessonNoteState.courseId || !lessonNoteState.lessonId) return;
    const value = els.previewNoteInput ? els.previewNoteInput.value : '';
    // If the latest typed value matches what we already persisted, skip.
    if (value === lessonNoteState.lastSavedValue && !lessonNoteState.inflight) {
      setNoteStatus('is-saved', 'Saved');
      return;
    }
    // Coalesce: if a request is already running, wait for it then re-flush.
    if (lessonNoteState.inflight) {
      try { await lessonNoteState.inflight; } catch (_) { /* ignore */ }
      return flushLessonNoteSave();
    }
    const courseId = lessonNoteState.courseId;
    const lessonId = lessonNoteState.lessonId;
    const p = (async () => {
      try {
        const res = await api('PUT', `/api/courses/${courseId}/lessons/${lessonId}/note`, {
          lessonNote: value,
        });
        lessonNoteState.lastSavedValue = value;
        // Keep the in-memory lesson in sync so a subsequent open shows the latest value.
        const course = state.courses.find((c) => c.id === courseId);
        if (course) {
          const lesson = (course.lessons || []).find((l) => l.id === lessonId);
          if (lesson) lesson.lessonNote = res && typeof res.lessonNote === 'string' ? res.lessonNote : value;
        }
        setNoteStatus('is-saved', 'Saved');
      } catch (err) {
        setNoteStatus('is-error', 'Save failed', 'bi-exclamation-triangle');
        toast('Could not save note: ' + err.message);
      } finally {
        lessonNoteState.inflight = null;
      }
    })();
    lessonNoteState.inflight = p;
    await p;
  }

  function initLessonNotePane(lesson) {
    if (!els.previewNotePane) return;
    // Cancel any pending save from a previously-opened lesson before swapping.
    if (lessonNoteState.saveTimer) {
      clearTimeout(lessonNoteState.saveTimer);
      lessonNoteState.saveTimer = null;
    }
    // Flush any in-flight save for the previous lesson so we don't lose data.
    // We don't await — the modal is already moving on, but the request keeps going.

    lessonNoteState.courseId = state.activeCourseId;
    lessonNoteState.lessonId = lesson && lesson.id;
    lessonNoteState.lastSavedValue = (lesson && typeof lesson.lessonNote === 'string') ? lesson.lessonNote : '';

    // Wire the toggle and input handlers once.
    if (!lessonNoteState.bound) {
      lessonNoteState.bound = true;
      els.previewNoteEditBtn.addEventListener('click', () => setLessonNoteMode('edit'));
      els.previewNoteViewBtn.addEventListener('click', () => setLessonNoteMode('view'));
      els.previewNoteInput.addEventListener('input', () => {
        scheduleLessonNoteSave();
      });
      // Flush on close so the very last keystroke isn't lost when the user
      // dismisses the modal quickly.
      els.previewModalEl.addEventListener('hide.bs.modal', () => {
        if (lessonNoteState.saveTimer) {
          clearTimeout(lessonNoteState.saveTimer);
          lessonNoteState.saveTimer = null;
        }
        flushLessonNoteSave();
      });
    }

    // Populate the editor with the persisted value.
    els.previewNoteInput.value = lessonNoteState.lastSavedValue;

    // Default to View mode if the note already has content, Edit mode otherwise.
    setLessonNoteMode(lessonNoteState.lastSavedValue.trim() ? 'view' : 'edit');
    setNoteStatus('is-saved', 'Saved');
  }

  // Some destinations send `X-Frame-Options: DENY` or
  // `Content-Security-Policy: frame-ancestors 'none'`, which makes the
  // browser refuse to render them inside our iframe (e.g. w3schools, GitHub,
  // Facebook). Browsers don't expose a JS hook for this from a cross-origin
  // parent, so we can't detect it programmatically. The pragmatic fix is to
  // always show an "Open in new tab" button in the modal header so the user
  // has a one-click escape hatch for any external resource.
  function openPreview(lesson) {
    els.previewTitle.textContent = lesson.title;
    const body = els.previewBody;
    const type = lesson.type;
    const resource = lesson.resource || '';

    initLessonNotePane(lesson);

    // Sync-rendered types (text/markdown) skip the loading flash; async/media types
    // show a brief "Loading..." placeholder while the iframe/img loads.
    const isSync = (type === 'text' || type === 'markdown');
    if (!isSync) {
      body.innerHTML = '<div class="text-center text-white-50 py-5">Loading...</div>';
    } else {
      body.innerHTML = '';
    }

    if (type === 'text') {
      const content = lesson.notes || resource || '(empty note)';
      body.innerHTML = `<pre class="preview-text">${escapeHtml(content)}</pre>`;
    } else if (type === 'markdown') {
      // Render raw markdown to sanitized HTML
      const md = lesson.notes || resource || '';
      body.innerHTML = `<div class="preview-markdown">${renderMarkdown(md)}</div>`;
    } else {
      // article / website / unknown — the destination may block embedding
      // via X-Frame-Options / frame-ancestors. The header "Open in new tab"
      // button above is the user-facing workaround.
      body.innerHTML = `<iframe class="preview-frame" src="${escapeHtml(resource)}" referrerpolicy="no-referrer"></iframe>`;
    }

    // "No content in modal" case: types like `website` open the URL in a new
    // tab from `openLessonResource`, so the in-modal preview area is empty.
    // The note pane then takes the full modal width. We also reveal the header
    // "Open in new tab" button so the user can re-open the URL from inside the
    // modal if the first new-tab window was closed.
    const noContentTypes = new Set(['website', 'article', 'link']);
    const isNoContent = noContentTypes.has(type);
    if (els.previewModalEl) {
      els.previewModalEl.classList.toggle('preview-modal--no-content', isNoContent);
    }
    if (els.previewOpenExternalBtn) {
      const href = (lesson && lesson.resource) ? String(lesson.resource) : '';
      // Anchor tag — only safe to set href when we have a real URL.
      els.previewOpenExternalBtn.setAttribute('href', href || '#');
      els.previewOpenExternalBtn.classList.toggle('d-none', !(isNoContent && href));
    }

    bs.previewModal.show();
  }

  // ---------- Event wiring -------------------------------------------------
  function wireEvents() {
    // Stop any playing <video> / <audio> / <iframe> inside a modal as soon as
    // it starts closing. Without this, dismissing the preview modal (close
    // button, backdrop click, or Escape) leaves the media element in the DOM
    // and the audio/video — including YouTube embeds — keeps playing in the
    // background. We stash the original `src` on a data attribute the first
    // time we touch an iframe so the next open can restore it.
    function stopModalMedia(modalEl) {
      if (!modalEl) return;
      modalEl.querySelectorAll('video, audio').forEach((m) => {
        try {
          m.pause();
          // Detaching the src and forcing a load releases the underlying
          // media stream — `pause()` alone is not enough in all browsers.
          m.removeAttribute('src');
          if (typeof m.load === 'function') m.load();
        } catch (_) { /* ignore */ }
      });
      // YouTube (and any other external) embeds play inside <iframe>, not
      // <video>, so the loop above can't touch them. Clearing `src` makes the
      // browser drop the document and stop playback immediately for the
      // close-button / backdrop / Escape paths alike.
      modalEl.querySelectorAll('iframe').forEach((f) => {
        try {
          if (!f.dataset) return;
          if (f.src && !f.dataset.ocbOrigSrc) {
            f.dataset.ocbOrigSrc = f.src;
          }
          f.src = 'about:blank';
        } catch (_) { /* ignore */ }
      });
    }
    // Restore the original iframe src when the modal is shown again so the
    // embed actually plays instead of staring at a blank page.
    function restoreModalMedia(modalEl) {
      if (!modalEl) return;
      modalEl.querySelectorAll('iframe').forEach((f) => {
        try {
          const orig = f.dataset && f.dataset.ocbOrigSrc;
          if (orig) {
            f.src = orig;
            delete f.dataset.ocbOrigSrc;
          }
        } catch (_) { /* ignore */ }
      });
    }
    ['previewModalEl', 'lessonModalEl', 'courseModalEl'].forEach((key) => {
      const el = els[key];
      if (!el) return;
      // `hide.bs.modal` fires the moment Bootstrap begins closing (close
      // button, backdrop click, Escape) — that's the right moment to yank
      // the iframe src so audio stops without waiting for the fade-out.
      el.addEventListener('hide.bs.modal', () => stopModalMedia(el));
      el.addEventListener('hidden.bs.modal', () => stopModalMedia(el));
      el.addEventListener('shown.bs.modal', () => restoreModalMedia(el));
    });

    els.newCourseBtn.addEventListener('click', openCourseCreateModal);
    els.toggleActionsBtn.addEventListener('click', toggleViewMode);
    if (els.importCourseBtn) els.importCourseBtn.addEventListener('click', openImportModal);
    if (els.importSubmitBtn) els.importSubmitBtn.addEventListener('click', submitImportCourse);
    if (els.importFileInput) {
      els.importFileInput.addEventListener('change', () => {
        // Auto-populate the textarea from the picked file so the user can
        // see what they're about to submit.
        const file = els.importFileInput.files && els.importFileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          if (els.importJsonInput) els.importJsonInput.value = String(reader.result || '');
        };
        reader.onerror = () => showImportError('Could not read the picked file');
        reader.readAsText(file);
      });
    }
    if (els.importModalEl) {
      els.importModalEl.addEventListener('hidden.bs.modal', resetImportForm);
    }
    if (els.exportCourseBtn) els.exportCourseBtn.addEventListener('click', exportActiveCourse);
    if (els.syncProgressBtn) els.syncProgressBtn.addEventListener('click', syncProgress);
    if (els.streaksBtn) els.streaksBtn.addEventListener('click', toggleStreaks);
    if (els.streaksCloseBtn) els.streaksCloseBtn.addEventListener('click', closeStreaks);
    if (els.streaksMonthSel) {
      els.streaksMonthSel.addEventListener('change', () => {
        streaksView.month = Number(els.streaksMonthSel.value);
        renderStreaks();
      });
    }
    if (els.streaksYearSel) {
      els.streaksYearSel.addEventListener('change', () => {
        streaksView.year = Number(els.streaksYearSel.value);
        // Clear month so renderStreaks() can snap to the closest valid one.
        streaksView.month = -1;
        renderStreaks();
      });
    }
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
    if (els.addTaskBtn) els.addTaskBtn.addEventListener('click', () => openTaskModal(null));
    if (els.saveTaskBtn) els.saveTaskBtn.addEventListener('click', saveTaskFromModal);
    if (els.taskRunnerSubmit) els.taskRunnerSubmit.addEventListener('click', submitTask);

    // Course metadata wiring: add author row + chip inputs for tags/languages
    if (els.addAuthorRowBtn && els.courseFormAuthors) {
      els.addAuthorRowBtn.addEventListener('click', () => {
        const row = makeAuthorRow('', '');
        els.courseFormAuthors.appendChild(row);
        const first = row.querySelector('.author-name');
        if (first) first.focus();
      });
    }

    function wireChipInput(input, container) {
      if (!input || !container) return;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const v = input.value;
          // Split on comma too so pasting "a, b" creates two chips.
          v.split(',').forEach((part) => {
            if (part.trim()) addChipToContainer(container, part);
          });
          input.value = '';
        } else if (e.key === 'Backspace' && !input.value) {
          const chips = container.querySelectorAll('.ocb-chip');
          const last = chips[chips.length - 1];
          if (last) last.remove();
        }
      });
      input.addEventListener('blur', () => {
        const v = input.value;
        if (v && v.trim()) {
          v.split(',').forEach((part) => {
            if (part.trim()) addChipToContainer(container, part);
          });
          input.value = '';
        }
      });
    }

    wireChipInput(els.courseTagsInput, els.courseFormTags);
    wireChipInput(els.courseLanguagesInput, els.courseFormLanguages);

    els.saveCourseBtn.addEventListener('click', saveCourseFromModal);
    els.saveLessonBtn.addEventListener('click', saveLessonFromModal);

    // Resource tabs
    $$('#resourceTabs .nav-link').forEach((btn) => {
      btn.addEventListener('click', () => activateResourceTab(btn.dataset.tab));
    });

    // Pressing Enter in title field submits
    [els.courseTitleInput, els.lessonTitleInput, els.taskTitleInput].forEach((inp) => {
      if (!inp) return;
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (inp === els.courseTitleInput) els.saveCourseBtn.click();
          else if (inp === els.lessonTitleInput) els.saveLessonBtn.click();
          else if (inp === els.taskTitleInput && els.saveTaskBtn) els.saveTaskBtn.click();
        }
      });
    });
  }

  // ---------- Theme controller --------------------------------------------
  // Stores the user's chosen mode ('system' | 'light' | 'dark'). The actually
  // applied attribute on <html> is resolved from this on every change and on
  // OS-level prefers-color-scheme updates.
  const THEME_KEY = 'ocb.theme';
  const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' };
  const THEME_ICON = {
    system: 'bi-circle-half',
    light: 'bi-sun-fill',
    dark: 'bi-moon-stars-fill',
  };

  function getStoredTheme() {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'system' || stored === 'light' || stored === 'dark') return stored;
    } catch (e) { /* localStorage may be unavailable */ }
    return 'system';
  }

  function resolveTheme(mode) {
    if (mode === 'light' || mode === 'dark') return mode;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function applyTheme(mode) {
    const resolved = resolveTheme(mode);
    document.documentElement.setAttribute('data-bs-theme', resolved);
    updateThemeUI(mode);
  }

  function updateThemeUI(mode) {
    if (els.activeThemeLabel) {
      els.activeThemeLabel.textContent = THEME_LABEL[mode] || 'System';
    }
    if (els.themeDropdownIcon) {
      els.themeDropdownIcon.className = 'bi me-1 ' + (THEME_ICON[mode] || 'bi-circle-half');
    }
    (els.themeChoices || []).forEach((btn) => {
      const isActive = btn.dataset.themeChoice === mode;
      const check = btn.querySelector('[data-theme-check]');
      if (check) {
        check.classList.toggle('d-none', !isActive);
      }
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
  }

  function setTheme(mode) {
    applyTheme(mode);
    try { localStorage.setItem(THEME_KEY, mode); } catch (e) { /* ignore */ }
  }

  function wireTheme() {
    if (els.themeDropdownMenu) {
      els.themeDropdownMenu.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-theme-choice]');
        if (!btn) return;
        const choice = btn.dataset.themeChoice;
        if (choice === 'system' || choice === 'light' || choice === 'dark') {
          setTheme(choice);
        }
      });
    }
    // Re-apply when the user changes OS-level theme while in 'system' mode.
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        if (getStoredTheme() === 'system') applyTheme('system');
      };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler); // older Safari
    }
  }

  // ---------- Init ---------------------------------------------------------
  function init() {
    applyTheme(getStoredTheme()); // apply persisted theme before first render
    wireTheme();
    wireEvents();
    initViewMode();
    loadCourses();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
