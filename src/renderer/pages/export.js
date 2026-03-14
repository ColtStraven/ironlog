// IronLog · Export Data
// Converts all database tables to CSV and saves via native file dialog.

const ExportPage = (() => {

  // ── CSV builder ───────────────────────────────────────────────────────────
  function toCSV(rows) {
    if (!rows || !rows.length) return '';

    const headers = Object.keys(rows[0]);
    const escape  = v => {
      if (v == null) return '';
      const s = String(v);
      // Wrap in quotes if contains comma, quote, or newline
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const lines = [
      headers.join(','),
      ...rows.map(row => headers.map(h => escape(row[h])).join(',')),
    ];

    return lines.join('\r\n');
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  // ── Export definitions ────────────────────────────────────────────────────
  const EXPORTS = [
    {
      key:      'sessions',
      title:    'Sessions',
      filename: `ironlog-sessions-${today()}.csv`,
      desc:     'One row per workout session — date, type, label, volume, drop-off, rep zones, top set.',
      icon:     '🏋',
    },
    {
      key:      'sets',
      title:    'Sets (full detail)',
      filename: `ironlog-sets-${today()}.csv`,
      desc:     'Every individual set ever logged — exercise, weight, reps, RPE, set volume, and estimated 1RM.',
      icon:     '📋',
    },
    {
      key:      'body_metrics',
      title:    'Body Metrics',
      filename: `ironlog-body-metrics-${today()}.csv`,
      desc:     'Daily weight, waist, chest, arm measurements, and body fat %.',
      icon:     '📏',
    },
    {
      key:      'daily_activity',
      title:    'Activity & Steps',
      filename: `ironlog-activity-${today()}.csv`,
      desc:     'Daily step count and work/off day log.',
      icon:     '👟',
    },
    {
      key:      'nutrition',
      title:    'Nutrition',
      filename: `ironlog-nutrition-${today()}.csv`,
      desc:     'Daily calorie, protein, carb, and fat log.',
      icon:     '🥗',
    },
    {
      key:      'exercises',
      title:    'Exercise List',
      filename: `ironlog-exercises-${today()}.csv`,
      desc:     'Your full exercise library — name, category, muscle group, equipment.',
      icon:     '📂',
    },
  ];

  // ── State ─────────────────────────────────────────────────────────────────
  let exportData   = null;
  let exportStatus = {};  // key → 'idle' | 'saving' | 'saved' | 'empty'

  // ── Render ────────────────────────────────────────────────────────────────
  async function render() {
    const container = document.getElementById('export-content');
    container.innerHTML = `<div class="empty-state"><div class="empty-title">Loading…</div></div>`;

    exportData   = await window.api.export.all();
    exportStatus = {};
    EXPORTS.forEach(e => {
      const rows = exportData[e.key];
      exportStatus[e.key] = rows && rows.length ? 'idle' : 'empty';
    });

    buildPage(container);
  }

  function buildPage(container) {
    // Row counts
    const counts = {};
    EXPORTS.forEach(e => {
      counts[e.key] = exportData[e.key] ? exportData[e.key].length : 0;
    });

    const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);

    const cards = EXPORTS.map(e => {
      const count  = counts[e.key];
      const status = exportStatus[e.key];
      return exportCard(e, count, status);
    }).join('');

    container.innerHTML = `
      <!-- Summary -->
      <div class="form-card" style="padding:16px 20px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-family:var(--mono);font-size:14px;font-weight:500;color:var(--text)">
              ${totalRows.toLocaleString()} total rows across ${EXPORTS.length} tables
            </div>
            <div style="font-size:12px;color:var(--text-3);margin-top:3px">
              All files saved as CSV · compatible with Excel, Google Sheets, and any data tool
            </div>
          </div>
          <button class="btn primary" id="export-all-btn" data-action="export-all">
            Export all tables
          </button>
        </div>
      </div>

      <!-- Individual export cards -->
      <div id="export-cards" style="display:flex;flex-direction:column;gap:10px">
        ${cards}
      </div>

      <!-- Format note -->
      <div class="form-card" style="background:var(--surface-2);border-color:var(--border)">
        <div class="section-label" style="margin-bottom:10px">About the export format</div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px">
          <div>
            <div class="signal-explain-title">Sets file</div>
            <p class="signal-explain-text">The most useful file for external analysis. Includes computed columns: <code>set_volume</code> (reps × weight) and <code>epley_1rm</code> (estimated 1RM) so you can chart strength trends in Excel without any formulas.</p>
          </div>
          <div>
            <div class="signal-explain-title">Sessions file</div>
            <p class="signal-explain-text">One row per session with all the pre-computed stats — total volume, average drop-off %, rep zone counts, top set, and weakest link. Ready to pivot or chart immediately.</p>
          </div>
          <div>
            <div class="signal-explain-title">Encoding</div>
            <p class="signal-explain-text">UTF-8 with Windows line endings (CRLF). Opens correctly in Excel on Windows without any import wizard.</p>
          </div>
          <div>
            <div class="signal-explain-title">Re-import</div>
            <p class="signal-explain-text">These files are for backup and external analysis. To restore your data to a new machine, copy the <code>ironlog.db</code> file from your AppData folder — that's the full backup.</p>
          </div>
        </div>
      </div>`;

    // Delegation — handles both export-all and export-one
    container.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'export-all') { await exportAll(); return; }
      if (btn.dataset.action === 'export-one') { await exportOne(btn.dataset.key); return; }
    });
  }

  function exportCard(def, count, status) {
    const isEmpty  = count === 0;
    const isSaved  = status === 'saved';
    const isSaving = status === 'saving';

    let btnLabel, btnCls, btnDisabled;
    if (isEmpty)       { btnLabel = 'No data';   btnCls = '';          btnDisabled = 'disabled'; }
    else if (isSaving) { btnLabel = 'Saving…';   btnCls = '';          btnDisabled = 'disabled'; }
    else if (isSaved)  { btnLabel = 'Saved ✓';   btnCls = 'tag-green'; btnDisabled = ''; }
    else               { btnLabel = 'Export CSV'; btnCls = '';          btnDisabled = ''; }

    return `
      <div class="export-card" id="export-card-${def.key}">
        <div class="export-card-left">
          <div class="export-card-title">${def.title}</div>
          <div class="export-card-desc">${def.desc}</div>
          <div class="export-card-meta">
            <span class="tag ${isEmpty ? 'tag-amber' : 'tag-blue'}">${count.toLocaleString()} row${count !== 1 ? 's' : ''}</span>
            <span class="muted text-sm">${def.filename}</span>
          </div>
        </div>
        <button
          class="btn ${isSaved ? 'primary' : ''}"
          id="export-btn-${def.key}"
          data-action="export-one" data-key="${def.key}"
          ${btnDisabled}
          style="flex-shrink:0;min-width:110px"
        >${btnLabel}</button>
      </div>`;
  }

  // ── Export one table ──────────────────────────────────────────────────────
  async function exportOne(key) {
    const def  = EXPORTS.find(e => e.key === key);
    const rows = exportData[key];
    if (!rows || !rows.length) return;

    setStatus(key, 'saving');

    const csv    = toCSV(rows);
    const result = await window.api.export.saveFile(def.filename, csv);

    setStatus(key, result.ok ? 'saved' : 'idle');
  }

  // ── Export all tables sequentially ───────────────────────────────────────
  async function exportAll() {
    const btn = document.getElementById('export-all-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Exporting…'; }

    let saved = 0;
    for (const def of EXPORTS) {
      const rows = exportData[def.key];
      if (!rows || !rows.length) continue;
      setStatus(def.key, 'saving');
      const csv    = toCSV(rows);
      const result = await window.api.export.saveFile(def.filename, csv);
      setStatus(def.key, result.ok ? 'saved' : 'idle');
      if (result.ok) saved++;
    }

    if (btn) {
      btn.disabled    = false;
      btn.textContent = saved > 0 ? `Exported ${saved} files ✓` : 'Export all tables';
      if (saved > 0) btn.classList.add('primary');
    }
  }

  function setStatus(key, status) {
    exportStatus[key] = status;

    const btn = document.getElementById(`export-btn-${key}`);
    if (!btn) return;

    if (status === 'saving') {
      btn.textContent = 'Saving…';
      btn.disabled    = true;
    } else if (status === 'saved') {
      btn.textContent = 'Saved ✓';
      btn.disabled    = false;
      btn.classList.add('primary');
    } else {
      btn.textContent = 'Export CSV';
      btn.disabled    = false;
      btn.classList.remove('primary');
    }
  }

  Router.register('export', render);
  return { render, exportOne, exportAll };
})();
