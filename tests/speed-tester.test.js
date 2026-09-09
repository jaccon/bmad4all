const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  THROTTLING_PROFILES,
  calculateThroughputMbps,
  probeClientSpeed
} = require('../src/shared/speed-tester.js');

describe('SpeedTester & Throttling Profiles', () => {
  test('defines standard network throttling profiles correctly', () => {
    assert.ok(THROTTLING_PROFILES.none);
    assert.equal(THROTTLING_PROFILES.none.latency, 0);
    assert.equal(THROTTLING_PROFILES.none.downloadThroughput, -1);

    assert.ok(THROTTLING_PROFILES['fast-4g']);
    assert.equal(THROTTLING_PROFILES['fast-4g'].latency, 20);
    assert.ok(THROTTLING_PROFILES['fast-4g'].downloadThroughput > 0);

    assert.ok(THROTTLING_PROFILES['slow-4g']);
    assert.equal(THROTTLING_PROFILES['slow-4g'].latency, 100);

    assert.ok(THROTTLING_PROFILES['fast-3g']);
    assert.equal(THROTTLING_PROFILES['fast-3g'].latency, 150);

    assert.ok(THROTTLING_PROFILES['slow-3g']);
    assert.equal(THROTTLING_PROFILES['slow-3g'].latency, 400);

    assert.ok(THROTTLING_PROFILES['broadband-50']);
    assert.equal(THROTTLING_PROFILES['broadband-50'].latency, 10);
  });

  test('calculateThroughputMbps computes Mbps accurately', () => {
    // 2,500,000 bytes in 1,000ms = 20,000,000 bits / 1s = 20.0 Mbps
    const mbps = calculateThroughputMbps(2500000, 1000);
    assert.equal(mbps, 20);

    // Boundary guards
    assert.equal(calculateThroughputMbps(0, 1000), 0);
    assert.equal(calculateThroughputMbps(1000, 0), 0);
    assert.equal(calculateThroughputMbps(-10, 100), 0);
    assert.equal(calculateThroughputMbps(100, -5), 0);
    assert.equal(calculateThroughputMbps(null, null), 0);
  });

  describe('probeClientSpeed with mock server', () => {
    let server;
    let port;

    before(async () => {
      server = http.createServer((req, res) => {
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'Content-Length': '0' });
          res.end();
          return;
        }

        // Return 500KB of test bytes
        const chunk = Buffer.alloc(100 * 1024, 'a');
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(500 * 1024)
        });

        for (let i = 0; i < 5; i++) {
          res.write(chunk);
        }
        res.end();
      });

      await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port;
          resolve();
        });
      });
    });

    after(async () => {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    test('measures ping and download throughput against mock endpoint', async () => {
      const mockUrl = `http://127.0.0.1:${port}/test`;
      const result = await probeClientSpeed({
        pingUrl: mockUrl,
        downloadUrl: mockUrl,
        timeoutMs: 3000
      });

      assert.equal(result.ok, true);
      assert.ok(typeof result.pingMs === 'number');
      assert.ok(result.downloadMbps > 0);
      assert.equal(result.bytesReceived, 500 * 1024);
      assert.ok(result.durationMs > 0);
    });

    test('handles unreachable endpoint gracefully without throwing uncaught error', async () => {
      const deadUrl = 'http://127.0.0.1:1'; // invalid port
      const result = await probeClientSpeed({
        pingUrl: deadUrl,
        downloadUrl: deadUrl,
        timeoutMs: 500
      });

      assert.equal(result.ok, false);
      assert.equal(result.downloadMbps, 0);
      assert.ok(result.error);
    });
  });
});
