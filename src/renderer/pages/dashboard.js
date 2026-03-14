// IronLog · Dashboard Page

const Dashboard = (() => {

  // Chart instances — destroyed and rebuilt on each visit
  let charts = {};

  function destroyCharts() {
    Object.values(charts).forEach(c => c && c.destroy());
    charts = {};
  }

  // ── Volume zone context ──────────────────────────────────────────
  function volumeTag(vol) {
    if (vol < 5000)  return { label: 'Maintenance zone', cls: 'tag-amber' };
    if (vol < 7000)  return { label: 'Slow growth',      cls: 'tag-blue'  };
    if (vol <= 12000) return { label: 'Ideal growth',    cls: 'tag-green' };
    return { label: 'Recovery risk', cls: 'tag-red' };
  }

  // ── Drop-off zone context ────────────────────────────────────────
  function dropoffTag(pct) {
    if (pct < 30)  return { label: 'Not training hard enough', cls: 'tag-amber' };
    if (pct <= 60) return { label: 'Hypertrophy zone',         cls: 'tag-green' };
    return { label: 'Poor recovery / too heavy', cls: 'tag-red' };
  }

  // ── Render helpers ───────────────────────────────────────────────
  function fmt(n, unit = '') {
    if (n == null) return '—';
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 }) + (unit ? ' ' + unit : '');
  }

  function metricCard(label, value, unit, deltaHtml = '') {
    return `
      <div class="metric-card">
        <div class="metric-label">${label}</div>
        <div class="metric-value">${value}</div>
        ${unit  ? `<div class="metric-unit">${unit}</div>` : ''}
        ${deltaHtml ? `<div class="metric-delta">${deltaHtml}</div>` : ''}
      </div>`;
  }

  // ── Chart color palette ──────────────────────────────────────────
  const C = {
    green:      '#1a5c3a',
    greenMid:   '#2d7a50',
    greenLight: '#9FE1CB',
    blue:       '#1a4a7a',
    blue2:      '#378ADD',
    blue3:      '#85B7EB',
    gray:       '#c8c5bb',
    grayLight:  '#e8e6de',
    amber:      '#8a5a10',
    red:        '#a02020',
  };

  const BASE_OPTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  };

  function axisStyle(extra = {}) {
    return {
      grid: { color: '#f0ede6' },
      ticks: { font: { size: 11 }, color: '#9a9890' },
      ...extra
    };
  }

  // ── Main render ──────────────────────────────────────────────────
  async function render() {
    destroyCharts();
    const container = document.getElementById('dashboard-content');

    const data = await window.api.dashboard.summary();
    const { weekVol, recentWeight, recentActivity, recentNutrition, lastSession, sessionCount } = data;

    // ── Week number from first session date ──
    // Uses program start stored in localStorage (set when first session saved)
    const programStart = localStorage.getItem('ironlog_program_start');
    let weekNum = '—';
    if (programStart) {
      const days = Math.floor((Date.now() - new Date(programStart)) / 86400000);
      weekNum = Math.min(12, Math.floor(days / 7) + 1);
      document.getElementById('weekNumber').textContent = weekNum;
    }

    // ── Top-level KPIs ───────────────────────
    const thisWeekVol = weekVol
      .filter(r => {
        const d = new Date(r.session_date);
        const now = new Date();
        const weekAgo = new Date(now - 7 * 86400000);
        return d >= weekAgo;
      })
      .reduce((sum, r) => sum + (r.volume || 0), 0);

    const lastWeight   = recentWeight.length ? recentWeight[recentWeight.length - 1] : null;
    const firstWeight  = recentWeight.length > 1 ? recentWeight[0] : null;
    const weightDelta  = lastWeight && firstWeight
      ? (lastWeight.weight_lbs - firstWeight.weight_lbs).toFixed(1)
      : null;

    const volCtx = volumeTag(thisWeekVol);
    const dropCtx = lastSession
      ? dropoffTag(lastSession.avg_dropoff_pct || 0)
      : null;

    // ── Date header ──────────────────────────
    document.getElementById('dashboard-meta').textContent =
      new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) +
      ' · Push/Pull Split';

    // ── Quick fatigue check for dashboard banner ──
    let fatigueBanner = '';
    const allSessionsForFatigue = await window.api.sessions.list(20);
    if (allSessionsForFatigue.length >= 4) {
      const sorted = [...allSessionsForFatigue].sort((a, b) => a.session_date.localeCompare(b.session_date));
      const last4 = sorted.slice(-4).filter(s => s.avg_dropoff_pct != null);
      if (last4.length >= 3) {
        const early  = (last4[0].avg_dropoff_pct + last4[1].avg_dropoff_pct) / 2;
        const recent = (last4[last4.length - 2].avg_dropoff_pct + last4[last4.length - 1].avg_dropoff_pct) / 2;
        const creep  = recent - early;
        if (creep > 8) {
          fatigueBanner = `
            <div style="background:var(--amber-light);border:1px solid var(--amber);border-radius:var(--radius);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px">
              <div>
                <span style="font-size:12px;font-weight:500;color:var(--amber)">Fatigue accumulation detected</span>
                <span style="font-size:12px;color:var(--text-2);margin-left:8px">Drop-off creeping up across recent sessions.</span>
              </div>
              <button class="btn" style="font-size:11px;padding:4px 12px;flex-shrink:0" onclick="Router.go('deload')">View Deload Detector →</button>
            </div>`;
        }
      }
    }

    // ── Build HTML ───────────────────────────
    let html = '';

    if (fatigueBanner) html += fatigueBanner;

    // KPI row
    html += `<div>
      <div class="section-label">This week</div>
      <div class="metric-row cols-4">
        ${metricCard(
          'Weekly Volume',
          thisWeekVol > 0 ? fmt(Math.round(thisWeekVol)) : '—',
          'lbs lifted',
          thisWeekVol > 0 ? `<span class="tag tag-sm ${volCtx.cls}">${volCtx.label}</span>` : ''
        )}
        ${metricCard(
          'Sessions',
          sessionCount ? sessionCount.cnt : '0',
          'this week',
          ''
        )}
        ${metricCard(
          'Body Weight',
          lastWeight ? fmt(lastWeight.weight_lbs) : '—',
          'lbs',
          weightDelta != null
            ? `<span class="${parseFloat(weightDelta) < 0 ? 'delta-up' : 'delta-down'}">${parseFloat(weightDelta) > 0 ? '+' : ''}${weightDelta} lbs</span>`
            : ''
        )}
        ${metricCard(
          'Avg Drop-off',
          lastSession && lastSession.avg_dropoff_pct != null ? Math.round(lastSession.avg_dropoff_pct) + '%' : '—',
          'strength endurance',
          dropCtx ? `<span class="tag tag-sm ${dropCtx.cls}">${dropCtx.label}</span>` : ''
        )}
      </div>
    </div>`;

    // ── Volume chart ─────────────────────────
    html += `<div>
      <div class="section-label">Training volume · last 8 weeks</div>
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <div class="chart-title">Session Volume</div>
            <div class="chart-subtitle">lbs lifted per session</div>
          </div>
          <span class="tag tag-green">Target: 7k–12k lbs</span>
        </div>
        <div class="chart-legend">
          <span><span class="legend-swatch" style="background:${C.green}"></span>Push</span>
          <span><span class="legend-swatch" style="background:${C.blue2}"></span>Pull</span>
        </div>
        <div style="position:relative;width:100%;height:220px">
          <canvas id="chart-volume"></canvas>
        </div>
      </div>
    </div>`;

    // ── Two-col charts ────────────────────────
    html += `<div class="chart-grid cols-2">
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <div class="chart-title">Body Weight</div>
            <div class="chart-subtitle">Daily log · lbs</div>
          </div>
          ${weightDelta != null
            ? `<span class="tag ${parseFloat(weightDelta) < 0 ? 'tag-green' : 'tag-amber'}">${parseFloat(weightDelta) > 0 ? '+' : ''}${weightDelta} lbs</span>`
            : ''}
        </div>
        <div style="position:relative;width:100%;height:180px">
          <canvas id="chart-weight"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <div class="chart-title">Daily Steps</div>
            <div class="chart-subtitle">Work vs off days</div>
          </div>
        </div>
        <div class="chart-legend">
          <span><span class="legend-swatch" style="background:${C.green}"></span>Work shift</span>
          <span><span class="legend-swatch" style="background:${C.grayLight};border:1px solid #ccc"></span>Off day</span>
        </div>
        <div style="position:relative;width:100%;height:160px">
          <canvas id="chart-steps"></canvas>
        </div>
      </div>
    </div>`;

    // ── Last session strip ────────────────────
    if (lastSession && lastSession.session_id) {
      const ls = lastSession;
      const lsDate = new Date(ls.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const zonesTotal = (ls.rep_zone_strength || 0) + (ls.rep_zone_size || 0) + (ls.rep_zone_metabolic || 0);

      html += `<div>
        <div class="section-label">Last session · ${ls.label || ls.session_type} · ${lsDate}</div>
        <div class="chart-card">
          <div class="analysis-grid cols-3" style="margin-bottom:0">
            <div class="analysis-cell">
              <div class="cell-label">Session Volume</div>
              <div class="cell-value">${ls.total_volume_lbs ? Math.round(ls.total_volume_lbs).toLocaleString() : '—'}</div>
              <div class="cell-sub ${volumeTag(ls.total_volume_lbs || 0).cls.replace('tag-','delta-')}">
                ${volumeTag(ls.total_volume_lbs || 0).label}
              </div>
            </div>
            <div class="analysis-cell">
              <div class="cell-label">Drop-off</div>
              <div class="cell-value">${ls.avg_dropoff_pct != null ? Math.round(ls.avg_dropoff_pct) + '%' : '—'}</div>
              <div class="cell-sub ${dropoffTag(ls.avg_dropoff_pct || 0).cls.replace('tag-','delta-')}">
                ${dropoffTag(ls.avg_dropoff_pct || 0).label}
              </div>
            </div>
            <div class="analysis-cell">
              <div class="cell-label">Exercises</div>
              <div class="cell-value">${ls.exercise_count || '—'}</div>
              <div class="cell-sub delta-neutral">${ls.set_count || '—'} total sets</div>
            </div>
            <div class="analysis-cell">
              <div class="cell-label">Top Set</div>
              <div class="cell-value" style="font-size:14px;line-height:1.3">${ls.top_set_desc || '—'}</div>
            </div>
            <div class="analysis-cell">
              <div class="cell-label">Weakest Link</div>
              <div class="cell-value" style="font-size:14px;line-height:1.3">${ls.weakest_link || '—'}</div>
              <div class="cell-sub delta-down">highest drop-off</div>
            </div>
            <div class="analysis-cell">
              <div class="cell-label">Rep Zones</div>
              <div style="display:flex;gap:4px;margin-top:6px;font-size:11px;color:var(--text-2)">
                <div style="flex:${ls.rep_zone_strength||0};background:${C.green};height:20px;border-radius:3px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;min-width:${(ls.rep_zone_strength||0) > 0 ? 24 : 0}px">
                  ${(ls.rep_zone_strength||0) > 0 ? ls.rep_zone_strength : ''}
                </div>
                <div style="flex:${ls.rep_zone_size||0};background:${C.greenMid};height:20px;border-radius:3px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;min-width:${(ls.rep_zone_size||0) > 0 ? 24 : 0}px">
                  ${(ls.rep_zone_size||0) > 0 ? ls.rep_zone_size : ''}
                </div>
                <div style="flex:${ls.rep_zone_metabolic||0};background:${C.greenLight};height:20px;border-radius:3px;display:flex;align-items:center;justify-content:center;color:${C.green};font-size:10px;min-width:${(ls.rep_zone_metabolic||0) > 0 ? 24 : 0}px">
                  ${(ls.rep_zone_metabolic||0) > 0 ? ls.rep_zone_metabolic : ''}
                </div>
              </div>
              <div style="display:flex;gap:8px;margin-top:4px;font-size:10px;color:var(--text-3)">
                <span>Str</span><span>Size</span><span>Meta</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    } else {
      html += `<div class="empty-state">
        <div class="empty-title">No sessions yet</div>
        <p>Log your first workout to see analytics here.</p>
        <br>
        <button class="btn primary" onclick="Router.go('log')">Log a Workout</button>
      </div>`;
    }

    container.innerHTML = html;

    // ── Build charts ──────────────────────────
    buildVolumeChart(weekVol);
    buildWeightChart(recentWeight);
    buildStepsChart(recentActivity);
  }

  function buildVolumeChart(rows) {
    const canvas = document.getElementById('chart-volume');
    if (!canvas || !rows.length) return;

    const pushRows = rows.filter(r => r.session_type === 'push' || (r.label && r.label.toLowerCase().includes('push')));
    const pullRows = rows.filter(r => r.session_type === 'pull' || (r.label && r.label.toLowerCase().includes('pull')));
    const allRows  = [...new Set(rows.map(r => r.session_date))].sort();

    const volFor = (arr, date) => {
      const r = arr.find(r => r.session_date === date);
      return r ? Math.round(r.volume) : null;
    };

    charts.volume = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: allRows.map(d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
        datasets: [
          {
            label: 'Push',
            data: allRows.map(d => volFor(pushRows, d)),
            backgroundColor: C.green,
            borderRadius: 3,
            skipNull: true,
          },
          {
            label: 'Pull',
            data: allRows.map(d => volFor(pullRows, d)),
            backgroundColor: C.blue2,
            borderRadius: 3,
            skipNull: true,
          },
          {
            label: 'Target',
            data: allRows.map(() => 7000),
            type: 'line',
            borderColor: C.gray,
            borderWidth: 1,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
          }
        ]
      },
      options: {
        ...BASE_OPTS,
        scales: {
          x: { ...axisStyle({ grid: { display: false } }), ticks: { font: { size: 11 }, color: '#9a9890', maxRotation: 45, autoSkip: false } },
          y: { ...axisStyle(), min: 0, ticks: { ...axisStyle().ticks, callback: v => (v / 1000).toFixed(0) + 'k' } }
        }
      }
    });
  }

  function buildWeightChart(rows) {
    const canvas = document.getElementById('chart-weight');
    if (!canvas || !rows.length) return;

    const labels = rows.map(r => new Date(r.log_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const vals   = rows.map(r => r.weight_lbs);
    const minV   = Math.min(...vals) - 2;
    const maxV   = Math.max(...vals) + 2;

    charts.weight = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: vals,
          borderColor: C.green,
          backgroundColor: 'rgba(26,92,58,0.06)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: C.green,
        }]
      },
      options: {
        ...BASE_OPTS,
        scales: {
          x: { ...axisStyle({ grid: { display: false } }), ticks: { font: { size: 10 }, color: '#9a9890', maxRotation: 45 } },
          y: { ...axisStyle(), min: minV, max: maxV, ticks: { ...axisStyle().ticks, callback: v => v + 'lb' } }
        }
      }
    });
  }

  function buildStepsChart(rows) {
    const canvas = document.getElementById('chart-steps');
    if (!canvas || !rows.length) return;

    const labels = rows.map(r => new Date(r.log_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const vals   = rows.map(r => r.steps || 0);
    const colors = rows.map(r => r.is_work_day ? C.green : C.grayLight);

    charts.steps = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data: vals, backgroundColor: colors, borderRadius: 3 }]
      },
      options: {
        ...BASE_OPTS,
        scales: {
          x: { ...axisStyle({ grid: { display: false } }), ticks: { font: { size: 10 }, color: '#9a9890', maxRotation: 45 } },
          y: { ...axisStyle(), min: 0, ticks: { ...axisStyle().ticks, callback: v => (v / 1000).toFixed(0) + 'k' } }
        }
      }
    });
  }

  Router.register('dashboard', render);

  return { render };
})();
