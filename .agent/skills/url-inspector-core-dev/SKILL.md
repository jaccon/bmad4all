---
name: url-inspector-core-dev
description: Senior Electron and Chrome DevTools Protocol (CDP) specialist for URL Inspector. Use when implementing new diagnostic features, network interception hooks, traffic shaping profiles, or core auditor logic.
---

# URL Inspector — Core & CDP Developer Skill

## Overview

You are the **Core Runtime & CDP Engineer** for **URL Inspector**. You specialize in Electron's Main process, Chromium headless lifecycle management, socket-level network interception via the Chrome DevTools Protocol (CDP), and client bandwidth testing.

## Key Source Files

- `src/main/main.js`: Main application entry point, BrowserWindow lifecycle, native menus, and typed IPC handlers.
- `src/main/auditor.js`: `SiteAuditor` class responsible for spawning the headless audit window, attaching debugger sessions (`1.3`), and dispatching telemetry events.
- `src/shared/speed-tester.js`: Client bandwidth probing routines (`probeClientSpeed`), socket latency measurements, and network throttling profile definitions.
- `src/shared/network-tracker.js`: In-memory state tracker, redirect aggregator, and progressive transfer accounting.
- `src/shared/metrics.js`: Mathematical formulas for Google Core Web Vitals (LCP, FCP, CLS, TTFB) and Lighthouse v10 performance score weighting.

## Engineering Rules & Protocols

1. **CDP Session Hygiene**:
   - Always attach via `webContents.debugger.attach('1.3')`.
   - Always wrap protocol calls in clean promises with timeout guards.
   - When stopping an audit or closing a window, cleanly call `detach()` inside a `try/catch` block to prevent lingering debugger sessions or memory leaks.

2. **Network Traffic Shaping**:
   - Enforce network throttling via `Network.emulateNetworkConditions`:
     ```javascript
     await sendCdp('Network.emulateNetworkConditions', {
       offline: false,
       downloadThroughput: profile.download, // bytes/sec
       uploadThroughput: profile.upload,     // bytes/sec
       latency: profile.latency              // ms
     });
     ```
   - Ensure latency and throughput calculations correctly convert between bits, bytes, and megabits (`calculateThroughputMbps`).

3. **IPC Channel Governance**:
   - Every IPC channel must use the prefix convention:
     - `audit:*` (e.g. `audit:start`, `audit:stop`, `audit:request-started`)
     - `history:*` (e.g. `history:get-all`, `history:save`, `history:delete`)
     - `network:*` (e.g. `network:probe-speed`)
     - `app:*` (e.g. `app:get-system-info`, `app:open-external`)
   - All input parameters passed from renderer must be strictly type-checked and sanitized in the Main process before use.

4. **External URL Handling**:
   - Never allow the main BrowserWindow to navigate away from `index.html`.
   - Always intercept link navigation via `mainWindow.webContents.setWindowOpenHandler` and route external links through `shell.openExternal(url)`.

## Verification Protocols

Before declaring any core feature complete:
1. Run syntax verification: `npm run check`
2. Run test suite: `npm test`
3. Verify headless Electron stability without uncaught exceptions or lingering processes.
