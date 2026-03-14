// IronLog · Strength Trends
// 1RM estimates (Epley), progressive overload tracking, and
// plateau detection — all local, no API.

const StrengthPage = (() => {

  // ── Chart instances ──────────────────────────────────────────────────────
  let rmChart       = null;
  let volumeChart   = null;
  let selectedIds   = new Set();
  let allExercises  = [];
  let rmData        = {};   // exerciseId → [{ date, rm, weight, reps }]
  let volData       = {};   // exerciseId → [{ date, volume }]

  const COLORS = [
    '#1a5c3a','#1a4a7a','#8a5a10','#a02020',
    '#2d7a50','#378ADD','#BA7517','#D85A30',
  ];

  // ── Math ─────────────────────────────────────────────────────────────────
  function epley(weight, reps) {
    return reps === 1 ? weight : weight * (1 + reps / 30);
  }

  function trendSlope(points) {
    // Simple linear regression over [index, value] pairs
    if (points.length < 2) return 0;
    const n  = points.length;
    const xs = points.map((_, i) => i);
    const ys = points.map(p => p.rm);
    const xm = xs.reduce((a, b) => a + b, 0) / n;
    const ym = ys.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((s, x, i) => s + (x - xm) * (ys[i] - ym), 0);
    const den = xs.reduce((s, x) => s + (x - xm) ** 2, 0);
    return den === 0 ? 0 : num / den;
  }

  function plateauDetect(points, windowSize = 3) {
    // Returns true if last `windowSize` sessions show < 2% improvement
    if (points.length < windowSize + 1) return false;
    const recent = points.slice(-windowSize);
    const first  = recent[0].rm;
    const last   = recent[recent.length - 1].rm;
    return first > 0 && Math.abs((last - first) / first) < 0.02;
  }

  function weeklyGainRate(points) {
    // Average gain per week based on first and last data points
    if (points.length < 2) return 0;
    const first    = points[0];
    const last     = points[points.length - 1];
    const daysDiff = (new Date(last.date) - new Date(first.date)) / 86400000;
    const weeks    = Math.max(1, daysDiff / 7);
    return (last.rm - first.rm) / weeks;
  }

  function overloadStatus(points) {
    // Compares last session to previous session for the same exercise
    if (points.length < 2) return null;
    const prev = points[points.length - 2];
    const curr = points[points.length - 1];
    const rmDiff  = curr.rm - prev.rm;
    const volDiff = curr.volume !== undefined ? curr.volume - prev.volume : null;
    return { rmDiff, volDiff, curr, prev };
  }

  // ── Data loading ──────────────────────────────────────────────────────────
  async function loadRMData(exerciseIds) {
    if (!exerciseIds.length) return;
    const rows = await window.api.dashboard.rmTrends(exerciseIds);

    // Group by exercise
    rmData = {};
    for (const r of rows) {
      if (!rmData[r.exercise_id]) rmData[r.exercise_id] = [];
      rmData[r.exercise_id].push({
        date: r.session_date,
        rm:   Math.round(epley(0, 0)),  // placeholder — we recompute below
        rawRM: parseFloat(r.estimated_1rm),
        name: r.name,
      });
    }

    // Re-key properly using estimated_1rm from DB (already Epley-computed)
    rmData = {};
    for (const r of rows) {
      if (!rmData[r.exercise_id]) rmData[r.exercise_id] = [];
      rmData[r.exercise_id].push({
        date: r.session_date,
        rm:   Math.round(parseFloat(r.estimated_1rm) * 10) / 10,
        name: r.name,
      });
    }

    // Also load per-session volume per exercise from sessions:get isn't ideal —
    // we pull it from the rm-trends query which is already grouped by session+exercise
    // Volume per session computed as sum(reps*weight) — need separate query.
    // For now we'll compute from the sets data fetched per-session via the existing API.
  }

  // ── Render ────────────────────────────────────────────────────────────────
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

    container.innerHTML = buildShell();
    populateExercisePicker();
    bindEvents();

    // Auto-select first 3 push exercises (most useful default)
    const pushExes = allExercises.filter(e => e.category === 'push').slice(0, 3);
    const defaults = pushExes.length ? pushExes : allExercises.slice(0, 3);
    defaults.forEach(e => {
      selectedIds.add(e.id);
      const chip = document.querySelector(`.ex-chip[data-id="${e.id}"]`);
      if (chip) chip.classList.add('selected');
    });

    await refreshCharts();
  }

  function buildShell() {
    return `
      <!-- Exercise picker -->
      <div class="form-card" style="padding:14px 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:11px;font-weight:500;letter-spacing:0.6px;text-transform:uppercase;color:var(--text-3)">
            Select exercises to compare
          </div>
          <button class="btn" style="font-size:11px;padding:4px 10px" data-action="clear-all">Clear all</button>
        </div>
        <div id="ex-chip-row" style="display:flex;flex-wrap:wrap;gap:6px"></div>
      </div>

      <!-- Summary stat cards -->
      <div id="strength-summary" class="metric-row cols-4"></div>

      <!-- 1RM chart -->
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <div class="chart-title">Estimated 1RM over time</div>
            <div class="chart-subtitle">Epley formula: weight × (1 + reps ÷ 30) · best set per session</div>
          </div>
          <span class="tag tag-blue" id="rm-trend-tag">—</span>
        </div>
        <div id="rm-legend" class="chart-legend" style="margin-bottom:10px"></div>
        <div style="position:relative;width:100%;height:260px">
          <canvas id="rm-chart"></canvas>
        </div>
      </div>

      <!-- Progressive overload table -->
      <div id="overload-section"></div>

      <!-- Per-exercise breakdown -->
      <div id="ex-breakdown"></div>
    `;
  }

  function populateExercisePicker() {
    const row = document.getElementById('ex-chip-row');
    // Group by category
    const grouped = {};
    allExercises.forEach(e => {
      if (!grouped[e.category]) grouped[e.category] = [];
      grouped[e.category].push(e);
    });

    let html = '';
    for (const [cat, exes] of Object.entries(grouped)) {
      exes.forEach(e => {
        html += `<div class="ex-chip" data-action="toggle-ex" data-id="${e.id}" data-cat="${cat}">${e.name}</div>`;
      });
    }
    row.innerHTML = html;
  }

  function bindEvents() {
    const container = document.getElementById('strength-content');
    if (!container) return;

    container.addEventListener('click', async e => {
      // Clear all button
      const clearBtn = e.target.closest('[data-action="clear-all"]');
      if (clearBtn) { clearAll(); return; }

      // Exercise chip toggle
      const chip = e.target.closest('[data-action="toggle-ex"]');
      if (chip) {
        await toggleExercise(parseInt(chip.dataset.id));
        return;
      }
    });
  }

  async function toggleExercise(id) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
      document.querySelector(`.ex-chip[data-id="${id}"]`)?.classList.remove('selected');
    } else {
      if (selectedIds.size >= 8) {
        alert('Select up to 8 exercises at a time.');
        return;
      }
      selectedIds.add(id);
      document.querySelector(`.ex-chip[data-id="${id}"]`)?.classList.add('selected');
    }
    await refreshCharts();
  }

  function clearAll() {
    selectedIds.clear();
    document.querySelectorAll('.ex-chip').forEach(c => c.classList.remove('selected'));
    refreshCharts();
  }

  // ── Chart refresh ─────────────────────────────────────────────────────────
  async function refreshCharts() {
    if (rmChart)     { rmChart.destroy();     rmChart     = null; }
    if (volumeChart) { volumeChart.destroy(); volumeChart = null; }

    document.getElementById('strength-summary').innerHTML   = '';
    document.getElementById('overload-section').innerHTML   = '';
    document.getElementById('ex-breakdown').innerHTML       = '';
    document.getElementById('rm-legend').innerHTML          = '';
    document.getElementById('rm-trend-tag').textContent     = '—';

    const ids = [...selectedIds];
    if (!ids.length) return;

    await loadRMData(ids);

    // Filter to exercises that actually have data
    const activeIds = ids.filter(id => rmData[id] && rmData[id].length > 0);
    if (!activeIds.length) {
      document.getElementById('strength-summary').innerHTML =
        `<div class="empty-state" style="grid-column:1/-1;padding:24px">
          <div class="empty-title">No data yet</div>
          <p>Log sessions with these exercises to see trends.</p>
        </div>`;
      return;
    }

    buildSummaryCards(activeIds);
    buildRMChart(activeIds);
    buildOverloadTable(activeIds);
    buildExBreakdown(activeIds);
  }

  // ── Summary cards ─────────────────────────────────────────────────────────
  function buildSummaryCards(ids) {
    const container = document.getElementById('strength-summary');

    // Overall best gainer
    let bestGainEx = null, bestGainVal = -Infinity;
    let totalPRs = 0;

    for (const id of ids) {
      const pts = rmData[id];
      if (!pts || pts.length < 2) continue;
      const gain = pts[pts.length - 1].rm - pts[0].rm;
      if (gain > bestGainVal) { bestGainVal = gain; bestGainEx = pts[0].name; }

      // Count PRs (each time rm exceeded previous best)
      let best = pts[0].rm;
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].rm > best) { totalPRs++; best = pts[i].rm; }
      }
    }

    // Most recent 1RM for first selected exercise
    const firstId  = ids[0];
    const firstPts = rmData[firstId];
    const latestRM = firstPts ? Math.round(firstPts[firstPts.length - 1].rm) : null;
    const firstName = firstPts ? firstPts[0].name : '';

    // Avg weekly gain rate across all exercises
    const rates = ids
      .filter(id => rmData[id] && rmData[id].length >= 2)
      .map(id => weeklyGainRate(rmData[id]));
    const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

    container.innerHTML = `
      <div class="metric-card">
        <div class="metric-label">Latest 1RM · ${firstName.split(' ').slice(0,2).join(' ')}</div>
        <div class="metric-value">${latestRM != null ? latestRM : '—'}</div>
        <div class="metric-unit">lbs estimated</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">PRs logged</div>
        <div class="metric-value">${totalPRs}</div>
        <div class="metric-unit">across selected exercises</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Best gainer</div>
        <div class="metric-value" style="font-size:16px;line-height:1.3">${bestGainEx ? bestGainEx.split(' ').slice(0,2).join(' ') : '—'}</div>
        <div class="metric-unit">${bestGainVal > 0 ? '+' + Math.round(bestGainVal) + ' lbs 1RM' : 'not enough data'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Avg weekly gain</div>
        <div class="metric-value">${avgRate > 0 ? '+' + avgRate.toFixed(1) : avgRate.toFixed(1)}</div>
        <div class="metric-unit">lbs / week on 1RM</div>
        <div class="metric-delta ${avgRate > 0 ? 'delta-up' : avgRate < 0 ? 'delta-down' : 'delta-neutral'}">
          ${avgRate > 1.5 ? 'Excellent progression' : avgRate > 0.5 ? 'Steady progress' : avgRate > 0 ? 'Slow — check volume' : 'No trend yet'}
        </div>
      </div>`;
  }

  // ── 1RM Chart ──────────────────────────────────────────────────────────────
  function buildRMChart(ids) {
    const canvas = document.getElementById('rm-chart');
    if (!canvas) return;

    // Collect all unique dates across exercises
    const allDates = [...new Set(
      ids.flatMap(id => (rmData[id] || []).map(p => p.date))
    )].sort();

    if (!allDates.length) return;

    const labels = allDates.map(d =>
      new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    );

    const datasets = ids.map((id, i) => {
      const pts   = rmData[id] || [];
      const color = COLORS[i % COLORS.length];
      const name  = pts.length ? pts[0].name : String(id);

      // Map each date to its rm value (null if no session that day)
      const data = allDates.map(date => {
        const pt = pts.find(p => p.date === date);
        return pt ? pt.rm : null;
      });

      return {
        label: name,
        data,
        borderColor: color,
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: color,
        pointHoverRadius: 6,
        spanGaps: true,
      };
    });

    rmChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} lbs`,
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: '#9a9890', maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }
          },
          y: {
            grid: { color: '#f0ede6' },
            ticks: { font: { size: 11 }, color: '#9a9890', callback: v => v + ' lb' }
          }
        }
      }
    });

    // Legend
    const legend = document.getElementById('rm-legend');
    legend.innerHTML = ids.map((id, i) => {
      const pts  = rmData[id] || [];
      const name = pts.length ? pts[0].name : String(id);
      return `<span>
        <span class="legend-swatch" style="background:${COLORS[i % COLORS.length]}"></span>
        ${name}
      </span>`;
    }).join('');

    // Overall trend tag
    const allPoints = ids.flatMap(id => rmData[id] || []);
    if (allPoints.length >= 2) {
      const slopes = ids
        .filter(id => rmData[id] && rmData[id].length >= 2)
        .map(id => trendSlope(rmData[id]));
      const avgSlope = slopes.reduce((a, b) => a + b, 0) / (slopes.length || 1);
      const tag = document.getElementById('rm-trend-tag');
      if (avgSlope > 0.3) { tag.textContent = 'Trending up'; tag.className = 'tag tag-green'; }
      else if (avgSlope > 0) { tag.textContent = 'Slight gain'; tag.className = 'tag tag-blue'; }
      else { tag.textContent = 'Flat'; tag.className = 'tag tag-amber'; }
    }
  }

  // ── Progressive Overload Table ─────────────────────────────────────────────
  function buildOverloadTable(ids) {
    const container = document.getElementById('overload-section');

    const rows = ids.map(id => {
      const pts  = rmData[id] || [];
      if (!pts.length) return null;

      const name      = pts[0].name;
      const latest    = pts[pts.length - 1];
      const prev      = pts.length >= 2 ? pts[pts.length - 2] : null;
      const allTime   = Math.max(...pts.map(p => p.rm));
      const isPR      = latest.rm >= allTime;
      const rmDiff    = prev ? Math.round((latest.rm - prev.rm) * 10) / 10 : null;
      const slope     = trendSlope(pts);
      const plateau   = plateauDetect(pts);
      const gainRate  = weeklyGainRate(pts);
      const totalGain = pts.length >= 2
        ? Math.round((pts[pts.length - 1].rm - pts[0].rm) * 10) / 10
        : null;

      return { name, latest, prev, allTime, isPR, rmDiff, slope, plateau, gainRate, totalGain, sessionCount: pts.length };
    }).filter(Boolean);

    if (!rows.length) return;

    const tableRows = rows.map(r => {
      const changeCell = r.rmDiff !== null
        ? `<span class="${r.rmDiff > 0 ? 'delta-up' : r.rmDiff < 0 ? 'delta-down' : 'delta-neutral'}">
            ${r.rmDiff > 0 ? '+' : ''}${r.rmDiff} lbs
           </span>`
        : '<span class="muted">—</span>';

      const statusCell = r.plateau
        ? `<span class="tag tag-amber">Plateau</span>`
        : r.rmDiff > 0
          ? `<span class="tag tag-green">${r.isPR ? '🏆 New PR' : 'Progressing'}</span>`
          : r.rmDiff < 0
            ? `<span class="tag tag-red">Regressed</span>`
            : `<span class="tag tag-blue">Holding</span>`;

      const overloadTip = r.plateau
        ? `Add 1 rep to each set, or increase weight by 2.5 lbs next session.`
        : r.rmDiff < 0
          ? `Check sleep and nutrition — regression often signals under-recovery.`
          : r.gainRate > 1
            ? `Strong weekly gain of +${r.gainRate.toFixed(1)} lbs/wk. Keep the same approach.`
            : `Steady. Continue adding small increments each session.`;

      return `
        <tr>
          <td style="font-weight:500">${r.name}</td>
          <td style="font-family:var(--mono)">${Math.round(r.latest.rm)} lbs</td>
          <td style="font-family:var(--mono)">${changeCell}</td>
          <td style="font-family:var(--mono)">${Math.round(r.allTime)} lbs</td>
          <td style="font-family:var(--mono)">${r.totalGain !== null ? (r.totalGain > 0 ? '+' : '') + r.totalGain + ' lbs' : '—'}</td>
          <td>${statusCell}</td>
          <td style="font-size:11px;color:var(--text-3);max-width:200px">${overloadTip}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="section-label">Progressive overload tracker</div>
      <div class="form-card" style="padding:0;overflow:hidden">
        <table class="set-table" style="width:100%">
          <thead>
            <tr>
              <th>Exercise</th>
              <th>Latest 1RM</th>
              <th>vs prev session</th>
              <th>All-time best</th>
              <th>Total gain</th>
              <th>Status</th>
              <th>Tip</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`;
  }

  // ── Per-exercise breakdown cards ───────────────────────────────────────────
  function buildExBreakdown(ids) {
    const container = document.getElementById('ex-breakdown');
    container.innerHTML = `<div class="section-label">Exercise detail</div>`;

    ids.forEach((id, i) => {
      const pts = rmData[id] || [];
      if (!pts.length) return;

      const name      = pts[0].name;
      const color     = COLORS[i % COLORS.length];
      const latest    = pts[pts.length - 1].rm;
      const first     = pts[0].rm;
      const allTime   = Math.max(...pts.map(p => p.rm));
      const plateau   = plateauDetect(pts);
      const slope     = trendSlope(pts);
      const gainRate  = weeklyGainRate(pts);

      // Mini history table — last 6 sessions
      const recent = pts.slice(-6);
      const histRows = recent.map((p, idx) => {
        const prev    = idx > 0 ? recent[idx - 1].rm : null;
        const diff    = prev !== null ? Math.round((p.rm - prev) * 10) / 10 : null;
        const isPR    = p.rm >= allTime && idx === recent.length - 1;
        return `<tr>
          <td style="font-family:var(--mono);font-size:11px;color:var(--text-3)">
            ${new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </td>
          <td style="font-family:var(--mono)">${Math.round(p.rm)} lbs ${isPR ? '<span class="tag tag-green" style="font-size:9px;padding:1px 5px">PR</span>' : ''}</td>
          <td style="font-family:var(--mono);font-size:12px">
            ${diff !== null
              ? `<span class="${diff > 0 ? 'delta-up' : diff < 0 ? 'delta-down' : 'delta-neutral'}">${diff > 0 ? '+' : ''}${diff}</span>`
              : '—'}
          </td>
        </tr>`;
      }).join('');

      // Projection: extrapolate at current rate to 12 weeks
      const programStart = localStorage.getItem('ironlog_program_start');
      const weekNum = programStart
        ? Math.min(12, Math.floor((Date.now() - new Date(programStart)) / (7 * 86400000)) + 1) : 1;
      const weeksLeft = Math.max(0, 12 - weekNum);
      const projected12 = gainRate > 0 ? Math.round(latest + gainRate * weeksLeft) : null;

      const card = document.createElement('div');
      card.className = 'form-card';
      card.style.marginBottom = '0';
      card.innerHTML = `
        <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:14px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>
            <span style="font-family:var(--mono);font-size:14px;font-weight:500">${name}</span>
          </div>
          ${plateau ? `<span class="tag tag-amber">Plateau detected</span>` : ''}
          ${slope > 0.3 ? `<span class="tag tag-green">Strong progression</span>` : ''}
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
            <div class="metric-value ${first < latest ? 'delta-up' : first > latest ? 'delta-down' : ''}">${latest - first >= 0 ? '+' : ''}${Math.round(latest - first)}</div>
            <div class="metric-unit">lbs since start</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Week 12 projection</div>
            <div class="metric-value">${projected12 ? projected12 : '—'}</div>
            <div class="metric-unit">${projected12 ? 'lbs at current rate' : 'not enough data'}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">
          <div>
            <div style="font-size:10px;font-weight:500;letter-spacing:0.6px;text-transform:uppercase;color:var(--text-3);margin-bottom:8px">
              Last ${recent.length} sessions
            </div>
            <table class="set-table" style="width:100%">
              <thead><tr><th>Date</th><th>Est. 1RM</th><th>Change</th></tr></thead>
              <tbody>${histRows}</tbody>
            </table>
          </div>
          <div>
            <div style="font-size:10px;font-weight:500;letter-spacing:0.6px;text-transform:uppercase;color:var(--text-3);margin-bottom:8px">
              Progressive overload guidance
            </div>
            ${buildOverloadGuidance(pts, plateau, gainRate)}
          </div>
        </div>`;

      container.appendChild(card);
    });
  }

  // ── Overload guidance block ────────────────────────────────────────────────
  function buildOverloadGuidance(pts, plateau, gainRate) {
    const latest = pts[pts.length - 1];

    // Double progression targets
    // Suggest hitting top of rep range before adding weight
    const suggestedWeightIncrease = 2.5;
    const items = [];

    if (plateau) {
      items.push({
        heading: 'Break the plateau',
        text: 'You\'ve stalled. Try one of: (1) Add a 5th set at the same weight. (2) Drop weight 10% and focus on hitting the top of your rep range clean. (3) Take one deload session at 60% load.',
        cls: 'tag-amber'
      });
    } else if (gainRate > 2) {
      items.push({
        heading: 'Excellent rate — protect it',
        text: `Gaining ~${gainRate.toFixed(1)} lbs/wk on 1RM. At this rate, add ${suggestedWeightIncrease} lbs every 1–2 sessions. Don't jump weight too fast — consistent small increments beat occasional big jumps.`,
        cls: 'tag-green'
      });
    } else if (gainRate > 0.5) {
      items.push({
        heading: 'Steady double progression',
        text: `When you hit the top of your rep range on all sets, add ${suggestedWeightIncrease} lbs next session. If reps drop too far, stay at the same weight until you can hit all sets cleanly again.`,
        cls: 'tag-green'
      });
    } else {
      items.push({
        heading: 'Progression is slow',
        text: `Add one rep to your last set each session instead of adding weight. Once all sets are at the top of the range, increase by ${suggestedWeightIncrease} lbs. Also check: protein intake, sleep, and total session volume.`,
        cls: 'tag-blue'
      });
    }

    // Rep range double progression guide
    items.push({
      heading: 'Double progression rule',
      text: 'Hit all reps at the top of your range across all sets → add 2.5 lbs next session. Miss reps → stay at same weight. Simple, sustainable, evidence-based.',
      cls: 'tag-blue'
    });

    return items.map(item => `
      <div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span class="tag ${item.cls}" style="font-size:10px">${item.heading}</span>
        </div>
        <p style="font-size:12px;color:var(--text-2);line-height:1.65;margin:0">${item.text}</p>
      </div>`).join('');
  }

  Router.register('strength', render);

  return { render, toggleExercise, clearAll };
})();
