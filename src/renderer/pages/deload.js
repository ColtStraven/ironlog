// IronLog · Deload Detector
// Watches four fatigue signals across your trailing 3-week window:
//   1. Volume drift     — are you doing less than your baseline?
//   2. Drop-off creep   — is endurance deteriorating session to session?
//   3. Strength drift   — are 1RM estimates flattening or falling?
//   4. Session spacing  — are rest days increasing (body avoiding load)?
//
// Each signal is scored 0–25. Total 0–100.
// 0–39  = Recovered / fresh — no deload needed
// 40–59 = Mild fatigue accumulation — monitor closely
// 60–79 = Moderate — deload recommended within 1–2 sessions
// 80+   = High — deload now

const DeloadPage = (() => {

  let fatigueChart = null;

  // ── Constants ─────────────────────────────────────────────────────────────
  const WINDOW_WEEKS   = 3;    // trailing window for signal detection
  const BASELINE_WEEKS = 2;    // early sessions used to establish baseline

  // ── Math helpers ──────────────────────────────────────────────────────────
  function mean(arr) {
    const v = arr.filter(x => x != null && !isNaN(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  function pctChange(baseline, current) {
    if (!baseline || baseline === 0) return 0;
    return ((current - baseline) / baseline) * 100;
  }

  function linearSlope(ys) {
    const v = ys.filter(x => x != null);
    if (v.length < 2) return 0;
    const n  = v.length;
    const xs = v.map((_, i) => i);
    const xm = xs.reduce((a, b) => a + b, 0) / n;
    const ym = v.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((s, x, i) => s + (x - xm) * (v[i] - ym), 0);
    const den = xs.reduce((s, x) => s + (x - xm) ** 2, 0);
    return den === 0 ? 0 : num / den;
  }

  function daysBetween(dateA, dateB) {
    return Math.abs((new Date(dateB + 'T00:00:00') - new Date(dateA + 'T00:00:00')) / 86400000);
  }

  function weeksAgo(dateStr, n) {
    const d = new Date();
    d.setDate(d.getDate() - n * 7);
    return dateStr >= d.toISOString().slice(0, 10);
  }

  function epley(weight, reps) {
    return reps === 1 ? weight : weight * (1 + reps / 30);
  }

  // ── Signal 1: Volume drift ─────────────────────────────────────────────────
  // Compare avg session volume in the trailing window vs the baseline window.
  // Score 0 (no drift) → 25 (severe drop)
  function scoreVolumeDrift(sessions) {
    if (sessions.length < 4) return { score: 0, detail: null };

    const baseline = sessions.slice(0, BASELINE_WEEKS * 2);  // ~first 4 sessions
    const recent   = sessions.slice(-Math.min(6, Math.floor(sessions.length / 2)));

    const baseVol = mean(baseline.map(s => s.total_volume_lbs).filter(Boolean));
    const recentVol = mean(recent.map(s => s.total_volume_lbs).filter(Boolean));

    if (!baseVol || !recentVol) return { score: 0, detail: null };

    const drift = pctChange(baseVol, recentVol);
    // Negative drift = volume falling = fatigue signal
    let score = 0;
    if (drift < -5)  score = 5;
    if (drift < -10) score = 10;
    if (drift < -20) score = 18;
    if (drift < -30) score = 25;

    return {
      score,
      detail: {
        baseline:  Math.round(baseVol),
        recent:    Math.round(recentVol),
        drift:     Math.round(drift),
        direction: drift < 0 ? 'down' : 'up',
      }
    };
  }

  // ── Signal 2: Drop-off creep ───────────────────────────────────────────────
  // Avg drop-off % trending upward across sessions = fatigue accumulation.
  // Score 0 → 25
  function scoreDropoffCreep(sessions) {
    const sessionsWithDropoff = sessions
      .filter(s => s.avg_dropoff_pct != null)
      .map(s => s.avg_dropoff_pct);

    if (sessionsWithDropoff.length < 3) return { score: 0, detail: null };

    const slope = linearSlope(sessionsWithDropoff);
    const recentAvg = mean(sessionsWithDropoff.slice(-3));
    const earlyAvg  = mean(sessionsWithDropoff.slice(0, 3));

    let score = 0;
    if (slope > 0.5)  score = 5;
    if (slope > 1.0)  score = 10;
    if (slope > 2.0)  score = 18;
    if (slope > 3.5)  score = 25;

    // Also penalise if absolute drop-off is already > 65% (chronically overtrained)
    if (recentAvg > 65) score = Math.max(score, 15);
    if (recentAvg > 75) score = Math.max(score, 22);

    return {
      score,
      detail: {
        earlyAvg:  earlyAvg != null ? Math.round(earlyAvg) : null,
        recentAvg: recentAvg != null ? Math.round(recentAvg) : null,
        slope:     Math.round(slope * 10) / 10,
        trending:  slope > 0.5 ? 'up' : slope < -0.5 ? 'down' : 'flat',
      }
    };
  }

  // ── Signal 3: Strength drift ───────────────────────────────────────────────
  // Track best Epley 1RM per session across all exercises.
  // Flattening or decline over the trailing window = fatigue.
  function scoreStrengthDrift(sessions, allSets) {
    if (sessions.length < 4 || !allSets.length) return { score: 0, detail: null };

    // Build per-session best 1RM (max across all exercises)
    const sessionRMs = sessions.map(s => {
      const sets = allSets.filter(r => r.session_id === s.id);
      if (!sets.length) return null;
      return Math.max(...sets.map(r => epley(r.weight_lbs, r.reps)));
    }).filter(Boolean);

    if (sessionRMs.length < 3) return { score: 0, detail: null };

    const slope    = linearSlope(sessionRMs);
    const recentRM = mean(sessionRMs.slice(-2));
    const peakRM   = Math.max(...sessionRMs);
    const dropFromPeak = peakRM > 0 ? pctChange(peakRM, recentRM) : 0;

    let score = 0;
    if (slope < -0.1)        score = 5;
    if (slope < -0.5)        score = 10;
    if (dropFromPeak < -3)   score = Math.max(score, 12);
    if (dropFromPeak < -6)   score = Math.max(score, 20);
    if (dropFromPeak < -10)  score = 25;

    return {
      score,
      detail: {
        peakRM:       Math.round(peakRM),
        recentRM:     Math.round(recentRM),
        dropFromPeak: Math.round(dropFromPeak * 10) / 10,
        slope:        Math.round(slope * 10) / 10,
      }
    };
  }

  // ── Signal 4: Session spacing ──────────────────────────────────────────────
  // If gaps between sessions are growing, body may be avoiding load.
  function scoreSessionSpacing(sessions) {
    if (sessions.length < 4) return { score: 0, detail: null };

    const sorted = [...sessions].sort((a, b) =>
      a.session_date.localeCompare(b.session_date)
    );

    const gaps = sorted.slice(1).map((s, i) =>
      daysBetween(sorted[i].session_date, s.session_date)
    );

    if (gaps.length < 3) return { score: 0, detail: null };

    const earlyGap  = mean(gaps.slice(0, Math.ceil(gaps.length / 2)));
    const recentGap = mean(gaps.slice(-2));
    const slope     = linearSlope(gaps);

    let score = 0;
    if (recentGap > earlyGap + 1.5) score = 8;
    if (recentGap > earlyGap + 3)   score = 15;
    if (slope > 0.3)                 score = Math.max(score, 8);
    if (slope > 0.8)                 score = Math.max(score, 18);
    if (recentGap > 5)               score = Math.max(score, 25); // >5 days between sessions

    return {
      score: Math.min(score, 25),
      detail: {
        earlyGap:  earlyGap  != null ? Math.round(earlyGap  * 10) / 10 : null,
        recentGap: recentGap != null ? Math.round(recentGap * 10) / 10 : null,
        slope:     Math.round(slope * 10) / 10,
        trend:     slope > 0.3 ? 'widening' : 'stable',
      }
    };
  }

  // ── Deload protocol builder ────────────────────────────────────────────────
  function deloadProtocol(totalScore, signals) {
    const isVolumeDriven  = signals.volume.score   >= 15;
    const isDropoffDriven = signals.dropoff.score  >= 15;
    const isStrengthDrop  = signals.strength.score >= 15;

    const items = [];

    // Duration
    const duration = totalScore >= 80 ? '7–10 days' : '5–7 days';
    items.push({ heading: 'Duration', text: duration });

    // Load prescription
    if (totalScore >= 80) {
      items.push({ heading: 'Load', text: 'Reduce weight by 40–50% across all exercises. This is a true deload — not a light week, a recovery week.' });
    } else if (totalScore >= 60) {
      items.push({ heading: 'Load', text: 'Reduce weight by 30–40%. Keep the same exercises and rep ranges, just lower the intensity.' });
    } else {
      items.push({ heading: 'Load', text: 'Reduce weight by 20–30% and aim for the top of your rep ranges comfortably. Technique focus week.' });
    }

    // Volume prescription
    if (isVolumeDriven) {
      items.push({ heading: 'Volume', text: 'Cut sets by 40–50%. 2–3 sets per exercise max. Your CNS needs reduced total work, not just lighter weight.' });
    } else {
      items.push({ heading: 'Volume', text: 'Cut sets by 30%. Keep all exercises, reduce volume per exercise.' });
    }

    // Drop-off prescription
    if (isDropoffDriven) {
      items.push({ heading: 'Rest periods', text: 'Extend rest to 2–3 minutes between sets. Your inter-set recovery is compromised — longer rests let the deload actually work.' });
    }

    // Strength note
    if (isStrengthDrop) {
      items.push({ heading: 'Strength note', text: 'Don\'t test maxes during deload. Strength will rebound after recovery — often higher than before the deload. This is a known supercompensation effect.' });
    }

    // Return to training
    items.push({ heading: 'Return to training', text: `After ${duration}, resume at your pre-deload weights. You will likely hit PRs in the session following the deload.` });

    return items;
  }

  // ── Weekly fatigue history (for chart) ────────────────────────────────────
  function buildFatigueHistory(sessions) {
    if (sessions.length < 2) return [];

    const sorted = [...sessions].sort((a, b) => a.session_date.localeCompare(b.session_date));
    const points = [];

    for (let i = 3; i <= sorted.length; i++) {
      const window = sorted.slice(0, i);
      const last4  = window.slice(-4);

      const v = scoreVolumeDrift(window);
      const d = scoreDropoffCreep(window);
      const sp = scoreSessionSpacing(window);

      const total = Math.min(100, v.score + d.score + sp.score);
      points.push({
        date:  sorted[i - 1].session_date,
        total,
        volScore:     v.score,
        dropoffScore: d.score,
        spacingScore: sp.score,
      });
    }

    return points;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  async function render() {
    const container = document.getElementById('deload-content');
    container.innerHTML = `<div class="empty-state"><div class="empty-title">Analyzing…</div></div>`;
    if (fatigueChart) { fatigueChart.destroy(); fatigueChart = null; }

    const sessions = await window.api.sessions.list(100);

    if (sessions.length < 4) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">Not enough data yet</div>
          <p>Log at least 4 sessions to start fatigue tracking. Come back after a week or two of training.</p>
          <br><button class="btn primary" data-nav="log">Log a Workout</button>
        </div>`;
      return;
    }

    // Load all sets for strength drift (need exercise-level data)
    const setData = [];
    for (const s of sessions.slice(0, 20)) {
      const { sets } = await window.api.sessions.get(s.id);
      sets.forEach(r => setData.push({ ...r, session_id: s.id }));
    }

    // Sort oldest → newest for analysis
    const sorted = [...sessions].sort((a, b) => a.session_date.localeCompare(b.session_date));

    // Run all four signals
    const volSig      = scoreVolumeDrift(sorted);
    const dropoffSig  = scoreDropoffCreep(sorted);
    const strengthSig = scoreStrengthDrift(sorted, setData);
    const spacingSig  = scoreSessionSpacing(sorted);

    const signals = {
      volume:   volSig,
      dropoff:  dropoffSig,
      strength: strengthSig,
      spacing:  spacingSig,
    };

    const totalScore = Math.min(100,
      volSig.score + dropoffSig.score + strengthSig.score + spacingSig.score
    );

    // Verdict
    let verdict, verdictCls, verdictTag, verdictText;
    if (totalScore >= 80) {
      verdict    = 'Deload now';
      verdictCls = 'verdict-red';
      verdictTag = 'tag-red';
      verdictText = 'Cumulative fatigue is high across multiple signals. Performance will continue declining if you push through. A deload this week will result in a stronger return than forcing more training.';
    } else if (totalScore >= 60) {
      verdict    = 'Deload recommended';
      verdictCls = 'verdict-amber';
      verdictTag = 'tag-amber';
      verdictText = 'Fatigue is accumulating. You\'re not at the wall yet, but you\'re approaching it. Deloading now is proactive — waiting until performance crashes is reactive and takes longer to recover from.';
    } else if (totalScore >= 40) {
      verdict    = 'Monitor closely';
      verdictCls = 'verdict-blue';
      verdictTag = 'tag-blue';
      verdictText = 'Mild fatigue signals present. Keep training but pay attention to how the next 2–3 sessions feel. If performance dips further, schedule a deload.';
    } else {
      verdict    = 'Recovered — keep training';
      verdictCls = 'verdict-green';
      verdictTag = 'tag-green';
      verdictText = 'No significant fatigue signals detected. Your volume, drop-off, and spacing data look healthy. Continue with your current program.';
    }

    const protocol = totalScore >= 40 ? deloadProtocol(totalScore, signals) : null;
    const history  = buildFatigueHistory(sorted);

    // ── Build HTML ──────────────────────────────────────────────────────────
    let html = '';

    // Score hero
    html += `
      <div class="deload-hero ${verdictCls}">
        <div class="deload-score-wrap">
          <div class="deload-score">${totalScore}</div>
          <div class="deload-score-label">fatigue score</div>
        </div>
        <div class="deload-verdict-wrap">
          <div class="deload-verdict">${verdict}</div>
          <p class="deload-verdict-text">${verdictText}</p>
          <div class="deload-score-bar">
            <div class="deload-fill" style="width:${totalScore}%"></div>
            <div class="deload-threshold" style="left:40%" title="Monitor"></div>
            <div class="deload-threshold" style="left:60%" title="Deload recommended"></div>
            <div class="deload-threshold" style="left:80%" title="Deload now"></div>
          </div>
          <div class="deload-bar-labels">
            <span>Fresh</span>
            <span style="margin-left:38%">Monitor</span>
            <span>Deload</span>
            <span>Now</span>
          </div>
        </div>
      </div>`;

    // Four signal cards
    html += `
      <div>
        <div class="section-label">Signal breakdown</div>
        <div class="metric-row cols-4">
          ${signalCard('Volume drift', volSig, buildVolDetail(volSig.detail))}
          ${signalCard('Drop-off creep', dropoffSig, buildDropoffDetail(dropoffSig.detail))}
          ${signalCard('Strength drift', strengthSig, buildStrengthDetail(strengthSig.detail))}
          ${signalCard('Session spacing', spacingSig, buildSpacingDetail(spacingSig.detail))}
        </div>
      </div>`;

    // Fatigue history chart
    if (history.length >= 2) {
      html += `
        <div class="chart-card">
          <div class="chart-header">
            <div>
              <div class="chart-title">Fatigue score over time</div>
              <div class="chart-subtitle">Cumulative across all four signals · per session</div>
            </div>
          </div>
          <div class="chart-legend">
            <span><span class="legend-swatch" style="background:#1a5c3a"></span>Volume drift</span>
            <span><span class="legend-swatch" style="background:#1a4a7a"></span>Drop-off creep</span>
            <span><span class="legend-swatch" style="background:#8a5a10"></span>Session spacing</span>
          </div>
          <div style="position:relative;width:100%;height:240px">
            <canvas id="fatigue-chart"></canvas>
          </div>
        </div>`;
    }

    // Deload protocol
    if (protocol) {
      html += `
        <div>
          <div class="section-label">Deload protocol</div>
          <div class="form-card">
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px">
              ${protocol.map(item => `
                <div>
                  <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-3);margin-bottom:4px">${item.heading}</div>
                  <p style="font-size:13px;color:var(--text-2);line-height:1.65;margin:0">${item.text}</p>
                </div>`).join('')}
            </div>
          </div>
        </div>`;
    }

    // Signal explanations
    html += `
      <div class="form-card">
        <div class="section-label" style="margin-bottom:14px">How each signal is calculated</div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px">
          <div>
            <div class="signal-explain-title">Volume drift (0–25 pts)</div>
            <p class="signal-explain-text">Compares your average session volume from your baseline (first sessions) to your recent sessions. A decline of &gt;10% scores fatigue points. The body unconsciously reduces effort when overtrained.</p>
          </div>
          <div>
            <div class="signal-explain-title">Drop-off creep (0–25 pts)</div>
            <p class="signal-explain-text">Tracks whether your rep endurance (first set vs last set) is getting worse session to session. A rising slope on drop-off % means your muscles are accumulating fatigue between workouts.</p>
          </div>
          <div>
            <div class="signal-explain-title">Strength drift (0–25 pts)</div>
            <p class="signal-explain-text">Monitors your best estimated 1RM across all exercises per session. When peak strength starts declining from its high point, it's a reliable late-stage fatigue indicator.</p>
          </div>
          <div>
            <div class="signal-explain-title">Session spacing (0–25 pts)</div>
            <p class="signal-explain-text">Watches whether gaps between sessions are growing. When the body is overtrained, it unconsciously resists returning to the gym — widening gaps often appear before performance drops are noticed.</p>
          </div>
        </div>
      </div>`;

    container.innerHTML = html;

    // Build fatigue chart
    if (history.length >= 2) buildFatigueChart(history, totalScore);
  }

  // ── Signal card ────────────────────────────────────────────────────────────
  function signalCard(title, sig, detailHtml) {
    const score = sig.score;
    const pct   = Math.round((score / 25) * 100);
    const cls   = score >= 18 ? 'delta-down' : score >= 10 ? 'delta-warn' : 'delta-up';
    const label = score >= 18 ? 'High' : score >= 10 ? 'Moderate' : score >= 5 ? 'Mild' : 'Clear';

    return `
      <div class="metric-card">
        <div class="metric-label">${title}</div>
        <div class="metric-value">${score}<span style="font-size:14px;color:var(--text-3)">/25</span></div>
        <div class="metric-delta ${cls}">${label}</div>
        <div class="signal-mini-bar">
          <div class="signal-mini-fill" style="width:${pct}%;background:${score >= 18 ? 'var(--red)' : score >= 10 ? 'var(--amber)' : 'var(--green)'}"></div>
        </div>
        ${detailHtml ? `<div class="signal-detail">${detailHtml}</div>` : ''}
      </div>`;
  }

  function buildVolDetail(d) {
    if (!d) return '<span class="muted text-sm">Not enough data</span>';
    return `<span class="text-sm muted">Baseline ${d.baseline.toLocaleString()} lbs → Recent ${d.recent.toLocaleString()} lbs
      <span class="${d.drift < 0 ? 'delta-down' : 'delta-up'}">(${d.drift > 0 ? '+' : ''}${d.drift}%)</span></span>`;
  }

  function buildDropoffDetail(d) {
    if (!d) return '<span class="muted text-sm">Not enough data</span>';
    return `<span class="text-sm muted">Early avg ${d.earlyAvg != null ? d.earlyAvg + '%' : '—'} → Recent ${d.recentAvg != null ? d.recentAvg + '%' : '—'}
      · slope <span class="${d.slope > 0.5 ? 'delta-down' : 'delta-neutral'}">${d.slope > 0 ? '+' : ''}${d.slope}/session</span></span>`;
  }

  function buildStrengthDetail(d) {
    if (!d) return '<span class="muted text-sm">Not enough data</span>';
    return `<span class="text-sm muted">Peak ${d.peakRM} lbs → Recent ${d.recentRM} lbs
      <span class="${d.dropFromPeak < -2 ? 'delta-down' : 'delta-neutral'}">(${d.dropFromPeak > 0 ? '+' : ''}${d.dropFromPeak}%)</span></span>`;
  }

  function buildSpacingDetail(d) {
    if (!d) return '<span class="muted text-sm">Not enough data</span>';
    return `<span class="text-sm muted">Early gap ${d.earlyGap != null ? d.earlyGap + ' days' : '—'} → Recent ${d.recentGap != null ? d.recentGap + ' days' : '—'}
      · ${d.trend}</span>`;
  }

  // ── Fatigue history chart ─────────────────────────────────────────────────
  function buildFatigueChart(history, currentTotal) {
    const canvas = document.getElementById('fatigue-chart');
    if (!canvas) return;

    const labels = history.map(p =>
      new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    );

    fatigueChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Total fatigue',
            data: history.map(p => p.total),
            borderColor: '#1a1917',
            backgroundColor: 'rgba(26,25,23,0.04)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: history.map(p =>
              p.total >= 80 ? '#a02020' : p.total >= 60 ? '#8a5a10' : p.total >= 40 ? '#1a4a7a' : '#1a5c3a'
            ),
            pointRadius: 5,
          },
          {
            label: 'Volume drift',
            data: history.map(p => p.volScore),
            borderColor: '#1a5c3a',
            backgroundColor: 'transparent',
            tension: 0.3,
            pointRadius: 2,
            borderWidth: 1.5,
          },
          {
            label: 'Drop-off creep',
            data: history.map(p => p.dropoffScore),
            borderColor: '#1a4a7a',
            backgroundColor: 'transparent',
            tension: 0.3,
            pointRadius: 2,
            borderWidth: 1.5,
          },
          {
            label: 'Session spacing',
            data: history.map(p => p.spacingScore),
            borderColor: '#8a5a10',
            backgroundColor: 'transparent',
            tension: 0.3,
            pointRadius: 2,
            borderWidth: 1.5,
          },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}`
            }
          },
          // Threshold lines via annotation would require plugin — using datasets instead
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: '#9a9890', maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }
          },
          y: {
            min: 0,
            max: 105,
            grid: { color: '#f0ede6' },
            ticks: {
              font: { size: 11 },
              color: '#9a9890',
              callback: v => {
                if (v === 40) return '40 monitor';
                if (v === 60) return '60 deload';
                if (v === 80) return '80 now';
                if (v === 0 || v === 100) return v;
                return '';
              }
            }
          }
        }
      }
    });
  }

  Router.register('deload', render);
  return { render };
})();
