const http = require('http');
const https = require('https');
const { URL } = require('url');

const THROTTLING_PROFILES = {
  none: {
    id: 'none',
    name: 'Banda Real (Sem Limitação)',
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
    connectionType: 'none'
  },
  'fast-4g': {
    id: 'fast-4g',
    name: 'Fast 4G / LTE (25 Mbps, 20ms)',
    latency: 20,
    downloadThroughput: Math.round((25 * 1024 * 1024) / 8),
    uploadThroughput: Math.round((10 * 1024 * 1024) / 8),
    connectionType: 'cellular4g'
  },
  'slow-4g': {
    id: 'slow-4g',
    name: 'Slow 4G (4 Mbps, 100ms)',
    latency: 100,
    downloadThroughput: Math.round((4 * 1024 * 1024) / 8),
    uploadThroughput: Math.round((1.5 * 1024 * 1024) / 8),
    connectionType: 'cellular4g'
  },
  'fast-3g': {
    id: 'fast-3g',
    name: 'Fast 3G (1.6 Mbps, 150ms)',
    latency: 150,
    downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8),
    uploadThroughput: Math.round((750 * 1024) / 8),
    connectionType: 'cellular3g'
  },
  'slow-3g': {
    id: 'slow-3g',
    name: 'Slow 3G (400 Kbps, 400ms)',
    latency: 400,
    downloadThroughput: Math.round((400 * 1024) / 8),
    uploadThroughput: Math.round((400 * 1024) / 8),
    connectionType: 'cellular3g'
  },
  'broadband-50': {
    id: 'broadband-50',
    name: 'Cabo / Wi-Fi (50 Mbps, 10ms)',
    latency: 10,
    downloadThroughput: Math.round((50 * 1024 * 1024) / 8),
    uploadThroughput: Math.round((20 * 1024 * 1024) / 8),
    connectionType: 'wifi'
  }
};

function calculateThroughputMbps(bytes, durationMs) {
  if (typeof bytes !== 'number' || typeof durationMs !== 'number' || durationMs <= 0 || bytes <= 0) {
    return 0;
  }
  const durationSec = durationMs / 1000;
  const bits = bytes * 8;
  return parseFloat((bits / (durationSec * 1000000)).toFixed(2));
}

function fetchProbe(targetUrl, method = 'HEAD', timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;

      const req = client.request(parsed, { method, timeout: timeoutMs }, (res) => {
        res.resume(); // consume response stream
        res.on('end', () => resolve({ statusCode: res.statusCode }));
      });

      req.on('timeout', () => {
        req.destroy(new Error('Probe timeout'));
      });

      req.on('error', (err) => reject(err));
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

function fetchDownloadBytes(targetUrl, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;

      let totalBytes = 0;
      const req = client.get(parsed, { timeout: timeoutMs }, (res) => {
        res.on('data', (chunk) => {
          totalBytes += chunk.length;
        });

        res.on('end', () => resolve(totalBytes));
        res.on('error', (err) => reject(err));
      });

      req.on('timeout', () => {
        req.destroy(new Error('Download timeout'));
      });

      req.on('error', (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}

async function probeClientSpeed(options = {}) {
  const pingUrl = options.pingUrl || 'https://speed.cloudflare.com/__down?bytes=0';
  const downloadUrl = options.downloadUrl || 'https://speed.cloudflare.com/__down?bytes=2000000';
  const timeoutMs = options.timeoutMs || 7000;

  // 1. Measure Ping (RTT)
  let pingMs = 0;
  try {
    const t0 = performance.now();
    await fetchProbe(pingUrl, 'HEAD', timeoutMs);
    pingMs = Math.max(1, Math.round(performance.now() - t0));
  } catch (err) {
    // If HEAD fails, try simple GET probe
    try {
      const t1 = performance.now();
      await fetchProbe(pingUrl, 'GET', timeoutMs);
      pingMs = Math.max(1, Math.round(performance.now() - t1));
    } catch (fallbackErr) {
      pingMs = 0;
    }
  }

  // 2. Measure Download Throughput
  try {
    const tStart = performance.now();
    const bytes = await fetchDownloadBytes(downloadUrl, timeoutMs);
    const durationMs = Math.max(1, Math.round(performance.now() - tStart));
    const mbps = calculateThroughputMbps(bytes, durationMs);

    return {
      ok: true,
      pingMs,
      downloadMbps: mbps,
      bytesReceived: bytes,
      durationMs,
      timestamp: Date.now()
    };
  } catch (err) {
    return {
      ok: false,
      pingMs,
      downloadMbps: 0,
      error: err.message || String(err),
      timestamp: Date.now()
    };
  }
}

module.exports = {
  THROTTLING_PROFILES,
  calculateThroughputMbps,
  probeClientSpeed
};
