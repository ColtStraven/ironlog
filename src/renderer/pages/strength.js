// IronLog · Strength Trends
// Clean exercise selector with search + category filter.

const StrengthPage = (() => {

  let rmChart      = null;
  let selectedIds  = new Set();
  let allExercises = [];
  let rmData       = {};
  let searchQuery  = '';
  let activeCategory = 'all';

  const COLORS = [
    '#1a5c3a','#1a4a7a','#8a5a10','#a02020',
    '#2d7a50','#378ADD','#BA7517','#D85A30',
  ];

  const CATEGORIES = ['all','push','pull','legs','core','cardio','other'];

  // ── Math ──────────────────────────────────────────────────────────────────
  function epley(weight, reps) {
    return reps === 1 ? weight : weight * (1 + reps / 30);
  }
  function trendSlope(points) {
    if (points.length < 2) return 0;
    const n = points.length, xs = points.map((_,i)=>i), ys = points.map(p=>p.rm);
    const xm = xs.reduce((a,b)=>a+b,0)/n, ym = ys.reduce((a,b)=>a+b,0)/n;
    const num = xs.reduce((s,x,i)=>s+(x-xm)*(ys[i]-ym),0);
    const den = xs.reduce((s,x)=>s+(x-xm)**2,0);
    return den===0?0:num/den;
  }
  function plateauDetect(points, w=3) {
    if (points.length < w+1) return false;
    const r = points.slice(-w);
    return r[0].rm > 0 && Math.abs((r[r.length-1].rm - r[0].rm)/r[0].rm) < 0.02;
  }
  function weeklyGainRate(points) {
    if (points.length < 2) return 0;
    const f = points[0], l = points[points.length-1];
    const weeks = Math.max(1,(new Date(l.date)-new Date(f.date))/604800000);
    return (l.rm - f.rm)/weeks;
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  async function loadRMData(ids) {
    if (!ids.length) return;
    const rows = await window.api.dashboard.rmTrends(ids);
    rmData = {};
    for (const r of rows) {
      if (!rmData[r.exercise_id]) rmData[r.exercise_id] = [];
      rmData[r.exercise_id].push({
        date: r.session_date,
        rm:   Math.round(parseFloat(r.estimated_1rm) * 10) / 10,
        name: r.name,
      });
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  async function render() {
    allExercises = await window.api.exercises.list();
    const container = document.getElementById('strength-content');

    if (!allExercises.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-title">No exercises yet</div>
        <p>Add exercises and log some workouts first.</p>
        <br><button class="btn primary" data-nav="exercises">Add Exercises</button>
      </div>`;
      return;
    }

    // Reset state on page visit
    if (rmChart) { rmChart.destroy(); rmChart = null; }

    container.innerHTML = buildShell();
    bindEvents();
    renderExerciseList();

    // Auto-select first 3 push exercises with data
    const pushExes = allExercises.filter(e => e.category === 'push').slice(0, 3);
    const defaults = pushExes.length ? pushExes : allExercises.slice(0, 3);
    defaults.forEach(e => selectedIds.add(e.id));
    renderSelectedStrip();
    await refreshCharts();
  }

  // ── Shell ──────────────────────────────────────────────────────────────────
  function buildShell() {
    const catTabs = CATEGORIES.map(c => `
      <button class="str-cat-tab ${c === activeCategory ? 'active' : ''}" data-cat="${c}">
        ${c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
      </button>`).join('');

    return `
      <div class="str-layout">

        <!-- ── Left panel: exercise selector ── -->
        <div class="str-panel">
          <div class="str-panel-head">
            <div class="section-label" style="margin-bottom:8px">Exercises</div>
            <input type="text" id="str-search"
              placeholder="Search exercises…"
              style="width:100%;margin-bottom:8px">
            <div class="str-cat-tabs">${catTabs}</div>
          </div>
          <div class="str-panel-list" id="str-ex-list"></div>
          <div class="str-panel-foot">
            <span id="str-selected-count" style="font-size:11px;color:var(--text-3)">0 selected</span>
            <button class="btn" style="font-size:11px;padding:3px 10px" data-action="clear-all">Clear</button>
          </div>
        </div>

        <!-- ── Right panel: charts + analysis ── -->
        <div class="str-main">

          <!-- Selected exercise strip -->
          <div id="str-selected-strip" style="display:none">
            <div class="str-strip" id="str-strip-chips"></div>
          </div>

          <!-- Summary cards -->
          <div id="strength-summary" class="metric-row cols-4"></div>

          <!-- 1RM chart -->
          <div class="chart-card" id="str-chart-card" style="display:none">
            <div class="chart-header">
              <div>
                <div class="chart-title">Estimated 1RM over time</div>
                <div class="chart-subtitle">Epley: weight × (1 + reps ÷ 30) · best set per session</div>
              </div>
              <span class="tag tag-blue" id="rm-trend-tag">—</span>
            </div>
            <div id="rm-legend" class="chart-legend" style="margin-bottom:10px"></div>
            <div style="position:relative;width:100%;height:260px">
              <canvas id="rm-chart"></canvas>
            </div>
          </div>

          <!-- Overload table -->
          <div id="overload-section"></div>

          <!-- Per-exercise breakdown -->
          <div id="ex-breakdown"></div>

          <!-- Empty state -->
          <div id="str-empty" class="empty-state" style="display:none">
            <div class="empty-title">Select exercises on the left</div>
            <p>Choose up to 8 exercises to compare their strength trends.</p>
          </div>

        </div>
      </div>`;
  }

  // ── Exercise list (filtered) ───────────────────────────────────────────────
  function renderExerciseList() {
    const list = document.getElementById('str-ex-list');
    if (!list) return;

    const q = searchQuery.toLowerCase().trim();
    const filtered = allExercises.filter(e => {
      const matchCat = activeCategory === 'all' || e.category === activeCategory;
      const matchQ   = !q || e.name.toLowerCase().includes(q) || e.muscle_group.toLowerCase().includes(q);
      return matchCat && matchQ;
    });

    if (!filtered.length) {
      list.innerHTML = `<div class="muted text-sm" style="padding:12px 14px">No exercises match.</div>`;
      return;
    }

    list.innerHTML = filtered.map(e => {
      const checked = selectedIds.has(e.id);
      return `
        <label class="str-ex-row ${checked ? 'checked' : ''}" data-id="${e.id}">
          <input type="checkbox" ${checked ? 'checked' : ''} data-action="toggle-ex" data-id="${e.id}">
          <span class="str-ex-name">${e.name}</span>
          <span class="str-ex-muscle">${e.muscle_group}</span>
        </label>`;
    }).join('');
  }

  // ── Selected strip above chart ─────────────────────────────────────────────
  function renderSelectedStrip() {
    const strip   = document.getElementById('str-selected-strip');
    const chips   = document.getElementById('str-strip-chips');
    const counter = document.getElementById('str-selected-count');

    if (counter) counter.textContent = `${selectedIds.size} selected`;

    if (!strip || !chips) return;

    if (selectedIds.size === 0) {
      strip.style.display = 'none';
      return;
    }

    strip.style.display = 'block';
    chips.innerHTML = [...selectedIds].map((id, i) => {
      const ex = allExercises.find(e => e.id === id);
      if (!ex) return '';
      const color = COLORS[i % COLORS.length];
      return `
        <div class="str-strip-chip">
          <span class="str-strip-dot" style="background:${color}"></span>
          <span class="str-strip-label">${ex.name}</span>
          <button class="str-strip-remove" data-action="remove-selected" data-id="${id}">✕</button>
        </div>`;
    }).join('');
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  function bindEvents() {
    const container = document.getElementById('strength-content');
    if (!container) return;

    // Search input
    const searchEl = document.getElementById('str-search');
    if (searchEl) {
      searchEl.addEventListener('input', e => {
        searchQuery = e.target.value;
        renderExerciseList();
      });
    }

    container.addEventListener('click', async e => {
      // Category tab
      const tab = e.target.closest('.str-cat-tab');
      if (tab) {
        activeCategory = tab.dataset.cat;
        container.querySelectorAll('.str-cat-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderExerciseList();
        return;
      }

      // Clear all
      if (e.target.closest('[data-action="clear-all"]')) {
        selectedIds.clear();
        renderExerciseList();
        renderSelectedStrip();
        await refreshCharts();
        return;
      }

      // Remove from strip
      const removeBtn = e.target.closest('[data-action="remove-selected"]');
      if (removeBtn) {
        selectedIds.delete(parseInt(removeBtn.dataset.id));
        renderExerciseList();
        renderSelectedStrip();
        await refreshCharts();
        return;
      }
    });

    // Checkbox toggle (use change event for reliability)
    container.addEventListener('change', async e => {
      const cb = e.target.closest('[data-action="toggle-ex"]');
      if (!cb) return;
      const id = parseInt(cb.dataset.id);
      if (cb.checked) {
        if (selectedIds.size >= 8) {
          cb.checked = false;
          // Flash the count label
          const counter = document.getElementById('str-selected-count');
          if (counter) { counter.textContent = 'Max 8 exercises'; counter.style.color = 'var(--red)'; setTimeout(()=>{ counter.textContent = `${selectedIds.size} selected`; counter.style.color='var(--text-3)'; }, 2000); }
          return;
        }
        selectedIds.add(id);
      } else {
        selectedIds.delete(id);
      }
      // Update row highlight
      const row = container.querySelector(`.str-ex-row[data-id="${id}"]`);
      if (row) row.classList.toggle('checked', selectedIds.has(id));
      renderSelectedStrip();
      await refreshCharts();
    });
  }

  // ── Chart refresh ──────────────────────────────────────────────────────────
  async function refreshCharts() {
    if (rmChart) { rmChart.destroy(); rmChart = null; }

    document.getElementById('strength-summary').innerHTML = '';
    document.getElementById('overload-section').innerHTML = '';
    document.getElementById('ex-breakdown').innerHTML     = '';
    document.getElementById('rm-legend').innerHTML        = '';
    document.getElementById('rm-trend-tag').textContent   = '—';

    const chartCard = document.getElementById('str-chart-card');
    const emptyEl   = document.getElementById('str-empty');

    const ids = [...selectedIds];

    if (!ids.length) {
      if (chartCard) chartCard.style.display = 'none';
      if (emptyEl)   emptyEl.style.display   = 'block';
      return;
    }

    if (emptyEl)   emptyEl.style.display   = 'none';
    if (chartCard) chartCard.style.display = 'block';

    await loadRMData(ids);

    const activeIds = ids.filter(id => rmData[id] && rmData[id].length > 0);
    if (!activeIds.length) {
      if (chartCard) chartCard.style.display = 'none';
      document.getElementById('strength-summary').innerHTML =
        `<div style="grid-column:1/-1;padding:20px 0;font-size:12px;color:var(--text-3)">
          No session data yet for selected exercises. Log some workouts first.
        </div>`;
      return;
    }

    buildSummaryCards(activeIds);
    buildRMChart(activeIds);
    buildOverloadTable(activeIds);
    buildExBreakdown(activeIds);
  }

  // ── Summary cards ──────────────────────────────────────────────────────────
  function buildSummaryCards(ids) {
    const container = document.getElementById('strength-summary');
    let bestGainEx = null, bestGainVal = -Infinity, totalPRs = 0;

    for (const id of ids) {
      const pts = rmData[id];
      if (!pts || pts.length < 2) continue;
      const gain = pts[pts.length-1].rm - pts[0].rm;
      if (gain > bestGainVal) { bestGainVal = gain; bestGainEx = pts[0].name; }
      let best = pts[0].rm;
      for (let i=1; i<pts.length; i++) { if (pts[i].rm > best) { totalPRs++; best = pts[i].rm; } }
    }

    const firstId  = ids[0];
    const firstPts = rmData[firstId];
    const latestRM = firstPts ? Math.round(firstPts[firstPts.length-1].rm) : null;
    const firstName = firstPts ? firstPts[0].name : '';

    const rates = ids.filter(id=>rmData[id]&&rmData[id].length>=2).map(id=>weeklyGainRate(rmData[id]));
    const avgRate = rates.length ? rates.reduce((a,b)=>a+b,0)/rates.length : 0;

    container.innerHTML = `
      <div class="metric-card">
        <div class="metric-label">Latest 1RM · ${firstName.split(' ').slice(0,2).join(' ')}</div>
        <div class="metric-value">${latestRM ?? '—'}</div>
        <div class="metric-unit">lbs estimated</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">PRs logged</div>
        <div class="metric-value">${totalPRs}</div>
        <div class="metric-unit">across selected</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Best gainer</div>
        <div class="metric-value" style="font-size:16px;line-height:1.3">${bestGainEx ? bestGainEx.split(' ').slice(0,2).join(' ') : '—'}</div>
        <div class="metric-unit">${bestGainVal > 0 ? '+'+Math.round(bestGainVal)+' lbs 1RM' : 'not enough data'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Avg weekly gain</div>
        <div class="metric-value">${avgRate > 0 ? '+'+avgRate.toFixed(1) : avgRate.toFixed(1)}</div>
        <div class="metric-unit">lbs / week on 1RM</div>
        <div class="metric-delta ${avgRate>0?'delta-up':avgRate<0?'delta-down':'delta-neutral'}">
          ${avgRate>1.5?'Excellent':avgRate>0.5?'Steady':avgRate>0?'Slow — check volume':'No trend yet'}
        </div>
      </div>`;
  }

  // ── 1RM Chart ──────────────────────────────────────────────────────────────
  function buildRMChart(ids) {
    const canvas = document.getElementById('rm-chart');
    if (!canvas) return;

    const allDates = [...new Set(ids.flatMap(id=>(rmData[id]||[]).map(p=>p.date)))].sort();
    if (!allDates.length) return;

    const labels = allDates.map(d =>
      new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})
    );

    const datasets = ids.map((id,i) => {
      const pts = rmData[id]||[];
      const color = COLORS[i%COLORS.length];
      return {
        label: pts.length ? pts[0].name : String(id),
        data:  allDates.map(d => { const p=pts.find(p=>p.date===d); return p?p.rm:null; }),
        borderColor: color, backgroundColor:'transparent',
        tension:0.3, pointRadius:4, pointBackgroundColor:color,
        pointHoverRadius:6, spanGaps:true,
      };
    });

    rmChart = new Chart(canvas, {
      type:'line', data:{labels,datasets},
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y} lbs`}}
        },
        scales:{
          x:{grid:{display:false},ticks:{font:{size:11},color:'#9a9890',maxRotation:45,autoSkip:true,maxTicksLimit:12}},
          y:{grid:{color:'#f0ede6'},ticks:{font:{size:11},color:'#9a9890',callback:v=>v+' lb'}}
        }
      }
    });

    // Legend
    document.getElementById('rm-legend').innerHTML = ids.map((id,i)=>{
      const pts=rmData[id]||[];
      return `<span><span class="legend-swatch" style="background:${COLORS[i%COLORS.length]}"></span>${pts.length?pts[0].name:id}</span>`;
    }).join('');

    // Trend tag
    const slopes = ids.filter(id=>rmData[id]&&rmData[id].length>=2).map(id=>trendSlope(rmData[id]));
    if (slopes.length) {
      const avg = slopes.reduce((a,b)=>a+b,0)/slopes.length;
      const tag = document.getElementById('rm-trend-tag');
      if (avg>0.3)      { tag.textContent='Trending up';  tag.className='tag tag-green'; }
      else if (avg>0)   { tag.textContent='Slight gain';  tag.className='tag tag-blue'; }
      else              { tag.textContent='Flat';         tag.className='tag tag-amber'; }
    }
  }

  // ── Overload table ─────────────────────────────────────────────────────────
  function buildOverloadTable(ids) {
    const container = document.getElementById('overload-section');

    const rows = ids.map(id => {
      const pts = rmData[id]||[];
      if (!pts.length) return null;
      const name      = pts[0].name;
      const latest    = pts[pts.length-1];
      const prev      = pts.length>=2?pts[pts.length-2]:null;
      const allTime   = Math.max(...pts.map(p=>p.rm));
      const isPR      = latest.rm >= allTime;
      const rmDiff    = prev?Math.round((latest.rm-prev.rm)*10)/10:null;
      const slope     = trendSlope(pts);
      const plateau   = plateauDetect(pts);
      const gainRate  = weeklyGainRate(pts);
      const totalGain = pts.length>=2?Math.round((pts[pts.length-1].rm-pts[0].rm)*10)/10:null;

      const changeCell = rmDiff!==null
        ? `<span class="${rmDiff>0?'delta-up':rmDiff<0?'delta-down':'delta-neutral'}">${rmDiff>0?'+':''}${rmDiff} lbs</span>`
        : '<span class="muted">—</span>';

      const statusCell = plateau
        ? `<span class="tag tag-amber">Plateau</span>`
        : rmDiff>0 ? `<span class="tag tag-green">${isPR?'🏆 New PR':'Progressing'}</span>`
        : rmDiff<0 ? `<span class="tag tag-red">Regressed</span>`
        : `<span class="tag tag-blue">Holding</span>`;

      const tip = plateau
        ? 'Add a set, or drop 10% and hit top of rep range clean.'
        : rmDiff<0 ? 'Check sleep and nutrition — regression signals under-recovery.'
        : gainRate>1 ? `+${gainRate.toFixed(1)} lbs/wk — keep the same approach.`
        : 'Add small increments each session.';

      return `<tr>
        <td style="font-weight:500">${name}</td>
        <td style="font-family:var(--mono)">${Math.round(latest.rm)} lbs</td>
        <td style="font-family:var(--mono)">${changeCell}</td>
        <td style="font-family:var(--mono)">${Math.round(allTime)} lbs</td>
        <td style="font-family:var(--mono)">${totalGain!==null?(totalGain>0?'+':'')+totalGain+' lbs':'—'}</td>
        <td>${statusCell}</td>
        <td style="font-size:11px;color:var(--text-3)">${tip}</td>
      </tr>`;
    }).filter(Boolean).join('');

    container.innerHTML = `
      <div class="section-label">Progressive overload tracker</div>
      <div class="form-card" style="padding:0;overflow:hidden">
        <table class="set-table" style="width:100%">
          <thead><tr>
            <th>Exercise</th><th>Latest 1RM</th><th>vs prev</th>
            <th>All-time</th><th>Total gain</th><th>Status</th><th>Tip</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // ── Per-exercise breakdown ─────────────────────────────────────────────────
  function buildExBreakdown(ids) {
    const container = document.getElementById('ex-breakdown');
    container.innerHTML = `<div class="section-label">Exercise detail</div>`;

    ids.forEach((id,i) => {
      const pts = rmData[id]||[];
      if (!pts.length) return;

      const name     = pts[0].name;
      const color    = COLORS[i%COLORS.length];
      const latest   = pts[pts.length-1].rm;
      const first    = pts[0].rm;
      const allTime  = Math.max(...pts.map(p=>p.rm));
      const plateau  = plateauDetect(pts);
      const slope    = trendSlope(pts);
      const gainRate = weeklyGainRate(pts);

      const recent = pts.slice(-6);
      const histRows = recent.map((p,idx)=>{
        const prev = idx>0?recent[idx-1].rm:null;
        const diff = prev!==null?Math.round((p.rm-prev)*10)/10:null;
        const isPR = p.rm>=allTime && idx===recent.length-1;
        return `<tr>
          <td style="font-family:var(--mono);font-size:11px;color:var(--text-3)">
            ${new Date(p.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
          </td>
          <td style="font-family:var(--mono)">${Math.round(p.rm)} lbs ${isPR?'<span class="tag tag-green" style="font-size:9px;padding:1px 5px">PR</span>':''}</td>
          <td style="font-family:var(--mono);font-size:12px">
            ${diff!==null?`<span class="${diff>0?'delta-up':diff<0?'delta-down':'delta-neutral'}">${diff>0?'+':''}${diff}</span>`:'—'}
          </td>
        </tr>`;
      }).join('');

      const programStart = localStorage.getItem('ironlog_program_start');
      const weekNum = programStart ? Math.min(12,Math.floor((Date.now()-new Date(programStart))/(7*86400000))+1) : 1;
      const weeksLeft = Math.max(0,12-weekNum);
      const projected12 = gainRate>0?Math.round(latest+gainRate*weeksLeft):null;

      const guidanceItems = [];
      if (plateau) {
        guidanceItems.push({cls:'tag-amber',heading:'Break the plateau',text:'Add a 5th set at same weight, drop 10% and build back up, or take a deload session.'});
      } else if (gainRate>2) {
        guidanceItems.push({cls:'tag-green',heading:'Excellent rate',text:`+${gainRate.toFixed(1)} lbs/wk. Add 2.5 lbs every 1–2 sessions. Consistent small increments beat big jumps.`});
      } else if (gainRate>0.5) {
        guidanceItems.push({cls:'tag-green',heading:'Steady double progression',text:'Hit top of rep range on all sets → add 2.5 lbs. Miss reps → stay at same weight.'});
      } else {
        guidanceItems.push({cls:'tag-blue',heading:'Progression slow',text:'Add one rep to your last set each session. Once all sets hit top of range, add 2.5 lbs.'});
      }
      guidanceItems.push({cls:'tag-blue',heading:'Double progression rule',text:'Top of rep range on all sets → +2.5 lbs. Miss reps → hold weight. Simple and sustainable.'});

      const guidance = guidanceItems.map(item=>`
        <div style="margin-bottom:10px">
          <span class="tag ${item.cls}" style="font-size:10px;margin-bottom:4px;display:inline-block">${item.heading}</span>
          <p style="font-size:12px;color:var(--text-2);line-height:1.65;margin:4px 0 0">${item.text}</p>
        </div>`).join('');

      const card = document.createElement('div');
      card.className = 'form-card';
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
          <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>
          <span style="font-family:var(--mono);font-size:14px;font-weight:500">${name}</span>
          ${plateau?'<span class="tag tag-amber">Plateau detected</span>':''}
          ${slope>0.3?'<span class="tag tag-green">Strong progression</span>':''}
        </div>
        <div class="metric-row cols-4" style="margin-bottom:16px">
          <div class="metric-card">
            <div class="metric-label">Current est. 1RM</div>
            <div class="metric-value">${Math.round(latest)}</div>
            <div class="metric-unit">lbs</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">All-time best</div>
            <div class="metric-value">${Math.round(allTime)}</div>
            <div class="metric-unit">lbs</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Total gain</div>
            <div class="metric-value ${first<latest?'delta-up':first>latest?'delta-down':''}">${latest-first>=0?'+':''}${Math.round(latest-first)}</div>
            <div class="metric-unit">lbs since start</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Week 12 projection</div>
            <div class="metric-value">${projected12??'—'}</div>
            <div class="metric-unit">${projected12?'lbs at current rate':'not enough data'}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">
          <div>
            <div class="section-label">Last ${recent.length} sessions</div>
            <table class="set-table" style="width:100%">
              <thead><tr><th>Date</th><th>Est. 1RM</th><th>Change</th></tr></thead>
              <tbody>${histRows}</tbody>
            </table>
          </div>
          <div>
            <div class="section-label">Overload guidance</div>
            ${guidance}
          </div>
        </div>`;
      container.appendChild(card);
    });
  }

  Router.register('strength', render);
  return { render };
})();
