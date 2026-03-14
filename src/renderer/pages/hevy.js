// IronLog · Hevy Sync Page

const HevyPage = (() => {

  let apiKey = '';

  // ── Boot — start webhook if key is saved ──────────────────────────────────
  async function boot() {
    const saved = await window.api.hevy.loadApiKey();
    if (saved.apiKey) {
      apiKey = saved.apiKey;
      await window.api.hevy.setApiKey(saved.apiKey, saved.webhookSecret || '');
    }
    // Silently backfill stats for any imported sessions missing analytics
    window.api.hevy.backfillStats().catch(() => {});
    window.api.hevy.onWorkoutImported(result => {
      onImportReceived(result);
    });
  }

  function onImportReceived(result) {
    // Flash notification banner
    const banner = document.getElementById('hevy-live-banner');
    if (banner) {
      banner.style.display = 'flex';
      banner.querySelector('.hevy-banner-text').textContent =
        result.duplicate
          ? `Duplicate — session already exists`
          : `Imported "${result.skipped?.length ? result.skipped.length + ' exercises skipped' : 'all exercises matched'}"`;
      setTimeout(() => { banner.style.display = 'none'; }, 6000);
    }
    // If we're on the hevy page, refresh the log
    if (document.getElementById('hevy-content')?.innerHTML) {
      refreshLog();
    }
    // Navigate to analysis for the new session
    if (!result.duplicate && result.sessionId) {
      setTimeout(() => {
        AnalysisPage.setSession(result.sessionId);
        Router.go('analysis');
      }, 1500);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  async function render() {
    const container = document.getElementById('hevy-content');
    container.innerHTML = `<div class="empty-state"><div class="empty-title">Loading…</div></div>`;

    const saved = await window.api.hevy.loadApiKey();
    apiKey = saved.apiKey || '';
    const webhookSecret = saved.webhookSecret || '';
    const status = await window.api.hevy.getStatus();
    const importLog = await window.api.hevy.importLog();

    container.innerHTML = buildPage(apiKey, webhookSecret, status, importLog);
    bindEvents();
  }

  function buildPage(key, secret, status, importLog) {
    const masked = key ? key.slice(0, 8) + '…' + key.slice(-4) : '';

    const logRows = importLog.map(row => {
      const skipped  = tryParse(row.skipped_exercises, []);
      const matchLog = tryParse(row.match_log, []);
      const hasError = !!row.error;
      const date     = row.imported_at ? row.imported_at.slice(0, 16).replace('T', ' ') : '—';

      return `
        <tr>
          <td style="font-family:var(--mono);font-size:11px;color:var(--text-3)">${date}</td>
          <td style="font-weight:500;font-size:13px">${row.workout_title || '—'}</td>
          <td style="font-family:var(--mono)">${row.session_date || '—'}</td>
          <td style="font-family:var(--mono)">${hasError ? '—' : row.sets_imported}</td>
          <td>
            ${hasError
              ? `<span class="tag tag-red">Error</span>`
              : skipped.length > 0
                ? `<span class="tag tag-amber">${skipped.length} skipped</span>`
                : `<span class="tag tag-green">Clean</span>`
            }
          </td>
          <td style="font-size:11px;color:var(--text-3);max-width:200px">
            ${hasError
              ? `<span style="color:var(--red)">${row.error}</span>`
              : skipped.length > 0
                ? `Skipped: ${skipped.join(', ')}`
                : matchLog.length + ' exercises matched'
            }
          </td>
        </tr>`;
    }).join('');

    return `
      <!-- Live banner (hidden by default) -->
      <div id="hevy-live-banner" style="display:none;background:var(--green-light);border:1px solid var(--green-mid);border-radius:var(--radius);padding:10px 16px;align-items:center;justify-content:space-between;gap:12px;margin-bottom:0">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:12px;font-weight:500;color:var(--green)">Hevy workout imported</span>
          <span class="hevy-banner-text" style="font-size:12px;color:var(--text-2)"></span>
        </div>
        <span style="font-size:11px;color:var(--text-3)">Opening analysis…</span>
      </div>

      <!-- API Key setup -->
      <div class="form-card">
        <div class="section-label">Hevy API key &amp; webhook secret</div>
        <div class="form-row" style="align-items:flex-end">
          <div class="form-group grow">
            <label>API key</label>
            <input type="password" id="hevy-api-key"
              value="${key}"
              placeholder="Paste your key from hevy.com/settings?developer"
              style="font-family:var(--mono);font-size:13px">
          </div>
          <button class="btn primary" id="hevy-save-key-btn">Save &amp; Connect</button>
          <button class="btn" id="hevy-test-btn">Test</button>
        </div>
        <div class="form-row" style="align-items:flex-end;margin-top:4px">
          <div class="form-group grow">
            <label>Webhook authorization header</label>
            <input type="text" id="hevy-webhook-secret"
              value="${secret}"
              placeholder="e.g. ironlog-hevy-secret-2026 — must match what you set in Hevy"
              style="font-family:var(--mono);font-size:13px">
          </div>
        </div>
        <div style="font-size:11px;color:var(--text-3);margin-top:4px">
          Set the same value in Hevy → Settings → Developer → Webhooks → Authorization header
        </div>
        <div id="hevy-key-msg" style="font-size:12px;margin-top:6px"></div>
      </div>

      <!-- Webhook server status -->
      <div class="form-card" style="background:var(--surface-2)">
        <div class="section-label">Webhook receiver</div>
        <div class="metric-row cols-3">
          <div class="metric-card">
            <div class="metric-label">Server status</div>
            <div class="metric-value" id="hevy-server-status" style="font-size:18px">
              ${status.running ? 'Running' : 'Stopped'}
            </div>
            <div class="metric-unit">${status.running ? 'Port ' + status.port : 'No API key set'}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Webhook URL</div>
            <div style="font-family:var(--mono);font-size:12px;color:var(--text-2);margin-top:6px;line-height:1.5">
              Your Cloudflare Tunnel URL<br>
              <span style="color:var(--text-3)">+ /webhook</span>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Sessions imported</div>
            <div class="metric-value">${importLog.filter(r => !r.error).length}</div>
            <div class="metric-unit">all time</div>
          </div>
        </div>
      </div>

      <!-- Import section -->
      <div class="form-card">
        <div class="section-label">Import workouts</div>

        <!-- Quick actions -->
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
          <button class="btn" id="hevy-import-latest-btn">Import latest</button>
          <button class="btn" id="hevy-import-all-btn">Import all history</button>
          <button class="btn" id="hevy-browse-btn">Browse &amp; pick</button>
          <button class="btn" id="hevy-clear-log-btn" style="margin-left:auto;font-size:11px;color:var(--text-3)">Clear import log</button>
          <span id="hevy-import-msg" style="font-size:12px;color:var(--text-3)"></span>
        </div>

        <!-- Bulk import progress (hidden until running) -->
        <div id="hevy-bulk-progress" style="display:none">
          <div style="font-size:12px;color:var(--text-2);margin-bottom:6px" id="hevy-bulk-label">Importing…</div>
          <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:8px">
            <div id="hevy-bulk-bar" style="height:100%;background:var(--green);border-radius:3px;width:0%;transition:width 0.3s"></div>
          </div>
          <div style="display:flex;gap:16px;font-size:11px;font-family:var(--mono);color:var(--text-3)">
            <span>Imported: <span id="hevy-bulk-imported" style="color:var(--green)">0</span></span>
            <span>Duplicates: <span id="hevy-bulk-dupes">0</span></span>
            <span>Errors: <span id="hevy-bulk-errors" style="color:var(--red)">0</span></span>
          </div>
        </div>

        <!-- Workout history browser (hidden until Browse clicked) -->
        <div id="hevy-browser" style="display:none;margin-top:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-3)">
              Hevy workout history
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <button class="btn" style="font-size:11px;padding:4px 10px" id="hevy-prev-btn">← Prev</button>
              <span id="hevy-page-label" style="font-size:12px;color:var(--text-3)"></span>
              <button class="btn" style="font-size:11px;padding:4px 10px" id="hevy-next-btn">Next →</button>
            </div>
          </div>
          <div id="hevy-browser-list"></div>
        </div>
      </div>

      <!-- Cloudflare setup guide -->
      <div class="form-card">
        <div class="section-label">Cloudflare Tunnel setup — one time</div>
        <div style="display:flex;flex-direction:column;gap:14px">

          <div class="hevy-step">
            <div class="hevy-step-num">1</div>
            <div class="hevy-step-body">
              <div class="hevy-step-title">Install cloudflared</div>
              <div class="hevy-step-text">Download the Windows installer from
                <span style="font-family:var(--mono);font-size:11px;background:var(--bg);padding:1px 5px;border-radius:3px;border:1px solid var(--border)">developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads</span>
                — or install via winget:
              </div>
              <div class="hevy-code">winget install Cloudflare.cloudflared</div>
            </div>
          </div>

          <div class="hevy-step">
            <div class="hevy-step-num">2</div>
            <div class="hevy-step-body">
              <div class="hevy-step-title">Start a tunnel to IronLog's webhook port</div>
              <div class="hevy-step-text">Run this in a terminal whenever IronLog is open:</div>
              <div class="hevy-code">cloudflared tunnel --url http://127.0.0.1:3001</div>
              <div class="hevy-step-text" style="margin-top:6px">Cloudflare will print a URL like
                <span style="font-family:var(--mono);font-size:11px">https://random-words-here.trycloudflare.com</span>
                — copy it.
              </div>
            </div>
          </div>

          <div class="hevy-step">
            <div class="hevy-step-num">3</div>
            <div class="hevy-step-body">
              <div class="hevy-step-title">Set the webhook URL in Hevy</div>
              <div class="hevy-step-text">Go to
                <span style="font-family:var(--mono);font-size:11px">hevy.com/settings?developer</span>
                → Webhooks → paste your tunnel URL with <span style="font-family:var(--mono);font-size:11px">/webhook</span> appended:
              </div>
              <div class="hevy-code">https://random-words-here.trycloudflare.com/webhook</div>
            </div>
          </div>

          <div class="hevy-step">
            <div class="hevy-step-num">4</div>
            <div class="hevy-step-body">
              <div class="hevy-step-title">Get a permanent URL (optional but recommended)</div>
              <div class="hevy-step-text">The free tunnel URL changes every session. For a permanent URL, create a free Cloudflare account and run:</div>
              <div class="hevy-code">cloudflared tunnel login
cloudflared tunnel create ironlog
cloudflared tunnel route dns ironlog ironlog.yourdomain.com
cloudflared tunnel run ironlog</div>
              <div class="hevy-step-text" style="margin-top:6px">Then set your webhook to <span style="font-family:var(--mono);font-size:11px">https://ironlog.yourdomain.com/webhook</span> once and never touch it again.</div>
            </div>
          </div>

          <div class="hevy-step">
            <div class="hevy-step-num">5</div>
            <div class="hevy-step-body">
              <div class="hevy-step-title">Test it</div>
              <div class="hevy-step-text">Save a workout in Hevy on your phone. IronLog will automatically import it and open the session analysis. Or click "Import latest workout" above to test immediately.</div>
            </div>
          </div>

        </div>
      </div>

      <!-- Import log -->
      ${importLog.length > 0 ? `
      <div>
        <div class="section-label">Import log</div>
        <div class="form-card" style="padding:0;overflow:hidden">
          <table class="set-table" style="width:100%">
            <thead>
              <tr>
                <th>Time</th><th>Workout</th><th>Date</th>
                <th>Sets</th><th>Status</th><th>Notes</th>
              </tr>
            </thead>
            <tbody id="hevy-log-tbody">${logRows}</tbody>
          </table>
        </div>
      </div>` : `
      <div class="empty-state" style="padding:32px">
        <div class="empty-title">No imports yet</div>
        <p>Once set up, every Hevy workout will appear here automatically.</p>
      </div>`}`;
  }

  function tryParse(str, fallback) {
    try { return JSON.parse(str) || fallback; }
    catch { return fallback; }
  }

  // ── Events ────────────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('hevy-save-key-btn')?.addEventListener('click', async () => {
      const key    = document.getElementById('hevy-api-key').value.trim();
      const secret = document.getElementById('hevy-webhook-secret').value.trim();
      const msg    = document.getElementById('hevy-key-msg');
      if (!key) { msg.textContent = 'Paste your API key first.'; msg.style.color = 'var(--red)'; return; }

      msg.textContent = 'Testing connection…'; msg.style.color = 'var(--text-3)';
      const test = await window.api.hevy.testConnection(key);

      if (!test.ok) {
        msg.textContent = 'Connection failed: ' + test.error;
        msg.style.color = 'var(--red)';
        return;
      }

      apiKey = key;
      await window.api.hevy.saveApiKey(key, secret);
      await window.api.hevy.setApiKey(key, secret);

      const name = test.user?.name || 'connected';
      const secretNote = secret ? ' · webhook secret set' : ' · no webhook secret (add one)';
      msg.textContent = `Connected as ${name} ✓ — webhook server started on port 3001${secretNote}`;
      msg.style.color = 'var(--green)';

      const statusEl = document.getElementById('hevy-server-status');
      if (statusEl) statusEl.textContent = 'Running';
    });

    document.getElementById('hevy-test-btn')?.addEventListener('click', async () => {
      const key = document.getElementById('hevy-api-key').value.trim();
      const msg = document.getElementById('hevy-key-msg');
      if (!key) { msg.textContent = 'Enter an API key first.'; msg.style.color = 'var(--red)'; return; }
      msg.textContent = 'Testing…'; msg.style.color = 'var(--text-3)';
      const test = await window.api.hevy.testConnection(key);
      if (test.ok) {
        msg.textContent = `API key valid — account: ${test.user?.name || 'unknown'}`;
        msg.style.color = 'var(--green)';
      } else {
        msg.textContent = 'Failed: ' + test.error;
        msg.style.color = 'var(--red)';
      }
    });

    document.getElementById('hevy-import-latest-btn')?.addEventListener('click', async () => {
      const msg = document.getElementById('hevy-import-msg');
      const key = apiKey || document.getElementById('hevy-api-key').value.trim();
      if (!key) { msg.textContent = 'Save your API key first.'; return; }

      msg.textContent = 'Fetching…';
      const result = await window.api.hevy.importLatest(key);

      if (!result.ok) {
        msg.textContent = 'Error: ' + result.error;
        return;
      }

      if (result.duplicate) {
        msg.textContent = 'Already imported — no duplicates created.';
      } else {
        msg.textContent = `Imported. Opening analysis…`;
        await refreshLog();
        setTimeout(() => {
          AnalysisPage.setSession(result.sessionId);
          Router.go('analysis');
        }, 800);
      }
    });

    document.getElementById('hevy-clear-log-btn')?.addEventListener('click', async () => {
      if (!confirm('Clear the import log? This lets you re-import workouts that were previously imported. It does NOT delete any session data from IronLog.')) return;
      await window.api.hevy.clearImportLog();
      const msg = document.getElementById('hevy-import-msg');
      msg.textContent = 'Import log cleared — you can now re-import any workout.';
      msg.style.color = 'var(--green)';
      // Reload browser if open
      const browser = document.getElementById('hevy-browser');
      if (browser && browser.style.display !== 'none') {
        loadBrowserPage(1);
      }
      setTimeout(() => { msg.textContent = ''; }, 4000);
    });

    // ── Import all history ──────────────────────────────────────────────────
    document.getElementById('hevy-import-all-btn')?.addEventListener('click', async () => {
      const key = apiKey || document.getElementById('hevy-api-key').value.trim();
      if (!key) { document.getElementById('hevy-import-msg').textContent = 'Save your API key first.'; return; }

      if (!confirm('This will import your entire Hevy workout history. Duplicates will be skipped automatically. Continue?')) return;

      const progressEl = document.getElementById('hevy-bulk-progress');
      const barEl      = document.getElementById('hevy-bulk-bar');
      const labelEl    = document.getElementById('hevy-bulk-label');
      const importedEl = document.getElementById('hevy-bulk-imported');
      const dupesEl    = document.getElementById('hevy-bulk-dupes');
      const errorsEl   = document.getElementById('hevy-bulk-errors');

      progressEl.style.display = 'block';
      document.getElementById('hevy-import-all-btn').disabled = true;

      // Listen for progress events
      window.api.hevy.onBulkProgress(data => {
        if (data.phase === 'start') {
          labelEl.textContent = `Importing ${data.total} workouts…`;
        } else if (data.phase === 'progress') {
          const pct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
          barEl.style.width = pct + '%';
          labelEl.textContent = `${data.done} / ${data.total} — "${data.latest}"`;
          importedEl.textContent = data.imported;
          dupesEl.textContent    = data.dupes;
          errorsEl.textContent   = data.errors;
        } else if (data.phase === 'done') {
          barEl.style.width = '100%';
          labelEl.textContent = `Done — ${data.imported} imported, ${data.dupes} duplicates skipped, ${data.errors} errors`;
          document.getElementById('hevy-import-all-btn').disabled = false;
          refreshLog();
        }
      });

      await window.api.hevy.importAll(key);
    });

    // ── Browse & pick ───────────────────────────────────────────────────────
    let browserPage = 1;
    let browserPageCount = 1;

    async function loadBrowserPage(page) {
      const key = apiKey || document.getElementById('hevy-api-key').value.trim();
      if (!key) return;

      const listEl = document.getElementById('hevy-browser-list');
      const pageLabel = document.getElementById('hevy-page-label');
      listEl.innerHTML = `<div class="muted text-sm" style="padding:12px 0">Loading…</div>`;

      const result = await window.api.hevy.listWorkouts(key, page, 10);
      console.log('[hevy browser] result:', result);
      if (!result.ok) {
        listEl.innerHTML = `<div style="color:var(--red);font-size:12px">${result.error}</div>`;
        return;
      }

      browserPage      = result.page || page;
      browserPageCount = result.page_count || 1;
      pageLabel.textContent = `Page ${browserPage} of ${browserPageCount}`;

      document.getElementById('hevy-prev-btn').disabled = browserPage <= 1;
      document.getElementById('hevy-next-btn').disabled = browserPage >= browserPageCount;

      if (!result.workouts.length) {
        listEl.innerHTML = `<div class="muted text-sm" style="padding:12px 0">No workouts found.</div>`;
        return;
      }

      listEl.innerHTML = result.workouts.map(w => {
        const date = (w.start_time || w.created_at || '').slice(0, 10);
        const sets = (w.exercises || []).reduce((s, e) => s + (e.sets || []).length, 0);
        return `
          <div class="hevy-browser-row" data-id="${w.id}">
            <div class="hevy-browser-meta">
              <span class="hevy-browser-title">${w.title || 'Untitled'}</span>
              <span class="hevy-browser-date">${date}</span>
              <span class="muted text-sm">${(w.exercises || []).length} exercises · ${sets} sets</span>
            </div>
            <button class="btn ${w.already_imported ? '' : 'primary'}"
              style="font-size:11px;padding:4px 12px;flex-shrink:0"
              data-action="import-one" data-id="${w.id}"
              ${w.already_imported ? 'disabled' : ''}>
              ${w.already_imported ? 'Imported ✓' : 'Import'}
            </button>
          </div>`;
      }).join('');

      // Delegate import button clicks
      listEl.addEventListener('click', async e => {
        const btn = e.target.closest('[data-action="import-one"]');
        if (!btn || btn.disabled) return;
        const wId = btn.dataset.id;
        const key = apiKey;
        btn.textContent = 'Importing…';
        btn.disabled    = true;
        const result = await window.api.hevy.importById(key, wId);
        if (result.ok && !result.duplicate) {
          btn.textContent = 'Imported ✓';
          btn.classList.remove('primary');
          refreshLog();
        } else if (result.duplicate) {
          btn.textContent = 'Imported ✓';
          btn.classList.remove('primary');
        } else {
          btn.textContent = 'Error';
          btn.style.color = 'var(--red)';
          btn.disabled    = false;
        }
      });
    }

    document.getElementById('hevy-browse-btn')?.addEventListener('click', () => {
      const browser = document.getElementById('hevy-browser');
      if (browser.style.display === 'none') {
        browser.style.display = 'block';
        loadBrowserPage(1);
      } else {
        browser.style.display = 'none';
      }
    });

    document.getElementById('hevy-prev-btn')?.addEventListener('click', () => {
      if (browserPage > 1) loadBrowserPage(browserPage - 1);
    });

    document.getElementById('hevy-next-btn')?.addEventListener('click', () => {
      if (browserPage < browserPageCount) loadBrowserPage(browserPage + 1);
    });
  }

  async function refreshLog() {
    const importLog = await window.api.hevy.importLog();
    const tbody = document.getElementById('hevy-log-tbody');
    if (!tbody) return;

    const rows = importLog.map(row => {
      const skipped  = (() => { try { return JSON.parse(row.skipped_exercises) || []; } catch { return []; } })();
      const matchLog = (() => { try { return JSON.parse(row.match_log) || []; } catch { return []; } })();
      const hasError = !!row.error;
      const date     = row.imported_at ? row.imported_at.slice(0, 16).replace('T', ' ') : '—';
      return `
        <tr>
          <td style="font-family:var(--mono);font-size:11px;color:var(--text-3)">${date}</td>
          <td style="font-weight:500;font-size:13px">${row.workout_title || '—'}</td>
          <td style="font-family:var(--mono)">${row.session_date || '—'}</td>
          <td style="font-family:var(--mono)">${hasError ? '—' : row.sets_imported}</td>
          <td>${hasError ? '<span class="tag tag-red">Error</span>' : skipped.length > 0 ? `<span class="tag tag-amber">${skipped.length} skipped</span>` : '<span class="tag tag-green">Clean</span>'}</td>
          <td style="font-size:11px;color:var(--text-3)">${hasError ? `<span style="color:var(--red)">${row.error}</span>` : skipped.length > 0 ? 'Skipped: ' + skipped.join(', ') : matchLog.length + ' matched'}</td>
        </tr>`;
    }).join('');
    tbody.innerHTML = rows;
  }

  Router.register('hevy', render);
  return { render, boot };
})();
