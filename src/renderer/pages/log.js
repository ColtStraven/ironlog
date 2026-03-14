// IronLog · Log Workout Page

const LogPage = (() => {

  // State for current log session
  let exercises  = [];
  let logEntries = [];  // [{ exercise_id, exercise_name, sets: [{reps, weight_lbs}] }]

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  async function render() {
    exercises = await window.api.exercises.list();
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
          <button class="btn primary" onclick="Router.go('exercises')">Add Exercises</button>
        </div>`;
      return;
    }

    container.innerHTML = buildForm();
    bindEvents();
  }

  function buildForm() {
    const exOptions = exercises
      .map(e => `<option value="${e.id}" data-category="${e.category}">${e.name} (${e.muscle_group})</option>`)
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

      <!-- Add exercise row -->
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

      <!-- Save -->
      <div style="display:flex;gap:12px;align-items:center">
        <button class="btn primary" id="save-session-btn">Save Session</button>
        <button class="btn" onclick="Router.go('dashboard')">Cancel</button>
        <span id="log-save-msg" style="font-size:12px;color:var(--text-3)"></span>
      </div>
    `;
  }

  function bindEvents() {
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
  }

  function renderExerciseBlocks() {
    const container = document.getElementById('log-exercise-blocks');

    if (logEntries.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = logEntries.map((entry, ei) => `
      <div class="form-card" id="ex-block-${ei}" style="margin-bottom:0">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px">
          <div style="font-family:var(--mono);font-size:13px;font-weight:500">${entry.exercise_name}</div>
          <button class="btn" style="font-size:11px;padding:4px 10px" onclick="LogPage.removeExercise(${ei})">Remove</button>
        </div>

        <table class="set-table">
          <thead>
            <tr>
              <th style="width:40px">Set</th>
              <th style="width:100px">Weight (lbs)</th>
              <th style="width:80px">Reps</th>
              <th style="width:60px">RPE</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="sets-body-${ei}">
            ${entry.sets.map((s, si) => buildSetRow(ei, si, s)).join('')}
          </tbody>
        </table>

        <div style="margin-top:10px">
          <button class="btn" style="font-size:12px" onclick="LogPage.addSet(${ei})">+ Set</button>
          ${entry.sets.length >= 2 ? buildDropoffBadge(entry.sets) : ''}
        </div>
      </div>
    `).join('');
  }

  function buildSetRow(ei, si, set) {
    return `
      <tr>
        <td style="color:var(--text-3);font-family:var(--mono)">${si + 1}</td>
        <td><input type="number" step="2.5" min="0" value="${set.weight_lbs || ''}"
              oninput="LogPage.updateSet(${ei},${si},'weight_lbs',this.value)"
              placeholder="35"></td>
        <td><input type="number" step="1" min="1" value="${set.reps || ''}"
              oninput="LogPage.updateSet(${ei},${si},'reps',this.value)"
              placeholder="10"></td>
        <td><input type="number" step="0.5" min="1" max="10" value="${set.rpe || ''}"
              oninput="LogPage.updateSet(${ei},${si},'rpe',this.value)"
              placeholder="—" style="width:60px"></td>
        <td><button class="del-btn" onclick="LogPage.removeSet(${ei},${si})">✕</button></td>
      </tr>`;
  }

  function buildDropoffBadge(sets) {
    const validSets = sets.filter(s => s.reps > 0);
    if (validSets.length < 2) return '';
    const first = validSets[0].reps;
    const last  = validSets[validSets.length - 1].reps;
    const pct   = first > 0 ? Math.round(((first - last) / first) * 100) : 0;

    let cls = 'tag-amber', label = 'Not hard enough';
    if (pct >= 30 && pct <= 60) { cls = 'tag-green'; label = 'Hypertrophy zone'; }
    if (pct > 60)               { cls = 'tag-red';   label = 'Too heavy / recovery risk'; }

    return `<span class="tag ${cls}" style="margin-left:10px">Drop-off ${pct}% · ${label}</span>`;
  }

  function addSet(ei) {
    const last = logEntries[ei].sets[logEntries[ei].sets.length - 1];
    logEntries[ei].sets.push({
      reps: last ? last.reps : '',
      weight_lbs: last ? last.weight_lbs : '',
      rpe: ''
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
    logEntries[ei].sets[si][field] = field === 'reps' ? parseInt(val) : parseFloat(val);
    // Refresh drop-off badge only (not full re-render)
    const block = document.getElementById(`ex-block-${ei}`);
    if (block) {
      const existing = block.querySelector('.tag');
      const newBadge = buildDropoffBadge(logEntries[ei].sets);
      const addBtn   = block.querySelector('button:last-of-type');
      // Remove old badge if present and replace
      const oldBadge = block.querySelector('.tag');
      if (oldBadge) oldBadge.remove();
      if (newBadge) addBtn.insertAdjacentHTML('afterend', newBadge);
    }
  }

  async function saveSession() {
    const date  = document.getElementById('log-date').value;
    const type  = document.getElementById('log-type').value;
    const label = document.getElementById('log-label').value.trim();
    const msg   = document.getElementById('log-save-msg');

    // Validation
    if (!date) { msg.textContent = 'Pick a date.'; return; }
    if (logEntries.length === 0) { msg.textContent = 'Add at least one exercise.'; return; }

    // Build flat sets array
    const sets = [];
    for (const entry of logEntries) {
      const validSets = entry.sets.filter(s => s.reps > 0 && s.weight_lbs >= 0);
      if (validSets.length === 0) continue;
      validSets.forEach((s, i) => {
        sets.push({
          exercise_id: entry.exercise_id,
          set_number:  i + 1,
          reps:        s.reps,
          weight_lbs:  s.weight_lbs || 0,
          rpe:         s.rpe || null,
          notes:       null,
        });
      });
    }

    if (sets.length === 0) { msg.textContent = 'No valid sets to save.'; return; }

    msg.textContent = 'Saving…';

    try {
      const result = await window.api.sessions.save({
        session: { session_date: date, session_type: type, label: label || null, notes: null, duration_min: null, avg_hr: null },
        sets,
      });

      // Store program start date on first save
      if (!localStorage.getItem('ironlog_program_start')) {
        localStorage.setItem('ironlog_program_start', date);
      }

      msg.textContent = '';
      // Jump straight to analysis for this session
      AnalysisPage.render(result.id);
      Router.go('analysis');
    } catch (err) {
      console.error(err);
      msg.textContent = 'Error saving session. Check console.';
    }
  }

  Router.register('log', render);

  // Expose functions needed by inline onclick handlers
  return { render, addSet, removeSet, removeExercise, updateSet };
})();
