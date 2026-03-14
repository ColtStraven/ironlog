// IronLog · Settings
// TDEE calculator, calorie and macro targets, profile info.
// All stored in localStorage — no DB needed.

const SettingsPage = (() => {

  const DEFAULTS = {
    // Profile
    weight_lbs:    196,
    height_in:     70,    // 5'10"
    age:           50,
    sex:           'male',
    // Activity
    workout_days:  4,
    steps_workday: 20000,
    steps_offday:  5000,
    // Goals
    goal:          'recomp',   // recomp | cut | bulk | maintain
    // Computed targets (editable)
    tdee:          2700,
    calorie_target: 2250,
    protein_target: 180,
    carb_target:    200,
    fat_target:     70,
    // Program
    program_start: '',
    program_weeks: 12,
  };

  function load() {
    try {
      const saved = localStorage.getItem('ironlog_settings');
      return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : { ...DEFAULTS };
    } catch { return { ...DEFAULTS }; }
  }

  function save(settings) {
    localStorage.setItem('ironlog_settings', JSON.stringify(settings));
    // Also keep program start in sync with the separate key used by other pages
    if (settings.program_start) {
      localStorage.setItem('ironlog_program_start', settings.program_start);
    }
  }

  // ── TDEE calculator (Mifflin-St Jeor) ────────────────────────────────────
  function calcTDEE(s) {
    const weight_kg = s.weight_lbs * 0.453592;
    const height_cm = s.height_in * 2.54;

    // BMR
    let bmr;
    if (s.sex === 'male') {
      bmr = 10 * weight_kg + 6.25 * height_cm - 5 * s.age + 5;
    } else {
      bmr = 10 * weight_kg + 6.25 * height_cm - 5 * s.age - 161;
    }

    // Activity multiplier
    // Blend work days (high steps + lifting) with off days
    const workDayMult = 1.725;   // very active (lifting + 20k steps)
    const offDayMult  = 1.375;   // lightly active
    const daysPerWeek = 7;
    const workDays    = Math.min(s.workout_days, 5);
    const offDays     = daysPerWeek - workDays;
    const blendedMult = (workDays * workDayMult + offDays * offDayMult) / daysPerWeek;

    return Math.round(bmr * blendedMult);
  }

  // ── Macro calculator ───────────────────────────────────────────────────────
  function calcMacros(s, calTarget) {
    const weight_lbs = s.weight_lbs;
    // Protein: 0.9g per lb bodyweight for recomp/cut
    const protein_g = Math.round(weight_lbs * (s.goal === 'bulk' ? 0.8 : 0.9));
    const protein_cals = protein_g * 4;
    // Fat: 25% of calories
    const fat_cals = Math.round(calTarget * 0.25);
    const fat_g    = Math.round(fat_cals / 9);
    // Carbs: remainder
    const carb_cals = calTarget - protein_cals - fat_cals;
    const carb_g    = Math.max(0, Math.round(carb_cals / 4));
    return { protein_g, fat_g, carb_g };
  }

  // ── Goal calorie adjustment ────────────────────────────────────────────────
  function goalCalories(tdee, goal) {
    switch (goal) {
      case 'cut':      return Math.round(tdee * 0.80);   // -20%
      case 'recomp':   return Math.round(tdee * 0.85);   // -15%
      case 'maintain': return tdee;
      case 'bulk':     return Math.round(tdee * 1.10);   // +10%
      default:         return Math.round(tdee * 0.85);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    const s = load();
    const container = document.getElementById('settings-content');
    container.innerHTML = buildPage(s);
    bindEvents(s);
  }

  function buildPage(s) {
    const tdee       = calcTDEE(s);
    const goalCals   = goalCalories(tdee, s.goal);
    const macros     = calcMacros(s, s.calorie_target);

    const goalOptions = ['recomp','cut','maintain','bulk'].map(g =>
      `<option value="${g}" ${s.goal === g ? 'selected' : ''}>${
        g === 'recomp' ? 'Body recomposition' :
        g === 'cut'    ? 'Cut (fat loss)' :
        g === 'maintain' ? 'Maintain' : 'Bulk (muscle gain)'
      }</option>`
    ).join('');

    const programStart = s.program_start || localStorage.getItem('ironlog_program_start') || '';
    const weekNum = programStart
      ? Math.min(s.program_weeks, Math.floor((Date.now() - new Date(programStart)) / (7 * 86400000)) + 1)
      : null;

    return `
      <!-- Profile -->
      <div class="form-card">
        <div class="section-label">Profile</div>
        <div class="form-row">
          <div class="form-group">
            <label>Weight (lbs)</label>
            <input type="number" id="s-weight" value="${s.weight_lbs}" step="0.5" style="width:100px">
          </div>
          <div class="form-group">
            <label>Height (inches)</label>
            <input type="number" id="s-height" value="${s.height_in}" step="1" style="width:100px">
            <span class="muted text-sm" style="margin-top:3px">${Math.floor(s.height_in / 12)}' ${s.height_in % 12}"</span>
          </div>
          <div class="form-group">
            <label>Age</label>
            <input type="number" id="s-age" value="${s.age}" step="1" style="width:80px">
          </div>
          <div class="form-group">
            <label>Sex</label>
            <select id="s-sex" style="width:100px">
              <option value="male"   ${s.sex === 'male'   ? 'selected' : ''}>Male</option>
              <option value="female" ${s.sex === 'female' ? 'selected' : ''}>Female</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Activity -->
      <div class="form-card">
        <div class="section-label">Activity pattern</div>
        <div class="form-row">
          <div class="form-group">
            <label>Workout days / week</label>
            <input type="number" id="s-workdays" value="${s.workout_days}" min="1" max="7" step="1" style="width:80px">
          </div>
          <div class="form-group">
            <label>Steps on work days</label>
            <input type="number" id="s-steps-work" value="${s.steps_workday}" step="500" style="width:110px">
          </div>
          <div class="form-group">
            <label>Steps on off days</label>
            <input type="number" id="s-steps-off" value="${s.steps_offday}" step="500" style="width:110px">
          </div>
        </div>
      </div>

      <!-- Goal -->
      <div class="form-card">
        <div class="section-label">Goal</div>
        <div class="form-row">
          <div class="form-group">
            <label>Primary goal</label>
            <select id="s-goal" style="width:220px">${goalOptions}</select>
          </div>
        </div>
      </div>

      <!-- TDEE estimate -->
      <div class="form-card" style="background:var(--surface-2)">
        <div class="section-label">TDEE estimate</div>
        <div class="metric-row cols-3" style="margin-bottom:14px">
          <div class="metric-card">
            <div class="metric-label">Calculated TDEE</div>
            <div class="metric-value" id="tdee-display">${tdee.toLocaleString()}</div>
            <div class="metric-unit">kcal/day (Mifflin-St Jeor)</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Goal adjustment</div>
            <div class="metric-value" id="goal-cal-display">${goalCals.toLocaleString()}</div>
            <div class="metric-unit" id="goal-cal-label">${goalLabel(s.goal, tdee, goalCals)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Your calorie target</div>
            <div class="metric-value" id="cal-target-display">${s.calorie_target.toLocaleString()}</div>
            <div class="metric-unit">manually set below</div>
          </div>
        </div>
        <p style="font-size:12px;color:var(--text-3);line-height:1.6;margin:0">
          TDEE is estimated using a blended activity multiplier across your workout and off days.
          Your high step count on work days (night shifts) meaningfully raises your daily burn.
          Use this as a starting point — adjust your calorie target based on actual weight trends over 2–3 weeks.
        </p>
      </div>

      <!-- Targets (editable) -->
      <div class="form-card">
        <div class="section-label">Nutrition targets</div>
        <div class="form-row" style="align-items:flex-end">
          <div class="form-group">
            <label>Calories / day</label>
            <input type="number" id="s-cal-target" value="${s.calorie_target}" step="50" style="width:110px">
          </div>
          <div class="form-group">
            <label>Protein (g)</label>
            <input type="number" id="s-protein" value="${s.protein_target}" step="5" style="width:90px">
          </div>
          <div class="form-group">
            <label>Carbs (g)</label>
            <input type="number" id="s-carbs" value="${s.carb_target}" step="5" style="width:90px">
          </div>
          <div class="form-group">
            <label>Fat (g)</label>
            <input type="number" id="s-fat" value="${s.fat_target}" step="5" style="width:90px">
          </div>
          <div>
            <button class="btn" id="auto-macros-btn" style="margin-bottom:1px">Auto-calculate</button>
          </div>
        </div>
        <div id="macro-cal-check" style="font-size:12px;color:var(--text-3);margin-top:4px">
          ${macroCalsCheck(s.protein_target, s.carb_target, s.fat_target, s.calorie_target)}
        </div>
      </div>

      <!-- Program -->
      <div class="form-card">
        <div class="section-label">Program</div>
        <div class="form-row">
          <div class="form-group">
            <label>Program start date</label>
            <input type="date" id="s-program-start" value="${programStart}" style="width:170px">
          </div>
          <div class="form-group">
            <label>Program length (weeks)</label>
            <input type="number" id="s-program-weeks" value="${s.program_weeks}" min="4" max="52" step="1" style="width:90px">
          </div>
          ${weekNum ? `
          <div class="form-group" style="justify-content:flex-end;padding-bottom:2px">
            <span class="tag tag-green">Week ${weekNum} of ${s.program_weeks}</span>
          </div>` : ''}
        </div>
      </div>

      <!-- Save -->
      <div style="display:flex;gap:12px;align-items:center">
        <button class="btn primary" id="settings-save-btn">Save Settings</button>
        <span id="settings-msg" style="font-size:12px;color:var(--green)"></span>
      </div>`;
  }

  function goalLabel(goal, tdee, goalCals) {
    const diff = goalCals - tdee;
    const pct  = Math.round((diff / tdee) * 100);
    return `${diff >= 0 ? '+' : ''}${diff} kcal (${pct >= 0 ? '+' : ''}${pct}% vs TDEE)`;
  }

  function macroCalsCheck(protein, carbs, fat, target) {
    const total = (protein * 4) + (carbs * 4) + (fat * 9);
    const diff  = total - target;
    if (Math.abs(diff) < 20) return `Macros add up to ${total} kcal ✓`;
    return `Macros add up to ${total} kcal (${diff > 0 ? '+' : ''}${diff} vs target)`;
  }

  // ── Events ────────────────────────────────────────────────────────────────
  function bindEvents(initialSettings) {
    let s = { ...initialSettings };

    // Live TDEE recalc on profile/activity changes
    const profileFields = ['s-weight','s-height','s-age','s-sex','s-workdays','s-steps-work','s-steps-off','s-goal'];
    profileFields.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        s = readForm();
        updateTDEEDisplay(s);
      });
    });

    // Macro cal check on target changes
    ['s-cal-target','s-protein','s-carbs','s-fat'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const check = document.getElementById('macro-cal-check');
        const calTarget = parseInt(document.getElementById('s-cal-target').value) || 0;
        const protein   = parseInt(document.getElementById('s-protein').value) || 0;
        const carbs     = parseInt(document.getElementById('s-carbs').value) || 0;
        const fat       = parseInt(document.getElementById('s-fat').value) || 0;
        if (check) check.textContent = macroCalsCheck(protein, carbs, fat, calTarget);
        // Update display
        const calDisplay = document.getElementById('cal-target-display');
        if (calDisplay) calDisplay.textContent = calTarget.toLocaleString();
      });
    });

    // Auto-calculate macros from calorie target
    document.getElementById('auto-macros-btn').addEventListener('click', () => {
      const curr    = readForm();
      const macros  = calcMacros(curr, curr.calorie_target);
      document.getElementById('s-protein').value = macros.protein_g;
      document.getElementById('s-carbs').value   = macros.carb_g;
      document.getElementById('s-fat').value     = macros.fat_g;
      const check = document.getElementById('macro-cal-check');
      if (check) check.textContent = macroCalsCheck(macros.protein_g, macros.carb_g, macros.fat_g, curr.calorie_target);
    });

    // Save
    document.getElementById('settings-save-btn').addEventListener('click', () => {
      const current = readForm();
      save(current);
      const msg = document.getElementById('settings-msg');
      msg.textContent = 'Saved.';
      setTimeout(() => { msg.textContent = ''; }, 2000);
      // Re-render nutrition page targets if it's open
    });
  }

  function readForm() {
    return {
      weight_lbs:     parseFloat(document.getElementById('s-weight').value)       || DEFAULTS.weight_lbs,
      height_in:      parseInt(document.getElementById('s-height').value)          || DEFAULTS.height_in,
      age:            parseInt(document.getElementById('s-age').value)             || DEFAULTS.age,
      sex:            document.getElementById('s-sex').value                       || DEFAULTS.sex,
      workout_days:   parseInt(document.getElementById('s-workdays').value)        || DEFAULTS.workout_days,
      steps_workday:  parseInt(document.getElementById('s-steps-work').value)      || DEFAULTS.steps_workday,
      steps_offday:   parseInt(document.getElementById('s-steps-off').value)       || DEFAULTS.steps_offday,
      goal:           document.getElementById('s-goal').value                      || DEFAULTS.goal,
      calorie_target: parseInt(document.getElementById('s-cal-target').value)      || DEFAULTS.calorie_target,
      protein_target: parseInt(document.getElementById('s-protein').value)         || DEFAULTS.protein_target,
      carb_target:    parseInt(document.getElementById('s-carbs').value)           || DEFAULTS.carb_target,
      fat_target:     parseInt(document.getElementById('s-fat').value)             || DEFAULTS.fat_target,
      program_start:  document.getElementById('s-program-start').value             || '',
      program_weeks:  parseInt(document.getElementById('s-program-weeks').value)   || DEFAULTS.program_weeks,
      tdee:           calcTDEE({ ...DEFAULTS, ...readPartialForm() }),
    };
  }

  function readPartialForm() {
    // Safe partial read for TDEE calc during input events
    return {
      weight_lbs:   parseFloat(document.getElementById('s-weight')?.value)      || DEFAULTS.weight_lbs,
      height_in:    parseInt(document.getElementById('s-height')?.value)         || DEFAULTS.height_in,
      age:          parseInt(document.getElementById('s-age')?.value)            || DEFAULTS.age,
      sex:          document.getElementById('s-sex')?.value                      || DEFAULTS.sex,
      workout_days: parseInt(document.getElementById('s-workdays')?.value)       || DEFAULTS.workout_days,
    };
  }

  function updateTDEEDisplay(s) {
    const tdee     = calcTDEE(s);
    const goalCals = goalCalories(tdee, s.goal);

    const tdeeEl    = document.getElementById('tdee-display');
    const goalCalEl = document.getElementById('goal-cal-display');
    const goalLblEl = document.getElementById('goal-cal-label');

    if (tdeeEl)    tdeeEl.textContent    = tdee.toLocaleString();
    if (goalCalEl) goalCalEl.textContent = goalCals.toLocaleString();
    if (goalLblEl) goalLblEl.textContent = goalLabel(s.goal, tdee, goalCals);
  }

  // ── Public getter so other pages can read targets ─────────────────────────
  function getTargets() {
    const s = load();
    return {
      calories: s.calorie_target,
      protein:  s.protein_target,
      carbs:    s.carb_target,
      fat:      s.fat_target,
      tdee:     s.tdee || calcTDEE(s),
    };
  }

  Router.register('settings', render);
  return { render, getTargets, load };
})();
