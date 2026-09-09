/**
 * Metrics Calculator & Network Utilities
 * Conforms to Google PageSpeed / Web Vitals thresholds
 */

const THRESHOLDS = {
  LCP: {
    good: 2500,
    needsImprovement: 4000,
    unit: 'ms',
    title: 'Largest Contentful Paint',
    weight: 0.30
  },
  FCP: {
    good: 1800,
    needsImprovement: 3000,
    unit: 'ms',
    title: 'First Contentful Paint',
    weight: 0.20
  },
  CLS: {
    good: 0.1,
    needsImprovement: 0.25,
    unit: '',
    title: 'Cumulative Layout Shift',
    weight: 0.25
  },
  TTFB: {
    good: 800,
    needsImprovement: 1800,
    unit: 'ms',
    title: 'Time to First Byte',
    weight: 0.15
  },
  INP: {
    good: 200,
    needsImprovement: 500,
    unit: 'ms',
    title: 'Interaction to Next Paint',
    weight: 0.10
  }
};

const ALLOWED_METRICS = new Set(Object.keys(THRESHOLDS));

/**
 * Normalizes and validates a user-provided URL.
 * Defaults to https:// if scheme is missing.
 */
function normalizeUrl(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('URL inválida: campo vazio ou nulo.');
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('URL inválida: campo vazio.');
  }

  // Check if a non-http(s) protocol was explicitly specified
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch) {
    const protocol = schemeMatch[1].toLowerCase();
    if (!['http', 'https'].includes(protocol)) {
      throw new Error('Protocolo não permitido: use http ou https.');
    }
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (!parsed.hostname || parsed.hostname.length < 1) {
      throw new Error('URL inválida: hostname ausente.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Protocolo não permitido: use http ou https.');
    }
    return parsed.href;
  } catch (err) {
    if (err.message && err.message.includes('Protocolo não permitido')) {
      throw err;
    }
    throw new Error(`URL inválida: ${err.message}`);
  }
}

/**
 * Evaluates a Web Vital against standard thresholds.
 */
function evaluateMetric(name, value) {
  if (!ALLOWED_METRICS.has(name) || typeof value !== 'number' || isNaN(value) || value < 0) {
    return {
      rating: 'unknown',
      label: 'N/A',
      color: '#94a3b8',
      value: (typeof value === 'number' && !isNaN(value)) ? value : null
    };
  }

  const cfg = THRESHOLDS[name];
  let rating = 'good';
  let label = 'Bom';
  let color = '#10b981'; // Emerald-500

  if (value > cfg.needsImprovement) {
    rating = 'poor';
    label = 'Ruim';
    color = '#ef4444'; // Red-500
  } else if (value > cfg.good) {
    rating = 'needs-improvement';
    label = 'Precisa melhorar';
    color = '#f59e0b'; // Amber-500
  }

  return {
    rating,
    label,
    color,
    value
  };
}

/**
 * Calculates a composite PageSpeed-style performance score from 0 to 100.
 */
function calculateOverallScore(metrics = {}) {
  if (!metrics || typeof metrics !== 'object') return 0;

  let totalWeight = 0;
  let weightedScore = 0;

  for (const [key, cfg] of Object.entries(THRESHOLDS)) {
    const val = metrics[key];
    if (typeof val === 'number' && !isNaN(val) && val >= 0) {
      totalWeight += cfg.weight;

      // Score curve per metric: 1.0 (good) down to 0.0 (poor)
      let metricScore = 1.0;
      if (val <= cfg.good) {
        metricScore = 1.0 - (val / cfg.good) * 0.1; // 0.90 - 1.0
      } else if (val <= cfg.needsImprovement) {
        const span = cfg.needsImprovement - cfg.good;
        const progress = (val - cfg.good) / span;
        metricScore = 0.89 - progress * 0.40; // 0.49 - 0.89
      } else {
        const over = val - cfg.needsImprovement;
        const decay = Math.min(over / cfg.needsImprovement, 1.0);
        metricScore = Math.max(0.48 - decay * 0.48, 0.0); // 0 - 0.48
      }

      weightedScore += metricScore * cfg.weight;
    }
  }

  if (totalWeight === 0) return 0;
  const normalized = (weightedScore / totalWeight) * 100;
  return Math.round(Math.max(0, Math.min(100, normalized)));
}

/**
 * Classifies network resource types into user-friendly groups.
 */
function classifyResourceType(resourceType = '', mimeType = '') {
  const typeLower = (resourceType || '').toLowerCase();
  const mimeLower = (mimeType || '').toLowerCase();

  if (typeLower === 'xhr' || typeLower === 'fetch' || mimeLower.includes('json') || mimeLower.includes('xml')) {
    return 'fetch';
  }
  if (typeLower === 'script' || mimeLower.includes('javascript') || mimeLower.includes('ecmascript')) {
    return 'script';
  }
  if (typeLower === 'stylesheet' || mimeLower.includes('css')) {
    return 'stylesheet';
  }
  if (typeLower === 'image' || mimeLower.startsWith('image/')) {
    return 'image';
  }
  if (typeLower === 'font' || mimeLower.startsWith('font/') || mimeLower.includes('woff')) {
    return 'font';
  }
  if (typeLower === 'document' || mimeLower.includes('html')) {
    return 'document';
  }
  if (typeLower === 'media' || mimeLower.startsWith('video/') || mimeLower.startsWith('audio/')) {
    return 'media';
  }

  return 'other';
}

/**
 * Formats byte counts into human readable strings.
 */
function formatBytes(bytes) {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Formats duration in milliseconds or seconds.
 */
function formatDuration(ms) {
  if (typeof ms !== 'number' || isNaN(ms) || ms < 0) return '0 ms';
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Detects whether a request is an API call (REST, GraphQL, XHR, Fetch, JSON endpoint).
 */
function isApiRequest(url = '', resourceType = '', mimeType = '', method = 'GET') {
  const urlLower = (url || '').toLowerCase();
  const typeLower = (resourceType || '').toLowerCase();
  const mimeLower = (mimeType || '').toLowerCase();
  const methodUpper = (method || 'GET').toUpperCase();

  // 1. Explicit XHR / Fetch resource types
  if (typeLower === 'xhr' || typeLower === 'fetch') {
    return true;
  }

  // 2. JSON, GraphQL, XML or event-stream content types
  if (
    mimeLower.includes('json') ||
    mimeLower.includes('graphql') ||
    mimeLower.includes('xml') ||
    mimeLower.includes('text/event-stream')
  ) {
    return true;
  }

  // 3. API URL patterns
  if (
    urlLower.includes('/api/') ||
    urlLower.includes('/api?') ||
    urlLower.endsWith('/api') ||
    urlLower.includes('/v1/') ||
    urlLower.includes('/v2/') ||
    urlLower.includes('/v3/') ||
    urlLower.includes('/v4/') ||
    urlLower.includes('/graphql') ||
    urlLower.includes('/rest/') ||
    urlLower.includes('/endpoints/')
  ) {
    return true;
  }

  // 4. Mutation HTTP methods (POST, PUT, PATCH, DELETE) targeting endpoints
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(methodUpper)) {
    return true;
  }

  return false;
}

/**
 * Extracts origin/base domain for API grouping.
 */
function extractApiOrigin(urlStr = '') {
  try {
    const u = new URL(urlStr);
    return u.origin;
  } catch (e) {
    return '';
  }
}

module.exports = {
  THRESHOLDS,
  ALLOWED_METRICS,
  normalizeUrl,
  evaluateMetric,
  calculateOverallScore,
  classifyResourceType,
  formatBytes,
  formatDuration,
  isApiRequest,
  extractApiOrigin
};
