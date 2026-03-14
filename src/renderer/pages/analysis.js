// IronLog · Session Analysis
// Generates a full coaching-style narrative breakdown from stored session data.
// All logic is local — no API calls.

const AnalysisPage = (() => {

  // ── Helpers ─────────────────────────────────────────────────────────────
  function epley1RM(weight, reps) {
    return reps === 1 ? weight : weight * (1 + reps / 30);
  }

  function dropoffPct(sets) {
    const valid = sets.filter(s => s.reps > 0);
    if (valid.length < 2) return null;
    const first = valid[0].reps;
    const last  = valid[valid.length - 1].reps;
    return first > 0 ? Math.round(((first - last) / first) * 100) : null;
  }

  function volumeForExercise(sets) {
    return sets.reduce((s, r) => s + r.reps * r.weight_lbs, 0);
  }

  function repZone(reps) {
    if (reps <= 6)  return 'strength';
    if (reps <= 12) return 'size';
    return 'metabolic';
  }

  function dropoffLabel(pct) {
    if (pct === null) return { text: '—', cls: 'delta-neutral', zone: 'Not enough sets' };
    if (pct < 30)  return { text: pct + '%', cls: 'delta-warn',    zone: 'Not training hard enough' };
    if (pct <= 60) return { text: pct + '%', cls: 'delta-up',      zone: 'Hypertrophy zone' };
    return           { text: pct + '%', cls: 'delta-down',   zone: 'Poor recovery / too heavy' };
  }

  function volumeLabel(vol) {
    if (vol < 5000)  return { band: '< 5k',    text: 'Maintenance',  cls: 'tag-amber', detail: 'Below the threshold for muscle growth stimulus.' };
    if (vol < 7000)  return { band: '5k–7k',   text: 'Slow growth',  cls: 'tag-blue',  detail: 'In the growth range but toward the lower end. Solid for early weeks.' };
    if (vol <= 12000) return { band: '7k–12k', text: 'Ideal growth', cls: 'tag-green', detail: 'The sweet spot for hypertrophy and recomp. Stay here.' };
    if (vol <= 15000) return { band: '12k–15k', text: 'High volume', cls: 'tag-amber', detail: 'Effective but watch recovery. You may need more food.' };
    return             { band: '> 15k',   text: 'Recovery risk', cls: 'tag-red',   detail: 'Volume is high enough to impair recovery. Consider reducing sets.' };
  }

  // ── Projection engine ────────────────────────────────────────────────────
  // Uses session history to compute a trend-based 12-week outlook.
  function buildProjection(sessions, bodyMetrics) {
    const programStart = localStorage.getItem('ironlog_program_start');
    const weekNum = programStart
      ? Math.min(12, Math.floor((Date.now() - new Date(programStart)) / (7 * 86400000)) + 1)
      : 1;

    // Volume trend: compare first 2 sessions to last 2
    let volTrend = null;
    if (sessions.length >= 4) {
      const early = (sessions.slice(0, 2).reduce((s, r) => s + (r.total_volume_lbs || 0), 0)) / 2;
      const late  = (sessions.slice(-2).reduce((s, r) => s + (r.total_volume_lbs || 0), 0)) / 2;
      volTrend = Math.round(((late - early) / early) * 100);
    }

    // Weight trend
    let weightLost = null;
    if (bodyMetrics.length >= 2) {
      const first = bodyMetrics[bodyMetrics.length - 1].weight_lbs;
      const last  = bodyMetrics[0].weight_lbs;
      weightLost = parseFloat((first - last).toFixed(1)); // negative = lost
    }

    // Current weight for projections
    const currentWeight = bodyMetrics.length ? bodyMetrics[0].weight_lbs : null;
    const weeklyLossRate = (weightLost && weekNum > 1)
      ? Math.abs(weightLost) / (weekNum - 1)
      : 0.5; // default assumption

    const projectedWeightAt12 = currentWeight
      ? Math.round((currentWeight - weeklyLossRate * (12 - weekNum)) * 10) / 10
      : null;

    return { weekNum, volTrend, weightLost, currentWeight, projectedWeightAt12, weeklyLossRate };
  }

  // ── Per-exercise analysis block ──────────────────────────────────────────
  function exerciseBlock(exName, sets) {
    const drop   = dropoffPct(sets);
    const dl     = dropoffLabel(drop);
    const vol    = Math.round(volumeForExercise(sets));
    const best1RM = Math.round(Math.max(...sets.map(s => epley1RM(s.weight_lbs, s.reps))));

    // Rep pattern string: e.g. "35×12 → 35×7 → 35×5 → 35×5"
    const pattern = sets.map(s => `${s.weight_lbs}×${s.reps}`).join(' → ');

    // Zone distribution
    const zones = { strength: 0, size: 0, metabolic: 0 };
    sets.forEach(s => zones[repZone(s.reps)]++);

    // Insight sentence
    let insight = '';
    if (drop !== null) {
      if (drop < 30) {
        insight = `You had very little fatigue across sets. This usually means you left reps in reserve — consider pushing the last set closer to failure, or adding a 5th set.`;
      } else if (drop <= 45) {
        insight = `Clean drop-off. You maintained output well across the session while still accumulating meaningful fatigue. This is where muscle growth happens.`;
      } else if (drop <= 60) {
        insight = `Solid endurance under fatigue. The higher drop-off shows you pushed hard early. Make sure rest periods are at least 90 seconds between sets.`;
      } else {
        insight = `High fatigue drop-off. Either the weight is slightly heavy for your current capacity, or rest periods are too short. Try 2 minutes between sets next session.`;
      }
    }

    return `
      <div class="analysis-ex-block">
        <div class="analysis-ex-header">
          <div class="analysis-ex-name">${exName}</div>
          <div class="analysis-ex-meta">
            <span class="tag ${dl.cls.replace('delta-up','tag-green').replace('delta-down','tag-red').replace('delta-warn','tag-amber').replace('delta-neutral','tag-blue')}">
              Drop-off ${dl.text}
            </span>
            <span class="muted text-sm">${vol.toLocaleString()} lbs · est. 1RM ${best1RM} lbs</span>
          </div>
        </div>

        <div class="analysis-pattern">${pattern}</div>

        <div class="dropoff-zone-row">
          <div class="dropoff-table">
            <div class="dz-row ${drop !== null && drop < 30 ? 'dz-active' : ''}">
              <span class="dz-range">&lt; 30%</span>
              <span class="dz-label">Not training hard enough</span>
            </div>
            <div class="dz-row ${drop !== null && drop >= 30 && drop <= 60 ? 'dz-active dz-good' : ''}">
              <span class="dz-range">30–60%</span>
              <span class="dz-label">Perfect hypertrophy zone</span>
            </div>
            <div class="dz-row ${drop !== null && drop > 60 ? 'dz-active dz-warn' : ''}">
              <span class="dz-range">&gt; 60%</span>
              <span class="dz-label">Poor recovery / too heavy</span>
            </div>
          </div>
          <div class="zone-pills">
            ${zones.strength  > 0 ? `<span class="zone-pill zpill-str">${zones.strength} strength set${zones.strength > 1 ? 's' : ''}</span>` : ''}
            ${zones.size      > 0 ? `<span class="zone-pill zpill-size">${zones.size} size set${zones.size > 1 ? 's' : ''}</span>` : ''}
            ${zones.metabolic > 0 ? `<span class="zone-pill zpill-meta">${zones.metabolic} metabolic set${zones.metabolic > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>

        ${insight ? `<div class="analysis-insight">${insight}</div>` : ''}
      </div>`;
  }

  // ── Volume section ────────────────────────────────────────────────────────
  function volumeSection(totalVol, sessionType) {
    const vl = volumeLabel(totalVol);
    const bands = [
      { range: '< 5k lbs',    label: 'Maintenance',   key: 'maint'  },
      { range: '5k–7k lbs',   label: 'Slow growth',   key: 'slow'   },
      { range: '7k–12k lbs',  label: 'Ideal growth',  key: 'ideal'  },
      { range: '12k–15k lbs', label: 'High volume',   key: 'high'   },
      { range: '> 15k lbs',   label: 'Recovery risk', key: 'risk'   },
    ];
    const activeKey = vl.text === 'Maintenance' ? 'maint'
      : vl.text === 'Slow growth' ? 'slow'
      : vl.text === 'Ideal growth' ? 'ideal'
      : vl.text === 'High volume' ? 'high' : 'risk';

    const rows = bands.map(b => `
      <div class="dz-row ${b.key === activeKey ? 'dz-active ' + (activeKey === 'ideal' ? 'dz-good' : activeKey === 'risk' ? 'dz-warn' : '') : ''}">
        <span class="dz-range">${b.range}</span>
        <span class="dz-label">${b.label}</span>
      </div>`).join('');

    let commentary = '';
    if (totalVol >= 7000 && totalVol <= 12000) {
      commentary = `You're in the growth zone immediately. Most people need 4–6 weeks of ramp-up to reach this. Your work capacity from daily step count is already carrying over.`;
    } else if (totalVol >= 5000) {
      commentary = `Solid foundation. As you add sets and increase load over the next few weeks, volume will naturally climb into the ideal growth range.`;
    } else {
      commentary = `Volume is below the growth threshold. Consider adding one set to 2–3 exercises next session, or increasing weight slightly on top sets.`;
    }

    return `
      <div class="narrative-section">
        <div class="narrative-number">2</div>
        <div class="narrative-body">
          <div class="narrative-heading">Your Volume Is ${vl.text === 'Ideal growth' ? 'Already in the Muscle Growth Range' : 'at ' + vl.text}</div>
          <div class="narrative-stat-hero">${Math.round(totalVol).toLocaleString()} <span class="narrative-stat-unit">lbs</span></div>
          <div class="dropoff-table" style="margin:12px 0 10px">${rows}</div>
          <p class="narrative-text">${commentary}</p>
        </div>
      </div>`;
  }

  // ── Rep zone section ──────────────────────────────────────────────────────
  function repZoneSection(allSets) {
    const zones = { strength: [], size: [], metabolic: [] };
    allSets.forEach(s => zones[repZone(s.reps)].push(s));

    const total = allSets.length;
    const strPct  = total ? Math.round((zones.strength.length  / total) * 100) : 0;
    const sizePct = total ? Math.round((zones.size.length      / total) * 100) : 0;
    const metPct  = total ? Math.round((zones.metabolic.length / total) * 100) : 0;

    const hitsAll = zones.strength.length > 0 && zones.size.length > 0 && zones.metabolic.length > 0;

    return `
      <div class="narrative-section">
        <div class="narrative-number">3</div>
        <div class="narrative-body">
          <div class="narrative-heading">Your Rep Ranges ${hitsAll ? 'Are Perfect for Recomp' : 'Cover These Hypertrophy Zones'}</div>
          <div class="zone-bar-display">
            <div class="zone-bar-seg seg-str"  style="flex:${zones.strength.length  || 0.5}">
              <span>${zones.strength.length} sets</span>
            </div>
            <div class="zone-bar-seg seg-size" style="flex:${zones.size.length      || 0.5}">
              <span>${zones.size.length} sets</span>
            </div>
            <div class="zone-bar-seg seg-meta" style="flex:${zones.metabolic.length || 0.5}">
              <span>${zones.metabolic.length} sets</span>
            </div>
          </div>
          <div class="zone-bar-labels">
            <span>Strength (1–6 reps) · ${strPct}%</span>
            <span>Size (7–12 reps) · ${sizePct}%</span>
            <span>Metabolic (13+ reps) · ${metPct}%</span>
          </div>
          <div class="dropoff-table" style="margin:12px 0 10px">
            <div class="dz-row ${zones.strength.length  > 0 ? 'dz-active dz-good' : ''}"><span class="dz-range">4–6 reps</span><span class="dz-label">Builds strength — heavier load, neural adaptation</span></div>
            <div class="dz-row ${zones.size.length      > 0 ? 'dz-active dz-good' : ''}"><span class="dz-range">6–12 reps</span><span class="dz-label">Builds muscle size — primary hypertrophy zone</span></div>
            <div class="dz-row ${zones.metabolic.length > 0 ? 'dz-active dz-good' : ''}"><span class="dz-range">12–20 reps</span><span class="dz-label">Metabolic stress — promotes fullness and endurance</span></div>
          </div>
          <p class="narrative-text">${hitsAll
            ? 'You hit all three zones in the same session. That combination is exactly what drives body recomposition — you build strength, stimulate size, and create the metabolic environment for fat loss simultaneously.'
            : 'You\'re covering ' + [zones.strength.length > 0 ? 'strength' : '', zones.size.length > 0 ? 'size' : '', zones.metabolic.length > 0 ? 'metabolic' : ''].filter(Boolean).join(' and ') + ' zones. As your program evolves, naturally spanning all three zones will accelerate recomp.'
          }</p>
        </div>
      </div>`;
  }

  // ── Projection section ────────────────────────────────────────────────────
  function projectionSection(proj, currentWeight, bodyFatPct) {
    const { weekNum, volTrend, weightLost, projectedWeightAt12 } = proj;
    const weeksLeft = 12 - weekNum;

    // Recomp window check
    const inRecompWindow = bodyFatPct >= 18 || (currentWeight && currentWeight > 160);

    const milestones = [
      { weeks: '1–2',  heading: 'Neural adaptation',       body: 'Strength climbs rapidly. Your nervous system is learning the movement patterns. Weight on the bar will increase faster than actual muscle is built — that\'s normal and expected.' },
      { weeks: '3–5',  heading: 'Fat loss begins',         body: 'With consistent caloric deficit and high step count, waist measurements start dropping. Strength keeps rising. This is the phase where the scale might not move much, but your clothes fit differently.' },
      { weeks: '6–8',  heading: 'Muscle memory kicks in',  body: 'If you\'ve trained before, this is where prior muscle returns fast. Chest, shoulders, and arms fill out noticeably. People may comment.' },
      { weeks: '9–12', heading: 'Visual transformation',   body: 'Fat loss becomes visible in the lower belly, love handles, and jawline. This is where the mirror changes fast. The work from weeks 1–8 becomes obvious.' },
    ];

    const milestoneHTML = milestones.map(m => `
      <div class="milestone-row">
        <div class="milestone-weeks">Weeks ${m.weeks}</div>
        <div class="milestone-body">
          <div class="milestone-heading">${m.heading}</div>
          <div class="milestone-text">${m.body}</div>
        </div>
      </div>`).join('');

    const projBox = projectedWeightAt12 ? `
      <div class="projection-box">
        <div class="proj-row">
          <span class="proj-label">Current</span>
          <span class="proj-value">${currentWeight} lbs</span>
        </div>
        <div class="proj-arrow">↓</div>
        <div class="proj-row proj-target">
          <span class="proj-label">Week 12 estimate</span>
          <span class="proj-value">${projectedWeightAt12}–${(projectedWeightAt12 + 3).toFixed(1)} lbs</span>
        </div>
        ${bodyFatPct ? `
        <div class="proj-row" style="margin-top:8px">
          <span class="proj-label">Estimated body fat</span>
          <span class="proj-value">${Math.max(15, Math.round(bodyFatPct - (weekNum * 0.4)))}–${Math.max(16, Math.round(bodyFatPct - (weekNum * 0.3)))}%</span>
        </div>` : ''}
      </div>` : '';

    return `
      <div class="narrative-section">
        <div class="narrative-number">4</div>
        <div class="narrative-body">
          <div class="narrative-heading">What Your Next ${weeksLeft > 0 ? weeksLeft + ' Weeks' : '12 Weeks'} Will Probably Look Like</div>
          ${inRecompWindow ? `<p class="narrative-text" style="margin-bottom:16px">Because of your daily step count, 4-day training split, and current body composition, you\'re in the recomposition window — where fat loss and muscle gain happen simultaneously. This is rare after the beginner phase and won\'t last forever. Take advantage of it now.</p>` : ''}
          ${milestoneHTML}
          ${projBox}
        </div>
      </div>`;
  }

  // ── Signal section ────────────────────────────────────────────────────────
  function signalSection(sessionCount, avgDropoff) {
    const isEarlyWeeks = sessionCount <= 8;
    const goodDropoff  = avgDropoff >= 30 && avgDropoff <= 60;

    return `
      <div class="narrative-section narrative-section-final">
        <div class="narrative-number">5</div>
        <div class="narrative-body">
          <div class="narrative-heading">The Signal That Matters Most</div>
          <p class="narrative-text">
            ${isEarlyWeeks
              ? `You're ${sessionCount} session${sessionCount !== 1 ? 's' : ''} in. Most people quit around session 8–12. If you simply stay consistent through week 8, results become dramatic and self-reinforcing — the hard part isn't the workouts, it's showing up for the next one.`
              : `${sessionCount} sessions logged. You're past the point where most people stop. The data is starting to mean something — trends are visible, your body has adapted to the training stimulus, and the work you've put in is compounding.`
            }
          </p>
          ${goodDropoff
            ? `<p class="narrative-text">Your average drop-off of <strong>${Math.round(avgDropoff)}%</strong> shows you're training close enough to failure to stimulate growth without destroying recovery. That's the single hardest thing to calibrate, and you're in the right zone.</p>`
            : ''}
          <div class="signal-callout">
            The most important session is always the next one.
          </div>
        </div>
      </div>`;
  }

  // ── Main render ───────────────────────────────────────────────────────────
  async function render(targetSessionId = null) {
    const container = document.getElementById('analysis-content');
    container.innerHTML = `<div class="empty-state"><div class="empty-title">Loading…</div></div>`;

    // Load session list and body metrics
    const allSessions = await window.api.sessions.list(50);
    const bodyMetrics = await window.api.metrics.list(30);

    if (!allSessions.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">No sessions yet</div>
          <p>Log your first workout, then come back here for a full breakdown.</p>
          <br><button class="btn primary" data-nav="log">Log a Workout</button>
        </div>`;
      return;
    }

    // Session picker
    const sessionId = targetSessionId || allSessions[0].id;
    const { session, stats, sets } = await window.api.sessions.get(sessionId);

    if (!sets.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-title">No sets found for this session.</div></div>`;
      return;
    }

    // Update topbar meta
    const d = new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US',
      { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    document.getElementById('analysis-meta').textContent = `${session.label || session.session_type} · ${d}`;

    // Group sets by exercise
    const byEx = {};
    sets.forEach(s => {
      if (!byEx[s.exercise_id]) byEx[s.exercise_id] = { name: s.exercise_name, sets: [] };
      byEx[s.exercise_id].sets.push(s);
    });

    const totalVolume = sets.reduce((sum, s) => sum + s.reps * s.weight_lbs, 0);
    const avgDropoff  = stats && stats.avg_dropoff_pct != null ? stats.avg_dropoff_pct : null;
    const currentBodyMetric = bodyMetrics[0] || null;
    const proj = buildProjection(allSessions, bodyMetrics);

    // Session picker HTML
    const pickerOptions = allSessions.map(s => {
      const label = s.label || s.session_type;
      const dt = new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<option value="${s.id}" ${s.id === sessionId ? 'selected' : ''}>${dt} · ${label}</option>`;
    }).join('');

    // ── Assemble full narrative ──────────────────────────────────────────
    let html = `
      <div class="analysis-picker-row">
        <label style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-3)">Session</label>
        <select id="session-picker" style="font-size:13px;width:280px" onchange="AnalysisPage.loadSession(this.value)">
          ${pickerOptions}
        </select>
      </div>

      <div class="narrative-container">

        <!-- ── Section 1: Strength-Endurance ── -->
        <div class="narrative-section">
          <div class="narrative-number">1</div>
          <div class="narrative-body">
            <div class="narrative-heading">Your Strength-Endurance Ratio</div>
            ${Object.values(byEx).map(ex => exerciseBlock(ex.name, ex.sets)).join('')}
            ${avgDropoff !== null ? `
            <p class="narrative-text" style="margin-top:16px">
              Session average drop-off: <strong>${Math.round(avgDropoff)}%</strong> —
              ${avgDropoff < 30 ? 'You have more in the tank. Push closer to failure on your last 1–2 sets.'
                : avgDropoff <= 60 ? 'Right in the sweet spot. You\'re training hard enough to stimulate growth without tanking recovery.'
                : 'High fatigue across the session. Prioritize rest periods and make sure you\'re eating enough protein post-workout.'}
            </p>` : ''}
          </div>
        </div>

        <!-- ── Section 2: Volume ── -->
        ${volumeSection(totalVolume, session.session_type)}

        <!-- ── Section 3: Rep Zones ── -->
        ${repZoneSection(sets)}

        <!-- ── Section 4: Projection ── -->
        ${projectionSection(
          proj,
          currentBodyMetric ? currentBodyMetric.weight_lbs : null,
          currentBodyMetric ? currentBodyMetric.body_fat_pct : null
        )}

        <!-- ── Section 5: Signal ── -->
        ${signalSection(allSessions.length, avgDropoff || 0)}

      </div>`;

    container.innerHTML = html;
  }

  function loadSession(id) {
    render(parseInt(id));
  }

  // Called by log.js before Router.go('analysis') to target a specific session
  let _pendingSessionId = null;
  function setSession(id) { _pendingSessionId = id; }

  Router.register('analysis', () => {
    const id = _pendingSessionId;
    _pendingSessionId = null;
    render(id || null);
  });

  return { render, loadSession, setSession };
})();
