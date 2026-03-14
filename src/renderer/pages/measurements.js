// IronLog · Measurements Page

const MeasurementsPage = (() => {

  async function render() {
    const rows = await window.api.metrics.list(90);
    const container = document.getElementById('measurements-content');
    container.innerHTML = buildPage(rows);
    bindEvents();
  }

  function today() { return new Date().toISOString().slice(0,10); }

  function buildPage(rows) {
    const tableRows = rows.map(r => `
      <tr>
        <td style="font-family:var(--mono);font-size:12px">${new Date(r.log_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
        <td style="font-family:var(--mono)">${r.weight_lbs != null ? r.weight_lbs + ' lbs' : '—'}</td>
        <td style="font-family:var(--mono)">${r.waist_in   != null ? r.waist_in + '"' : '—'}</td>
        <td style="font-family:var(--mono)">${r.chest_in   != null ? r.chest_in + '"' : '—'}</td>
        <td style="font-family:var(--mono)">${r.arm_in     != null ? r.arm_in + '"' : '—'}</td>
        <td style="font-family:var(--mono)">${r.body_fat_pct != null ? r.body_fat_pct + '%' : '—'}</td>
      </tr>`).join('');

    return `
      <div class="form-card">
        <div class="section-label">Log today</div>
        <div class="form-row">
          <div class="form-group"><label>Date</label><input type="date" id="m-date" value="${today()}" style="width:160px"></div>
          <div class="form-group"><label>Weight (lbs)</label><input type="number" id="m-weight" step="0.1" placeholder="196.0" style="width:100px"></div>
          <div class="form-group"><label>Waist (in)</label><input type="number" id="m-waist" step="0.25" placeholder="43" style="width:90px"></div>
          <div class="form-group"><label>Chest (in)</label><input type="number" id="m-chest" step="0.25" placeholder="42" style="width:90px"></div>
          <div class="form-group"><label>Arm (in)</label><input type="number" id="m-arm" step="0.25" placeholder="14" style="width:90px"></div>
          <div class="form-group"><label>Body fat %</label><input type="number" id="m-bf" step="0.5" placeholder="25" style="width:90px"></div>
          <div style="padding-top:18px"><button class="btn primary" id="m-save">Save</button></div>
        </div>
        <div id="m-msg" style="font-size:12px;color:var(--red)"></div>
      </div>

      ${rows.length > 0 ? `
      <div class="form-card" style="padding:0;overflow:hidden">
        <table class="set-table" style="width:100%">
          <thead><tr><th>Date</th><th>Weight</th><th>Waist</th><th>Chest</th><th>Arm</th><th>Body fat</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>` : ''}`;
  }

  function bindEvents() {
    document.getElementById('m-save').addEventListener('click', async () => {
      const msg = document.getElementById('m-msg');
      const row = {
        log_date:     document.getElementById('m-date').value,
        weight_lbs:   parseFloat(document.getElementById('m-weight').value) || null,
        waist_in:     parseFloat(document.getElementById('m-waist').value)  || null,
        chest_in:     parseFloat(document.getElementById('m-chest').value)  || null,
        arm_in:       parseFloat(document.getElementById('m-arm').value)    || null,
        body_fat_pct: parseFloat(document.getElementById('m-bf').value)     || null,
        notes: null,
      };
      if (!row.log_date) { msg.textContent = 'Pick a date.'; return; }
      await window.api.metrics.save(row);
      render();
    });
  }

  Router.register('measurements', render);
  return { render };
})();


// ─────────────────────────────────────────────────────────
// IronLog · Activity Page

const ActivityPage = (() => {

  async function render() {
    const rows = await window.api.activity.list(30);
    const container = document.getElementById('activity-content');
    container.innerHTML = buildPage(rows);
    bindEvents();
  }

  function today() { return new Date().toISOString().slice(0,10); }

  function buildPage(rows) {
    const tableRows = rows.map(r => `
      <tr>
        <td style="font-family:var(--mono);font-size:12px">${new Date(r.log_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
        <td style="font-family:var(--mono)">${r.steps != null ? r.steps.toLocaleString() : '—'}</td>
        <td><span class="tag ${r.is_work_day ? 'tag-green' : 'tag-blue'}">${r.is_work_day ? 'Work shift' : 'Off day'}</span></td>
        <td style="color:var(--text-3)">${r.shift_start ? r.shift_start + ' – ' + r.shift_end : '—'}</td>
      </tr>`).join('');

    return `
      <div class="form-card">
        <div class="section-label">Log day</div>
        <div class="form-row">
          <div class="form-group"><label>Date</label><input type="date" id="a-date" value="${today()}" style="width:160px"></div>
          <div class="form-group"><label>Steps</label><input type="number" id="a-steps" step="100" placeholder="20000" style="width:110px"></div>
          <div class="form-group">
            <label>Day type</label>
            <select id="a-workday" style="width:130px">
              <option value="1">Work shift</option>
              <option value="0">Off day</option>
            </select>
          </div>
          <div style="padding-top:18px"><button class="btn primary" id="a-save">Save</button></div>
        </div>
      </div>

      ${rows.length > 0 ? `
      <div class="form-card" style="padding:0;overflow:hidden">
        <table class="set-table" style="width:100%">
          <thead><tr><th>Date</th><th>Steps</th><th>Type</th><th>Shift</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>` : ''}`;
  }

  function bindEvents() {
    document.getElementById('a-save').addEventListener('click', async () => {
      const row = {
        log_date:    document.getElementById('a-date').value,
        steps:       parseInt(document.getElementById('a-steps').value) || null,
        is_work_day: parseInt(document.getElementById('a-workday').value),
        shift_start: document.getElementById('a-workday').value === '1' ? '19:00' : null,
        shift_end:   document.getElementById('a-workday').value === '1' ? '07:30' : null,
        notes: null,
      };
      if (!row.log_date) return;
      await window.api.activity.save(row);
      render();
    });
  }

  Router.register('activity', render);
  return { render };
})();


// ─────────────────────────────────────────────────────────
// IronLog · Nutrition Page

const NutritionPage = (() => {

  async function render() {
    const rows = await window.api.nutrition.list(30);
    const container = document.getElementById('nutrition-content');
    container.innerHTML = buildPage(rows);
    bindEvents();
  }

  function today() { return new Date().toISOString().slice(0,10); }

  function getTargets() {
    // Pull from settings if available, fall back to defaults
    try {
      if (typeof SettingsPage !== 'undefined') return SettingsPage.getTargets();
    } catch {}
    return { calories: 2250, protein: 180, carbs: 200, fat: 70 };
  }

  function calTag(cals) {
    if (!cals) return '';
    const target = getTargets().calories;
    const diff = cals - target;
    if (Math.abs(diff) < 150) return `<span class="tag tag-green">On target</span>`;
    if (diff < 0) return `<span class="tag tag-amber">${Math.abs(diff)} under</span>`;
    return `<span class="tag tag-red">${diff} over</span>`;
  }

  function buildPage(rows) {
    const targets = getTargets();
    const tableRows = rows.map(r => `
      <tr>
        <td style="font-family:var(--mono);font-size:12px">${new Date(r.log_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
        <td style="font-family:var(--mono)">${r.calories != null ? r.calories.toLocaleString() : '—'}</td>
        <td>${calTag(r.calories)}</td>
        <td style="font-family:var(--mono)">${r.protein_g != null ? r.protein_g + 'g' : '—'}</td>
        <td style="font-family:var(--mono)">${r.carbs_g   != null ? r.carbs_g   + 'g' : '—'}</td>
        <td style="font-family:var(--mono)">${r.fat_g     != null ? r.fat_g     + 'g' : '—'}</td>
      </tr>`).join('');

    return `
      <div class="metric-row cols-4" style="margin-bottom:4px">
        <div class="metric-card">
          <div class="metric-label">Calorie target</div>
          <div class="metric-value">${targets.calories.toLocaleString()}</div>
          <div class="metric-unit">kcal/day</div>
          <div class="metric-delta delta-neutral" data-nav="settings" style="cursor:pointer;text-decoration:underline">Edit in Settings</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Protein target</div>
          <div class="metric-value">${targets.protein}g</div>
          <div class="metric-unit">per day</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Carb target</div>
          <div class="metric-value">${targets.carbs}g</div>
          <div class="metric-unit">per day</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Fat target</div>
          <div class="metric-value">${targets.fat}g</div>
          <div class="metric-unit">per day</div>
        </div>
      </div>

      <div class="form-card">
        <div class="section-label">Log today</div>
        <div class="form-row">
          <div class="form-group"><label>Date</label><input type="date" id="n-date" value="${today()}" style="width:160px"></div>
          <div class="form-group"><label>Calories</label><input type="number" id="n-cals" placeholder="${targets.calories}" style="width:100px"></div>
          <div class="form-group"><label>Protein (g)</label><input type="number" id="n-protein" placeholder="${targets.protein}" style="width:95px"></div>
          <div class="form-group"><label>Carbs (g)</label><input type="number" id="n-carbs" placeholder="${targets.carbs}" style="width:90px"></div>
          <div class="form-group"><label>Fat (g)</label><input type="number" id="n-fat" placeholder="${targets.fat}" style="width:80px"></div>
          <div style="padding-top:18px"><button class="btn primary" id="n-save">Save</button></div>
        </div>
      </div>

      ${rows.length > 0 ? `
      <div class="form-card" style="padding:0;overflow:hidden">
        <table class="set-table" style="width:100%">
          <thead><tr><th>Date</th><th>Calories</th><th>vs target</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>` : ''}`;
  }

  function bindEvents() {
    document.getElementById('n-save').addEventListener('click', async () => {
      const row = {
        log_date:  document.getElementById('n-date').value,
        calories:  parseInt(document.getElementById('n-cals').value)    || null,
        protein_g: parseInt(document.getElementById('n-protein').value) || null,
        carbs_g:   parseInt(document.getElementById('n-carbs').value)   || null,
        fat_g:     parseInt(document.getElementById('n-fat').value)     || null,
        water_oz:  null,
        notes:     null,
      };
      if (!row.log_date) return;
      await window.api.nutrition.save(row);
      render();
    });
  }

  Router.register('nutrition', render);
  return { render };
})();
