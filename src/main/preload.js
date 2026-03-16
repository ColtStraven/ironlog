'use strict';

// ─────────────────────────────────────────────────────────────
//  IronLog · Preload
//  Exposes a typed API surface to the renderer via contextBridge.
//  Renderer code calls window.api.xxx() — never require() directly.
// ─────────────────────────────────────────────────────────────

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

// ── Window controls ─────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('win', {
  minimize:  () => ipcRenderer.send('win:minimize'),
  maximize:  () => ipcRenderer.send('win:maximize'),
  close:     () => ipcRenderer.send('win:close'),
  onMaximized: (cb) => ipcRenderer.on('win:maximized', (_, val) => cb(val)),
});

contextBridge.exposeInMainWorld('api', {

  // ── Exercises ──────────────────────────────────────────────
  exercises: {
    list:   ()     => invoke('exercises:list'),
    add:    (ex)   => invoke('exercises:add', ex),
    delete: (id)   => invoke('exercises:delete', id),
  },

  // ── Sessions ───────────────────────────────────────────────
  sessions: {
    list:   (limit)        => invoke('sessions:list', limit),
    get:    (id)           => invoke('sessions:get', id),
    save:   (data)         => invoke('sessions:save', data),
    delete: (id)           => invoke('sessions:delete', id),
  },

  // ── Body Metrics ───────────────────────────────────────────
  metrics: {
    list: (limit) => invoke('metrics:list', limit),
    save: (row)   => invoke('metrics:save', row),
  },

  // ── Activity ───────────────────────────────────────────────
  activity: {
    list: (limit) => invoke('activity:list', limit),
    save: (row)   => invoke('activity:save', row),
  },

  // ── Nutrition ──────────────────────────────────────────────
  nutrition: {
    list: (limit) => invoke('nutrition:list', limit),
    save: (row)   => invoke('nutrition:save', row),
  },

  // ── Dashboard + Analytics ──────────────────────────────────
  dashboard: {
    summary:   ()            => invoke('dashboard:summary'),
    rmTrends:  (exerciseIds) => invoke('analytics:rm-trends', exerciseIds),
    session:   (id)          => invoke('analysis:session', id),
  },

  // ── Export ─────────────────────────────────────────────────
  export: {
    all:      ()                   => invoke('export:all'),
    saveFile: (filename, content)  => invoke('export:save-file', { filename, content }),
  },

  // ── Hevy integration ───────────────────────────────────────
  hevy: {
    setApiKey:         (key, secret) => invoke('hevy:set-api-key', { key, secret }),
    saveApiKey:        (key, secret) => invoke('hevy:save-api-key', { key, secret }),
    loadApiKey:        ()            => invoke('hevy:load-api-key'),
    testConnection:    (key)         => invoke('hevy:test-connection', key),
    getStatus:         ()            => invoke('hevy:get-status'),
    stop:              ()            => invoke('hevy:stop'),
    importLatest:      (key)         => invoke('hevy:import-latest', key),
    importLog:         ()            => invoke('hevy:import-log'),
    startIfConfigured: ()            => invoke('hevy:start-if-configured'),
    listWorkouts:      (key, page, pageSize) => invoke('hevy:list-workouts', { key, page, pageSize }),
    importById:        (key, workoutId)      => invoke('hevy:import-by-id', { key, workoutId }),
    importAll:         (key)                 => invoke('hevy:import-all', { key }),
    backfillStats:     ()                    => invoke('hevy:backfill-stats'),
    clearImportLog:    ()                    => invoke('hevy:clear-import-log'),
    onWorkoutImported: (cb) => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.on('hevy:workout-imported', (_, data) => cb(data));
    },
    onBulkProgress: (cb) => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.on('hevy:bulk-progress', (_, data) => cb(data));
    },
  },

});
