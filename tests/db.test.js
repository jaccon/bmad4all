const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { AuditDatabase } = require('../src/main/db');

test('AuditDatabase (SQLite Persistence)', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-db-test-'));
  const dbPath = path.join(tempDir, 'test_history.sqlite');
  let db;

  t.after(() => {
    if (db) db.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  });

  await t.test('initializes and creates sqlite table', async () => {
    db = new AuditDatabase(dbPath);
    await db.init();
    assert.strictEqual(fs.existsSync(dbPath), true, 'SQLite file should be created on disk');
  });

  await t.test('saves an audit execution record', async () => {
    const record = {
      url: 'https://google.com',
      overallScore: 92,
      lcp: 1420.5,
      fcp: 850.2,
      cls: 0.012,
      ttfb: 120.4,
      inp: 45.0,
      totalRequests: 48,
      totalBytes: 1245000,
      loadTimeMs: 1850,
      throttling: 'fast-4g',
      clientSpeedMbps: 85.5,
      clientPingMs: 18,
      status: 'completed',
      errorMessage: null
    };

    const saved = await db.saveAudit(record);
    assert.ok(saved.id > 0, 'Should return generated id');
    assert.strictEqual(saved.url, 'https://google.com');
  });

  await t.test('retrieves audit history ordered by newest first', async () => {
    await db.saveAudit({
      url: 'https://github.com',
      overallScore: 88,
      status: 'completed'
    });

    const list = await db.getHistory();
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].url, 'https://github.com', 'Newest audit should be first');
    assert.strictEqual(list[1].url, 'https://google.com');
    assert.strictEqual(list[1].overall_score, 92);
  });

  await t.test('persists data across db re-opens', async () => {
    db.close();
    const reopenedDb = new AuditDatabase(dbPath);
    await reopenedDb.init();

    const list = await reopenedDb.getHistory();
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].url, 'https://github.com');
    reopenedDb.close();

    // Reassign for cleanup
    db = new AuditDatabase(dbPath);
    await db.init();
  });

  await t.test('deletes a specific audit by id', async () => {
    const listBefore = await db.getHistory();
    const idToDelete = listBefore[0].id;

    await db.deleteAudit(idToDelete);
    const listAfter = await db.getHistory();
    assert.strictEqual(listAfter.length, 1);
    assert.strictEqual(listAfter[0].id !== idToDelete, true);
  });

  await t.test('clears all audit history', async () => {
    await db.clearHistory();
    const list = await db.getHistory();
    assert.strictEqual(list.length, 0);
  });
});
