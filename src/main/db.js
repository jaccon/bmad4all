const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

class AuditDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.SQL = null;
    this.db = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized && this.db) {
      return;
    }

    if (!this.SQL) {
      this.SQL = await initSqlJs();
    }

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      try {
        const fileBuffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(fileBuffer);
      } catch (err) {
        console.error('[AuditDatabase] Error loading existing DB file, recreating:', err.message);
        this.db = new this.SQL.Database();
      }
    } else {
      this.db = new this.SQL.Database();
    }

    this._createSchema();
    this._persist();
    this.isInitialized = true;
  }

  _createSchema() {
    const schema = `
      CREATE TABLE IF NOT EXISTS audit_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        overall_score INTEGER,
        lcp REAL,
        fcp REAL,
        cls REAL,
        ttfb REAL,
        inp REAL,
        total_requests INTEGER,
        total_bytes INTEGER,
        load_time_ms REAL,
        throttling TEXT,
        client_speed_mbps REAL,
        client_ping_ms REAL,
        status TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_history(created_at DESC);
    `;
    this.db.run(schema);
  }

  _persist() {
    if (!this.db || !this.dbPath) return;
    try {
      const data = this.db.export();
      fs.writeFileSync(this.dbPath, Buffer.from(data));
    } catch (err) {
      console.error('[AuditDatabase] Failed to persist SQLite database:', err.message);
    }
  }

  async saveAudit(record) {
    await this.init();

    const stmt = this.db.prepare(`
      INSERT INTO audit_history (
        url,
        overall_score,
        lcp,
        fcp,
        cls,
        ttfb,
        inp,
        total_requests,
        total_bytes,
        load_time_ms,
        throttling,
        client_speed_mbps,
        client_ping_ms,
        status,
        error_message,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    const createdAt = record.createdAt || new Date().toISOString();
    const url = String(record.url || '');
    const overallScore = record.overallScore !== undefined ? record.overallScore : null;
    const lcp = record.lcp !== undefined ? record.lcp : null;
    const fcp = record.fcp !== undefined ? record.fcp : null;
    const cls = record.cls !== undefined ? record.cls : null;
    const ttfb = record.ttfb !== undefined ? record.ttfb : null;
    const inp = record.inp !== undefined ? record.inp : null;
    const totalRequests = record.totalRequests !== undefined ? record.totalRequests : null;
    const totalBytes = record.totalBytes !== undefined ? record.totalBytes : null;
    const loadTimeMs = record.loadTimeMs !== undefined ? record.loadTimeMs : null;
    const throttling = record.throttling || 'none';
    const clientSpeedMbps = record.clientSpeedMbps !== undefined ? record.clientSpeedMbps : null;
    const clientPingMs = record.clientPingMs !== undefined ? record.clientPingMs : null;
    const status = record.status || 'completed';
    const errorMessage = record.errorMessage || null;

    stmt.run([
      url,
      overallScore,
      lcp,
      fcp,
      cls,
      ttfb,
      inp,
      totalRequests,
      totalBytes,
      loadTimeMs,
      throttling,
      clientSpeedMbps,
      clientPingMs,
      status,
      errorMessage,
      createdAt
    ]);
    stmt.free();

    // Get last insert ID
    const res = this.db.exec('SELECT last_insert_rowid() AS id;');
    const generatedId = res[0] && res[0].values[0] ? res[0].values[0][0] : null;

    this._persist();

    return {
      id: generatedId,
      url,
      overallScore,
      lcp,
      fcp,
      cls,
      ttfb,
      inp,
      totalRequests,
      totalBytes,
      loadTimeMs,
      throttling,
      clientSpeedMbps,
      clientPingMs,
      status,
      errorMessage,
      createdAt
    };
  }

  async getHistory(limit = 100) {
    await this.init();

    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    const res = this.db.exec(`
      SELECT 
        id,
        url,
        overall_score,
        lcp,
        fcp,
        cls,
        ttfb,
        inp,
        total_requests,
        total_bytes,
        load_time_ms,
        throttling,
        client_speed_mbps,
        client_ping_ms,
        status,
        error_message,
        created_at
      FROM audit_history
      ORDER BY id DESC
      LIMIT ${safeLimit};
    `);

    if (!res || res.length === 0) {
      return [];
    }

    const { columns, values } = res[0];
    return values.map((row) => {
      const entry = {};
      columns.forEach((col, idx) => {
        entry[col] = row[idx];
      });
      return entry;
    });
  }

  async deleteAudit(id) {
    await this.init();
    const numericId = Number(id);
    if (!numericId) return false;

    this.db.run('DELETE FROM audit_history WHERE id = ?;', [numericId]);
    this._persist();
    return true;
  }

  async clearHistory() {
    await this.init();
    this.db.run('DELETE FROM audit_history;');
    this._persist();
    return true;
  }

  close() {
    if (this.db) {
      try {
        this._persist();
        this.db.close();
      } catch (e) {}
      this.db = null;
      this.isInitialized = false;
    }
  }
}

module.exports = { AuditDatabase };
