/* ============================================================================
   01-toast-session-navbar.js — Toast, Session, Navbar
   ============================================================================ */
'use strict';

const Toast = {
  show(opts) {
    const o = Object.assign({ type: 'info', title: '', message: '', duration: 4000 }, opts || {});
    const c = $('#toast-container'); if (!c) return;
    const node = document.createElement('div');
    node.className = `app-toast ${o.type}`;
    const icon = { success: 'check-circle-fill', error: 'exclamation-octagon-fill', warning: 'exclamation-triangle-fill', info: 'info-circle-fill' }[o.type] || 'info-circle-fill';
    node.innerHTML = `
      <i class="bi bi-${icon} t-icon"></i>
      <div class="t-body">
        <div class="t-title">${escapeHtml(o.title)}</div>
        ${o.message ? `<div class="t-msg">${escapeHtml(o.message)}</div>` : ''}
      </div>
      <button class="t-close" type="button" aria-label="Close"><i class="bi bi-x-lg"></i></button>
    `;
    const close = () => { if (!node.parentNode) return; node.style.transition = 'opacity 0.2s'; node.style.opacity = '0'; setTimeout(() => node.remove(), 200); };
    node.querySelector('.t-close').addEventListener('click', close);
    c.appendChild(node);
    if (o.duration > 0) setTimeout(close, o.duration);
    return close;
  },
  success(title, msg, dur) { return this.show({ type: 'success', title, message: msg, duration: dur }); },
  error(title, msg, dur) { return this.show({ type: 'error', title, message: msg, duration: dur }); },
  warning(title, msg, dur) { return this.show({ type: 'warning', title, message: msg, duration: dur }); },
  info(title, msg, dur) { return this.show({ type: 'info', title, message: msg, duration: dur }); }
};

const Session = {
  async start() {
    if (AppState.session.id) return;
    try {
      const res = await API.post('/api/session/start', {});
      AppState.session.id = res.session_id;
      AppState.session.startTime = new Date();
      AppState.session.elapsedSec = 0;
      AppState.session.completedTopicsThisSession = 0;
      AppState.session.notesEditedThisSession = 0;
      AppState.session.modulesStudied = new Set();
      AppState.session.initialStreak = (AppState.stats && AppState.stats.streak && AppState.stats.streak.current) || 0;
      this._startTimers();
      Navbar.render();
    } catch (e) { console.warn('Session start failed:', e); }
  },
  _startTimers() {
    if (AppState.session.tickTimer) clearInterval(AppState.session.tickTimer);
    if (AppState.session.heartbeatTimer) clearInterval(AppState.session.heartbeatTimer);
    AppState.session.tickTimer = setInterval(() => {
      AppState.session.elapsedSec += 1;
      Navbar.updateTimer();
    }, SESSION_TIMER_TICK_MS);
    AppState.session.heartbeatTimer = setInterval(() => this._heartbeat(), SESSION_HEARTBEAT_MS);
  },
  async _heartbeat() {
    if (!AppState.session.id) return;
    try {
      const res = await API.patch(`/api/session/${encodeURIComponent(AppState.session.id)}/heartbeat`, {});
      AppState.session.elapsedSec = res.elapsed_sec || AppState.session.elapsedSec;
    } catch (e) { console.warn('heartbeat failed', e); }
  },
  async end() {
    if (!AppState.session.id) return;
    const id = AppState.session.id;
    try { await API.post(`/api/session/${encodeURIComponent(id)}/end`, { triggered_by: 'page_action' }); }
    catch (e) { console.warn('Session end failed', e); }
    if (AppState.session.tickTimer) { clearInterval(AppState.session.tickTimer); AppState.session.tickTimer = null; }
    if (AppState.session.heartbeatTimer) { clearInterval(AppState.session.heartbeatTimer); AppState.session.heartbeatTimer = null; }
    AppState.session.id = null;
    Navbar.render();
  },
  trackModuleVisit(mid) { if (mid) AppState.session.modulesStudied.add(mid); },
  trackComplete() { AppState.session.completedTopicsThisSession += 1; Navbar.render(); },
  trackNoteEdit() { AppState.session.notesEditedThisSession += 1; Navbar.render(); }
};

const Navbar = {
  render() {
    this._renderCourseLabel();
    this._renderCenter();
  },
  _renderCourseLabel() {
    const el = $('#nav-course-name');
    if (!el) return;
    el.textContent = AppState.course ? (AppState.course.name || '') : '';
  },
  _renderCenter() {
    const wrap = $('#nav-center');
    if (!wrap) return;
    if (!AppState.course) { wrap.innerHTML = ''; return; }
    const progress = this._getProgressPct();
    const circumference = 2 * Math.PI * 16;
    const offset = circumference * (1 - progress / 100);
    const session = AppState.session;
    const sessionActive = !!session.id;
    const sessionLabel = sessionActive ? formatDuration(session.elapsedSec) : '0m';
    const streak = (AppState.stats && AppState.stats.streak && AppState.stats.streak.current) || 0;
    const miniHeat = (AppState.stats && AppState.stats.heatmap) || {};
    // Build the last-7-days minute series from the object shape
    // { 'YYYY-MM-DD': { study_time_seconds, ... } }.
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const last5 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const k = ymd(d);
      const entry = miniHeat[k] || {};
      const seconds = typeof entry.study_time_seconds === 'number'
        ? entry.study_time_seconds
        : (entry.study_time || 0);
      last5.push({ key: k, label: days[d.getDay()], minutes: Math.round(seconds / 60) });
    }
    const clock = formatClock(new Date());

    wrap.innerHTML = `
      <div class="nav-stat" id="nav-progress" title="Course progress">
        <svg class="progress-circle" viewBox="0 0 36 36" width="36" height="36">
          <circle class="bg-circle" cx="18" cy="18" r="16"></circle>
          <circle class="fg-circle" cx="18" cy="18" r="16" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"></circle>
        </svg>
        <div>
          <div class="nav-stat-label">Progress</div>
          <div class="nav-stat-value">${progress}%</div>
        </div>
      </div>
      <div class="nav-divider"></div>
      <div class="nav-stat" id="nav-session" title="Session timer">
        <i class="bi bi-stopwatch" style="color:${sessionActive ? 'var(--success)' : 'var(--text-muted)'}"></i>
        <div>
          <div class="nav-stat-label">${sessionActive ? 'Session' : 'Idle'}</div>
          <div class="nav-stat-value">${sessionLabel}</div>
        </div>
      </div>
      <div class="nav-divider"></div>
      <div class="nav-stat" id="nav-clock" title="Local time">
        <i class="bi bi-clock"></i>
        <div>
          <div class="nav-stat-label">Now</div>
          <div class="nav-stat-value" style="font-variant-numeric: tabular-nums;">${clock}</div>
        </div>
      </div>
      <div class="nav-divider"></div>
      <div class="nav-stat" id="nav-streak" title="Current streak">
        <i class="bi bi-fire" style="color:${streak > 0 ? 'var(--warning)' : 'var(--text-muted)'}"></i>
        <div>
          <div class="nav-stat-label">Streak</div>
          <div class="nav-stat-value">${streak}d</div>
        </div>
      </div>
      <div class="nav-divider"></div>
      <div class="nav-stat" id="nav-heat" title="Activity heatmap">
        <div class="heat-mini" id="nav-heat-cells">
          ${last5.map(d => `<div class="heat-mini-cell ${heatLevelClass(d && d.minutes || 0)}"></div>`).join('')}
        </div>
        <div>
          <div class="nav-stat-label">Heat</div>
          <div class="nav-stat-sub">Last 7d</div>
        </div>
      </div>
      <div class="nav-divider"></div>
      <button class="btn btn-sm btn-accent" id="nav-save-progress"><i class="bi bi-cloud-arrow-up"></i> Save Progress</button>
    `;

    const saveBtn = $('#nav-save-progress');
    if (saveBtn) saveBtn.addEventListener('click', () => GitModal.save());

    const heat = $('#nav-heat');
    if (heat) heat.addEventListener('click', () => Heatmap.toggle());
  },
  _getProgressPct() {
    const s = AppState.stats;
    if (!s) return 0;
    // Backend nests topic totals under s.progress; fall back to top-level for
    // older payloads.
    const prog = s.progress || s;
    if (!prog.total_topics) return 0;
    return Math.round((prog.completed_topics / prog.total_topics) * 100);
  },
  updateTimer() {
    const wrap = $('#nav-session');
    if (!wrap) return;
    const session = AppState.session;
    const val = wrap.querySelector('.nav-stat-value');
    if (val) val.textContent = formatDuration(session.elapsedSec);
    const lab = wrap.querySelector('.nav-stat-label');
    if (lab) lab.textContent = session.id ? 'Session' : 'Idle';
  },
  updateClock() {
    const wrap = $('#nav-clock');
    if (!wrap) return;
    const val = wrap.querySelector('.nav-stat-value');
    if (val) val.textContent = formatClock(new Date());
  }
};
