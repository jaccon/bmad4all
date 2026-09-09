const { BrowserWindow } = require('electron');
const { NetworkTracker } = require('../shared/network-tracker.js');
const { normalizeUrl, evaluateMetric, calculateOverallScore, ALLOWED_METRICS } = require('../shared/metrics-calculator.js');

// Injected Web Vitals collection script
const WEB_VITALS_INJECTION_SCRIPT = `
(function() {
  if (window.__bmad_vitals_installed) return;
  window.__bmad_vitals_installed = true;

  function report(name, value) {
    try {
      if (typeof name === 'string' && typeof value === 'number') {
        console.debug('__BMAD_METRIC__:' + JSON.stringify({ name: name, value: value }));
      }
    } catch(e) {}
  }

  // TTFB (Time to First Byte)
  try {
    const navEntries = performance.getEntriesByType('navigation');
    if (navEntries && navEntries.length > 0) {
      const nav = navEntries[0];
      const ttfb = nav.responseStart || (nav.responseEnd - nav.requestStart);
      if (ttfb > 0) report('TTFB', Math.round(ttfb));
    }
  } catch(e) {}

  // FCP (First Contentful Paint)
  try {
    const paintObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          report('FCP', Math.round(entry.startTime));
        }
      }
    });
    paintObserver.observe({ type: 'paint', buffered: true });
  } catch(e) {}

  // LCP (Largest Contentful Paint)
  try {
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      if (entries.length > 0) {
        const lastEntry = entries[entries.length - 1];
        report('LCP', Math.round(lastEntry.startTime));
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch(e) {}

  // CLS (Cumulative Layout Shift)
  try {
    let clsVal = 0;
    const clsObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          clsVal += entry.value;
          report('CLS', parseFloat(clsVal.toFixed(3)));
        }
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch(e) {}

  // INP / FID
  try {
    const fidObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const delay = entry.processingStart - entry.startTime;
        report('INP', Math.round(delay));
      }
    });
    fidObserver.observe({ type: 'first-input', buffered: true });
  } catch(e) {}
})();
`;

class SiteAuditor {
  constructor(senderWindow) {
    this.senderWindow = senderWindow;
    this.targetWindow = null;
    this.networkTracker = new NetworkTracker();
    this.metrics = {
      LCP: null,
      FCP: null,
      CLS: null,
      TTFB: null,
      INP: null
    };
    this.overallScore = 0;
    this.activeUrl = '';
    this.isRunning = false;
    this.isStarting = false;
    this.isStoppedByUser = false;
    this.attachedDebugger = false;
    this.loadStartTime = 0;
    this.auditTimeoutTimer = null;
  }

  emit(channel, payload) {
    if (this.senderWindow && !this.senderWindow.isDestroyed() && !this.senderWindow.webContents.isDestroyed()) {
      this.senderWindow.webContents.send(channel, payload);
    }
  }

  async startAudit(rawUrl) {
    if (this.isStarting) return;
    this.isStarting = true;

    if (this.isRunning) {
      await this.stopAudit();
    }

    let url;
    try {
      url = normalizeUrl(rawUrl);
    } catch (err) {
      this.isStarting = false;
      this.emit('audit:error', { message: err.message });
      return;
    }

    this.activeUrl = url;
    this.isRunning = true;
    this.isStoppedByUser = false;
    this.networkTracker.reset();
    this.metrics = { LCP: null, FCP: null, CLS: null, TTFB: null, INP: null };
    this.overallScore = 0;
    this.loadStartTime = Date.now();

    // Timeout guard: 45s maximum per audit
    if (this.auditTimeoutTimer) clearTimeout(this.auditTimeoutTimer);
    this.auditTimeoutTimer = setTimeout(() => {
      if (this.isRunning) {
        this.emit('audit:status', {
          status: 'completed',
          url: this.activeUrl,
          message: 'Auditoria finalizada por tempo limite (45s).'
        });
      }
    }, 45000);

    this.emit('audit:status', {
      status: 'starting',
      url,
      message: `Iniciando auditoria para ${url}...`
    });

    try {
      this.targetWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false, // background/headless
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      });

      const wc = this.targetWindow.webContents;

      // Hardening: deny popups and mute audio
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      wc.setAudioMuted(true);

      // Handle crashes and window closure
      this.targetWindow.on('closed', () => {
        this.targetWindow = null;
        this.attachedDebugger = false;
        if (!this.isStoppedByUser && this.isRunning) {
          this.isRunning = false;
        }
      });

      wc.on('render-process-gone', (event, details) => {
        this.isRunning = false;
        this.emit('audit:status', {
          status: 'failed',
          url: this.activeUrl,
          message: `Processo de renderização terminou inesperadamente: ${details.reason}`
        });
      });

      try {
        wc.debugger.attach('1.3');
        this.attachedDebugger = true;

        wc.debugger.on('message', (event, method, params) => {
          this.handleCdpMessage(method, params);
        });

        await wc.debugger.sendCommand('Network.enable');
        await wc.debugger.sendCommand('Page.enable');
        await wc.debugger.sendCommand('Runtime.enable');

        // Inject Web Vitals observer before scripts execute
        await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
          source: WEB_VITALS_INJECTION_SCRIPT
        });
      } catch (dbgErr) {
        console.warn('Debugger attach warning (will fallback to webContents events):', dbgErr.message);
      }

      this.emit('audit:status', {
        status: 'navigating',
        url,
        message: 'Conectando e transmitindo requisições de rede...'
      });

      // Track lifecycle events
      wc.on('did-start-loading', () => {
        if (!this.isRunning) return;
        this.emit('audit:status', {
          status: 'loading',
          url,
          message: 'Carregando recursos e renderizando página...'
        });
      });

      wc.on('dom-ready', async () => {
        if (!this.isRunning) return;
        this.emit('audit:status', {
          status: 'dom-ready',
          url,
          message: 'DOM carregado. Avaliando métricas de performance...'
        });
        await this.extractFallbackMetrics();
      });

      wc.on('did-finish-load', async () => {
        if (!this.isRunning) return;
        const totalLoadTime = Date.now() - this.loadStartTime;
        await this.extractFallbackMetrics();
        this.overallScore = calculateOverallScore(this.metrics);

        this.emit('audit:status', {
          status: 'completed',
          url,
          totalLoadTime,
          message: `Carregamento concluído em ${(totalLoadTime / 1000).toFixed(2)}s. Auditoria ativa monitorando requisições assíncronas.`
        });
      });

      wc.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (this.isStoppedByUser || errorCode === -3 || isMainFrame === false) return;
        this.isRunning = false;
        this.emit('audit:status', {
          status: 'failed',
          url: validatedURL,
          errorCode,
          errorDescription,
          message: `Falha no carregamento: ${errorDescription} (${errorCode})`
        });
      });

      this.isStarting = false;
      await wc.loadURL(url);
    } catch (err) {
      this.isStarting = false;
      if (this.isStoppedByUser) return; // User stopped, not an error
      this.isRunning = false;
      this.emit('audit:error', { message: `Erro ao auditar página: ${err.message}` });
    }
  }

  handleCdpMessage(method, params) {
    if (!this.isRunning || !params) return;

    switch (method) {
      case 'Network.requestWillBeSent': {
        const record = this.networkTracker.onRequestWillBeSent(params);
        if (record) {
          this.emit('audit:request-started', {
            request: record,
            stats: this.networkTracker.getStats()
          });
        }
        break;
      }

      case 'Network.responseReceived': {
        const record = this.networkTracker.onResponseReceived(params);
        if (record) {
          this.emit('audit:response-received', {
            request: record,
            stats: this.networkTracker.getStats()
          });
        }
        break;
      }

      case 'Network.loadingFinished': {
        const record = this.networkTracker.onLoadingFinished(params);
        if (record) {
          this.emit('audit:request-finished', {
            request: record,
            stats: this.networkTracker.getStats()
          });
        }
        break;
      }

      case 'Network.loadingFailed': {
        const record = this.networkTracker.onLoadingFailed(params);
        if (record) {
          this.emit('audit:request-failed', {
            request: record,
            stats: this.networkTracker.getStats()
          });
        }
        break;
      }

      case 'Runtime.consoleAPICalled': {
        if (params.type === 'debug' && params.args && params.args[0] && typeof params.args[0].value === 'string') {
          const text = params.args[0].value;
          if (text.startsWith('__BMAD_METRIC__:')) {
            try {
              const data = JSON.parse(text.slice(16));
              if (data && typeof data === 'object' && typeof data.name === 'string') {
                this.updateMetric(data.name, data.value);
              }
            } catch (e) {}
          }
        }
        break;
      }
    }
  }

  updateMetric(name, value) {
    if (!ALLOWED_METRICS.has(name) || typeof value !== 'number' || isNaN(value)) return;

    this.metrics[name] = value;
    const evaluated = evaluateMetric(name, value);
    this.overallScore = calculateOverallScore(this.metrics);

    this.emit('audit:metric-update', {
      name,
      value,
      evaluated,
      allMetrics: this.metrics,
      overallScore: this.overallScore
    });
  }

  async extractFallbackMetrics() {
    if (!this.targetWindow || this.targetWindow.isDestroyed()) return;

    try {
      const timing = await this.targetWindow.webContents.executeJavaScript(`
        (function() {
          try {
            const nav = performance.getEntriesByType('navigation')[0];
            const paint = performance.getEntriesByType('paint');
            let fcp = 0;
            for (const p of paint) {
              if (p.name === 'first-contentful-paint') fcp = Math.round(p.startTime);
            }
            const ttfb = nav ? Math.round(nav.responseStart) : 0;
            const domContentLoaded = nav ? Math.round(nav.domContentLoadedEventEnd) : 0;
            const loadEvent = nav ? Math.round(nav.loadEventEnd) : 0;
            return { fcp, ttfb, domContentLoaded, loadEvent };
          } catch(e) {
            return null;
          }
        })()
      `);

      if (timing) {
        if (timing.ttfb > 0 && this.metrics.TTFB === null) {
          this.updateMetric('TTFB', timing.ttfb);
        }
        if (timing.fcp > 0 && this.metrics.FCP === null) {
          this.updateMetric('FCP', timing.fcp);
        }
      }
    } catch (e) {
      // Ignored if window closed or script restricted
    }
  }

  async stopAudit() {
    this.isStoppedByUser = true;
    this.isRunning = false;
    this.isStarting = false;

    if (this.auditTimeoutTimer) {
      clearTimeout(this.auditTimeoutTimer);
      this.auditTimeoutTimer = null;
    }

    if (this.targetWindow && !this.targetWindow.isDestroyed()) {
      if (this.attachedDebugger) {
        try {
          this.targetWindow.webContents.debugger.detach();
        } catch (e) {}
        this.attachedDebugger = false;
      }
      try {
        this.targetWindow.close();
      } catch (e) {}
      this.targetWindow = null;
    }

    this.emit('audit:status', {
      status: 'stopped',
      url: this.activeUrl,
      message: 'Auditoria interrompida.'
    });
  }
}

module.exports = { SiteAuditor, WEB_VITALS_INJECTION_SCRIPT };
