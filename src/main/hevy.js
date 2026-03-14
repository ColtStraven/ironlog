'use strict';

// ─────────────────────────────────────────────────────────────
//  IronLog · Hevy Integration
//  Webhook receiver + Hevy API client + exercise mapper
//  Runs a local HTTP server on port 3001 inside the main process.
// ─────────────────────────────────────────────────────────────

const http = require('http');
const https = require('https');

const HEVY_API_BASE = 'https://api.hevyapp.com';
const WEBHOOK_PORT  = 3001;

let webhookServer = null;
let _ipcMain      = null;
let _win          = null;
let _db_all       = null;
let _db_run       = null;
let _db_get       = null;
let _db_persist   = null;
let _apiKey       = null;
let _webhookSecret = null;
let _computeStats = null;

// ── HTTPS helper ──────────────────────────────────────────────────────────────
function hevyGet(path, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.hevyapp.com',
      path,
      method:  'GET',
      headers: {
        'api-key':    apiKey,
        'Accept':     'application/json',
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Bad JSON from Hevy: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Hevy API ──────────────────────────────────────────────────────────────────
async function fetchWorkout(workoutId, apiKey) {
  const data = await hevyGet(`/v1/workouts/${workoutId}`, apiKey);
  return data.workout || data;
}

async function fetchExerciseTemplates(apiKey) {
  // Fetch first page (500 is max) — enough for template name lookup
  const data = await hevyGet(`/v1/exercise_templates?page=1&pageSize=500`, apiKey);
  return data.exercise_templates || [];
}

// ── kg → lbs ──────────────────────────────────────────────────────────────────
function kgToLbs(kg) {
  if (kg == null) return 0;
  return Math.round(kg * 2.20462 * 4) / 4; // round to nearest 0.25 lb
}

// ── Exercise matcher ──────────────────────────────────────────────────────────
// Fuzzy match Hevy exercise title → IronLog exercise id
// Strategy: exact → lowercase exact → strip punctuation → partial word overlap
function normalise(str) {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function wordOverlap(a, b) {
  const aw = new Set(normalise(a).split(' '));
  const bw = new Set(normalise(b).split(' '));
  let shared = 0;
  aw.forEach(w => { if (bw.has(w)) shared++; });
  return shared / Math.max(aw.size, bw.size);
}

function matchExercise(hevyTitle, ironlogExercises) {
  const target = normalise(hevyTitle);

  // 1. Exact match (case-insensitive)
  for (const ex of ironlogExercises) {
    if (normalise(ex.name) === target) return { ex, confidence: 1.0 };
  }

  // 2. Best word overlap ≥ 0.6
  let best = null, bestScore = 0;
  for (const ex of ironlogExercises) {
    const score = wordOverlap(hevyTitle, ex.name);
    if (score > bestScore) { bestScore = score; best = ex; }
  }
  if (bestScore >= 0.6) return { ex: best, confidence: bestScore };

  return null;
}

// ── Import a workout ──────────────────────────────────────────────────────────
async function importWorkout(workoutId, apiKey) {
  const logLines = [];
  const log = msg => { logLines.push(msg); console.log('[hevy]', msg); };

  log(`Fetching workout ${workoutId}…`);
  const workout = await fetchWorkout(workoutId, apiKey);

  if (!workout || !workout.id) {
    throw new Error('Workout not found or API error');
  }

  log(`Got workout: "${workout.title}" (${workout.start_time})`);

  // Parse date
  const sessionDate = (workout.start_time || workout.created_at || '').slice(0, 10);
  if (!sessionDate) throw new Error('No date on workout');

  // Duration in minutes
  let durationMin = null;
  if (workout.start_time && workout.end_time) {
    const ms = new Date(workout.end_time) - new Date(workout.start_time);
    durationMin = Math.round(ms / 60000);
  }

  // Determine session type from title
  const titleLower = (workout.title || '').toLowerCase();
  let sessionType = 'other';
  if (titleLower.includes('push'))  sessionType = 'push';
  else if (titleLower.includes('pull')) sessionType = 'pull';
  else if (titleLower.includes('leg') || titleLower.includes('squat')) sessionType = 'legs';
  else if (titleLower.includes('chest') || titleLower.includes('bench')) sessionType = 'push';
  else if (titleLower.includes('back') || titleLower.includes('row') || titleLower.includes('pull')) sessionType = 'pull';
  else if (titleLower.includes('cardio') || titleLower.includes('run')) sessionType = 'cardio';
  else if (titleLower.includes('full') || titleLower.includes('total')) sessionType = 'full';

  // Load IronLog exercise library
  const ironlogExercises = _db_all(`SELECT id, name, category, muscle_group FROM exercises ORDER BY name`);
  log(`IronLog library: ${ironlogExercises.length} exercises`);

  // Map Hevy exercises → IronLog exercises
  const mappedSets   = [];
  const skipped      = [];
  const matchLog     = [];

  for (const hevyEx of (workout.exercises || [])) {
    const hevyTitle = hevyEx.title || hevyEx.exercise_template_id || 'Unknown';
    const match = matchExercise(hevyTitle, ironlogExercises);

    if (!match) {
      log(`SKIP: "${hevyTitle}" — no match found`);
      skipped.push(hevyTitle);
      continue;
    }

    log(`MATCH: "${hevyTitle}" → "${match.ex.name}" (${Math.round(match.confidence * 100)}%)`);
    matchLog.push({ hevy: hevyTitle, ironlog: match.ex.name, confidence: match.confidence });

    // Only import weight_reps sets (skip warmup, failure, drop sets if needed)
    const validSets = (hevyEx.sets || []).filter(s =>
      s.reps != null && s.reps > 0 &&
      (s.weight_kg != null || s.reps > 0)
    );

    validSets.forEach((s, idx) => {
      mappedSets.push({
        exercise_id: match.ex.id,
        set_number:  idx + 1,
        reps:        s.reps,
        weight_lbs:  kgToLbs(s.weight_kg),
        rpe:         s.rpe || null,
      });
    });
  }

  if (mappedSets.length === 0) {
    throw new Error(`No sets could be mapped. Skipped: ${skipped.join(', ')}`);
  }

  // Check for duplicate (same date + same title)
  const existing = _db_get(
    `SELECT id FROM sessions WHERE session_date = ? AND label = ?`,
    [sessionDate, workout.title]
  );
  if (existing) {
    log(`Duplicate detected — session already imported (id ${existing.id})`);
    return { sessionId: existing.id, duplicate: true, log: logLines, skipped, matchLog };
  }

  // Insert session
  _db_run(
    `INSERT INTO sessions (session_date, session_type, label, notes, duration_min, avg_hr)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionDate, sessionType, workout.title, workout.description || null, durationMin, null]
  );
  const sessionRow = _db_get(`SELECT id FROM sessions ORDER BY id DESC LIMIT 1`);
  const sessionId  = sessionRow.id;

  // Insert sets
  for (const s of mappedSets) {
    _db_run(
      `INSERT INTO sets (session_id, exercise_id, set_number, reps, weight_lbs, rpe)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, s.exercise_id, s.set_number, s.reps, s.weight_lbs, s.rpe]
    );
  }

  _db_persist();

  // Compute all analytics (drop-off, volume, rep zones, 1RM, etc.)
  if (_computeStats) _computeStats(sessionId);

  // Write import log to DB
  _db_run(
    `INSERT OR REPLACE INTO hevy_import_log
     (workout_id, session_id, workout_title, session_date, sets_imported,
      skipped_exercises, match_log, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      workoutId,
      sessionId,
      workout.title,
      sessionDate,
      mappedSets.length,
      JSON.stringify(skipped),
      JSON.stringify(matchLog),
    ]
  );
  _db_persist();

  log(`Saved session ${sessionId} — ${mappedSets.length} sets, ${skipped.length} exercises skipped`);

  return { sessionId, duplicate: false, log: logLines, skipped, matchLog };
}

// ── Webhook HTTP server ───────────────────────────────────────────────────────
function startWebhookServer(apiKey, webhookSecret, onWorkoutImported) {
  if (webhookServer) {
    webhookServer.close();
    webhookServer = null;
  }

  _apiKey        = apiKey;
  _webhookSecret = webhookSecret || null;

  webhookServer = http.createServer(async (req, res) => {
    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'ironlog-hevy-webhook' }));
      return;
    }

    // Webhook endpoint
    if (req.method === 'POST' && req.url === '/webhook') {
      // Validate authorization header if a secret is configured
      if (_webhookSecret) {
        const authHeader = req.headers['authorization'] || '';
        if (authHeader !== _webhookSecret) {
          console.warn('[hevy] Webhook rejected — authorization header mismatch');
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
      }

      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        // Respond immediately with 200 — Hevy requires < 5 second response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));

        try {
          const payload = JSON.parse(body);
          const workoutId = payload.workoutId;
          if (!workoutId) {
            console.error('[hevy] Webhook received but no workoutId in payload');
            return;
          }

          console.log('[hevy] Webhook received — workoutId:', workoutId);

          const result = await importWorkout(workoutId, _apiKey);

          // Notify renderer
          if (onWorkoutImported) onWorkoutImported(result);

        } catch (err) {
          console.error('[hevy] Import error:', err.message);
          // Log failure to DB
          try {
            _db_run(
              `INSERT OR REPLACE INTO hevy_import_log
               (workout_id, session_id, workout_title, session_date, sets_imported,
                skipped_exercises, match_log, imported_at, error)
               VALUES (?, NULL, 'Import failed', NULL, 0, '[]', '[]', datetime('now'), ?)`,
              [body.slice(0, 100), err.message]
            );
            _db_persist();
          } catch {}
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  webhookServer.listen(WEBHOOK_PORT, '127.0.0.1', () => {
    console.log(`[hevy] Webhook server listening on http://127.0.0.1:${WEBHOOK_PORT}`);
  });

  webhookServer.on('error', err => {
    console.error('[hevy] Webhook server error:', err.message);
  });
}

function stopWebhookServer() {
  if (webhookServer) {
    webhookServer.close();
    webhookServer = null;
    console.log('[hevy] Webhook server stopped');
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
function registerHevyHandlers(ipcMain, win, dbHelpers) {
  _ipcMain      = ipcMain;
  _win          = win;
  _db_all       = dbHelpers.all;
  _db_run       = dbHelpers.run;
  _db_get       = dbHelpers.get;
  _db_persist   = dbHelpers.persist;
  _computeStats = dbHelpers.computeAndCacheStats;

  // Save/load API key from settings
  ipcMain.handle('hevy:set-api-key', (_, { key, secret }) => {
    _apiKey        = key;
    _webhookSecret = secret || null;
    startWebhookServer(key, secret, result => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('hevy:workout-imported', result);
      }
    });
    return { ok: true };
  });

  ipcMain.handle('hevy:get-status', () => ({
    running: webhookServer !== null,
    port: WEBHOOK_PORT,
    hasKey: !!_apiKey,
  }));

  ipcMain.handle('hevy:stop', () => {
    stopWebhookServer();
    return { ok: true };
  });

  ipcMain.handle('hevy:import-log', () => {
    try {
      return _db_all(`SELECT * FROM hevy_import_log ORDER BY imported_at DESC LIMIT 50`);
    } catch { return []; }
  });

  ipcMain.handle('hevy:test-connection', async (_, key) => {
    try {
      const data = await hevyGet('/v1/user/info', key);
      return { ok: true, user: data.data || data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('hevy:import-latest', async (_, key) => {
    try {
      const data = await hevyGet('/v1/workouts?page=1&pageSize=1', key);
      const workouts = data.workouts || [];
      if (!workouts.length) return { ok: false, error: 'No workouts found' };
      const result = await importWorkout(workouts[0].id, key);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Fetch paginated workout list (for the history browser)
  ipcMain.handle('hevy:list-workouts', async (_, { key, page = 1, pageSize = 10 }) => {
    try {
      const safePageSize = Math.min(pageSize, 10); // Hevy API max is 10
      const data = await hevyGet(`/v1/workouts?page=${page}&pageSize=${safePageSize}`, key);
      console.log('[hevy] list-workouts response:', JSON.stringify(data).slice(0, 300));
      // Attach already-imported flag to each workout
      const imported = _db_all(`SELECT workout_id FROM hevy_import_log WHERE error IS NULL`);
      const importedIds = new Set(imported.map(r => r.workout_id));
      const workouts = (data.workouts || []).map(w => ({
        ...w,
        already_imported: importedIds.has(w.id),
      }));
      return { ok: true, workouts, page: data.page, page_count: data.page_count };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Import a specific workout by ID
  ipcMain.handle('hevy:import-by-id', async (_, { key, workoutId }) => {
    try {
      const result = await importWorkout(workoutId, key);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Bulk import all workouts (paginated, streams progress via webContents)
  ipcMain.handle('hevy:import-all', async (_, { key }) => {
    let page = 1;
    let totalImported = 0;
    let totalSkipped  = 0;
    let totalDupe     = 0;
    const errors      = [];

    try {
      // Get total count first
      const countData = await hevyGet('/v1/workouts/count', key);
      const totalCount = countData.workout_count || 0;

      if (_win && !_win.isDestroyed()) {
        _win.webContents.send('hevy:bulk-progress', { phase: 'start', total: totalCount });
      }

      while (true) {
        const data = await hevyGet(`/v1/workouts?page=${page}&pageSize=10`, key);
        const workouts = data.workouts || [];
        if (!workouts.length) break;

        for (const w of workouts) {
          try {
            const result = await importWorkout(w.id, key);
            if (result.duplicate) totalDupe++;
            else totalImported++;

            if (_win && !_win.isDestroyed()) {
              _win.webContents.send('hevy:bulk-progress', {
                phase:    'progress',
                done:     totalImported + totalDupe + errors.length,
                total:    totalCount,
                latest:   w.title,
                imported: totalImported,
                dupes:    totalDupe,
                errors:   errors.length,
              });
            }
          } catch (err) {
            errors.push({ id: w.id, title: w.title, error: err.message });
          }
        }

        if (page >= data.page_count) break;
        page++;
        // Small delay to avoid hammering the API
        await new Promise(r => setTimeout(r, 300));
      }

      if (_win && !_win.isDestroyed()) {
        _win.webContents.send('hevy:bulk-progress', {
          phase: 'done', imported: totalImported, dupes: totalDupe, errors: errors.length,
        });
      }

      return { ok: true, imported: totalImported, dupes: totalDupe, errors };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Clear import log so workouts can be re-imported
  ipcMain.handle('hevy:clear-import-log', () => {
    _db_run(`DELETE FROM hevy_import_log`);
    _db_persist();
    return { ok: true };
  });

  // Backfill stats for Hevy-imported sessions that are missing session_stats rows
  ipcMain.handle('hevy:backfill-stats', () => {
    if (!_computeStats) return { ok: false, error: 'Stats engine not ready' };
    const missing = _db_all(`
      SELECT s.id FROM sessions s
      LEFT JOIN session_stats ss ON ss.session_id = s.id
      WHERE ss.session_id IS NULL
    `);
    for (const row of missing) {
      try { _computeStats(row.id); } catch (e) { console.error('[hevy] backfill error for session', row.id, e.message); }
    }
    console.log(`[hevy] Backfilled stats for ${missing.length} sessions`);
    return { ok: true, count: missing.length };
  });

  console.log('[hevy] IPC handlers registered');
}

module.exports = { registerHevyHandlers, startWebhookServer, stopWebhookServer };