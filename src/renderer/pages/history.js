// IronLog · Session History Page

const HistoryPage = (() => {

  async function render() {
    const sessions  = await window.api.sessions.list(50);
    const container = document.getElementById('history-content');

    if (sessions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">No sessions logged yet</div>
          <p>Your workout history will appear here.</p>
          <br>
          <button class="btn primary" data-action="go-log">Log First Workout</button>
        </div>`;
      bindDelegation(container);
      return;
    }

    function volTag(v) {
      if (!v) return '';
      if (v < 5000)   return `<span class="tag tag-amber">Maintenance</span>`;
      if (v < 7000)   return `<span class="tag tag-blue">Slow growth</span>`;
      if (v <= 12000) return `<span class="tag tag-green">Ideal</span>`;
      return `<span class="tag tag-red">High</span>`;
    }

    const rows = sessions.map(s => {
      const d = new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US',
        { weekday:'short', month:'short', day:'numeric' });
      return `
        <tr style="cursor:pointer" data-action="view-session" data-id="${s.id}">
          <td style="font-family:var(--mono);font-size:12px;color:var(--text-2)">${d}</td>
          <td style="font-weight:500">${s.label || s.session_type}</td>
          <td><span class="tag tag-${s.session_type === 'push' ? 'green' : s.session_type === 'pull' ? 'blue' : 'amber'}">${s.session_type}</span></td>
          <td style="font-family:var(--mono)">${s.total_volume_lbs ? Math.round(s.total_volume_lbs).toLocaleString() + ' lbs' : '—'}</td>
          <td>${volTag(s.total_volume_lbs)}</td>
          <td style="font-family:var(--mono)">${s.avg_dropoff_pct != null ? Math.round(s.avg_dropoff_pct) + '%' : '—'}</td>
          <td style="color:var(--text-3)">${s.exercise_count || '—'} exercises</td>
          <td>
            <button class="del-btn" data-action="delete-session" data-id="${s.id}">✕</button>
          </td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="form-card" style="padding:0;overflow:hidden">
        <table class="set-table" style="width:100%">
          <thead>
            <tr>
              <th>Date</th><th>Label</th><th>Type</th><th>Volume</th>
              <th>Zone</th><th>Drop-off</th><th>Exercises</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="session-detail"></div>`;

    bindDelegation(container);
  }

  function bindDelegation(container) {
    container.addEventListener('click', async e => {
      // Delete session button
      const delBtn = e.target.closest('[data-action="delete-session"]');
      if (delBtn) {
        e.stopPropagation();
        const id = parseInt(delBtn.dataset.id);
        if (!confirm('Delete this session? This cannot be undone.')) return;
        await window.api.sessions.delete(id);
        render();
        return;
      }

      // Log first workout button
      const logBtn = e.target.closest('[data-action="go-log"]');
      if (logBtn) { Router.go('log'); return; }

      // Close detail panel
      const closeBtn = e.target.closest('[data-action="close-detail"]');
      if (closeBtn) {
        const detail = document.getElementById('session-detail');
        if (detail) detail.innerHTML = '';
        return;
      }

      // Row click — view session
      const row = e.target.closest('tr[data-action="view-session"]');
      if (row) {
        viewSession(parseInt(row.dataset.id));
        return;
      }
    });
  }

  async function viewSession(id) {
    const { session, stats, sets } = await window.api.sessions.get(id);
    const detail = document.getElementById('session-detail');
    if (!detail) return;

    const byEx = {};
    sets.forEach(s => {
      if (!byEx[s.exercise_id]) byEx[s.exercise_id] = { name: s.exercise_name, sets: [] };
      byEx[s.exercise_id].sets.push(s);
    });

    const exBlocks = Object.values(byEx).map(ex => {
      const setRows = ex.sets.map(s => `
        <tr>
          <td style="color:var(--text-3);font-family:var(--mono)">${s.set_number}</td>
          <td style="font-family:var(--mono)">${s.weight_lbs} lbs</td>
          <td style="font-family:var(--mono)">${s.reps} reps</td>
          <td style="font-family:var(--mono);color:var(--text-3)">${s.rpe ? 'RPE ' + s.rpe : '—'}</td>
          <td style="font-family:var(--mono);color:var(--green)">${Math.round(s.weight_lbs * s.reps).toLocaleString()} lbs</td>
        </tr>`).join('');

      const first = ex.sets[0]?.reps;
      const last  = ex.sets[ex.sets.length - 1]?.reps;
      const drop  = first && last && first > 0 ? Math.round(((first - last) / first) * 100) : null;

      return `
        <div style="margin-bottom:16px">
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px">
            <span style="font-family:var(--mono);font-size:13px;font-weight:500">${ex.name}</span>
            ${drop != null ? `<span class="tag ${drop <= 30 ? 'tag-amber' : drop <= 60 ? 'tag-green' : 'tag-red'}">Drop-off ${drop}%</span>` : ''}
          </div>
          <table class="set-table">
            <thead><tr><th>Set</th><th>Weight</th><th>Reps</th><th>RPE</th><th>Volume</th></tr></thead>
            <tbody>${setRows}</tbody>
          </table>
        </div>`;
    }).join('');

    const d = new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US',
      { weekday:'long', month:'long', day:'numeric', year:'numeric' });

    detail.innerHTML = `
      <div class="form-card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px">
          <div>
            <div style="font-family:var(--mono);font-size:15px;font-weight:500">${session.label || session.session_type}</div>
            <div style="font-size:12px;color:var(--text-3)">${d}</div>
          </div>
          <button class="btn" data-action="close-detail">Close</button>
        </div>
        ${stats ? `
        <div class="analysis-grid cols-3" style="margin-bottom:20px">
          <div class="analysis-cell">
            <div class="cell-label">Total Volume</div>
            <div class="cell-value">${Math.round(stats.total_volume_lbs || 0).toLocaleString()}</div>
            <div class="cell-sub delta-neutral">lbs</div>
          </div>
          <div class="analysis-cell">
            <div class="cell-label">Avg Drop-off</div>
            <div class="cell-value">${stats.avg_dropoff_pct != null ? Math.round(stats.avg_dropoff_pct) + '%' : '—'}</div>
          </div>
          <div class="analysis-cell">
            <div class="cell-label">Top Set</div>
            <div class="cell-value" style="font-size:13px;line-height:1.4">${stats.top_set_desc || '—'}</div>
          </div>
        </div>` : ''}
        ${exBlocks}
      </div>`;

    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  Router.register('history', render);
  return { render };
})();
