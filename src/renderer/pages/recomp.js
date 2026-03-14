// IronLog · Recomp Tracker
// Overlays bodyweight, waist measurement, and weekly training volume
// on a unified chart. Answers: "is this actually working?"

const RecompPage = (() => {

  let chartMain   = null;
  let chartSignal = null;

  // ── Math helpers ─────────────────────────────────────────────────────────
  function linearRegression(ys) {
    const n  = ys.length;
    if (n < 2) return { slope: 0, intercept: ys[0] || 0 };
    const xs = ys.map((_, i) => i);
    const xm = xs.reduce((a, b) => a + b, 0) / n;
    const ym = ys.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((s, x, i) => s + (x - xm) * (ys[i] - ym), 0);
    const den = xs.reduce((s, x)    => s + (x - xm) ** 2, 0);
    const slope = den === 0 ? 0 : num / den;
    return { slope, intercept: ym - slope * xm };
  }

  function trendLine(ys) {
    const { slope, intercept } = linearRegression(ys);
    return ys.map((_, i) => Math.round((slope * i + intercept) * 10) / 10);
  }

  function movingAvg(arr, window = 3) {
    return arr.map((_, i) => {
      const slice = arr.slice(Math.max(0, i - window + 1), i + 1).filter(v => v != null);
      return slice.length ? Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10 : null;
    });
  }

  // ── Recomp signal score ───────────────────────────────────────────────────
  // Combines weight trend, waist trend, and volume trend into a 0–100 score.
  function recompScore(weightPts, waistPts, volPts) {
    let score = 50;  // neutral start
    let signals = [];

    // Weight trend — going down is good for recomp
    if (weightPts.length >= 3) {
      const { slope } = linearRegression(weightPts.map(p => p.weight_lbs));
      if (slope < -0.1)      { score += 15; signals.push({ text: 'Weight trending down', positive: true }); }
      else if (slope > 0.2)  { score -= 10; signals.push({ text: 'Weight trending up', positive: false }); }
      else                   { signals.push({ text: 'Weight stable', positive: null }); }
    }

    // Waist trend — going down is good
    if (waistPts.length >= 2) {
      const { slope } = linearRegression(waistPts.map(p => p.waist_in));
      if (slope < -0.05)     { score += 20; signals.push({ text: 'Waist shrinking', positive: true }); }
      else if (slope > 0.1)  { score -= 15; signals.push({ text: 'Waist growing', positive: false }); }
      else                   { signals.push({ text: 'Waist holding steady', positive: null }); }
    }

    // Volume trend — going up is good
    if (volPts.length >= 3) {
      const vols = volPts.map(p => p.volume);
      const { slope } = linearRegression(vols);
      if (slope > 200)       { score += 15; signals.push({ text: 'Volume increasing', positive: true }); }
      else if (slope < -500) { score -= 10; signals.push({ text: 'Volume dropping', positive: false }); }
      else                   { signals.push({ text: 'Volume consistent', positive: null }); }
    }

    // Divergence bonus: weight down + waist down = recomp confirmed
    if (weightPts.length >= 3 && waistPts.length >= 2) {
      const wSlope    = linearRegression(weightPts.map(p => p.weight_lbs)).slope;
      const waistSlope = linearRegression(waistPts.map(p => p.waist_in)).slope;
      if (wSlope <= 0 && waistSlope < 0) {
        score += 10;
        signals.push({ text: 'Classic recomp pattern', positive: true });
      }
    }

    return { score: Math.min(100, Math.max(0, Math.round(score))), signals };
  }

  // ── Build weekly volume series ────────────────────────────────────────────
  function weeklyVolume(sessions) {
    // Group sessions by ISO week
    const byWeek = {};
    for (const s of sessions) {
      const d    = new Date(s.session_date + 'T00:00:00');
      const year = d.getFullYear();
      const week = getISOWeek(d);
      const key  = `${year}-W${String(week).padStart(2,'0')}`;
      if (!byWeek[key]) byWeek[key] = { week: key, volume: 0, date: s.session_date };
      byWeek[key].volume += s.total_volume_lbs || 0;
    }
    return Object.values(byWeek).sort((a, b) => a.week.localeCompare(b.week));
  }

  function getISOWeek(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  async function render() {
    const container = document.getElementById('recomp-content');
    container.innerHTML = `<div class="empty-state"><div class="empty-title">Loading…</div></div>`;

    if (chartMain)   { chartMain.destroy();   chartMain   = null; }
    if (chartSignal) { chartSignal.destroy(); chartSignal = null; }

    const [metrics, sessions, activity] = await Promise.all([
      window.api.metrics.list(90),
      window.api.sessions.list(100),
      window.api.activity.list(60),
    ]);

    const weightPts = metrics.filter(m => m.weight_lbs != null).reverse();
    const waistPts  = metrics.filter(m => m.waist_in   != null).reverse();
    const hasData   = weightPts.length > 0 || sessions.length > 0;

    if (!hasData) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">No data yet</div>
          <p>Log body measurements and some workouts to see your recomp progress here.</p>
          <br>
          <div style="display:flex;gap:10px;justify-content:center">
            <button class="btn primary" data-nav="measurements">Log Measurements</button>
            <button class="btn" data-nav="log">Log Workout</button>
          </div>
        </div>`;
      return;
    }

    const weeklyVol    = weeklyVolume(sessions);
    const { score, signals } = recompScore(weightPts, waistPts, weeklyVol);

    // Summary deltas
    const firstWeight  = weightPts.length ? weightPts[0].weight_lbs : null;
    const lastWeight   = weightPts.length ? weightPts[weightPts.length - 1].weight_lbs : null;
    const weightChange = firstWeight && lastWeight ? Math.round((lastWeight - firstWeight) * 10) / 10 : null;

    const firstWaist   = waistPts.length ? waistPts[0].waist_in : null;
    const lastWaist    = waistPts.length ? waistPts[waistPts.length - 1].waist_in : null;
    const waistChange  = firstWaist && lastWaist ? Math.round((lastWaist - firstWaist) * 10) / 10 : null;

    const totalVol     = weeklyVol.reduce((s, w) => s + w.volume, 0);
    const avgWeekVol   = weeklyVol.length ? Math.round(totalVol / weeklyVol.length) : 0;

    const programStart = localStorage.getItem('ironlog_program_start');
    const weekNum = programStart
      ? Math.min(12, Math.floor((Date.now() - new Date(programStart)) / (7 * 86400000)) + 1) : null;

    // ── Score interpretation ──────────────────────────────────────────────
    let scoreLabel, scoreClass, scoreText;
    if (score >= 75) {
      scoreLabel = 'Strong recomp signal';
      scoreClass = 'delta-up';
      scoreText  = 'Your data shows the classic recomp pattern — fat coming off while training volume holds or grows. Keep doing exactly what you\'re doing.';
    } else if (score >= 55) {
      scoreLabel = 'Recomp in progress';
      scoreClass = 'delta-up';
      scoreText  = 'Positive indicators across your data. The trend is moving in the right direction. Stay consistent and log measurements regularly so the picture gets clearer.';
    } else if (score >= 40) {
      scoreLabel = 'Early or unclear';
      scoreClass = 'delta-neutral';
      scoreText  = 'Not enough data yet, or signals are mixed. Keep logging daily weight and weekly measurements. Recomp trends typically become visible after 3–4 weeks.';
    } else {
      scoreLabel = 'Check your inputs';
      scoreClass = 'delta-down';
      scoreText  = 'Weight or measurements trending the wrong way. Check nutrition — calories and protein are usually the culprit. Volume dropping could also signal under-recovery.';
    }

    // ── HTML ──────────────────────────────────────────────────────────────
    let html = '';

    // KPI row
    html += `
      <div>
        <div class="section-label">Progress since start${weekNum ? ' · week ' + weekNum + ' of 12' : ''}</div>
        <div class="metric-row cols-4">
          <div class="metric-card">
            <div class="metric-label">Recomp score</div>
            <div class="metric-value">${score}</div>
            <div class="metric-unit">out of 100</div>
            <div class="metric-delta ${scoreClass}">${scoreLabel}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Weight change</div>
            <div class="metric-value">${weightChange !== null ? (weightChange > 0 ? '+' : '') + weightChange : '—'}</div>
            <div class="metric-unit">lbs since first log</div>
            <div class="metric-delta ${weightChange !== null ? (weightChange < 0 ? 'delta-up' : weightChange > 0 ? 'delta-down' : 'delta-neutral') : ''}">
              ${weightChange !== null ? (weightChange < 0 ? 'Fat loss signal' : weightChange > 0 ? 'Gaining' : 'Holding') : 'No data'}
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Waist change</div>
            <div class="metric-value">${waistChange !== null ? (waistChange > 0 ? '+' : '') + waistChange : '—'}</div>
            <div class="metric-unit">inches since first log</div>
            <div class="metric-delta ${waistChange !== null ? (waistChange < 0 ? 'delta-up' : waistChange > 0 ? 'delta-down' : 'delta-neutral') : ''}">
              ${waistChange !== null ? (waistChange < 0 ? 'Shrinking' : waistChange > 0 ? 'Growing' : 'No change') : 'No data'}
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Avg weekly volume</div>
            <div class="metric-value">${avgWeekVol > 0 ? Math.round(avgWeekVol / 1000 * 10) / 10 + 'k' : '—'}</div>
            <div class="metric-unit">lbs lifted per week</div>
            <div class="metric-delta ${avgWeekVol >= 7000 ? 'delta-up' : avgWeekVol >= 5000 ? 'delta-neutral' : 'delta-down'}">
              ${avgWeekVol >= 7000 ? 'Growth range' : avgWeekVol >= 5000 ? 'Slow growth' : avgWeekVol > 0 ? 'Below target' : 'No sessions'}
            </div>
          </div>
        </div>
      </div>`;

    // Main overlay chart
    html += `
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <div class="chart-title">Recomp overlay</div>
            <div class="chart-subtitle">Bodyweight · waist · weekly training volume</div>
          </div>
        </div>
        <div class="chart-legend">
          <span><span class="legend-swatch" style="background:#1a5c3a"></span>Bodyweight (lbs, left axis)</span>
          ${waistPts.length ? `<span><span class="legend-swatch" style="background:#1a4a7a"></span>Waist (inches, left axis)</span>` : ''}
          ${weeklyVol.length ? `<span><span class="legend-swatch" style="background:#e2e0d8;border:1px solid #ccc"></span>Weekly volume (lbs ÷ 100, right axis)</span>` : ''}
          ${weightPts.length >= 3 ? `<span><span class="legend-swatch" style="background:#9FE1CB"></span>Weight trend line</span>` : ''}
        </div>
        <div style="position:relative;width:100%;height:300px">
          <canvas id="recomp-main-chart"></canvas>
        </div>
      </div>`;

    // Signal breakdown
    html += `
      <div class="chart-grid cols-2">
        <div class="chart-card">
          <div class="chart-header">
            <div>
              <div class="chart-title">Signal breakdown</div>
              <div class="chart-subtitle">What your data is telling you</div>
            </div>
          </div>
          <div class="recomp-signals">
            ${signals.map(s => `
              <div class="recomp-signal-row">
                <span class="signal-dot ${s.positive === true ? 'dot-green' : s.positive === false ? 'dot-red' : 'dot-gray'}"></span>
                <span class="signal-text">${s.text}</span>
              </div>`).join('')}
            ${!signals.length ? '<p class="muted text-sm">Log more data to see signals.</p>' : ''}
          </div>
          <div class="recomp-score-bar">
            <div class="score-fill" style="width:${score}%;background:${score >= 60 ? '#1a5c3a' : score >= 40 ? '#8a5a10' : '#a02020'}"></div>
          </div>
          <p class="narrative-text" style="margin-top:10px">${scoreText}</p>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div>
              <div class="chart-title">Weekly training volume</div>
              <div class="chart-subtitle">Total lbs lifted per week</div>
            </div>
          </div>
          <div style="position:relative;width:100%;height:200px">
            <canvas id="recomp-vol-chart"></canvas>
          </div>
        </div>
      </div>`;

    // Interpretation guide
    html += `
      <div class="chart-card">
        <div class="chart-header">
          <div class="chart-title">How to read this chart</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
          <div>
            <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-3);margin-bottom:6px">Recomp is working when</div>
            <div class="recomp-signal-row"><span class="signal-dot dot-green"></span><span class="signal-text">Weight flat or slowly decreasing</span></div>
            <div class="recomp-signal-row"><span class="signal-dot dot-green"></span><span class="signal-text">Waist measurement decreasing</span></div>
            <div class="recomp-signal-row"><span class="signal-dot dot-green"></span><span class="signal-text">Training volume holding or growing</span></div>
            <div class="recomp-signal-row"><span class="signal-dot dot-green"></span><span class="signal-text">Strength trending upward</span></div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-3);margin-bottom:6px">Warning signs</div>
            <div class="recomp-signal-row"><span class="signal-dot dot-red"></span><span class="signal-text">Weight falling fast (&gt; 1.5 lbs/wk)</span></div>
            <div class="recomp-signal-row"><span class="signal-dot dot-red"></span><span class="signal-text">Volume dropping week over week</span></div>
            <div class="recomp-signal-row"><span class="signal-dot dot-red"></span><span class="signal-text">Strength stalling or regressing</span></div>
            <div class="recomp-signal-row"><span class="signal-dot dot-red"></span><span class="signal-text">Waist not moving after 4+ weeks</span></div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-3);margin-bottom:6px">Your targets</div>
            <div class="recomp-signal-row"><span class="signal-dot dot-gray"></span><span class="signal-text">Weight: −0.5 to −1 lb/wk max</span></div>
            <div class="recomp-signal-row"><span class="signal-dot dot-gray"></span><span class="signal-text">Waist: −0.25 to −0.5 in/wk</span></div>
            <div class="recomp-signal-row"><span class="signal-dot dot-gray"></span><span class="signal-text">Volume: 7k–12k lbs/session</span></div>
            <div class="recomp-signal-row"><span class="signal-dot dot-gray"></span><span class="signal-text">Protein: ~0.9g per lb bodyweight</span></div>
          </div>
        </div>
      </div>`;

    container.innerHTML = html;

    // Build charts
    buildMainChart(weightPts, waistPts, weeklyVol);
    buildVolChart(weeklyVol);
  }

  // ── Main overlay chart ────────────────────────────────────────────────────
  function buildMainChart(weightPts, waistPts, weeklyVol) {
    const canvas = document.getElementById('recomp-main-chart');
    if (!canvas) return;

    // Unified date axis — all unique dates from weight + waist logs
    const allDates = [...new Set([
      ...weightPts.map(p => p.log_date),
      ...waistPts.map(p => p.log_date),
    ])].sort();

    if (!allDates.length) return;

    const labels = allDates.map(d =>
      new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    );

    const weightData = allDates.map(d => {
      const pt = weightPts.find(p => p.log_date === d);
      return pt ? pt.weight_lbs : null;
    });

    const waistData = allDates.map(d => {
      const pt = waistPts.find(p => p.log_date === d);
      return pt ? pt.waist_in : null;
    });

    // Weight trend line
    const validWeights = weightData.filter(v => v != null);
    const weightTrend  = validWeights.length >= 3 ? trendLine(weightData.map(v => v || 0)) : null;

    // Weekly volume scaled to same axis (÷100 to fit near body weight scale)
    const volByDate = {};
    for (const w of weeklyVol) volByDate[w.date] = w.volume;
    const volData = allDates.map(d => {
      const v = volByDate[d];
      return v ? Math.round(v / 100) : null;
    });

    const datasets = [];

    if (weightData.some(v => v != null)) {
      datasets.push({
        label: 'Bodyweight',
        data: weightData,
        borderColor: '#1a5c3a',
        backgroundColor: 'rgba(26,92,58,0.06)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: '#1a5c3a',
        spanGaps: true,
        yAxisID: 'yLeft',
      });
    }

    if (weightTrend) {
      datasets.push({
        label: 'Weight trend',
        data: weightTrend,
        borderColor: '#9FE1CB',
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
        spanGaps: true,
        yAxisID: 'yLeft',
      });
    }

    if (waistData.some(v => v != null)) {
      datasets.push({
        label: 'Waist',
        data: waistData,
        borderColor: '#1a4a7a',
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#1a4a7a',
        spanGaps: true,
        yAxisID: 'yLeft',
      });
    }

    if (volData.some(v => v != null)) {
      datasets.push({
        label: 'Weekly volume ÷100',
        data: volData,
        borderColor: '#c8c5bb',
        backgroundColor: 'rgba(200,197,187,0.15)',
        fill: true,
        tension: 0.2,
        pointRadius: 2,
        borderWidth: 1,
        spanGaps: true,
        yAxisID: 'yRight',
        type: 'bar',
        borderRadius: 2,
      });
    }

    // Y axis range based on weight values
    const wMin = validWeights.length ? Math.floor(Math.min(...validWeights)) - 3 : 150;
    const wMax = validWeights.length ? Math.ceil(Math.max(...validWeights))  + 3 : 220;

    chartMain = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const v = ctx.parsed.y;
                if (ctx.dataset.label === 'Weekly volume ÷100') return ` Volume: ${(v * 100).toLocaleString()} lbs`;
                if (ctx.dataset.label === 'Waist') return ` Waist: ${v}"`;
                if (ctx.dataset.label === 'Weight trend') return null;
                return ` Weight: ${v} lbs`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: '#9a9890', maxRotation: 45, autoSkip: true, maxTicksLimit: 14 }
          },
          yLeft: {
            position: 'left',
            min: wMin,
            max: wMax,
            grid: { color: '#f0ede6' },
            ticks: { font: { size: 11 }, color: '#9a9890', callback: v => v }
          },
          yRight: {
            position: 'right',
            grid: { display: false },
            ticks: { font: { size: 11 }, color: '#c8c5bb', callback: v => (v * 100 / 1000).toFixed(0) + 'k' }
          }
        }
      }
    });
  }

  // ── Weekly volume bar chart ────────────────────────────────────────────────
  function buildVolChart(weeklyVol) {
    const canvas = document.getElementById('recomp-vol-chart');
    if (!canvas || !weeklyVol.length) return;

    const labels = weeklyVol.map(w => w.week.replace('-W', ' W'));
    const data   = weeklyVol.map(w => Math.round(w.volume));
    const colors = data.map(v => v >= 7000 && v <= 12000 ? '#1a5c3a' : v >= 5000 ? '#2d7a50' : '#c8c5bb');

    chartSignal = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Weekly volume',
            data,
            backgroundColor: colors,
            borderRadius: 3,
          },
          {
            label: 'Target floor',
            data: data.map(() => 7000),
            type: 'line',
            borderColor: '#c8c5bb',
            borderWidth: 1,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9a9890', maxRotation: 45 } },
          y: {
            grid: { color: '#f0ede6' },
            min: 0,
            ticks: { font: { size: 11 }, color: '#9a9890', callback: v => (v / 1000).toFixed(0) + 'k' }
          }
        }
      }
    });
  }

  Router.register('recomp', render);
  return { render };
})();
