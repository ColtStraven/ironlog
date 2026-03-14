'use strict';

// ─────────────────────────────────────────────────────────────
//  IronLog · Preload
//  Exposes a typed API surface to the renderer via contextBridge.
//  Renderer code calls window.api.xxx() — never require() directly.
// ─────────────────────────────────────────────────────────────

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

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

});
