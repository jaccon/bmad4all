const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SiteAuditor } = require('./auditor.js');
const { probeClientSpeed } = require('../shared/speed-tester.js');
const { AuditDatabase } = require('./db.js');

let mainWindow = null;
let auditor = null;
let auditDb = null;

function getDatabase() {
  if (!auditDb) {
    let dbDir;
    try {
      dbDir = app.getPath('userData');
    } catch (e) {
      dbDir = path.join(__dirname, '../../data');
    }
    const dbPath = path.join(dbDir, 'audit_history.sqlite');
    auditDb = new AuditDatabase(dbPath);
  }
  return auditDb;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#000000',
    title: 'PageSpeed & Network Monitor',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  auditor = new SiteAuditor(mainWindow);

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    if (auditor) {
      auditor.stopAudit();
    }
    mainWindow = null;
    auditor = null;
  });
}

// IPC Handlers: Audit Execution
ipcMain.handle('audit:start', async (event, payload) => {
  if (!auditor && mainWindow) {
    auditor = new SiteAuditor(mainWindow);
  }
  if (auditor) {
    const url = (typeof payload === 'string') ? payload : (payload && payload.url);
    const throttling = (typeof payload === 'object' && payload && payload.throttling) ? payload.throttling : 'none';
    await auditor.startAudit(url, throttling);
    return { ok: true };
  }
  return { ok: false, error: 'Auditor not initialized' };
});

ipcMain.handle('audit:stop', async () => {
  if (auditor) {
    await auditor.stopAudit();
    return { ok: true };
  }
  return { ok: false };
});

// IPC Handlers: Network Speed Probe
ipcMain.handle('network:probe-speed', async () => {
  return await probeClientSpeed();
});

// IPC Handlers: SQLite Audit History
ipcMain.handle('history:get-all', async (event, limit) => {
  try {
    const db = getDatabase();
    return await db.getHistory(limit || 100);
  } catch (err) {
    console.error('[Main] history:get-all error:', err.message);
    return [];
  }
});

ipcMain.handle('history:save', async (event, record) => {
  try {
    const db = getDatabase();
    return await db.saveAudit(record || {});
  } catch (err) {
    console.error('[Main] history:save error:', err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('history:delete', async (event, id) => {
  try {
    const db = getDatabase();
    return await db.deleteAudit(id);
  } catch (err) {
    console.error('[Main] history:delete error:', err.message);
    return false;
  }
});

ipcMain.handle('history:clear', async () => {
  try {
    const db = getDatabase();
    return await db.clearHistory();
  } catch (err) {
    console.error('[Main] history:clear error:', err.message);
    return false;
  }
});

ipcMain.handle('app:get-system-info', () => {
  return {
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform
  };
});

app.whenReady().then(async () => {
  try {
    const db = getDatabase();
    await db.init();
  } catch (e) {
    console.error('[Main] Failed to initialize SQLite database:', e.message);
  }

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (auditor) {
    await auditor.stopAudit();
  }
  if (auditDb) {
    auditDb.close();
  }
});
