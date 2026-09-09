const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { NetworkTracker } = require('../src/shared/network-tracker.js');

describe('NetworkTracker', () => {
  test('tracks request lifecycle from sent to response to finished', () => {
    const tracker = new NetworkTracker();

    tracker.onRequestWillBeSent({
      requestId: 'req-1',
      request: {
        url: 'https://api.example.com/users',
        method: 'GET',
        headers: {}
      },
      type: 'XHR',
      timestamp: 100.0,
      wallTime: Date.now() / 1000
    });

    let items = tracker.getRequests();
    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'req-1');
    assert.equal(items[0].url, 'https://api.example.com/users');
    assert.equal(items[0].method, 'GET');
    assert.equal(items[0].status, 'pending');
    assert.equal(items[0].category, 'fetch');

    tracker.onResponseReceived({
      requestId: 'req-1',
      response: {
        status: 200,
        statusText: 'OK',
        mimeType: 'application/json',
        encodedDataLength: 1024
      },
      type: 'XHR',
      timestamp: 100.2
    });

    items = tracker.getRequests();
    assert.equal(items[0].statusCode, 200);

    tracker.onLoadingFinished({
      requestId: 'req-1',
      encodedDataLength: 2048,
      timestamp: 100.35
    });

    items = tracker.getRequests();
    assert.equal(items[0].status, 'completed');
    assert.equal(items[0].encodedDataLength, 2048);
    assert.ok(items[0].durationMs >= 350);

    const stats = tracker.getStats();
    assert.equal(stats.totalRequests, 1);
    assert.equal(stats.completedRequests, 1);
    assert.equal(stats.totalBytes, 2048);
    assert.equal(stats.typeCounts.fetch, 1);
  });

  test('tracks failed requests without double incrementing', () => {
    const tracker = new NetworkTracker();

    tracker.onRequestWillBeSent({
      requestId: 'req-fail',
      request: { url: 'https://api.example.com/error', method: 'POST' },
      type: 'Fetch',
      timestamp: 10.0,
      wallTime: Date.now() / 1000
    });

    tracker.onLoadingFailed({
      requestId: 'req-fail',
      errorText: 'net::ERR_CONNECTION_REFUSED',
      timestamp: 10.5
    });

    // Call again to test deduplication guard
    tracker.onLoadingFailed({
      requestId: 'req-fail',
      errorText: 'net::ERR_CONNECTION_REFUSED',
      timestamp: 10.6
    });

    const items = tracker.getRequests();
    assert.equal(items[0].status, 'failed');
    assert.equal(items[0].errorText, 'net::ERR_CONNECTION_REFUSED');

    const stats = tracker.getStats();
    assert.equal(stats.failedRequests, 1);
  });

  test('handles HTTP redirects without overwriting previous hop', () => {
    const tracker = new NetworkTracker();

    // Initial hop
    tracker.onRequestWillBeSent({
      requestId: 'redir-req',
      request: { url: 'http://site.com', method: 'GET' },
      type: 'Document',
      timestamp: 1.0
    });

    // Second hop via redirect
    tracker.onRequestWillBeSent({
      requestId: 'redir-req',
      redirectResponse: { status: 301 },
      request: { url: 'https://site.com', method: 'GET' },
      type: 'Document',
      timestamp: 1.2
    });

    const items = tracker.getRequests();
    assert.equal(items.length, 2);
    assert.equal(items[0].url, 'http://site.com');
    assert.equal(items[0].statusCode, 301);
    assert.equal(items[1].url, 'https://site.com');
  });

  test('evicts oldest entries when maxItems is reached', () => {
    const tracker = new NetworkTracker({ maxItems: 3 });

    tracker.onRequestWillBeSent({ requestId: 'r1', request: { url: 'https://a.com' }, type: 'Script' });
    tracker.onRequestWillBeSent({ requestId: 'r2', request: { url: 'https://b.com' }, type: 'Stylesheet' });
    tracker.onRequestWillBeSent({ requestId: 'r3', request: { url: 'https://c.com' }, type: 'Image' });
    tracker.onRequestWillBeSent({ requestId: 'r4', request: { url: 'https://d.com' }, type: 'Font' });

    const items = tracker.getRequests();
    assert.equal(items.length, 3);
    assert.equal(items[0].id, 'r2');
    assert.equal(items[1].id, 'r3');
    assert.equal(items[2].id, 'r4');
  });

  test('guards against null and undefined inputs across all methods', () => {
    const tracker = new NetworkTracker(null);

    assert.equal(tracker.onRequestWillBeSent(null), null);
    assert.equal(tracker.onRequestWillBeSent({}), null);
    assert.equal(tracker.onResponseReceived(null), null);
    assert.equal(tracker.onLoadingFinished(null), null);
    assert.equal(tracker.onLoadingFailed(null), null);

    const filtered = tracker.filter({ search: 'something' });
    assert.equal(filtered.length, 0);
  });

  test('filters requests by category and search term', () => {
    const tracker = new NetworkTracker();

    tracker.onRequestWillBeSent({
      requestId: '1',
      request: { url: 'https://site.com/app.js', method: 'GET' },
      type: 'Script',
      timestamp: 1.0
    });

    tracker.onRequestWillBeSent({
      requestId: '2',
      request: { url: 'https://site.com/api/v1/auth', method: 'POST' },
      type: 'XHR',
      timestamp: 1.1
    });

    const scripts = tracker.filter({ category: 'script' });
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].id, '1');

    const searchMatch = tracker.filter({ search: 'auth' });
    assert.equal(searchMatch.length, 1);
    assert.equal(searchMatch[0].id, '2');
  });

  test('captures and preserves request and response headers, protocol and remote IP', () => {
    const tracker = new NetworkTracker();

    tracker.onRequestWillBeSent({
      requestId: 'req-headers',
      request: {
        url: 'https://api.example.com/data',
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': 'Bearer secret-token'
        }
      },
      type: 'XHR',
      timestamp: 10.0
    });

    let item = tracker.getRequests()[0];
    assert.deepEqual(item.requestHeaders, {
      'Accept': 'application/json',
      'Authorization': 'Bearer secret-token'
    });
    assert.deepEqual(item.responseHeaders, {});

    tracker.onResponseReceived({
      requestId: 'req-headers',
      response: {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
        protocol: 'h2',
        remoteIPAddress: '192.0.2.1'
      },
      type: 'XHR',
      timestamp: 10.2
    });

    item = tracker.getRequests()[0];
    assert.deepEqual(item.responseHeaders, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    assert.equal(item.protocol, 'h2');
    assert.equal(item.remoteIPAddress, '192.0.2.1');
  });

  test('tracks progressive data received via onDataReceived', () => {
    const tracker = new NetworkTracker();

    tracker.onRequestWillBeSent({
      requestId: 'req-chunked',
      request: { url: 'https://api.example.com/stream', method: 'GET' },
      type: 'Fetch',
      timestamp: 10.0
    });

    tracker.onDataReceived({
      requestId: 'req-chunked',
      dataLength: 512,
      timestamp: 10.2
    });

    let item = tracker.getRequests()[0];
    assert.equal(item.encodedDataLength, 512);
    assert.equal(tracker.getStats().totalBytes, 512);

    tracker.onDataReceived({
      requestId: 'req-chunked',
      dataLength: 512,
      timestamp: 10.4
    });

    item = tracker.getRequests()[0];
    assert.equal(item.encodedDataLength, 1024);
    assert.equal(tracker.getStats().totalBytes, 1024);
  });

  test('tracks and separates requests by API', () => {
    const tracker = new NetworkTracker();

    // 1. Static script
    tracker.onRequestWillBeSent({
      requestId: 'req-js',
      request: { url: 'https://site.com/app.js', method: 'GET' },
      type: 'Script',
      timestamp: 1.0
    });

    // 2. REST API on Stripe
    tracker.onRequestWillBeSent({
      requestId: 'req-stripe',
      request: { url: 'https://api.stripe.com/v1/charges', method: 'POST' },
      type: 'Fetch',
      timestamp: 1.1
    });

    // 3. Internal API on same site
    tracker.onRequestWillBeSent({
      requestId: 'req-internal-api',
      request: { url: 'https://site.com/api/users', method: 'GET' },
      type: 'XHR',
      timestamp: 1.2
    });

    // 4. GraphQL API
    tracker.onRequestWillBeSent({
      requestId: 'req-graphql',
      request: { url: 'https://api.github.com/graphql', method: 'POST' },
      type: 'Other',
      timestamp: 1.3
    });

    const stats = tracker.getStats();
    assert.equal(stats.totalRequests, 4);
    assert.equal(stats.typeCounts.api, 3);
    assert.equal(stats.typeCounts.script, 1);

    // Filter only APIs
    const apiRequests = tracker.filter({ category: 'api' });
    assert.equal(apiRequests.length, 3);
    assert.deepEqual(apiRequests.map(r => r.id), ['req-stripe', 'req-internal-api', 'req-graphql']);

    // Separate requests by specific API Origin
    const stripeRequests = tracker.filter({ apiOrigin: 'https://api.stripe.com' });
    assert.equal(stripeRequests.length, 1);
    assert.equal(stripeRequests[0].id, 'req-stripe');

    const internalApiRequests = tracker.filter({ apiOrigin: 'https://site.com' });
    assert.equal(internalApiRequests.length, 1);
    assert.equal(internalApiRequests[0].id, 'req-internal-api');

    const githubRequests = tracker.filter({ apiOrigin: 'https://api.github.com' });
    assert.equal(githubRequests.length, 1);
    assert.equal(githubRequests[0].id, 'req-graphql');
  });
});
