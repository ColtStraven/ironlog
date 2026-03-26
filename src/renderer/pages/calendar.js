// IronLog · Calendar
// Editable monthly calendar. Click any day to mark it as:
//   gym day (push/pull/legs/rest), work shift, or deload week.
// All data stored in localStorage — no DB needed.

const CalendarPage = (() => {

  // ── Storage ────────────────────────────────────────────────────────────────
  function loadData() {
    try {
      return JSON.parse(localStorage.getItem('ironlog_calendar') || '{}');
    } catch { return {}; }
  }

  function saveData(data) {
    localStorage.setItem('ironlog_calendar', JSON.stringify(data));
  }

  function dayKey(year, month, day) {
    return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let viewYear  = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  let calData   = {};
  let editModal = null; // currently open day key

  // Day types
  const DAY_TYPES = {
    push:    { label: 'Push',     color: '#1a5c3a', bg: '#e8f4ee', emoji: '💪' },
    pull:    { label: 'Pull',     color: '#1a4a7a', bg: '#e8f0fa', emoji: '🏋' },
    legs:    { label: 'Legs',     color: '#8a5a10', bg: '#fdf3e3', emoji: '🦵' },
    rest:    { label: 'Rest',     color: '#9a9890', bg: '#f5f4f0', emoji: '😴' },
    work:    { label: 'Work shift', color: '#534AB7', bg: '#EEEDFE', emoji: '🏥' },
    deload:  { label: 'Deload',   color: '#a02020', bg: '#faeaea', emoji: '⬇' },
    cardio:  { label: 'Cardio',   color: '#2d7a50', bg: '#f2faf6', emoji: '🏃' },
    birthday:{ label: 'Birthday', color: '#D85A30', bg: '#FAECE7', emoji: '🎂' },
  };

  // Week types for program tracking
  const WEEK_TYPES = {
    training: { label: 'Training week', color: 'var(--green)', bg: 'var(--green-light)' },
    deload:   { label: 'Deload week',   color: 'var(--red)',   bg: 'var(--red-light)'   },
    off:      { label: 'Off week',      color: 'var(--text-3)','bg': 'var(--bg)'         },
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    calData = loadData();
    const container = document.getElementById('calendar-content');
    document.getElementById('calendar-meta').textContent =
      new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    container.innerHTML = buildPage();
    bindEvents();
  }

  function buildPage() {
    return `
      <div class="cal-layout">

        <!-- Month nav + legend -->
        <div class="cal-header">
          <div class="cal-nav">
            <button class="btn" id="cal-prev">&#8592;</button>
            <div class="cal-month-label">
              ${new Date(viewYear, viewMonth).toLocaleDateString('en-US',{month:'long',year:'numeric'})}
            </div>
            <button class="btn" id="cal-next">&#8594;</button>
            <button class="btn" style="margin-left:8px" id="cal-today">Today</button>
          </div>
          <div class="cal-legend">
            ${Object.entries(DAY_TYPES).map(([k,v])=>`
              <span class="cal-legend-item">
                <span class="cal-legend-dot" style="background:${v.color}"></span>
                ${v.label}
              </span>`).join('')}
          </div>
        </div>

        <!-- Program week tracker -->
        <div class="cal-week-strip" id="cal-week-strip">
          ${buildWeekStrip()}
        </div>

        <!-- Calendar grid -->
        <div class="cal-grid-wrap">
          ${buildGrid()}
        </div>

      </div>

      <!-- Day edit modal (hidden) -->
      <div id="cal-modal-overlay" class="cal-modal-overlay" style="display:none">
        <div class="cal-modal" id="cal-modal"></div>
      </div>`;
  }

  // ── Week strip ─────────────────────────────────────────────────────────────
  function buildWeekStrip() {
    const programStart = localStorage.getItem('ironlog_program_start');
    if (!programStart) {
      return `<div class="muted text-sm" style="padding:8px 0">No program start date set — log a workout to start tracking weeks.</div>`;
    }

    const startDate = new Date(programStart + 'T00:00:00');
    const today     = new Date();
    const weekNum   = Math.max(1, Math.floor((today - startDate) / (7 * 86400000)) + 1);

    // Build 12 week cells
    const weeks = [];
    for (let w = 1; w <= 12; w++) {
      const weekStart = new Date(startDate.getTime() + (w-1)*7*86400000);
      const weekKey   = `week-${w}`;
      const stored    = calData[weekKey] || {};
      const wType     = stored.type || 'training';
      const wt        = WEEK_TYPES[wType];
      const isCurrent = w === weekNum;
      const isPast    = w < weekNum;

      weeks.push(`
        <div class="cal-week-cell ${isCurrent?'current':''} ${isPast?'past':''}"
             data-week="${w}" data-action="edit-week"
             style="--wbg:${wt.bg};--wcol:${wt.color}">
          <div class="cal-week-num">W${w}</div>
          <div class="cal-week-type">${wType === 'training' ? '' : wt.label}</div>
          ${stored.label ? `<div class="cal-week-custom">${stored.label}</div>` : ''}
          ${isCurrent ? '<div class="cal-week-now">NOW</div>' : ''}
        </div>`);
    }

    return `
      <div class="section-label" style="margin-bottom:8px">12-week program · week ${weekNum}</div>
      <div class="cal-week-row">${weeks.join('')}</div>`;
  }

  // ── Calendar grid ──────────────────────────────────────────────────────────
  function buildGrid() {
    const today     = new Date();
    const firstDay  = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
    const prevDays  = new Date(viewYear, viewMonth, 0).getDate();

    const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const headers = DOW.map(d=>`<div class="cal-dow">${d}</div>`).join('');

    let cells = '';

    // Leading empty cells
    for (let i = 0; i < firstDay; i++) {
      const d = prevDays - firstDay + i + 1;
      cells += `<div class="cal-cell other-month"><span class="cal-day-num">${d}</span></div>`;
    }

    // Current month cells
    for (let d = 1; d <= daysInMonth; d++) {
      const key     = dayKey(viewYear, viewMonth, d);
      const stored  = calData[key] || {};
      const types   = stored.types || [];
      const note    = stored.note || '';
      const isToday = (today.getFullYear()===viewYear && today.getMonth()===viewMonth && today.getDate()===d);

      const dots = types.map(t => {
        const dt = DAY_TYPES[t];
        return dt ? `<span class="cal-dot" style="background:${dt.color}" title="${dt.label}"></span>` : '';
      }).join('');

      const emojis = types.map(t => DAY_TYPES[t]?.emoji || '').filter(Boolean).join(' ');

      cells += `
        <div class="cal-cell ${isToday?'today':''} ${types.length?'has-data':''}"
             data-key="${key}" data-action="edit-day">
          <div class="cal-cell-top">
            <span class="cal-day-num ${isToday?'today-num':''}">${d}</span>
            <span class="cal-dots">${dots}</span>
          </div>
          ${emojis ? `<div class="cal-emojis">${emojis}</div>` : ''}
          ${note   ? `<div class="cal-note-preview">${note.slice(0,30)}${note.length>30?'…':''}</div>` : ''}
        </div>`;
    }

    // Trailing empty cells to complete grid
    const totalCells = firstDay + daysInMonth;
    const trailing   = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= trailing; i++) {
      cells += `<div class="cal-cell other-month"><span class="cal-day-num">${i}</span></div>`;
    }

    return `
      <div class="cal-grid">
        ${headers}
        ${cells}
      </div>`;
  }

  // ── Day edit modal ─────────────────────────────────────────────────────────
  function openDayModal(key) {
    editModal = key;
    const stored = calData[key] || {};
    const types  = stored.types || [];
    const note   = stored.note || '';

    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(year, month-1, day);
    const dateLabel = date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});

    const typeButtons = Object.entries(DAY_TYPES).map(([k,v]) => `
      <button class="cal-type-btn ${types.includes(k)?'active':''}"
              data-type="${k}" data-action="toggle-type"
              style="--tbg:${v.bg};--tcol:${v.color}">
        <span>${v.emoji}</span>
        <span>${v.label}</span>
      </button>`).join('');

    const modal = document.getElementById('cal-modal');
    modal.innerHTML = `
      <div class="cal-modal-header">
        <div class="cal-modal-date">${dateLabel}</div>
        <button class="btn" id="cal-modal-close">✕</button>
      </div>

      <div class="cal-modal-section">
        <div class="section-label">Day type</div>
        <div class="cal-type-grid">${typeButtons}</div>
      </div>

      <div class="cal-modal-section">
        <div class="section-label">Note</div>
        <input type="text" id="cal-day-note"
          value="${note}"
          placeholder="e.g. Push A · felt strong · PR on bench"
          style="width:100%">
      </div>

      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn primary" id="cal-modal-save">Save</button>
        <button class="btn danger" id="cal-modal-clear">Clear day</button>
      </div>`;

    document.getElementById('cal-modal-overlay').style.display = 'flex';
    document.getElementById('cal-day-note').focus();
  }

  function closeDayModal() {
    document.getElementById('cal-modal-overlay').style.display = 'none';
    editModal = null;
  }

  // ── Week edit modal ────────────────────────────────────────────────────────
  function openWeekModal(weekNum) {
    editModal = `week-${weekNum}`;
    const stored = calData[editModal] || {};
    const wType  = stored.type || 'training';
    const wLabel = stored.label || '';

    const typeButtons = Object.entries(WEEK_TYPES).map(([k,v]) => `
      <button class="cal-type-btn ${wType===k?'active':''}"
              data-type="${k}" data-action="toggle-week-type"
              style="--tbg:${v.bg};--tcol:${v.color}">
        ${v.label}
      </button>`).join('');

    const modal = document.getElementById('cal-modal');
    modal.innerHTML = `
      <div class="cal-modal-header">
        <div class="cal-modal-date">Program Week ${weekNum}</div>
        <button class="btn" id="cal-modal-close">✕</button>
      </div>

      <div class="cal-modal-section">
        <div class="section-label">Week type</div>
        <div class="cal-type-grid">${typeButtons}</div>
      </div>

      <div class="cal-modal-section">
        <div class="section-label">Label (optional)</div>
        <input type="text" id="cal-week-label"
          value="${wLabel}"
          placeholder="e.g. Push/Pull A, volume block"
          style="width:100%">
      </div>

      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn primary" id="cal-modal-save">Save</button>
        <button class="btn danger" id="cal-modal-clear">Clear week</button>
      </div>`;

    document.getElementById('cal-modal-overlay').style.display = 'flex';
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  function bindEvents() {
    const container = document.getElementById('calendar-content');

    // Month navigation
    document.getElementById('cal-prev').addEventListener('click', () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      render();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      render();
    });
    document.getElementById('cal-today').addEventListener('click', () => {
      viewYear  = new Date().getFullYear();
      viewMonth = new Date().getMonth();
      render();
    });

    // Grid / week strip clicks (delegation)
    container.addEventListener('click', e => {
      const dayCell = e.target.closest('[data-action="edit-day"]');
      if (dayCell) { openDayModal(dayCell.dataset.key); return; }

      const weekCell = e.target.closest('[data-action="edit-week"]');
      if (weekCell) { openWeekModal(parseInt(weekCell.dataset.week)); return; }
    });

    // Modal overlay click to close
    document.getElementById('cal-modal-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('cal-modal-overlay')) closeDayModal();
    });

    // Modal inner events (delegated on document since modal is re-rendered)
    document.getElementById('cal-modal').addEventListener('click', e => {
      // Close
      if (e.target.id === 'cal-modal-close') { closeDayModal(); return; }

      // Toggle day type
      const typeBtn = e.target.closest('[data-action="toggle-type"]');
      if (typeBtn) {
        const key    = editModal;
        const type   = typeBtn.dataset.type;
        if (!calData[key]) calData[key] = {};
        if (!calData[key].types) calData[key].types = [];
        const idx = calData[key].types.indexOf(type);
        if (idx === -1) calData[key].types.push(type);
        else            calData[key].types.splice(idx, 1);
        typeBtn.classList.toggle('active', calData[key].types.includes(type));
        return;
      }

      // Toggle week type
      const weekTypeBtn = e.target.closest('[data-action="toggle-week-type"]');
      if (weekTypeBtn) {
        const key  = editModal;
        if (!calData[key]) calData[key] = {};
        calData[key].type = weekTypeBtn.dataset.type;
        document.querySelectorAll('[data-action="toggle-week-type"]').forEach(b => {
          b.classList.toggle('active', b.dataset.type === weekTypeBtn.dataset.type);
        });
        return;
      }

      // Save day
      if (e.target.id === 'cal-modal-save') {
        const key = editModal;
        if (!calData[key]) calData[key] = {};
        // Note field
        const noteEl = document.getElementById('cal-day-note');
        if (noteEl) calData[key].note = noteEl.value.trim();
        // Week label
        const labelEl = document.getElementById('cal-week-label');
        if (labelEl) calData[key].label = labelEl.value.trim();
        saveData(calData);
        closeDayModal();
        render();
        return;
      }

      // Clear day/week
      if (e.target.id === 'cal-modal-clear') {
        delete calData[editModal];
        saveData(calData);
        closeDayModal();
        render();
        return;
      }
    });
  }

  Router.register('calendar', render);
  return { render };
})();
