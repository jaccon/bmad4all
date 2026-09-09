const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeUrl,
  evaluateMetric,
  calculateOverallScore,
  classifyResourceType,
  formatBytes,
  formatDuration,
  isApiRequest,
  extractApiOrigin,
  THRESHOLDS
} = require('../src/shared/metrics-calculator.js');

describe('Metrics and Network Utilities', () => {
  describe('normalizeUrl', () => {
    test('should add https:// protocol if missing', () => {
      assert.equal(normalizeUrl('example.com'), 'https://example.com/');
      assert.equal(normalizeUrl('www.google.com/test'), 'https://www.google.com/test');
    });

    test('should preserve http:// protocol for localhost or custom urls', () => {
      assert.equal(normalizeUrl('http://localhost:3000'), 'http://localhost:3000/');
    });

    test('should throw error for invalid url format', () => {
      assert.throws(() => normalizeUrl(''), /URL inválida/);
      assert.throws(() => normalizeUrl('   '), /URL inválida/);
      assert.throws(() => normalizeUrl('http://'), /URL inválida/);
    });

    test('should reject non-http/https protocols', () => {
      assert.throws(() => normalizeUrl('javascript:alert(1)'), /Protocolo não permitido/);
      assert.throws(() => normalizeUrl('file:///etc/passwd'), /Protocolo não permitido/);
      assert.throws(() => normalizeUrl('data:text/html,<h1>hi</h1>'), /Protocolo não permitido/);
    });
  });

  describe('evaluateMetric', () => {
    test('LCP evaluation conforms to Google PageSpeed thresholds', () => {
      assert.deepEqual(evaluateMetric('LCP', 1500), {
        rating: 'good',
        label: 'Bom',
        color: '#10b981',
        value: 1500
      });
      assert.deepEqual(evaluateMetric('LCP', 3000), {
        rating: 'needs-improvement',
        label: 'Precisa melhorar',
        color: '#f59e0b',
        value: 3000
      });
      assert.deepEqual(evaluateMetric('LCP', 5000), {
        rating: 'poor',
        label: 'Ruim',
        color: '#ef4444',
        value: 5000
      });
    });

    test('handles boundary threshold values accurately', () => {
      // 2500 is good (<= 2500)
      assert.equal(evaluateMetric('LCP', 2500).rating, 'good');
      // 2501 is needs-improvement
      assert.equal(evaluateMetric('LCP', 2501).rating, 'needs-improvement');
      // 4000 is needs-improvement (<= 4000)
      assert.equal(evaluateMetric('LCP', 4000).rating, 'needs-improvement');
      // 4001 is poor
      assert.equal(evaluateMetric('LCP', 4001).rating, 'poor');
    });

    test('protects against prototype pollution and unallowed metric names', () => {
      assert.equal(evaluateMetric('__proto__', 100).rating, 'unknown');
      assert.equal(evaluateMetric('constructor', 100).rating, 'unknown');
      assert.equal(evaluateMetric('UNKNOWN', 100).rating, 'unknown');
    });

    test('guards against non-numeric or negative values', () => {
      assert.equal(evaluateMetric('LCP', null).rating, 'unknown');
      assert.equal(evaluateMetric('LCP', NaN).rating, 'unknown');
      assert.equal(evaluateMetric('LCP', -50).rating, 'unknown');
    });
  });

  describe('calculateOverallScore', () => {
    test('calculates 100 for optimal metrics', () => {
      const metrics = {
        LCP: 1200,
        FCP: 800,
        CLS: 0.02,
        TTFB: 200
      };
      const score = calculateOverallScore(metrics);
      assert.ok(score >= 90 && score <= 100);
    });

    test('calculates poor score for slow metrics', () => {
      const metrics = {
        LCP: 6000,
        FCP: 4000,
        CLS: 0.5,
        TTFB: 3000
      };
      const score = calculateOverallScore(metrics);
      assert.ok(score < 50);
    });

    test('guards null or non-object metrics parameter', () => {
      assert.equal(calculateOverallScore(null), 0);
      assert.equal(calculateOverallScore(undefined), 0);
      assert.equal(calculateOverallScore('string'), 0);
    });
  });

  describe('classifyResourceType', () => {
    test('classifies standard resource types correctly', () => {
      assert.equal(classifyResourceType('XHR', 'application/json'), 'fetch');
      assert.equal(classifyResourceType('Fetch', 'application/json'), 'fetch');
      assert.equal(classifyResourceType('Script', 'application/javascript'), 'script');
      assert.equal(classifyResourceType('Stylesheet', 'text/css'), 'stylesheet');
      assert.equal(classifyResourceType('Image', 'image/webp'), 'image');
      assert.equal(classifyResourceType('Document', 'text/html'), 'document');
      assert.equal(classifyResourceType('Font', 'font/woff2'), 'font');
    });
  });

  describe('formatBytes & formatDuration', () => {
    test('formats byte sizes cleanly', () => {
      assert.equal(formatBytes(0), '0 B');
      assert.equal(formatBytes(512), '512 B');
      assert.equal(formatBytes(1024), '1.0 KB');
      assert.equal(formatBytes(1048576), '1.0 MB');
      assert.equal(formatBytes(1073741824), '1.0 GB');
    });

    test('handles >= 1TB without undefined units', () => {
      assert.equal(formatBytes(1099511627776), '1.0 TB');
      assert.equal(formatBytes(5000000000000), '4.5 TB');
    });

    test('guards non-numeric and negative byte inputs', () => {
      assert.equal(formatBytes(null), '0 B');
      assert.equal(formatBytes(NaN), '0 B');
      assert.equal(formatBytes(-100), '0 B');
    });

    test('formats duration cleanly', () => {
      assert.equal(formatDuration(45), '45 ms');
      assert.equal(formatDuration(1500), '1.50 s');
      assert.equal(formatDuration(null), '0 ms');
      assert.equal(formatDuration(-10), '0 ms');
    });
  });

  describe('isApiRequest & extractApiOrigin', () => {
    test('identifies XHR and Fetch as API requests', () => {
      assert.equal(isApiRequest('https://site.com/data', 'XHR', '', 'GET'), true);
      assert.equal(isApiRequest('https://site.com/data', 'Fetch', '', 'GET'), true);
    });

    test('identifies JSON, GraphQL and XML mime types as API requests', () => {
      assert.equal(isApiRequest('https://site.com/endpoint', 'Other', 'application/json', 'GET'), true);
      assert.equal(isApiRequest('https://site.com/query', 'Other', 'application/graphql+json', 'GET'), true);
      assert.equal(isApiRequest('https://site.com/feed', 'Other', 'text/xml', 'GET'), true);
    });

    test('identifies REST/API url patterns as API requests', () => {
      assert.equal(isApiRequest('https://site.com/api/users', 'Other', '', 'GET'), true);
      assert.equal(isApiRequest('https://site.com/v1/auth', 'Other', '', 'GET'), true);
      assert.equal(isApiRequest('https://site.com/v2/orders', 'Other', '', 'GET'), true);
      assert.equal(isApiRequest('https://site.com/graphql', 'Other', '', 'GET'), true);
      assert.equal(isApiRequest('https://site.com/rest/products', 'Other', '', 'GET'), true);
    });

    test('identifies POST, PUT, PATCH, DELETE as API requests', () => {
      assert.equal(isApiRequest('https://site.com/submit', 'Other', '', 'POST'), true);
      assert.equal(isApiRequest('https://site.com/update', 'Other', '', 'PUT'), true);
      assert.equal(isApiRequest('https://site.com/change', 'Other', '', 'PATCH'), true);
      assert.equal(isApiRequest('https://site.com/remove', 'Other', '', 'DELETE'), true);
    });

    test('does not classify standard static assets as API requests', () => {
      assert.equal(isApiRequest('https://site.com/app.js', 'Script', 'application/javascript', 'GET'), false);
      assert.equal(isApiRequest('https://site.com/style.css', 'Stylesheet', 'text/css', 'GET'), false);
      assert.equal(isApiRequest('https://site.com/logo.png', 'Image', 'image/png', 'GET'), false);
      assert.equal(isApiRequest('https://site.com/font.woff2', 'Font', 'font/woff2', 'GET'), false);
      assert.equal(isApiRequest('https://site.com/index.html', 'Document', 'text/html', 'GET'), false);
    });

    test('extracts API origin cleanly', () => {
      assert.equal(extractApiOrigin('https://api.stripe.com/v1/charges'), 'https://api.stripe.com');
      assert.equal(extractApiOrigin('http://localhost:8080/api/test'), 'http://localhost:8080');
      assert.equal(extractApiOrigin('invalid-url'), '');
    });
  });
});
