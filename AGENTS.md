# Repository Guidelines

## Project Structure & Module Organization
- `manifest.json` defines the Chrome extension entry point, requested permissions, and content script injection rules. Update this first when adding new scripts or host permissions.
- `content.js` holds all runtime logic, including audio enhancements, bitrate monitoring, and UI overlays. Group related features under the existing section headers to keep the file navigable.
- `style.css` styles the overlay controls. Scope new rules using unique prefixes (e.g. `.ks-`) to avoid clashing with host page styles.
- `icons/kick_icon.png` supplies the extension icon; add alternate sizes with the same prefix if Chrome Web Store packaging is planned.

## Build, Test, and Development Commands
- Load locally: open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select this directory.
- Package for distribution: `mkdir -p dist && zip -r dist/kickscroll.zip manifest.json content.js style.css icons` bundles the current sources into a deployable archive.
- Enable verbose logging by toggling `DEBUG_LOGGING` in `content.js`; this prints `[KickScroll]` traces in the target tab’s DevTools console.

## Coding Style & Naming Conventions
- JavaScript uses 4-space indentation, `const`/`let`, and `camelCase` for variables/functions. Reserve UPPER_SNAKE_CASE for configuration constants defined near the top of `content.js`.
- Prefer arrow functions for callbacks and keep helper objects (e.g. `log`) self-contained.
- CSS selectors follow kebab-case with the `ks-` prefix; keep related declarations grouped and document non-obvious rules inline.
- Store persistent settings under the `kickScrollSettings` key to stay compatible with existing sync data.

## Testing Guidelines
- Automated tests are not configured; run manual QA on YouTube and other media-heavy sites after every change.
- Validate: panel toggling, audio boosts, bitrate overlays, and right-click interactions. Use the DevTools **Console** and **Performance** tabs to watch for errors or dropped frames.
- After packaging, install the zip in a clean Chrome profile to confirm storage sync and overlay styles load correctly.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat:`, `fix:`, `refactor:`, etc.) even though the historical log is empty—this keeps future release notes consistent.
- Each PR should describe the user-facing impact, include reproduction or testing steps, and attach screenshots of overlay changes when UI is touched.
- Reference related issues or tasks with `Closes #ID` in the description, and request review from another maintainer before merging.

## Configuration & Debugging Tips
- Key tuning knobs (`AUTO_COLLAPSE_DELAY`, `DISABLE_EFFECT_SCALING`, audio thresholds) live near the top of `content.js`; adjust and reload the extension to experiment.
- The extension stores incremental metrics (e.g. bitrate history) in memory only; reload the page to reset. Use `chrome.storage.sync.clear()` cautiously when testing persistence flows.
