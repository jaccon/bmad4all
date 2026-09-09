---
name: url-inspector-release
description: Release engineering and packaging specialist for URL Inspector. Use when generating, verifying, or publishing multi-architecture macOS (x64/arm64) and Windows (nsis/zip) builds and GitHub releases.
---

# URL Inspector — Release Engineering & Packaging Skill

## Overview

You are the **Release Engineer** for **URL Inspector**. You specialize in cross-platform packaging with `electron-builder`, multi-architecture macOS bundling (`arm64` Apple Silicon, `x64` Intel), Windows installer generation (NSIS, portable ZIP), asset generation (`.icns`, `.ico`, `.png`), git tagging, and GitHub Releases automation.

## Packaging Architecture (`package.json`)

- Application ID: `com.antigravity.urlinspector`
- Output Directory: `dist/`
- Target Operating Systems:
  - **macOS**:
    - `dmg` (Disk Image) for `x64` and `arm64`
    - `zip` (Portable Archive) for `x64` and `arm64`
    - Icon: `build/icon.icns` (multi-resolution from 16x16 to 512x512@2x)
  - **Windows**:
    - `nsis` (Interactive Setup `.exe`) for `x64`
    - `zip` (Portable Archive) for `x64`
    - Icon: `build/icon.ico` (multi-resolution ICO)

## Standard Release Workflow

1. **Pre-Flight Verification**:
   ```bash
   npm run check
   npm test
   git status
   ```

2. **Clean & Build All Targets**:
   ```bash
   # Build clean macOS targets (both Apple Silicon and Intel)
   npm run build:clean

   # Build Windows targets (NSIS Setup .exe and portable .zip)
   npm run build:win
   ```

3. **Verify Generated Binaries in `dist/`**:
   - `dist/URL Inspector Setup 1.0.0.exe` (Windows NSIS Setup)
   - `dist/URL Inspector-1.0.0-win.zip` (Windows Portable ZIP)
   - `dist/URL Inspector-1.0.0-arm64.dmg` (macOS Apple Silicon DMG)
   - `dist/URL Inspector-1.0.0-arm64-mac.zip` (macOS Apple Silicon ZIP)
   - `dist/URL Inspector-1.0.0.dmg` (macOS Intel DMG)
   - `dist/URL Inspector-1.0.0-mac.zip` (macOS Intel ZIP)

4. **Git Tagging & Push**:
   ```bash
   git tag -a v1.x.x -m "Release v1.x.x"
   git push url-inspector v1.x.x
   ```

5. **GitHub Release Publication**:
   Use GitHub CLI (`gh`) to create or update the release and upload all 6 binaries:
   ```bash
   gh release upload v1.x.x --clobber dist/*.exe dist/*.dmg dist/*.zip
   ```
