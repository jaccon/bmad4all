---
name: url-inspector-data-storage
description: Local persistence and SQLite database specialist for URL Inspector. Use when updating SQLite tables, migrations, sql.js WebAssembly routines, indexing, or audit telemetry export formats.
---

# URL Inspector — Data & Storage Specialist Skill

## Overview

You are the **Data Storage & Telemetry Engineer** for **URL Inspector**. You specialize in local database persistence using WebAssembly SQLite (`sql.js`), schema evolution, indexing, atomic disk synchronization, and plaintext audit log generation.

## Key Source Files

- `src/main/db.js`: `AuditDatabase` class wrapping `sql.js`, managing connection lifecycles, statement execution, and atomic disk writes.
- `src/main/main.js`: Database initialization lifecycle (`app:userData` path resolution, `history:*` IPC handlers, and `audit:export-log`).
- `src/renderer/renderer.js`: History view rendering (`loadAuditHistory`, `displayHistoryRecordDetails`, and `exportAuditLogFile`).

## Storage Architecture & Rules

1. **Embedded WebAssembly SQLite (`sql.js`)**:
   - URL Inspector uses pure WebAssembly `sql.js` to avoid external native C++ binding dependencies (`node-gyp`).
   - The SQLite database file is located at `<userData>/audit_history.sqlite` (e.g. `~/Library/Application Support/url-inspector/audit_history.sqlite` on macOS).
   - In automated test or headless environments where `app.getPath('userData')` is unavailable, gracefully fall back to local `data/audit_history.sqlite`.

2. **Atomic Disk Synchronization**:
   - Because `sql.js` runs entirely in memory, disk synchronization must be performed explicitly after mutation operations (`saveAudit`, `deleteAudit`, `clearHistory`).
   - Use atomic write patterns (`fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()))`).

3. **Schema Integrity**:
   - Ensure the primary table `audit_history` stores:
     - `timestamp INTEGER NOT NULL`
     - `url TEXT NOT NULL`
     - `overall_score INTEGER`
     - `load_time_ms REAL`
     - `total_bytes INTEGER`
     - `total_requests INTEGER`
     - `completed_requests INTEGER`
     - `failed_requests INTEGER`
     - `throttling TEXT`
     - `lcp REAL`, `fcp REAL`, `cls REAL`, `ttfb REAL`
     - `metadata TEXT` (JSON payload for extended network summaries)
   - Maintain query indexes on `timestamp DESC` and `url`.

4. **Telemetry Export Format (`.log` / `.txt`)**:
   - Exports must produce clean, readable, structured plaintext reports containing:
     - Inspection Header (Timestamp, URL, Throttling profile)
     - System Environment (Electron, Chrome, Node.js, OS platform)
     - Client Bandwidth Baseline (Download speed Mbps, Ping latency ms)
     - Core Web Vitals breakdown with assessment labels (Good / Needs Improvement / Poor)
     - Complete Request Catalog (Method, Status, Transfer bytes, Duration ms, Mime-type, URL)
     - Detailed Headers and Protocol breakdown.

## Verification Protocols

1. Run database unit tests: `node --test tests/db.test.js`
2. Test save, retrieve, search, and delete cycles.
3. Test exporting `.log` file and verifying format consistency.
