# Contributing to URL Inspector

Thank you for your interest in contributing to **URL Inspector**! We welcome contributions from developers, testers, and performance engineers of all backgrounds.

Please review the following guidelines before opening an issue or submitting a pull request.

---

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## How Can I Contribute?

### 1. Reporting Bugs
- Before submitting an issue, search existing issues to avoid duplicates.
- Provide a clear and descriptive title.
- Include step-by-step reproduction steps, expected behavior, and actual results.
- Include environment details:
  - Operating System & Architecture (e.g., macOS Sonoma arm64)
  - Node.js version (`node -v`)
  - Target URL being tested
  - Relevant logs or stack traces.

### 2. Suggesting Enhancements
- State the problem your suggestion solves.
- Describe the proposed workflow, UI interaction, or performance metric.
- Explain why this enhancement would be useful to most URL Inspector users.

### 3. Submitting Pull Requests
1. Fork the repository on GitHub: [https://github.com/jaccon/url-inspector](https://github.com/jaccon/url-inspector)
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/url-inspector.git
   cd url-inspector
   ```
3. Create a descriptive feature branch:
   ```bash
   git checkout -b feat/my-new-feature
   ```
4. Install dependencies:
   ```bash
   npm install
   ```
5. Implement your changes following existing code conventions.
6. Verify all automated tests and syntax checks pass:
   ```bash
   npm run check
   npm test
   ```
7. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat(network): add custom timeout handling for slow connections"
   ```
8. Push to your fork and submit a Pull Request targeting the `main` branch.

---

## Development Standards

- **Zero Bloat Policy**: URL Inspector minimizes runtime dependencies. Favor native Node.js and standard Web APIs over third-party packages whenever possible.
- **Chrome DevTools Protocol (CDP)**: Adhere strictly to the CDP domain lifecycle specifications. Always handle session detachment and cleanup gracefully to avoid memory leaks.
- **Context Isolation & Security**: Never disable `contextIsolation` in Electron BrowserWindow configurations. All IPC communication must pass through typed handlers in `preload.js`.
- **Code Quality**: All pull requests must pass the native test runner (`npm test`) with zero regressions.

---

## Maintainers

- **André Jaccon** — Project Lead & Architect ([@jaccon](https://github.com/jaccon))
