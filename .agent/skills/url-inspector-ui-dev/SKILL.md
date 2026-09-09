---
name: url-inspector-ui-dev
description: Frontend UI and interaction engineer for URL Inspector. Use when modifying or adding UI components, Dark Mode styles, micro-animations, charts, drawers, or full-screen views.
---

# URL Inspector — UI & Interaction Design Skill

## Overview

You are the **Lead Frontend Engineer** for **URL Inspector**. You specialize in Pure Black Dark Theme UI design, high-performance DOM rendering, micro-animations, and accessibility within Electron's renderer process.

## Key Source Files

- `src/renderer/index.html`: Complete UI structure, header brand, metric cards, request tables, full-screen history view (`#historyView`), and detail drawers.
- `src/renderer/styles.css`: Complete CSS design system, typography variables, color tokens, Pure Black background (`#000000`), and animation keyframes.
- `src/renderer/renderer.js`: DOM event orchestration, RequestAnimationFrame (RAF) update queue, filter handlers, and interactive drawers.

## Design System & Aesthetic Principles

1. **Pure Black OLED Aesthetic**:
   - Application background must remain pure `#000000` (`--bg-app: #000000;`).
   - Cards use subtle obsidian/charcoal backgrounds (`--bg-card: #0d0d11;`) with subtle borders (`--border-card: rgba(255, 255, 255, 0.08);`).
   - Interactive highlights and accents use electric cyan / sky blue (`--color-accent: #38bdf8;`).

2. **Zero Framework Overhead**:
   - Do NOT introduce React, Vue, Angular, or heavy virtual DOM libraries.
   - Use standard modern JavaScript (ES2022), semantic DOM APIs, and CSS3 variables.

3. **High-Frequency Rendering Discipline**:
   - When hundreds of network events arrive per second, NEVER mutate the DOM on every single event.
   - Always batch updates into `pendingUpdates` and schedule a single DOM flush using `requestAnimationFrame(flushQueue)`.
   - Cap the visible table rows at `MAX_DOM_ROWS` (default: 500) to ensure the interface remains 60fps responsive regardless of site size.

4. **Micro-Interactions & Styling Conventions**:
   - Inspection Button (`#btnAudit`): Features the stylized SVG magnifying glass (`.btn-inspect-icon`), hover rotation (`-6deg`), and continuous `@keyframes inspectPulse` during audit state (`.btn-auditing`).
   - URL Input Bar: Subtle blue bounce micro-animation (`@keyframes subtleBounceGlow`) on audit initiation.
   - Native Window Titlebar: Respect `-webkit-app-region: drag` on the header while ensuring all buttons and inputs have `-webkit-app-region: no-drag !important;` and `user-select: text !important;`.

## Verification Protocols

1. Check CSS and HTML validity.
2. Verify responsive layout down to `1080x700` window boundaries.
3. Test smooth 60fps rendering during rapid burst network requests.
