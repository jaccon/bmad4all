# URL Inspector

<div align="center">

![URL Inspector Logo](src/renderer/assets/icon.png)

### High-Performance Desktop Web Diagnostics, Core Web Vitals & Network Protocol Analyzer

[![Repository](https://img.shields.io/badge/GitHub-jaccon%2Furl--inspector-38bdf8?style=for-the-badge&logo=github)](https://github.com/jaccon/url-inspector)
[![Electron](https://img.shields.io/badge/Electron-30.5.1-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-Local_Storage-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Tests](https://img.shields.io/badge/Tests-45%20Passed-success?style=for-the-badge&logo=node.js)](tests/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

**Created by [André Jaccon](https://github.com/jaccon)**

</div>

---

## 📖 Overview

**URL Inspector** is an enterprise-grade desktop performance engineering and network inspection suite built with **Electron** and **Node.js**. Designed for software architects, Site Reliability Engineers (SREs), performance specialists, and frontend engineers, the application connects directly to Chromium via the **Chrome DevTools Protocol (CDP)** to capture granular, low-level telemetry during page loads.

With an immersive **Pure Black Dark Mode** aesthetic, URL Inspector provides real-time visibility into **Google Core Web Vitals (LCP, FCP, CLS, TTFB)**, active client connection speeds, network throttling emulation (traffic shaping), HTTP status filtering, waterfall timing analysis, and persistent **SQLite execution history**.

---

## ✨ Key Features

### 🚀 1. Real-Time Network & Protocol Diagnostics
- **Chrome DevTools Protocol (CDP) Hook**: Binds low-level debugger sessions (`Network.enable`, `Page.enable`, `Performance.enable`) to inspect requests straight from the Chromium engine.
- **Deep Resource Breakdown**: Automatically separates and tallies resources into *Documents*, *Stylesheets*, *Scripts*, *Images*, *Fonts*, *APIs / XHR / Fetch*, *Media*, and *Other*.
- **Encoded vs. Decoded Transfer Metrics**: Measures the exact byte weight transferred over the wire (compressed/encoded) alongside the uncompressed payload size processed by the browser runtime.
- **Microsecond Timing Waterfall**: Visualizes individual request lifecycles:
  - DNS Resolution
  - TCP Handshake
  - SSL/TLS Negotiation
  - Time to First Byte (TTFB / Server Processing)
  - Content Download Duration
- **Detailed Request Drawer**: Inspect raw request & response headers, protocol version (HTTP/1.1, HTTP/2, HTTP/3 / QUIC), remote server IP address, mime-types, and timing breakdowns.

### 🌐 2. Client Bandwidth Probe & Network Traffic Shaping
- **Tester Bandwidth Probing**: Validates the current machine's physical connection throughput (Mbps) and latency (ping ms) prior to computing audit impact. Displayed as the primary diagnostic card on the dashboard.
- **Deterministic Network Throttling**: Emulates real-world cellular and broadband constraints via CDP `Network.emulateNetworkConditions`:
  - **Full Bandwidth**: Unthrottled line speed
  - **Broadband / Cable**: 50 Mbps Download / 10ms Latency
  - **Fast 4G / LTE**: 25 Mbps Download / 20ms Latency
  - **Slow 4G**: 4 Mbps Download / 100ms Latency
  - **Fast 3G**: 1.6 Mbps Download / 150ms Latency
  - **Slow 3G**: 400 Kbps Download / 400ms Latency

### 📊 3. Google Core Web Vitals & Performance Scoring
- **Automated Performance Scoring**: Computes a weighted overall health score (0–100) based on industry-standard Google Lighthouse performance methodologies.
- **Interactive Metric Tooltips**: Hover tooltips explaining metric significance and official evaluation thresholds:
  - **LCP (Largest Contentful Paint)**: Render time of the primary content block ($\le 2.5\text{s}$ Good, $2.5\text{s} - 4.0\text{s}$ Needs Improvement, $> 4.0\text{s}$ Poor).
  - **FCP (First Contentful Paint)**: Instant when the initial DOM element is painted ($\le 1.8\text{s}$ Good, $1.8\text{s} - 3.0\text{s}$ Needs Improvement, $> 3.0\text{s}$ Poor).
  - **CLS (Cumulative Layout Shift)**: Quantifies unexpected layout instability ($\le 0.1$ Good, $0.1 - 0.25$ Needs Improvement, $> 0.25$ Poor).
  - **TTFB (Time to First Byte)**: Server responsiveness and round-trip latency ($\le 800\text{ms}$ Good, $800\text{ms} - 1800\text{ms}$ Needs Improvement, $> 1800\text{ms}$ Poor).

### 🔍 4. Multi-Facet Filtering & Search
- **HTTP Status Code Filter**: Isolate requests by specific status codes (`200 OK`, `301/302 Redirect`, `304 Not Modified`, `404 Not Found`, `500 Server Error`) or HTTP status family ranges (`2xx`, `3xx`, `4xx`, `5xx`).
- **API Origin Aggregator**: Detects external and internal API domains in real-time, allowing isolated analysis of third-party vs. first-party microservices.
- **Instant Search**: Real-time filtering by URL substring, method, or path.

### 📝 5. Telemetry .log Export
- **One-Click Audit Log Generator**: Generates an exhaustive plaintext `.log` / `.txt` file for archiving, incident post-mortems, and CI benchmarking.
- Includes timestamp, tested URL, system environment versions, client bandwidth probe stats, throttling profile, complete Core Web Vitals, and the full catalog of intercepted HTTP requests with response headers and timings.

### 🗄️ 6. Full-Screen SQLite Execution History
- **Embedded SQLite Engine**: Stored locally via WebAssembly (`sql.js`) at `<userData>/audit_history.sqlite` with resilient file locking and zero external database dependencies.
- **Full-Screen Workspace**: Dedicated full-screen interface (`#historyView`) with quick "Back to Inspector" navigation.
- **Historical Analysis**: Tracks date/time, inspected URL, overall performance score, total load duration, transferred bytes, total request count, and historical Web Vitals across audits.

### ⚡ 7. Dynamic Lazy-Load Awareness
- Pages loading media or analytics via scroll triggers and asynchronous intervals are continuously monitored. The UI keeps dynamic counters alive until network activity has settled, preventing premature audit termination.

---

## 🖥️ User Interface & Aesthetic

- **Pure Black Dark Theme (`#000000`)**: Engineered for developer environments, reducing OLED screen strain and emphasizing data clarity.
- **Branded Micro-Interactions**:
  - Custom Obsidian squircle app icon with glowing electric cyan lens refraction.
  - Interactive stylized magnifying glass within the **Start Inspect** button with hover rotation (`-6deg`) and pulsing scan animation during execution.
  - Subtle blue bounce highlight around the URL input bar upon inspection trigger.
  - Interactive repository badge in the header routing safely to [`https://github.com/jaccon/url-inspector`](https://github.com/jaccon/url-inspector) in the system's default browser.

---

## 🏗️ Architecture

```
url-inspector/
├── build/                        # Packaging assets
│   ├── icon.png                  # High-resolution master icon (1024x1024)
│   └── icon.icns                 # macOS multi-resolution iconset (Retina ready)
├── src/
│   ├── main/                     # Electron Main Process (Node.js)
│   │   ├── main.js               # Window lifecycle, native menus, IPC handlers
│   │   ├── auditor.js            # Headless browser controller & CDP debugger session
│   │   └── db.js                 # SQLite database layer (sql.js Wasm)
│   ├── preload/                  # Secure Context Isolation Bridge
│   │   └── preload.js            # Exposes typed window.electronAPI safely
│   ├── renderer/                 # Frontend Presentation Layer
│   │   ├── index.html            # Application UI markup & modal views
│   │   ├── styles.css            # Dark mode design system & responsive layout
│   │   ├── renderer.js           # DOM controller, animations, state management
│   │   └── assets/               # Bundled static icons and media
│   └── shared/                   # Universal Utility Modules
│       ├── metrics.js            # Core Web Vitals math & thresholds
│       ├── network-tracker.js    # In-memory network request aggregator
│       └── speed-tester.js       # Client bandwidth & ping measurement engine
├── tests/                        # Comprehensive Unit Test Suite
│   ├── auditor.test.js           # Auditor session lifecycle tests
│   ├── db.test.js                # SQLite CRUD operations tests
│   ├── metrics.test.js           # PageSpeed threshold calculation tests
│   ├── network-tracker.test.js   # HTTP lifecycle & filtering tests
│   └── speed-tester.test.js      # Speed probe & throttling profile tests
└── package.json                  # Scripts and Electron Builder configuration
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v20.x` or higher (LTS recommended)
- **npm**: `v10.x` or higher
- **macOS** (for DMG builds) or any modern desktop OS for running development mode.

### Installation

```bash
# Clone the repository
git clone https://github.com/jaccon/url-inspector.git
cd url-inspector

# Switch to supported Node version (if using nvm)
nvm use 20

# Install dependencies
npm install
```

### Running in Development Mode

```bash
npm start
```

### Running Tests & Code Quality

The test suite runs using the native Node.js Test Runner with zero third-party testing bloat:

```bash
# Run all 45 unit tests
npm test

# Run syntax check across all processes
npm run check
```

---

## 📦 Building Application Packages

URL Inspector uses `electron-builder` configured for native multi-architecture distribution:

```bash
# Clean previous builds and package both Intel and Apple Silicon installers
npm run build:clean

# Standard macOS build
npm run build:mac

# Generate unpackaged directory only
npm run build:mac:dir
```

### Generated Artifacts (`dist/`):
- **Apple Silicon (M1 / M2 / M3 / M4)**:
  - `dist/URL Inspector-1.0.0-arm64.dmg` (Installable Disk Image)
  - `dist/URL Inspector-1.0.0-arm64-mac.zip` (Portable Archive)
  - `dist/mac-arm64/URL Inspector.app` (Application Bundle)
- **Intel (x86_64)**:
  - `dist/URL Inspector-1.0.0.dmg` (Installable Disk Image)
  - `dist/URL Inspector-1.0.0-mac.zip` (Portable Archive)
  - `dist/mac/URL Inspector.app` (Application Bundle)

---

## 👤 Credits & Author

**URL Inspector** was architected, designed, and developed by:

**André Jaccon**  
- **GitHub**: [@jaccon](https://github.com/jaccon)
- **Repository**: [https://github.com/jaccon/url-inspector](https://github.com/jaccon/url-inspector)

*Contributions, bug reports, and feature requests are welcome via GitHub Issues!*

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
