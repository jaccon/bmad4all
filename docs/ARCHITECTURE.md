# URL Inspector Architecture & Engineering Specification

This document details the internal architecture, protocol lifecycle, data flow, and database schemas of **URL Inspector**.

---

## 1. High-Level Architecture Overview

URL Inspector employs a multi-process architecture based on Electron and Chromium:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Electron Main Process                         │
│  (Node.js Runtime - src/main/main.js, auditor.js, db.js)               │
│                                                                        │
│   ┌────────────────────────┐         ┌──────────────────────────────┐  │
│   │   BrowserWindow        │         │   SiteAuditor                │  │
│   │   (UI Window)          │         │   (Headless Chromium Target) │  │
│   └───────────┬────────────┘         └──────────────┬───────────────┘  │
│               │                                     │                  │
│               │                                     ▼                  │
│               │                      Chrome DevTools Protocol (CDP)    │
│               │                      - Network.*                       │
│               │                      - Page.*                          │
│               │                      - Performance.*                   │
│               │                                                        │
│               │ IPC Channels                                           │
│               │ (audit:*, history:*, network:*, app:*)                 │
│               ▼                                                        │
├───────────────┼────────────────────────────────────────────────────────┤
│               │                                                        │
│   ┌───────────▼────────────┐                                           │
│   │   Preload Bridge       │  Context Isolation Enabled                │
│   │   (src/preload.js)     │  Exposes window.electronAPI               │
│   └───────────┬────────────┘                                           │
│               │                                                        │
│               ▼                                                        │
│   ┌────────────────────────┐                                           │
│   │   Renderer Process     │                                           │
│   │   (Pure Black Dark UI) │  Real-time RAF render queues              │
│   │   - index.html         │  Zero framework overhead                  │
│   │   - styles.css         │  Memory capped DOM tables                 │
│   │   - renderer.js        │                                           │
│   └────────────────────────┘                                           │
│                                                                        │
│   ┌────────────────────────┐                                           │
│   │   SQLite Database      │  WebAssembly sql.js                       │
│   │   (audit_history.db)   │  Persistent local storage                 │
│   └────────────────────────┘                                           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Process Separation & Security Boundary

### Main Process (`src/main/`)
- Controls application lifecycle, native menus, dock icons, and OS window frame.
- Spawns background `SiteAuditor` instances utilizing an isolated headless BrowserWindow.
- Attaches to Chromium's internal debugging target via `webContents.debugger.attach('1.3')`.
- Manages local SQLite disk persistence via WebAssembly `sql.js`.

### Preload Script (`src/preload/preload.js`)
- Runs in a secure isolated context before webpage scripts execute.
- Prevents prototype pollution and blocks direct renderer access to Node.js APIs or native modules.
- Exposes typed and sanitized helper functions via `contextBridge.exposeInMainWorld('electronAPI', ...)`.

### Renderer Process (`src/renderer/`)
- Renders the user interface in Pure Black (`#000000`) dark theme.
- Employs RequestAnimationFrame (RAF) batching to handle bursts of hundreds of concurrent network events without dropping frames.
- Limits in-memory DOM table rows to prevent memory exhaustion during long sessions.

---

## 3. Chrome DevTools Protocol (CDP) Lifecycle

During an inspection session, `SiteAuditor` orchestrates the following protocol workflow:

1. **Protocol Attachment**:
   ```javascript
   wc.debugger.attach('1.3');
   await sendCdp('Network.enable', { maxResourceBufferSize: 10485760 });
   await sendCdp('Page.enable');
   await sendCdp('Performance.enable');
   ```

2. **Network Traffic Shaping**:
   If a network throttling profile is selected, conditions are emulated at the socket layer:
   ```javascript
   await sendCdp('Network.emulateNetworkConditions', {
     offline: false,
     downloadThroughput: profile.download,
     uploadThroughput: profile.upload,
     latency: profile.latency
   });
   ```

3. **Telemetry Streaming**:
   - `Network.requestWillBeSent`: Intercepts request URL, method, initial timestamp, and client headers.
   - `Network.responseReceived`: Captures HTTP status, mime-type, protocol, remote IP, and timing breakdown (DNS, connect, SSL, TTFB).
   - `Network.dataReceived`: Tracks progressive transfer size chunks.
   - `Network.loadingFinished`: Finalizes encoded size and uncompressed decoded body size.
   - `Network.loadingFailed`: Captures network aborts, timeouts, or DNS failures without double-counting.

4. **Performance Metrics Extraction**:
   Injects performance observer polyfills to sample Google Core Web Vitals (`LCP`, `FCP`, `CLS`, `TTFB`) directly from the DOM runtime before detaching.

---

## 4. SQLite Database Schema

Audit execution history is stored in SQLite via `sql.js`:

```sql
CREATE TABLE IF NOT EXISTS audit_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  url TEXT NOT NULL,
  overall_score INTEGER,
  load_time_ms REAL,
  total_bytes INTEGER,
  total_requests INTEGER,
  completed_requests INTEGER,
  failed_requests INTEGER,
  throttling TEXT,
  lcp REAL,
  fcp REAL,
  cls REAL,
  ttfb REAL,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_history_timestamp ON audit_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_history_url ON audit_history(url);
```

---

## 5. Testing & Quality Assurance

Unit test coverage spans:
- Core Web Vitals metric thresholds and score calculations (`tests/metrics.test.js`)
- In-memory network request tracker and filter logic (`tests/network-tracker.test.js`)
- Bandwidth probe calculations and throttling profiles (`tests/speed-tester.test.js`)
- SQLite database initialization, transactions, and eviction (`tests/db.test.js`)
- Auditor session lifecycle and event handling (`tests/auditor.test.js`)
