// IronLog · Log Workout Page
// Zero inline onclick handlers — all events via delegation on #log-content.

const LogPage = (() => {

  let exercises  = [];
  let logEntries = [];

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  async function render() {
    exercises  = await window.api.exercises.list();
    logEntries = [];

    document.getElementById('log-date-display').textContent =
      new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const container = document.getElementById('log-content');

    if (exercises.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">No exercises yet</div>
          <p>Add your exercises first, then come back to log a workout.</p>
          <br>
          <button class="btn primary" data-action="go-exercises">Add Exercises</button>
        </div>`;
      bindDelegation(container);
      return;
    }

    container.innerHTML = buildShell();
    bindDelegation(container);
    bindStaticEvents();
    renderExerciseBlocks();
  }

  // ── Shell (rendered once) ─────────────────────────────────────────────────
  function buildShell() {
    const exOptions = exercises
      .map(e => `<option value="${e.id}">${e.name} (${e.muscle_group})</option>`)
      .join('');

    return `
      <div class="form-card" style="margin-bottom:0">
        <div class="form-row">
          <div class="form-group">
            <label>Date</label>
            <input type="date" id="log-date" value="${today()}" style="width:160px">
          </div>
          <div class="form-group">
            <label>Session Type</label>
            <select id="log-type" style="width:120px">
              <option value="push">Push</option>
              <option value="pull">Pull</option>
              <option value="legs">Legs</option>
              <option value="full">Full Body</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group grow">
            <label>Label (optional)</label>
            <input type="text" id="log-label" placeholder="e.g. Push A, Pull B">
          </div>
        </div>
      </div>

      <div id="log-exercise-blocks"></div>

      <div class="form-card" style="background:var(--surface-2)">
        <div class="form-row" style="margin-bottom:0">
          <div class="form-group grow">
            <label>Add Exercise</label>
            <select id="add-exercise-select">
              <option value="">— choose exercise —</option>
              ${exOptions}
            </select>
          </div>
          <div style="padding-top:18px">
            <button class="btn" id="add-exercise-btn">+ Add</button>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:12px;align-items:center">
        <button class="btn primary" id="save-session-btn">Save Session</button>
        <button class="btn" id="cancel-btn">Cancel</button>
        <span id="log-save-msg" style="font-size:12px;color:var(--text-3)"></span>
      </div>`;
  }

  // ── Event delegation — one listener on the page container ─────────────────
  function bindDelegation(container) {
    // Remove old listener by cloning (safest cross-browser approach)
    const fresh = container.cloneNode(true);
    container.parentNode.replaceChild(fresh, container);
    const c = document.getElementById('log-content');

    c.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const ei     = btn.dataset.ei !== undefined ? parseInt(btn.dataset.ei) : null;
      const si     = btn.dataset.si !== undefined ? parseInt(btn.dataset.si) : null;

      switch (action) {
        case 'go-exercises':   Router.go('exercises'); break;
        case 'add-set':        addSet(ei);             break;
        case 'remove-set':     removeSet(ei, si);      break;
        case 'remove-exercise':removeExercise(ei);     break;
      }
    });

    c.addEventListener('input', e => {
      const inp = e.target.closest('[data-set-field]');
      if (!inp) return;
      const ei    = parseInt(inp.dataset.ei);
      const si    = parseInt(inp.dataset.si);
      const field = inp.dataset.setField;
      updateSet(ei, si, field, inp.value);
    });
  }

  function bindStaticEvents() {
    document.getElementById('add-exercise-btn').addEventListener('click', () => {
      const sel = document.getElementById('add-exercise-select');
      const id  = parseInt(sel.value);
      if (!id) return;
      const ex = exercises.find(e => e.id === id);
      if (!ex) return;
      if (logEntries.find(e => e.exercise_id === id)) {
        alert(`${ex.name} is already in this session.`);
        return;
      }
      logEntries.push({ exercise_id: id, exercise_name: ex.name, sets: [] });
      sel.value = '';
      renderExerciseBlocks();
    });

    document.getElementById('save-session-btn').addEventListener('click', saveSession);
    document.getElementById('cancel-btn').addEventListener('click', () => Router.go('dashboard'));
  }

  // ── Exercise blocks ───────────────────────────────────────────────────────
  function renderExerciseBlocks() {
    const container = document.getElementById('log-exercise-blocks');
    if (!container) return;

    if (logEntries.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = logEntries.map((entry, ei) => `
      <div class="form-card" id="ex-block-${ei}" style="margin-bottom:0">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px">
          <div style="font-family:var(--mono);font-size:13px;font-weight:500">${entry.exercise_name}</div>
          <button class="btn" style="font-size:11px;padding:4px 10px"
            data-action="remove-exercise" data-ei="${ei}">Remove</button>
        </div>
        <table class="set-table">
          <thead>
            <tr>
              <th style="width:40px">Set</th>
              <th style="width:110px">Weight (lbs)</th>
              <th style="width:80px">Reps</th>
              <th style="width:60px">RPE</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${entry.sets.map((s, si) => buildSetRow(ei, si, s)).join('')}
          </tbody>
        </table>
        <div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button class="btn" style="font-size:12px"
            data-action="add-set" data-ei="${ei}">+ Set</button>
          ${buildDropoffBadge(entry.sets)}
        </div>
      </div>`).join('');
  }

  function buildSetRow(ei, si, set) {
    return `
      <tr>
        <td style="color:var(--text-3);font-family:var(--mono)">${si + 1}</td>
        <td><input type="number" step="2.5" min="0"
              value="${set.weight_lbs !== '' ? set.weight_lbs : ''}"
              placeholder="35" style="width:90px"
              data-set-field="weight_lbs" data-ei="${ei}" data-si="${si}"></td>
        <td><input type="number" step="1" min="1"
              value="${set.reps !== '' ? set.reps : ''}"
              placeholder="10" style="width:70px"
              data-set-field="reps" data-ei="${ei}" data-si="${si}"></td>
        <td><input type="number" step="0.5" min="1" max="10"
              value="${set.rpe || ''}"
              placeholder="—" style="width:55px"
              data-set-field="rpe" data-ei="${ei}" data-si="${si}"></td>
        <td>
          <button class="del-btn"
            data-action="remove-set" data-ei="${ei}" data-si="${si}">✕</button>
        </td>
      </tr>`;
  }

  function buildDropoffBadge(sets) {
    const valid = sets.filter(s => s.reps > 0);
    if (valid.length < 2) return '';
    const first = valid[0].reps;
    const last  = valid[valid.length - 1].reps;
    const pct   = first > 0 ? Math.round(((first - last) / first) * 100) : 0;
    let cls = 'tag-amber', label = 'Not hard enough';
    if (pct >= 30 && pct <= 60) { cls = 'tag-green'; label = 'Hypertrophy zone'; }
    if (pct > 60)               { cls = 'tag-red';   label = 'Too heavy / recovery risk'; }
    return `<span class="tag ${cls}">Drop-off ${pct}% · ${label}</span>`;
  }

  // ── Set operations ────────────────────────────────────────────────────────
  function addSet(ei) {
    const last = logEntries[ei].sets[logEntries[ei].sets.length - 1];
    logEntries[ei].sets.push({
      reps:       last ? last.reps       : '',
      weight_lbs: last ? last.weight_lbs : '',
      rpe:        '',
    });
    renderExerciseBlocks();
  }

  function removeSet(ei, si) {
    logEntries[ei].sets.splice(si, 1);
    renderExerciseBlocks();
  }

  function removeExercise(ei) {
    logEntries.splice(ei, 1);
    renderExerciseBlocks();
  }

  function updateSet(ei, si, field, val) {
    if (!logEntries[ei] || !logEntries[ei].sets[si]) return;
    logEntries[ei].sets[si][field] = field === 'reps' ? parseInt(val) || 0 : parseFloat(val) || 0;
    // Refresh drop-off badge without full re-render
    const block = document.getElementById(`ex-block-${ei}`);
    if (!block) return;
    const old = block.querySelector('.tag');
    if (old) old.remove();
    const badge = buildDropoffBadge(logEntries[ei].sets);
    if (badge) {
      const addBtn = block.querySelector('[data-action="add-set"]');
      if (addBtn) addBtn.insertAdjacentHTML('afterend', badge);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function saveSession() {
    const date  = document.getElementById('log-date').value;
    const type  = document.getElementById('log-type').value;
    const label = document.getElementById('log-label').value.trim();
    const msg   = document.getElementById('log-save-msg');
    const btn   = document.getElementById('save-session-btn');

    if (!date)              { msg.textContent = 'Pick a date.';               return; }
    if (!logEntries.length) { msg.textContent = 'Add at least one exercise.'; return; }

    const sets = [];
    for (const entry of logEntries) {
      const valid = entry.sets.filter(s => s.reps > 0 && s.weight_lbs >= 0);
      if (!valid.length) continue;
      valid.forEach((s, i) => sets.push({
        exercise_id: entry.exercise_id,
        set_number:  i + 1,
        reps:        s.reps,
        weight_lbs:  s.weight_lbs || 0,
        rpe:         s.rpe || null,
        notes:       null,
      }));
    }

    if (!sets.length) { msg.textContent = 'No valid sets to save.'; return; }

    msg.textContent  = 'Saving…';
    btn.disabled     = true;

    try {
      const result = await window.api.sessions.save({
        session: { session_date: date, session_type: type, label: label || null,
                   notes: null, duration_min: null, avg_hr: null },
        sets,
      });

      if (!localStorage.getItem('ironlog_program_start')) {
        localStorage.setItem('ironlog_program_start', date);
      }

      msg.textContent = '';
      AnalysisPage.setSession(result.id);
      Router.go('analysis');
    } catch (err) {
      console.error(err);
      msg.textContent = 'Error saving — check DevTools console.';
      btn.disabled    = false;
    }
  }

  Router.register('log', render);
  return { render, addSet, removeSet, removeExercise, updateSet };
})();
