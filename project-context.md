# URL Inspector — Project Context & Engineering Rules

## 1. Project Overview
- **Name**: URL Inspector
- **Repository**: `https://github.com/jaccon/url-inspector`
- **Author**: André Jaccon
- **Stack**: Electron 30, Node.js 20, Chromium DevTools Protocol (CDP), SQLite 3 (sql.js WebAssembly), Pure Black CSS3 design system, Vanilla JS (ES2022).
- **Core Purpose**: High-performance desktop web diagnostics, real-time network interception, deterministic traffic shaping, Core Web Vitals (LCP, FCP, CLS, TTFB) calculation, and persistent SQLite history.

---

## 2. Critical Architecture & Security Rules

### Security Boundaries
- `contextIsolation: true` MUST NEVER be disabled in any BrowserWindow.
- `nodeIntegration: false` MUST ALWAYS be enforced in renderer windows.
- All IPC communication between Main and Renderer MUST pass through typed, validated channels in `src/preload/preload.js`.
- Never trust renderer input in the Main process; validate URLs with `new URL()` and protocols with `http:` / `https:`.
- External URLs must NEVER be navigated to within the main BrowserWindow. Use `webContents.setWindowOpenHandler` and `shell.openExternal(url)` to open them in the user's native system browser.

### Chrome DevTools Protocol (CDP) Lifecycle
- Protocol attachment is handled in `SiteAuditor` (`src/main/auditor.js`) via `wc.debugger.attach('1.3')`.
- Always enable required domains: `Network.enable`, `Page.enable`, `Performance.enable`.
- Always safely wrap `detach()` in teardown logic to prevent lingering debugger sessions or memory leaks.
- Network throttling is enforced via `Network.emulateNetworkConditions` with exact bytes/sec and latency parameters.

### Data Storage & WebAssembly SQLite (`sql.js`)
- URL Inspector uses pure WebAssembly `sql.js` (zero C++ native bindings / no node-gyp).
- Database path: `app.getPath('userData')/audit_history.sqlite`. Falls back to `data/audit_history.sqlite` during CLI/test environments.
- Because `sql.js` runs in memory, always call `fs.writeFileSync` to persist the exported buffer on mutation (`saveAudit`, `deleteAudit`, `clearHistory`).

### High-Performance Rendering Discipline
- Zero heavyweight virtual DOM frameworks (pure Vanilla JS and CSS variables).
- Use `requestAnimationFrame` (RAF) batching via `pendingUpdates` queue in `renderer.js` to process high-throughput network event streams.
- Cap rendered DOM table rows at `MAX_DOM_ROWS` (default: 500) to keep the UI at 60fps.
- Preserve the Pure Black (`#000000`) theme and obsidian palette tokens.

---

## 3. Test & Verification Commands
- **Run all unit tests**: `npm test` (Uses native Node.js test runner — zero external testing bloat).
- **Syntax check**: `npm run check` (Node check across `main.js`, `auditor.js`, `preload.js`, `renderer.js`).
- **Build macOS packages**: `npm run build:mac` (Generates DMG and ZIP for Intel `x64` and Apple Silicon `arm64`).
- **Build Windows packages**: `npm run build:win` (Generates NSIS Setup `.exe` and portable `.zip`).
- **Clean build**: `npm run build:clean` (Cleans `dist/` and runs full multi-arch package rebuild).
