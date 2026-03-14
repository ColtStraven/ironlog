'use strict';

// ─────────────────────────────────────────────
//  IronLog · Database (sql.js edition)
//  No native compilation — pure WebAssembly.
//  DB lives in memory; persisted to disk on every write.
// ─────────────────────────────────────────────

const path      = require('path');
const fs        = require('fs');
const initSqlJs = require('sql.js');

let db;       // sql.js Database instance
let DB_PATH;  // file path for persistence

// ── Persist helper ──────────────────────────────────────────────────────────
function persist() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ── Query helpers ────────────────────────────────────────────────────────────
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

// ── Schema ────────────────────────────────────────────────────────────────────
function applySchema() {
  db.run(`PRAGMA foreign_keys = ON;`);

  db.run(`CREATE TABLE IF NOT EXISTS exercises (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL UNIQUE,
    category     TEXT NOT NULL,
    muscle_group TEXT NOT NULL,
    equipment    TEXT DEFAULT 'dumbbell',
    notes        TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date  TEXT NOT NULL,
    session_type  TEXT NOT NULL,
    label         TEXT,
    notes         TEXT,
    duration_min  INTEGER,
    avg_hr        INTEGER,
    created_at    TEXT DEFAULT (datetime('now'))
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS sets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    exercise_id  INTEGER NOT NULL REFERENCES exercises(id),
    set_number   INTEGER NOT NULL,
    reps         INTEGER NOT NULL,
    weight_lbs   REAL NOT NULL,
    rpe          REAL,
    notes        TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS body_metrics (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date     TEXT NOT NULL UNIQUE,
    weight_lbs   REAL,
    body_fat_pct REAL,
    waist_in     REAL,
    chest_in     REAL,
    arm_in       REAL,
    notes        TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS daily_activity (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date     TEXT NOT NULL UNIQUE,
    steps        INTEGER,
    is_work_day  INTEGER DEFAULT 0,
    shift_start  TEXT,
    shift_end    TEXT,
    notes        TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS nutrition (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date     TEXT NOT NULL UNIQUE,
    calories     INTEGER,
    protein_g    INTEGER,
    carbs_g      INTEGER,
    fat_g        INTEGER,
    water_oz     INTEGER,
    notes        TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS session_stats (
    session_id          INTEGER PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    total_volume_lbs    REAL,
    avg_dropoff_pct     REAL,
    top_set_desc        TEXT,
    weakest_link        TEXT,
    rep_zone_strength   INTEGER,
    rep_zone_size       INTEGER,
    rep_zone_metabolic  INTEGER,
    exercise_count      INTEGER,
    set_count           INTEGER,
    updated_at          TEXT DEFAULT (datetime('now'))
  );`);

  persist();
  console.log('[db] Schema applied');
}

// ── Init (async — sql.js loads WASM) ──────────────────────────────────────────
async function initDatabase(userDataPath) {
  DB_PATH = path.join(userDataPath, 'ironlog.db');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
    console.log('[db] Loaded from', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('[db] New database at', DB_PATH);
  }

  applySchema();
  return db;
}

// ── Stat engine ────────────────────────────────────────────────────────────────
function computeAndCacheStats(sessionId) {
  const sets = all(`
    SELECT se.*, ex.name as exercise_name
    FROM sets se JOIN exercises ex ON ex.id = se.exercise_id
    WHERE se.session_id = ?
    ORDER BY se.exercise_id, se.set_number
  `, [sessionId]);

  if (!sets.length) return;

  const totalVolume = sets.reduce((s, r) => s + r.reps * r.weight_lbs, 0);

  const byEx = {};
  for (const s of sets) {
    if (!byEx[s.exercise_id]) byEx[s.exercise_id] = { name: s.exercise_name, sets: [] };
    byEx[s.exercise_id].sets.push(s);
  }

  const dropoffs = [];
  let topSet = null, topVol = 0;

  for (const ex of Object.values(byEx)) {
    if (ex.sets.length >= 2) {
      const first = ex.sets[0].reps;
      const last  = ex.sets[ex.sets.length - 1].reps;
      const pct   = first > 0 ? Math.round(((first - last) / first) * 100) : 0;
      dropoffs.push({ name: ex.name, dropoff: pct });
    }
    for (const s of ex.sets) {
      const v = s.reps * s.weight_lbs;
      if (v > topVol) { topVol = v; topSet = `${ex.name} ${s.weight_lbs}×${s.reps}`; }
    }
  }

  const avgDropoff = dropoffs.length
    ? Math.round(dropoffs.reduce((s, d) => s + d.dropoff, 0) / dropoffs.length) : 0;
  const weakest = dropoffs.length
    ? dropoffs.reduce((a, b) => b.dropoff > a.dropoff ? b : a).name : null;

  const zoneStr  = sets.filter(s => s.reps <= 6).length;
  const zoneSize = sets.filter(s => s.reps >= 7 && s.reps <= 12).length;
  const zoneMeta = sets.filter(s => s.reps >= 13).length;
  const uniqueEx = new Set(sets.map(s => s.exercise_id)).size;

  db.run(`
    INSERT INTO session_stats
      (session_id, total_volume_lbs, avg_dropoff_pct, top_set_desc, weakest_link,
       rep_zone_strength, rep_zone_size, rep_zone_metabolic, exercise_count, set_count)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(session_id) DO UPDATE SET
      total_volume_lbs=excluded.total_volume_lbs,
      avg_dropoff_pct=excluded.avg_dropoff_pct,
      top_set_desc=excluded.top_set_desc,
      weakest_link=excluded.weakest_link,
      rep_zone_strength=excluded.rep_zone_strength,
      rep_zone_size=excluded.rep_zone_size,
      rep_zone_metabolic=excluded.rep_zone_metabolic,
      exercise_count=excluded.exercise_count,
      set_count=excluded.set_count,
      updated_at=datetime('now')
  `, [sessionId, totalVolume, avgDropoff, topSet, weakest,
      zoneStr, zoneSize, zoneMeta, uniqueEx, sets.length]);

  persist();
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────
function registerHandlers(ipcMain) {

  ipcMain.handle('exercises:list', () =>
    all(`SELECT * FROM exercises ORDER BY category, name`)
  );

  ipcMain.handle('exercises:add', (_, ex) => {
    try {
      db.run(
        `INSERT INTO exercises (name, category, muscle_group, equipment, notes) VALUES (?,?,?,?,?)`,
        [ex.name, ex.category, ex.muscle_group, ex.equipment, ex.notes || null]
      );
      persist();
      return get(`SELECT * FROM exercises WHERE name = ?`, [ex.name]);
    } catch (e) {
      throw new Error(e.message);
    }
  });

  ipcMain.handle('exercises:delete', (_, id) => {
    db.run(`DELETE FROM exercises WHERE id = ?`, [id]);
    persist();
    return { ok: true };
  });

  ipcMain.handle('sessions:list', (_, limit = 20) =>
    all(`
      SELECT s.*, ss.total_volume_lbs, ss.avg_dropoff_pct,
             ss.exercise_count, ss.set_count,
             ss.rep_zone_strength, ss.rep_zone_size, ss.rep_zone_metabolic,
             ss.top_set_desc, ss.weakest_link
      FROM sessions s
      LEFT JOIN session_stats ss ON ss.session_id = s.id
      ORDER BY s.session_date DESC LIMIT ?
    `, [limit])
  );

  ipcMain.handle('sessions:get', (_, id) => ({
    session: get(`SELECT * FROM sessions WHERE id = ?`, [id]),
    stats:   get(`SELECT * FROM session_stats WHERE session_id = ?`, [id]),
    sets:    all(`
      SELECT se.*, ex.name as exercise_name, ex.muscle_group, ex.category
      FROM sets se JOIN exercises ex ON ex.id = se.exercise_id
      WHERE se.session_id = ? ORDER BY se.exercise_id, se.set_number
    `, [id]),
  }));

  ipcMain.handle('sessions:save', (_, { session, sets }) => {
    db.run(
      `INSERT INTO sessions (session_date, session_type, label, notes, duration_min, avg_hr)
       VALUES (?,?,?,?,?,?)`,
      [session.session_date, session.session_type, session.label || null,
       session.notes || null, session.duration_min || null, session.avg_hr || null]
    );
    const sessionId = get(`SELECT id FROM sessions ORDER BY id DESC LIMIT 1`).id;

    for (const s of sets) {
      db.run(
        `INSERT INTO sets (session_id, exercise_id, set_number, reps, weight_lbs, rpe, notes)
         VALUES (?,?,?,?,?,?,?)`,
        [sessionId, s.exercise_id, s.set_number, s.reps, s.weight_lbs,
         s.rpe || null, s.notes || null]
      );
    }
    persist();
    computeAndCacheStats(sessionId);
    return { id: sessionId };
  });

  ipcMain.handle('sessions:delete', (_, id) => {
    db.run(`DELETE FROM sessions WHERE id = ?`, [id]);
    persist();
    return { ok: true };
  });

  ipcMain.handle('metrics:list', (_, limit = 90) =>
    all(`SELECT * FROM body_metrics ORDER BY log_date DESC LIMIT ?`, [limit])
  );

  ipcMain.handle('metrics:save', (_, r) => {
    db.run(
      `INSERT INTO body_metrics (log_date, weight_lbs, body_fat_pct, waist_in, chest_in, arm_in, notes)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(log_date) DO UPDATE SET
         weight_lbs=excluded.weight_lbs, body_fat_pct=excluded.body_fat_pct,
         waist_in=excluded.waist_in, chest_in=excluded.chest_in,
         arm_in=excluded.arm_in, notes=excluded.notes`,
      [r.log_date, r.weight_lbs||null, r.body_fat_pct||null,
       r.waist_in||null, r.chest_in||null, r.arm_in||null, r.notes||null]
    );
    persist();
    return { ok: true };
  });

  ipcMain.handle('activity:list', (_, limit = 30) =>
    all(`SELECT * FROM daily_activity ORDER BY log_date DESC LIMIT ?`, [limit])
  );

  ipcMain.handle('activity:save', (_, r) => {
    db.run(
      `INSERT INTO daily_activity (log_date, steps, is_work_day, shift_start, shift_end, notes)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(log_date) DO UPDATE SET
         steps=excluded.steps, is_work_day=excluded.is_work_day,
         shift_start=excluded.shift_start, shift_end=excluded.shift_end, notes=excluded.notes`,
      [r.log_date, r.steps||null, r.is_work_day||0,
       r.shift_start||null, r.shift_end||null, r.notes||null]
    );
    persist();
    return { ok: true };
  });

  ipcMain.handle('nutrition:list', (_, limit = 30) =>
    all(`SELECT * FROM nutrition ORDER BY log_date DESC LIMIT ?`, [limit])
  );

  ipcMain.handle('nutrition:save', (_, r) => {
    db.run(
      `INSERT INTO nutrition (log_date, calories, protein_g, carbs_g, fat_g, water_oz, notes)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(log_date) DO UPDATE SET
         calories=excluded.calories, protein_g=excluded.protein_g,
         carbs_g=excluded.carbs_g, fat_g=excluded.fat_g,
         water_oz=excluded.water_oz, notes=excluded.notes`,
      [r.log_date, r.calories||null, r.protein_g||null,
       r.carbs_g||null, r.fat_g||null, r.water_oz||null, r.notes||null]
    );
    persist();
    return { ok: true };
  });

  ipcMain.handle('dashboard:summary', () => {
    const cutoff  = new Date(Date.now() - 56 * 86400000).toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() -  7 * 86400000).toISOString().slice(0, 10);
    return {
      weekVol: all(`
        SELECT s.id, s.session_date, s.session_type, s.label,
               SUM(se.reps * se.weight_lbs) as volume
        FROM sessions s JOIN sets se ON se.session_id = s.id
        WHERE s.session_date >= ? GROUP BY s.id ORDER BY s.session_date
      `, [cutoff]),
      recentWeight:    all(`SELECT log_date, weight_lbs FROM body_metrics ORDER BY log_date DESC LIMIT 14`).reverse(),
      recentActivity:  all(`SELECT log_date, steps, is_work_day FROM daily_activity ORDER BY log_date DESC LIMIT 14`).reverse(),
      recentNutrition: all(`SELECT log_date, calories, protein_g FROM nutrition ORDER BY log_date DESC LIMIT 14`).reverse(),
      lastSession: get(`
        SELECT s.*, ss.session_id, ss.total_volume_lbs, ss.avg_dropoff_pct,
               ss.top_set_desc, ss.weakest_link,
               ss.rep_zone_strength, ss.rep_zone_size, ss.rep_zone_metabolic,
               ss.exercise_count, ss.set_count
        FROM sessions s LEFT JOIN session_stats ss ON ss.session_id = s.id
        ORDER BY s.session_date DESC LIMIT 1
      `),
      sessionCount: get(`SELECT COUNT(*) as cnt FROM sessions WHERE session_date >= ?`, [weekAgo]),
    };
  });

  // Full session data for narrative analysis page
  ipcMain.handle('analysis:session', (_, id) => {
    // If no id passed, use most recent session
    const session = id
      ? get(`SELECT * FROM sessions WHERE id = ?`, [id])
      : get(`SELECT * FROM sessions ORDER BY session_date DESC, id DESC LIMIT 1`);
    if (!session) return null;

    const stats = get(`SELECT * FROM session_stats WHERE session_id = ?`, [session.id]);
    const sets  = all(`
      SELECT se.*, ex.name as exercise_name, ex.muscle_group, ex.category, ex.equipment
      FROM sets se JOIN exercises ex ON ex.id = se.exercise_id
      WHERE se.session_id = ?
      ORDER BY se.exercise_id, se.set_number
    `, [session.id]);

    // Per-exercise analysis
    const byEx = {};
    for (const s of sets) {
      if (!byEx[s.exercise_id]) {
        byEx[s.exercise_id] = {
          id: s.exercise_id, name: s.exercise_name,
          muscle_group: s.muscle_group, category: s.category,
          sets: []
        };
      }
      byEx[s.exercise_id].sets.push(s);
    }

    const exercises = Object.values(byEx).map(ex => {
      const validSets = ex.sets;
      const firstReps = validSets[0]?.reps || 0;
      const lastReps  = validSets[validSets.length - 1]?.reps || 0;
      const dropoff   = firstReps > 0 ? Math.round(((firstReps - lastReps) / firstReps) * 100) : 0;
      const volume    = validSets.reduce((s, r) => s + r.reps * r.weight_lbs, 0);
      const best1rm   = Math.max(...validSets.map(s => s.weight_lbs * (1 + s.reps / 30)));
      const repCounts = validSets.map(s => s.reps);
      return { ...ex, dropoff, volume, best1rm, repCounts,
               firstReps, lastReps,
               zoneStr:  validSets.filter(s => s.reps <= 6).length,
               zoneSize: validSets.filter(s => s.reps >= 7 && s.reps <= 12).length,
               zoneMeta: validSets.filter(s => s.reps >= 13).length };
    });

    // Historical comparison — same exercises, previous sessions
    const exerciseIds = exercises.map(e => e.id);
    let history = [];
    if (exerciseIds.length) {
      const ph = exerciseIds.map(() => '?').join(',');
      history = all(`
        SELECT se.exercise_id, ex.name,
               s.session_date, s.id as session_id,
               SUM(se.reps * se.weight_lbs) as volume,
               MAX(se.weight_lbs * (1 + se.reps / 30.0)) as best_1rm
        FROM sets se
        JOIN sessions s ON s.id = se.session_id
        JOIN exercises ex ON ex.id = se.exercise_id
        WHERE se.exercise_id IN (${ph}) AND s.id != ?
        GROUP BY s.id, se.exercise_id
        ORDER BY s.session_date DESC
      `, [...exerciseIds, session.id]);
    }

    // Body metrics for context
    const latestMetrics = get(`SELECT * FROM body_metrics ORDER BY log_date DESC LIMIT 1`);
    const latestActivity = get(`SELECT * FROM daily_activity ORDER BY log_date DESC LIMIT 1`);

    // Session count (for program week context)
    const totalSessions = get(`SELECT COUNT(*) as cnt FROM sessions`);

    return { session, stats, exercises, history, latestMetrics, latestActivity, totalSessions };
  });

  ipcMain.handle('analytics:rm-trends', (_, exerciseIds) => {
    if (!exerciseIds || !exerciseIds.length) return [];
    const ph = exerciseIds.map(() => '?').join(',');
    return all(`
      SELECT s.session_date, se.exercise_id, ex.name,
             MAX(se.weight_lbs * (1.0 + se.reps / 30.0)) as estimated_1rm
      FROM sets se JOIN sessions s ON s.id = se.session_id
      JOIN exercises ex ON ex.id = se.exercise_id
      WHERE se.exercise_id IN (${ph})
      GROUP BY s.session_date, se.exercise_id ORDER BY s.session_date
    `, exerciseIds);
  });

  console.log('[db] IPC handlers registered');
}

module.exports = { initDatabase, registerHandlers };
