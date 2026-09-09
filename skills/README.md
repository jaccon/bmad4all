# URL Inspector — BMAD Development Skills

This directory contains specialized **BMAD (Breakthrough Method for Agile AI-driven Development)** skills in English. These skills provide domain-specific instructions, architectural rules, and operational runbooks for AI agents (Amelia, Winston, John, etc.) and developers continuing the evolution of **URL Inspector**.

---

## Available Skills

| Skill | Directory | Focus Area |
| :--- | :--- | :--- |
| **`url-inspector-core-dev`** | [`url-inspector-core-dev/`](url-inspector-core-dev/SKILL.md) | Electron 30 Main Process, Chrome DevTools Protocol (CDP), socket-level network interception, traffic shaping emulation, and speed probing. |
| **`url-inspector-ui-dev`** | [`url-inspector-ui-dev/`](url-inspector-ui-dev/SKILL.md) | Pure Black Dark Theme (`#000000`), Vanilla JS/CSS design system, RequestAnimationFrame (RAF) render queues, interactive micro-animations, and full-screen views. |
| **`url-inspector-data-storage`** | [`url-inspector-data-storage/`](url-inspector-data-storage/SKILL.md) | Embedded SQLite 3 via WebAssembly (`sql.js`), database schemas, index optimizations, audit execution history, and structured plaintext `.log` telemetry export. |
| **`url-inspector-qa-testing`** | [`url-inspector-qa-testing/`](url-inspector-qa-testing/SKILL.md) | Native Node.js Test Runner (`tests/`), mock HTTP servers, regression test suites, headless Electron DOM validations, and zero-dependency verification. |
| **`url-inspector-release`** | [`url-inspector-release/`](url-inspector-release/SKILL.md) | Multi-architecture macOS packaging (`x64` Intel, `arm64` Apple Silicon DMG/ZIP), Windows packaging (NSIS Setup `.exe`, portable `.zip`), version tagging, and GitHub Releases. |

---

## How to Use These Skills with BMAD

When working with BMAD agents (e.g. within Google Antigravity, Claude Code, Cursor, or Gemini CLI):

1. **Direct Invocation**: Ask the agent to activate a specific skill:
   - *"Activate the url-inspector-core-dev skill to add HTTP/3 QUIC inspection"*
   - *"Use url-inspector-ui-dev to implement a new latency distribution chart"*
   - *"Run url-inspector-qa-testing to verify regressions across all 45 unit tests"*
   - *"Use url-inspector-release to build and publish version 1.1.0"*

2. **Integration with Core BMAD Agents**:
   - **Amelia (Dev Agent)**: Uses `url-inspector-core-dev`, `url-inspector-ui-dev`, and `url-inspector-data-storage` to execute user stories.
   - **Winston (Architect)**: Consults `url-inspector-core-dev` and `url-inspector-data-storage` when planning technical RFCs.
   - **Murph (QA / Test Architect)**: Uses `url-inspector-qa-testing` to write and enforce test suites.

---

## Architecture Context

All skills in this directory enforce the project's **Zero Bloat Policy** and strict security standards:
- Always preserve `contextIsolation: true` across Electron windows.
- Zero heavyweight frontend frameworks (pure Vanilla JS and modern CSS).
- Zero external database binaries (pure WebAssembly `sql.js`).
- 100% local persistence with zero analytics or telemetry tracking.
