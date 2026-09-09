const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SiteAuditor } = require('./auditor.js');
const { probeClientSpeed } = require('../shared/speed-tester.js');

let mainWindow = null;
let auditor = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0b0f19',
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

// IPC Handlers
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
  return { ok: false, error: 'Auditor não inicializado' };
});

ipcMain.handle('audit:stop', async () => {
  if (auditor) {
    await auditor.stopAudit();
    return { ok: true };
  }
  return { ok: false };
});

ipcMain.handle('network:probe-speed', async () => {
  return await probeClientSpeed();
});

ipcMain.handle('app:get-system-info', () => {
  return {
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform
  };
});

app.whenReady().then(() => {
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
});
