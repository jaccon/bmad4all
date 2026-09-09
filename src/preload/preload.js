const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startAudit: (urlOrPayload, throttling) => {
    if (typeof urlOrPayload === 'string') {
      return ipcRenderer.invoke('audit:start', { url: urlOrPayload, throttling: throttling || 'none' });
    }
    return ipcRenderer.invoke('audit:start', urlOrPayload);
  },
  stopAudit: () => ipcRenderer.invoke('audit:stop'),
  probeSpeed: () => ipcRenderer.invoke('network:probe-speed'),
  getSystemInfo: () => ipcRenderer.invoke('app:get-system-info'),

  // SQLite History API
  getHistory: (limit) => ipcRenderer.invoke('history:get-all', limit),
  saveAuditHistory: (record) => ipcRenderer.invoke('history:save', record),
  deleteAuditHistory: (id) => ipcRenderer.invoke('history:delete', id),
  clearAuditHistory: () => ipcRenderer.invoke('history:clear'),

  onRequestStarted: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('audit:request-started', handler);
    return () => ipcRenderer.removeListener('audit:request-started', handler);
  },

  onResponseReceived: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('audit:response-received', handler);
    return () => ipcRenderer.removeListener('audit:response-received', handler);
  },

  onRequestFinished: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('audit:request-finished', handler);
    return () => ipcRenderer.removeListener('audit:request-finished', handler);
  },

  onRequestFailed: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('audit:request-failed', handler);
    return () => ipcRenderer.removeListener('audit:request-failed', handler);
  },

  onMetricUpdate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('audit:metric-update', handler);
    return () => ipcRenderer.removeListener('audit:metric-update', handler);
  },

  onStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('audit:status', handler);
    return () => ipcRenderer.removeListener('audit:status', handler);
  },

  onError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('audit:error', handler);
    return () => ipcRenderer.removeListener('audit:error', handler);
  }
});
