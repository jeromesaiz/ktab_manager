# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

kTab Manager is a keyboard-first Firefox browser extension (Manifest V2) for managing tabs. It displays all open tabs across all windows in a single popup, grouped by domain or browser window, with instant search filtering.

## Architecture

This is a minimal, zero-dependency Firefox extension with no build step:

- **manifest.json** — Manifest V2 config. Only permission is `tabs`. Uses `browser_action` for the popup. Keyboard shortcut: Alt+T (Mac) / Alt+Shift+T (Windows/Linux).
- **popup.html** — Single HTML file containing all CSS (inline `<style>`) and loading `popup.js`. Fixed 520px width, dark theme.
- **popup.js** — All logic in a single async IIFE. Uses the `browser.tabs` / `browser.windows` WebExtension APIs directly (no polyfills).

Key patterns in popup.js:
- Tab data is fetched once at popup open (`browser.tabs.query({})`) and mutated in-place throughout the session (closes, mutes, etc.)
- Two grouping modes (domain / window) with a shared render pipeline: `buildDomainGroups` / `buildWindowGroups` → `render()` → `buildTabRow()`
- Keyboard navigation is handled by a single document-level `keydown` listener that manages selection state via `.selected` CSS class
- Color-coded groups using a fixed 15-color palette, assigned sequentially via `colorFor()`

## Development

No build tools, package manager, or tests. To develop:

1. Open `about:debugging#/runtime/this-firefox` in Firefox
2. Click "Load Temporary Add-on" and select `manifest.json`
3. Click the extension icon (or press Alt+T) to open the popup
4. After code changes, click "Reload" on the debugging page

## Key Conventions

- Uses `browser.*` APIs (Firefox WebExtension), not `chrome.*`
- All JS uses `function` keyword (no arrow functions), ES5-compatible style except for `async/await` and `Map`/`Set`
- CSS is entirely inline in popup.html, not in a separate stylesheet
- DOM is built imperatively (createElement), no templates or frameworks
