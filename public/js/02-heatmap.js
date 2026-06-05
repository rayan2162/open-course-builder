/* ============================================================================
   02-heatmap.js — Heatmap panel rendering (grid, weekly chart, upcoming)
   ============================================================================ */
'use strict';

const Heatmap = {
  _chart: null,
  toggle() {
    const panel = $('#heatmap-panel');
    if (!panel) return;
    AppState.heatmapOpen = !AppState.heatmapOpen;
    panel.style.display = AppState.heatmapOpen ? 'block' : 'none';
    if (AppState.heatmapOpen) this.render();
  },
  close() {
    AppState.heatmapOpen = false;
    const p = $('#heatmap-panel'); if (p) p.style.display = 'none';
  },
  render() {
    this._renderGrid();
    this._renderChart();
    this._renderUpcoming();
  },
  _renderGrid() {
    const wrap = $('#heatmap-grid-wrap');
    if (!wrap) return;
    const data = (AppState.stats && AppState.stats.heatmap) || {};
    const map = Object.create(null);
    // Backend stores heatmap as an object { 'YYYY-MM-DD': { study_time_seconds, ... } }.
    // Normalize to minutes keyed by date for the grid lookups below.
    Object.keys(data).forEach(k => {
      const entry = data[k] || {};
      const seconds = typeof entry.study_time_seconds === 'number'
        ? entry.study_time_seconds
        : (entry.study_time || 0);
      map[k] = Math.round(seconds / 60);
    });

    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - (HEATMAP_DAYS - 1));
    const startDay = start.getDay();
    start.setDate(start.getDate() - startDay);

    const cols = Math.ceil(HEATMAP_DAYS / 7) + 1;
    const grid = [];
    for (let c = 0; c < cols; c++) {
      const col = [];
      for (let r = 0; r < 7; r++) {
        const dt = new Date(start);
        dt.setDate(start.getDate() + c * 7 + r);
        col.push(dt);
      }
      grid.push(col);
    }

    const html = [];
    html.push('<div class="heatmap-month-row"></div>');
    html.push('<div class="heatmap-grid" id="heatmap-grid">');
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < cols; c++) {
        const dt = grid[c][r];
        const k = ymd(dt);
        const m = map[k] || 0;
        if (dt > today) { html.push(`<div class="heatmap-cell" style="visibility:hidden"></div>`); continue; }
        html.push(`<div class="heatmap-cell ${heatLevelClass(m)}" title="${k}: ${m}m"></div>`);
      }
    }
    html.push('</div>');
    wrap.innerHTML = html.join('');

    const monthRow = wrap.querySelector('.heatmap-month-row');
    if (monthRow) {
      const labels = [];
      let lastM = -1;
      for (let c = 0; c < cols; c++) {
        const dt = grid[c][0];
        const m = dt.getMonth();
        if (m !== lastM) {
          labels.push(`<span style="display:inline-block; width:${7 * 15}px;">${dt.toLocaleString(undefined, { month: 'short' })}</span>`);
          lastM = m;
        } else {
          labels.push(`<span style="display:inline-block; width:${7 * 15}px;"></span>`);
        }
      }
      monthRow.innerHTML = labels.join('');
    }
  },
  _renderChart() {
    const canvas = document.getElementById('weeklyChart');
    if (!canvas) return;
    const data = (AppState.stats && AppState.stats.heatmap) || {};
    const map = Object.create(null);
    Object.keys(data).forEach(k => {
      const entry = data[k] || {};
      const seconds = typeof entry.study_time_seconds === 'number'
        ? entry.study_time_seconds
        : (entry.study_time || 0);
      map[k] = Math.round(seconds / 60);
    });
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const series = [];
    const labels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const k = ymd(d);
      labels.push(days[d.getDay()]);
      series.push(map[k] || 0);
    }
    if (this._chart) { this._chart.destroy(); this._chart = null; }
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 200);
    grad.addColorStop(0, 'rgba(99, 102, 241, 0.6)');
    grad.addColorStop(1, 'rgba(99, 102, 241, 0.05)');
    this._chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Minutes', data: series, backgroundColor: grad,
          borderColor: 'rgba(99,102,241,1)', borderWidth: 1, borderRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9494a8' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9494a8' }, beginAtZero: true }
        }
      }
    });
  },
  _renderUpcoming() {
    const wrap = $('#upcoming-list');
    if (!wrap) return;
    const items = (AppState.stats && AppState.stats.upcoming_lessons) || [];
    if (!items.length) {
      wrap.innerHTML = '<div class="text-muted-2" style="font-size:12px;">All caught up. Pick a module to start a new topic.</div>';
      return;
    }
    wrap.innerHTML = items.slice(0, 5).map(it => `
      <div class="upcoming-item" data-mod="${escapeHtml(it.module_id)}" data-top="${escapeHtml(it.topic_id)}">
        <i class="bi bi-bookmark"></i>
        <div style="flex:1;">
          <div>${escapeHtml(it.topic_name)}</div>
          <div class="up-mod">${escapeHtml(it.module_name || '')}</div>
        </div>
        <i class="bi bi-chevron-right"></i>
      </div>
    `).join('');
    $$('.upcoming-item', wrap).forEach(el => {
      el.addEventListener('click', () => {
        AppState.selectedModuleId = el.dataset.mod;
        Heatmap.close();
        Sidebar.render();
        Main.render();
        if (el.dataset.top) {
          setTimeout(() => TopicViewer.open(el.dataset.mod, el.dataset.top), 80);
        }
      });
    });
  }
};
