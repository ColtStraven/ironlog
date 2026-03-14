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

  db.run(`CREATE TABLE IF NOT EXISTS hevy_import_log (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id     TEXT    NOT NULL,
    session_id     INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
    workout_title  TEXT,
    session_date   TEXT,
    sets_imported  INTEGER DEFAULT 0,
    skipped_exercises TEXT DEFAULT '[]',
    match_log      TEXT    DEFAULT '[]',
    error          TEXT,
    imported_at    TEXT    DEFAULT (datetime('now'))
  );`);

  persist();
  console.log('[db] Schema applied');
  seedExercises();
}

// ── Exercise seed data ────────────────────────────────────────────────────────
// INSERT OR IGNORE — safe to run every startup. Never overwrites user data.
// Category mapping: push | pull | legs | core | cardio | other
function seedExercises() {
  const exercises = [
    // ── Chest (push) ─────────────────────────────────────────────────────────
    ['Around The World','push','chest','dumbbell'],
    ['Bench Press (Barbell)','push','chest','barbell'],
    ['Bench Press (Cable)','push','chest','cable'],
    ['Bench Press (Dumbbell)','push','chest','dumbbell'],
    ['Bench Press (Smith Machine)','push','chest','machine'],
    ['Bench Press - Close Grip (Barbell)','push','chest','barbell'],
    ['Bench Press - Wide Grip (Barbell)','push','chest','barbell'],
    ['Butterfly (Pec Deck)','push','chest','machine'],
    ['Cable Fly Crossovers','push','chest','cable'],
    ['Chest Dip','push','chest','bodyweight'],
    ['Chest Dip (Assisted)','push','chest','machine'],
    ['Chest Dip (Weighted)','push','chest','bodyweight'],
    ['Chest Fly (Band)','push','chest','other'],
    ['Chest Fly (Dumbbell)','push','chest','dumbbell'],
    ['Chest Fly (Machine)','push','chest','machine'],
    ['Chest Fly (Suspension)','push','chest','other'],
    ['Chest Press (Band)','push','chest','other'],
    ['Chest Press (Machine)','push','chest','machine'],
    ['Clap Push Ups','push','chest','bodyweight'],
    ['Decline Bench Press (Barbell)','push','chest','barbell'],
    ['Decline Bench Press (Dumbbell)','push','chest','dumbbell'],
    ['Decline Bench Press (Machine)','push','chest','machine'],
    ['Decline Bench Press (Smith Machine)','push','chest','machine'],
    ['Decline Chest Fly (Dumbbell)','push','chest','dumbbell'],
    ['Decline Push Up','push','chest','bodyweight'],
    ['Dumbbell Squeeze Press','push','chest','dumbbell'],
    ['Feet Up Bench Press (Barbell)','push','chest','barbell'],
    ['Floor Press (Barbell)','push','chest','barbell'],
    ['Floor Press (Dumbbell)','push','chest','dumbbell'],
    ['Hex Press (Dumbbell)','push','chest','dumbbell'],
    ['Incline Bench Press (Barbell)','push','chest','barbell'],
    ['Incline Bench Press (Dumbbell)','push','chest','dumbbell'],
    ['Incline Bench Press (Smith Machine)','push','chest','machine'],
    ['Incline Chest Fly (Dumbbell)','push','chest','dumbbell'],
    ['Incline Chest Press (Machine)','push','chest','machine'],
    ['Incline Push Ups','push','chest','bodyweight'],
    ['Iso-Lateral Chest Press (Machine)','push','chest','machine'],
    ['Kneeling Push Up','push','chest','bodyweight'],
    ['Low Cable Fly Crossovers','push','chest','cable'],
    ['One Arm Push Up','push','chest','bodyweight'],
    ['Plank Pushup','push','chest','bodyweight'],
    ['Plate Press','push','chest','other'],
    ['Plate Squeeze (Svend Press)','push','chest','other'],
    ['Push Up','push','chest','bodyweight'],
    ['Push Up (Weighted)','push','chest','bodyweight'],
    ['Push Up - Close Grip','push','chest','bodyweight'],
    ['Ring Dips','push','chest','other'],
    ['Ring Push Up','push','chest','other'],
    ['Seated Chest Flys (Cable)','push','chest','cable'],
    ['Single Arm Cable Crossover','push','chest','cable'],

    // ── Shoulders (push) ─────────────────────────────────────────────────────
    ['Arnold Press (Dumbbell)','push','shoulders','dumbbell'],
    ['Band Pullaparts','push','shoulders','other'],
    ['Chest Supported Reverse Fly (Dumbbell)','push','shoulders','dumbbell'],
    ['Chest Supported Y Raise (Dumbbell)','push','shoulders','dumbbell'],
    ['Face Pull','push','shoulders','cable'],
    ['Front Raise (Band)','push','shoulders','other'],
    ['Front Raise (Barbell)','push','shoulders','barbell'],
    ['Front Raise (Cable)','push','shoulders','cable'],
    ['Front Raise (Dumbbell)','push','shoulders','dumbbell'],
    ['Front Raise (Suspension)','push','shoulders','other'],
    ['Handstand Push Up','push','shoulders','bodyweight'],
    ['Kettlebell Around the World','push','shoulders','other'],
    ['Kettlebell Halo','push','shoulders','other'],
    ['Kettlebell Shoulder Press','push','shoulders','other'],
    ['Lateral Raise (Band)','push','shoulders','other'],
    ['Lateral Raise (Cable)','push','shoulders','cable'],
    ['Lateral Raise (Dumbbell)','push','shoulders','dumbbell'],
    ['Lateral Raise (Machine)','push','shoulders','machine'],
    ['Overhead Plate Raise','push','shoulders','other'],
    ['Overhead Press (Barbell)','push','shoulders','barbell'],
    ['Overhead Press (Dumbbell)','push','shoulders','dumbbell'],
    ['Overhead Press (Smith Machine)','push','shoulders','machine'],
    ['Pike Pushup','push','shoulders','bodyweight'],
    ['Plate Front Raise','push','shoulders','other'],
    ['Push Press','push','shoulders','barbell'],
    ['Rear Delt Reverse Fly (Cable)','push','shoulders','cable'],
    ['Rear Delt Reverse Fly (Dumbbell)','push','shoulders','dumbbell'],
    ['Rear Delt Reverse Fly (Machine)','push','shoulders','machine'],
    ['Reverse Fly Single Arm (Cable)','push','shoulders','cable'],
    ['Seated Lateral Raise (Dumbbell)','push','shoulders','dumbbell'],
    ['Seated Overhead Press (Barbell)','push','shoulders','barbell'],
    ['Seated Overhead Press (Dumbbell)','push','shoulders','dumbbell'],
    ['Seated Shoulder Press (Machine)','push','shoulders','machine'],
    ['Shoulder Press (Dumbbell)','push','shoulders','dumbbell'],
    ['Shoulder Press (Machine Plates)','push','shoulders','machine'],
    ['Shoulder Taps','push','shoulders','bodyweight'],
    ['Single Arm Cable Crossover','push','shoulders','cable'],
    ['Single Arm Landmine Press (Barbell)','push','shoulders','barbell'],
    ['Single Arm Lateral Raise (Cable)','push','shoulders','cable'],
    ['Standing Military Press (Barbell)','push','shoulders','barbell'],
    ['Upright Row (Barbell)','push','shoulders','barbell'],
    ['Upright Row (Cable)','push','shoulders','cable'],
    ['Upright Row (Dumbbell)','push','shoulders','dumbbell'],

    // ── Triceps (push) ───────────────────────────────────────────────────────
    ['Bench Dip','push','triceps','bodyweight'],
    ['Bench Press - Close Grip (Barbell)','push','triceps','barbell'],
    ['Diamond Push Up','push','triceps','bodyweight'],
    ['Floor Triceps Dip','push','triceps','bodyweight'],
    ['JM Press (Barbell)','push','triceps','barbell'],
    ['Overhead Triceps Extension (Cable)','push','triceps','cable'],
    ['Seated Dip Machine','push','triceps','machine'],
    ['Seated Triceps Press','push','triceps','dumbbell'],
    ['Single Arm Tricep Extension (Dumbbell)','push','triceps','dumbbell'],
    ['Single Arm Triceps Pushdown (Cable)','push','triceps','cable'],
    ['Skullcrusher (Barbell)','push','triceps','barbell'],
    ['Skullcrusher (Dumbbell)','push','triceps','dumbbell'],
    ['Triceps Dip','push','triceps','bodyweight'],
    ['Triceps Dip (Assisted)','push','triceps','machine'],
    ['Triceps Dip (Weighted)','push','triceps','bodyweight'],
    ['Triceps Extension (Barbell)','push','triceps','barbell'],
    ['Triceps Extension (Cable)','push','triceps','cable'],
    ['Triceps Extension (Dumbbell)','push','triceps','dumbbell'],
    ['Triceps Extension (Machine)','push','triceps','machine'],
    ['Triceps Extension (Suspension)','push','triceps','other'],
    ['Triceps Kickback (Cable)','push','triceps','cable'],
    ['Triceps Kickback (Dumbbell)','push','triceps','dumbbell'],
    ['Triceps Pressdown','push','triceps','cable'],
    ['Triceps Pushdown','push','triceps','cable'],
    ['Triceps Rope Pushdown','push','triceps','cable'],
    ['Wide-Elbow Triceps Press (Dumbbell)','push','triceps','dumbbell'],

    // ── Lats / upper back (pull) ──────────────────────────────────────────────
    ['Bent Over Row (Band)','pull','upper back','other'],
    ['Bent Over Row (Barbell)','pull','upper back','barbell'],
    ['Bent Over Row (Dumbbell)','pull','upper back','dumbbell'],
    ['Chest Supported Incline Row (Dumbbell)','pull','upper back','dumbbell'],
    ['Dead Hang','pull','upper back','bodyweight'],
    ['Dumbbell Row','pull','lats','dumbbell'],
    ['Gorilla Row (Kettlebell)','pull','upper back','other'],
    ['Inverted Row','pull','upper back','bodyweight'],
    ['Iso-Lateral High Row (Machine)','pull','lats','machine'],
    ['Iso-Lateral Low Row','pull','upper back','machine'],
    ['Iso-Lateral Row (Machine)','pull','upper back','machine'],
    ['Kneeling Pulldown (band)','pull','lats','other'],
    ['Landmine Row','pull','upper back','barbell'],
    ['Lat Pulldown (Band)','pull','lats','other'],
    ['Lat Pulldown (Cable)','pull','lats','cable'],
    ['Lat Pulldown (Machine)','pull','lats','machine'],
    ['Lat Pulldown - Close Grip (Cable)','pull','lats','cable'],
    ['Low Row (Suspension)','pull','upper back','other'],
    ['Meadows Rows (Barbell)','pull','upper back','barbell'],
    ['Pendlay Row (Barbell)','pull','upper back','barbell'],
    ['Pullover (Dumbbell)','pull','lats','dumbbell'],
    ['Pullover (Machine)','pull','lats','machine'],
    ['Rack Pull','pull','upper back','barbell'],
    ['Renegade Row (Dumbbell)','pull','upper back','dumbbell'],
    ['Reverse Grip Lat Pulldown (Cable)','pull','lats','cable'],
    ['Rope Straight Arm Pulldown','pull','lats','cable'],
    ['Scapular Pull Ups','pull','upper back','bodyweight'],
    ['Seated Cable Row - Bar Grip','pull','upper back','cable'],
    ['Seated Cable Row - Bar Wide Grip','pull','upper back','cable'],
    ['Seated Cable Row - V Grip (Cable)','pull','upper back','cable'],
    ['Seated Row (Machine)','pull','upper back','machine'],
    ['Single Arm Cable Row','pull','upper back','cable'],
    ['Single Arm Lat Pulldown','pull','lats','cable'],
    ['Straight Arm Lat Pulldown (Cable)','pull','lats','cable'],
    ['T Bar Row','pull','upper back','barbell'],
    ['Vertical Traction (Machine)','pull','lats','machine'],

    // ── Pull-ups / chin-ups (pull) ─────────────────────────────────────────────
    ['Chin Up','pull','lats','bodyweight'],
    ['Chin Up (Assisted)','pull','lats','machine'],
    ['Chin Up (Weighted)','pull','lats','bodyweight'],
    ['Kipping Pull Up','pull','lats','bodyweight'],
    ['Negative Pull Up','pull','lats','bodyweight'],
    ['Pull Up','pull','lats','bodyweight'],
    ['Pull Up (Assisted)','pull','lats','machine'],
    ['Pull Up (Band)','pull','lats','other'],
    ['Pull Up (Weighted)','pull','lats','bodyweight'],
    ['Ring Pull Up','pull','lats','other'],
    ['Sternum Pull up (Gironda)','pull','lats','bodyweight'],
    ['Wide Pull Up','pull','lats','bodyweight'],

    // ── Biceps (pull) ─────────────────────────────────────────────────────────
    ['21s Bicep Curl','pull','biceps','barbell'],
    ['Behind the Back Curl (Cable)','pull','biceps','cable'],
    ['Bicep Curl (Barbell)','pull','biceps','barbell'],
    ['Bicep Curl (Cable)','pull','biceps','cable'],
    ['Bicep Curl (Dumbbell)','pull','biceps','dumbbell'],
    ['Bicep Curl (Machine)','pull','biceps','machine'],
    ['Bicep Curl (Suspension)','pull','biceps','other'],
    ['Concentration Curl','pull','biceps','dumbbell'],
    ['Cross Body Hammer Curl','pull','biceps','dumbbell'],
    ['Drag Curl','pull','biceps','barbell'],
    ['EZ Bar Biceps Curl','pull','biceps','barbell'],
    ['Hammer Curl (Band)','pull','biceps','other'],
    ['Hammer Curl (Cable)','pull','biceps','cable'],
    ['Hammer Curl (Dumbbell)','pull','biceps','dumbbell'],
    ['Kettlebell Curl','pull','biceps','other'],
    ['Overhead Curl (Cable)','pull','biceps','cable'],
    ['Pinwheel Curl (Dumbbell)','pull','biceps','dumbbell'],
    ['Plate Curl','pull','biceps','other'],
    ['Preacher Curl (Barbell)','pull','biceps','barbell'],
    ['Preacher Curl (Dumbbell)','pull','biceps','dumbbell'],
    ['Preacher Curl (Machine)','pull','biceps','machine'],
    ['Reverse Curl (Barbell)','pull','biceps','barbell'],
    ['Reverse Curl (Cable)','pull','biceps','cable'],
    ['Reverse Curl (Dumbbell)','pull','biceps','dumbbell'],
    ['Reverse Grip Concentration Curl','pull','biceps','dumbbell'],
    ['Rope Cable Curl','pull','biceps','cable'],
    ['Seated Incline Curl (Dumbbell)','pull','biceps','dumbbell'],
    ['Single Arm Curl (Cable)','pull','biceps','cable'],
    ['Spider Curl (Barbell)','pull','biceps','barbell'],
    ['Spider Curl (Dumbbell)','pull','biceps','dumbbell'],
    ['Waiter Curl (Dumbbell)','pull','biceps','dumbbell'],
    ['Zottman Curl (Dumbbell)','pull','biceps','dumbbell'],

    // ── Forearms / traps (pull) ───────────────────────────────────────────────
    ['Behind the Back Bicep Wrist Curl (Barbell)','pull','forearms','barbell'],
    ['Seated Palms Up Wrist Curl','pull','forearms','barbell'],
    ['Seated Wrist Extension (Barbell)','pull','forearms','barbell'],
    ['Wrist Roller','pull','forearms','other'],
    ['Shrug (Barbell)','pull','traps','barbell'],
    ['Shrug (Cable)','pull','traps','cable'],
    ['Shrug (Dumbbell)','pull','traps','dumbbell'],
    ['Shrug (Machine)','pull','traps','machine'],
    ['Shrug (Smith Machine)','pull','traps','machine'],

    // ── Legs — quads ──────────────────────────────────────────────────────────
    ['Assisted Pistol Squats','legs','quadriceps','bodyweight'],
    ['Belt Squat (Machine)','legs','quadriceps','machine'],
    ['Box Jump','legs','quadriceps','bodyweight'],
    ['Box Squat (Barbell)','legs','quadriceps','barbell'],
    ['Bulgarian Split Squat','legs','quadriceps','dumbbell'],
    ['Curtsy Lunge (Dumbbell)','legs','quadriceps','dumbbell'],
    ['Dumbbell Step Up','legs','quadriceps','dumbbell'],
    ['Frog Jumps','legs','quadriceps','bodyweight'],
    ['Front Squat','legs','quadriceps','barbell'],
    ['Full Squat','legs','quadriceps','bodyweight'],
    ['Goblet Squat','legs','quadriceps','dumbbell'],
    ['Hack Squat','legs','quadriceps','barbell'],
    ['Hack Squat (Machine)','legs','quadriceps','machine'],
    ['Hip Abduction (Machine)','legs','abductors','machine'],
    ['Hip Adduction (Machine)','legs','adductors','machine'],
    ['Jump Squat','legs','quadriceps','bodyweight'],
    ['Jumping Lunge','legs','quadriceps','bodyweight'],
    ['Kettlebell Goblet Squat','legs','quadriceps','other'],
    ['Lateral Box Jump','legs','quadriceps','bodyweight'],
    ['Lateral Lunge','legs','quadriceps','bodyweight'],
    ['Lateral Squat','legs','quadriceps','bodyweight'],
    ['Leg Extension (Machine)','legs','quadriceps','machine'],
    ['Leg Press (Machine)','legs','quadriceps','machine'],
    ['Leg Press Horizontal (Machine)','legs','quadriceps','machine'],
    ['Lunge','legs','quadriceps','bodyweight'],
    ['Lunge (Barbell)','legs','quadriceps','barbell'],
    ['Lunge (Dumbbell)','legs','quadriceps','dumbbell'],
    ['Overhead Dumbbell Lunge','legs','quadriceps','dumbbell'],
    ['Pause Squat (Barbell)','legs','quadriceps','barbell'],
    ['Pendulum Squat (Machine)','legs','quadriceps','machine'],
    ['Pistol Squat','legs','quadriceps','bodyweight'],
    ['Reverse Lunge','legs','quadriceps','bodyweight'],
    ['Reverse Lunge (Barbell)','legs','quadriceps','barbell'],
    ['Reverse Lunge (Dumbbell)','legs','quadriceps','dumbbell'],
    ['Single Leg Extensions','legs','quadriceps','machine'],
    ['Single Leg Press (Machine)','legs','quadriceps','machine'],
    ['Sissy Squat (Weighted)','legs','quadriceps','other'],
    ['Split Squat (Dumbbell)','legs','quadriceps','dumbbell'],
    ['Squat (Band)','legs','quadriceps','other'],
    ['Squat (Barbell)','legs','quadriceps','barbell'],
    ['Squat (Bodyweight)','legs','quadriceps','bodyweight'],
    ['Squat (Dumbbell)','legs','quadriceps','dumbbell'],
    ['Squat (Machine)','legs','quadriceps','machine'],
    ['Squat (Smith Machine)','legs','quadriceps','machine'],
    ['Squat (Suspension)','legs','quadriceps','other'],
    ['Step Up','legs','quadriceps','bodyweight'],
    ['Sumo Squat','legs','quadriceps','bodyweight'],
    ['Sumo Squat (Barbell)','legs','quadriceps','barbell'],
    ['Sumo Squat (Dumbbell)','legs','quadriceps','dumbbell'],
    ['Sumo Squat (Kettlebell)','legs','quadriceps','other'],
    ['Walking Lunge','legs','quadriceps','bodyweight'],
    ['Walking Lunge (Dumbbell)','legs','quadriceps','dumbbell'],
    ['Wall Sit','legs','quadriceps','bodyweight'],
    ['Zercher Squat','legs','quadriceps','barbell'],

    // ── Legs — hamstrings ─────────────────────────────────────────────────────
    ['Glute Ham Raise','legs','hamstrings','bodyweight'],
    ['Good Morning (Barbell)','legs','hamstrings','barbell'],
    ['Lying Leg Curl (Machine)','legs','hamstrings','machine'],
    ['Nordic Hamstrings Curls','legs','hamstrings','bodyweight'],
    ['Romanian Deadlift (Barbell)','legs','hamstrings','barbell'],
    ['Romanian Deadlift (Dumbbell)','legs','hamstrings','dumbbell'],
    ['Seated Leg Curl (Machine)','legs','hamstrings','machine'],
    ['Single Leg Romanian Deadlift (Barbell)','legs','hamstrings','barbell'],
    ['Single Leg Romanian Deadlift (Dumbbell)','legs','hamstrings','dumbbell'],
    ['Standing Leg Curls','legs','hamstrings','machine'],
    ['Straight Leg Deadlift','legs','hamstrings','barbell'],

    // ── Legs — glutes ─────────────────────────────────────────────────────────
    ['Bird Dog','legs','glutes','bodyweight'],
    ['Cable Pull Through','legs','glutes','cable'],
    ['Clamshell','legs','glutes','bodyweight'],
    ['Deadlift (Band)','legs','glutes','other'],
    ['Deadlift (Barbell)','legs','glutes','barbell'],
    ['Deadlift (Dumbbell)','legs','glutes','dumbbell'],
    ['Deadlift (Smith Machine)','legs','glutes','machine'],
    ['Deadlift (Trap bar)','legs','glutes','barbell'],
    ['Fire Hydrants','legs','glutes','bodyweight'],
    ['Frog Pumps (Dumbbell)','legs','glutes','dumbbell'],
    ['Glute Bridge','legs','glutes','bodyweight'],
    ['Glute Kickback (Machine)','legs','glutes','machine'],
    ['Glute Kickback on Floor','legs','glutes','bodyweight'],
    ['Hip Thrust','legs','glutes','bodyweight'],
    ['Hip Thrust (Barbell)','legs','glutes','barbell'],
    ['Hip Thrust (Machine)','legs','glutes','machine'],
    ['Hip Thrust (Smith Machine)','legs','glutes','machine'],
    ['Lateral Band Walks','legs','glutes','other'],
    ['Lateral Leg Raises','legs','glutes','bodyweight'],
    ['Partial Glute Bridge (Barbell)','legs','glutes','barbell'],
    ['Rear Kick (Machine)','legs','glutes','machine'],
    ['Reverse Hyperextension','legs','glutes','bodyweight'],
    ['Single Leg Glute Bridge','legs','glutes','bodyweight'],
    ['Single Leg Hip Thrust','legs','glutes','bodyweight'],
    ['Single Leg Hip Thrust (Dumbbell)','legs','glutes','dumbbell'],
    ['Standing Cable Glute Kickbacks','legs','glutes','cable'],
    ['Sumo Deadlift','legs','glutes','barbell'],

    // ── Legs — calves ─────────────────────────────────────────────────────────
    ['Calf Extension (Machine)','legs','calves','machine'],
    ['Calf Press (Machine)','legs','calves','machine'],
    ['Seated Calf Raise','legs','calves','machine'],
    ['Single Leg Standing Calf Raise','legs','calves','bodyweight'],
    ['Single Leg Standing Calf Raise (Barbell)','legs','calves','barbell'],
    ['Single Leg Standing Calf Raise (Dumbbell)','legs','calves','dumbbell'],
    ['Single Leg Standing Calf Raise (Machine)','legs','calves','machine'],
    ['Standing Calf Raise','legs','calves','bodyweight'],
    ['Standing Calf Raise (Barbell)','legs','calves','barbell'],
    ['Standing Calf Raise (Dumbbell)','legs','calves','dumbbell'],
    ['Standing Calf Raise (Machine)','legs','calves','machine'],
    ['Standing Calf Raise (Smith)','legs','calves','machine'],

    // ── Back extensions / lower back ──────────────────────────────────────────
    ['Back Extension (Hyperextension)','pull','lower back','bodyweight'],
    ['Back Extension (Machine)','pull','lower back','machine'],
    ['Back Extension (Weighted Hyperextension)','pull','lower back','bodyweight'],
    ['Superman','pull','lower back','bodyweight'],

    // ── Core ──────────────────────────────────────────────────────────────────
    ['Ab Scissors','core','abdominals','bodyweight'],
    ['Ab Wheel','core','abdominals','other'],
    ['Bicycle Crunch','core','abdominals','bodyweight'],
    ['Bicycle Crunch Raised Legs','core','abdominals','bodyweight'],
    ['Cable Core Palloff Press','core','abdominals','cable'],
    ['Cable Crunch','core','abdominals','cable'],
    ['Cable Twist (Down to up)','core','abdominals','cable'],
    ['Cable Twist (Up to down)','core','abdominals','cable'],
    ['Crunch','core','abdominals','bodyweight'],
    ['Crunch (Machine)','core','abdominals','machine'],
    ['Crunch (Weighted)','core','abdominals','other'],
    ['Dead Bug','core','abdominals','bodyweight'],
    ['Decline Crunch','core','abdominals','bodyweight'],
    ['Decline Crunch (Weighted)','core','abdominals','other'],
    ['Dragon Flag','core','abdominals','bodyweight'],
    ['Dragonfly','core','abdominals','bodyweight'],
    ['Elbow to Knee','core','abdominals','bodyweight'],
    ['Flutter Kicks','core','abdominals','bodyweight'],
    ['Hanging Knee Raise','core','abdominals','bodyweight'],
    ['Hanging Leg Raise','core','abdominals','bodyweight'],
    ['Heel Taps','core','abdominals','bodyweight'],
    ['Hollow Rock','core','abdominals','bodyweight'],
    ['Jack Knife (Suspension)','core','abdominals','other'],
    ['Jackknife Sit Up','core','abdominals','bodyweight'],
    ['Knee Raise Parallel Bars','core','abdominals','bodyweight'],
    ['L-Sit Hold','core','abdominals','bodyweight'],
    ['Landmine 180','core','abdominals','barbell'],
    ['Leg Raise Parallel Bars','core','abdominals','bodyweight'],
    ['Lying Knee Raise','core','abdominals','bodyweight'],
    ['Lying Leg Raise','core','abdominals','bodyweight'],
    ['Mountain Climber','core','abdominals','bodyweight'],
    ['Oblique Crunch','core','abdominals','bodyweight'],
    ['Plank','core','abdominals','bodyweight'],
    ['Reverse Crunch','core','abdominals','bodyweight'],
    ['Reverse Plank','core','abdominals','bodyweight'],
    ['Russian Twist (Bodyweight)','core','abdominals','bodyweight'],
    ['Russian Twist (Weighted)','core','abdominals','other'],
    ['Side Bend','core','abdominals','bodyweight'],
    ['Side Bend (Dumbbell)','core','abdominals','dumbbell'],
    ['Side Plank','core','abdominals','bodyweight'],
    ['Sit Up','core','abdominals','bodyweight'],
    ['Sit Up (Weighted)','core','abdominals','other'],
    ['Spiderman','core','abdominals','bodyweight'],
    ['Toe Touch','core','abdominals','bodyweight'],
    ['Toes to Bar','core','abdominals','bodyweight'],
    ['Torso Rotation','core','abdominals','machine'],
    ['V Up','core','abdominals','bodyweight'],

    // ── Neck ──────────────────────────────────────────────────────────────────
    ['Lying Neck Curls','pull','neck','bodyweight'],
    ['Lying Neck Curls (Weighted)','pull','neck','other'],
    ['Lying Neck Extension','pull','neck','bodyweight'],
    ['Lying Neck Extension (Weighted)','pull','neck','other'],

    // ── Full body / compound ──────────────────────────────────────────────────
    ['Ball Slams','other','full body','other'],
    ['Battle Ropes','cardio','full body','other'],
    ['Burpee','other','full body','bodyweight'],
    ['Burpee Over the Bar','other','full body','bodyweight'],
    ['Clean','other','full body','barbell'],
    ['Clean and Jerk','other','full body','barbell'],
    ['Clean and Press','other','full body','barbell'],
    ['Clean Pull','other','full body','barbell'],
    ['Deadlift High Pull','other','full body','barbell'],
    ['Downward Dog','other','full body','bodyweight'],
    ['Dumbbell Snatch','other','full body','dumbbell'],
    ['Farmers Walk','other','full body','dumbbell'],
    ['Front Lever Hold','other','full body','bodyweight'],
    ['Front Lever Raise','other','full body','bodyweight'],
    ['Handstand Hold','other','full body','bodyweight'],
    ['Hang Clean','other','full body','barbell'],
    ['Hang Snatch','other','full body','barbell'],
    ['High Knee Skips','other','full body','bodyweight'],
    ['High Knees','other','full body','bodyweight'],
    ['Jump Shrug','other','full body','barbell'],
    ['Jumping Jack','other','full body','bodyweight'],
    ['Kettlebell Clean','other','full body','other'],
    ['Kettlebell High Pull','other','full body','other'],
    ['Kettlebell Snatch','other','full body','other'],
    ['Kettlebell Swing','other','full body','other'],
    ['Kettlebell Turkish Get Up','other','full body','other'],
    ['Landmine Squat and Press','other','full body','barbell'],
    ['Muscle Up','other','full body','bodyweight'],
    ['Overhead Squat','other','full body','barbell'],
    ['Power Clean','other','full body','barbell'],
    ['Power Snatch','other','full body','barbell'],
    ['Press Under','other','full body','barbell'],
    ['Sled Push','other','full body','other'],
    ['Snatch','other','full body','barbell'],
    ['Split Jerk','other','full body','barbell'],
    ['Squat Row','other','full body','cable'],
    ['Thruster (Barbell)','other','full body','barbell'],
    ['Thruster (Kettlebell)','other','full body','other'],
    ['Wall Ball','other','full body','other'],

    // ── Cardio ────────────────────────────────────────────────────────────────
    ['Aerobics','cardio','cardio','bodyweight'],
    ['Air Bike','cardio','cardio','machine'],
    ['Boxing','cardio','cardio','bodyweight'],
    ['Climbing','cardio','cardio','bodyweight'],
    ['Cycling','cardio','cardio','machine'],
    ['Elliptical Trainer','cardio','cardio','machine'],
    ['HIIT','cardio','cardio','bodyweight'],
    ['Hiking','cardio','cardio','bodyweight'],
    ['Jump Rope','cardio','cardio','other'],
    ['Pilates','cardio','full body','bodyweight'],
    ['Rowing Machine','cardio','cardio','machine'],
    ['Running','cardio','cardio','bodyweight'],
    ['Skating','cardio','cardio','bodyweight'],
    ['Skiing','cardio','cardio','bodyweight'],
    ['Snowboarding','cardio','cardio','bodyweight'],
    ['Spinning','cardio','cardio','machine'],
    ['Sprints','cardio','cardio','bodyweight'],
    ['Stair Machine (Floors)','cardio','cardio','machine'],
    ['Stair Machine (Steps)','cardio','cardio','machine'],
    ['Swimming','cardio','cardio','bodyweight'],
    ['Treadmill','cardio','cardio','machine'],
    ['Walking','cardio','cardio','bodyweight'],
    ['Yoga','other','full body','bodyweight'],

    // ── Other ─────────────────────────────────────────────────────────────────
    ['Stretching','other','full body','bodyweight'],
    ['Warm Up','other','full body','bodyweight'],
  ];

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO exercises (name, category, muscle_group, equipment)
     VALUES (?, ?, ?, ?)`
  );
  for (const [name, category, muscle_group, equipment] of exercises) {
    stmt.run([name, category, muscle_group, equipment]);
  }
  stmt.free();
  persist();
  console.log('[db] Exercise library seeded');
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

  // ── Export ────────────────────────────────────────────────────────────────
  // Returns all tables as plain arrays for CSV serialization in the renderer.
  ipcMain.handle('export:all', () => ({
    sessions: all(`
      SELECT s.id, s.session_date, s.session_type, s.label,
             s.duration_min, s.avg_hr, s.notes,
             ss.total_volume_lbs, ss.avg_dropoff_pct,
             ss.rep_zone_strength, ss.rep_zone_size, ss.rep_zone_metabolic,
             ss.exercise_count, ss.set_count,
             ss.top_set_desc, ss.weakest_link
      FROM sessions s
      LEFT JOIN session_stats ss ON ss.session_id = s.id
      ORDER BY s.session_date
    `),
    sets: all(`
      SELECT se.id, s.session_date, s.label as session_label,
             ex.name as exercise, ex.category, ex.muscle_group,
             se.set_number, se.reps, se.weight_lbs, se.rpe,
             ROUND(se.reps * se.weight_lbs, 1) as set_volume,
             ROUND(se.weight_lbs * (1.0 + se.reps / 30.0), 1) as epley_1rm
      FROM sets se
      JOIN sessions s  ON s.id  = se.session_id
      JOIN exercises ex ON ex.id = se.exercise_id
      ORDER BY s.session_date, se.exercise_id, se.set_number
    `),
    body_metrics: all(`SELECT * FROM body_metrics ORDER BY log_date`),
    daily_activity: all(`SELECT * FROM daily_activity ORDER BY log_date`),
    nutrition: all(`SELECT * FROM nutrition ORDER BY log_date`),
    exercises: all(`SELECT * FROM exercises ORDER BY category, name`),
  }));

  console.log('[db] IPC handlers registered');
}

module.exports = { initDatabase, registerHandlers, getDbHelpers: () => ({ all, get, run: (sql, p) => { db.run(sql, p); }, persist, computeAndCacheStats }) };
