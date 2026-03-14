'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const { initDatabase, registerHandlers, getDbHelpers } = require('./database');
const { registerHevyHandlers, startWebhookServer }     = require('./hevy');

let win;

function createWindow() {
  win = new BrowserWindow({
    width:  1280,
    height: 820,
    minWidth:  900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#f5f4f0',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(async () => {
  try {
    await initDatabase(app.getPath('userData'));
    registerHandlers(ipcMain);

    // ── Native save-file dialog ──────────────────────────────────────────
    ipcMain.handle('export:save-file', async (_, { filename, content }) => {
      const { filePath, canceled } = await dialog.showSaveDialog(win, {
        defaultPath: filename,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (canceled || !filePath) return { ok: false };
      fs.writeFileSync(filePath, content, 'utf8');
      return { ok: true, filePath };
    });

    createWindow();

    // ── Hevy integration ─────────────────────────────────────────────────
    // Register handlers first (win is available after createWindow)
    registerHevyHandlers(ipcMain, win, getDbHelpers());

    // Auto-start webhook server if API key is saved in settings
    ipcMain.handle('hevy:start-if-configured', () => {
      const settingsPath = path.join(app.getPath('userData'), 'hevy-settings.json');
      if (fs.existsSync(settingsPath)) {
        try {
          const { apiKey, webhookSecret } = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          if (apiKey) {
            startWebhookServer(apiKey, webhookSecret || null, result => {
              if (win && !win.isDestroyed()) {
                win.webContents.send('hevy:workout-imported', result);
              }
            });
          }
        } catch {}
      }
      return { ok: true };
    });

    // Persist API key to file when set
    ipcMain.handle('hevy:save-api-key', (_, { key, secret }) => {
      const settingsPath = path.join(app.getPath('userData'), 'hevy-settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify({ apiKey: key, webhookSecret: secret }), 'utf8');
      return { ok: true };
    });

    ipcMain.handle('hevy:load-api-key', () => {
      const settingsPath = path.join(app.getPath('userData'), 'hevy-settings.json');
      if (!fs.existsSync(settingsPath)) return { apiKey: '', webhookSecret: '' };
      try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
      catch { return { apiKey: '', webhookSecret: '' }; }
    });

  } catch (err) {
    console.error('[main] Failed to init database:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
