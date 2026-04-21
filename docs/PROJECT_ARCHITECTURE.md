# ReadEasy Extension — Architecture Hub

> Last updated: April 19, 2026

This file is the entry point for architecture and implementation details.

## Why this file exists

The original architecture document crossed 1,000 lines and is now split into two focused documents for easier handling:

- [PROJECT_ARCHITECTURE_FOUNDATION_AND_SYSTEM_MAP.md](PROJECT_ARCHITECTURE_FOUNDATION_AND_SYSTEM_MAP.md)
- [PROJECT_ARCHITECTURE_WORKFLOWS_AND_HISTORY.md](PROJECT_ARCHITECTURE_WORKFLOWS_AND_HISTORY.md)

Read them in order.

## Current system map (canonical quick view)

### Core runtime files

- `manifest.json` — MV3 config (permissions, side panel, content scripts, DNR, OAuth)
- `background.js` — service worker (reader launch, list CRUD, auth, floater rebroadcast)
- `content.js` — Readability extraction and URL normalization in active tab
- `selection.js` — Save Selection responder + floating launcher/menu logic
- `db.js` — IndexedDB helper layer for extension pages

### Reader surface

- `reader.html` — reader UI shell
- `reader.js` — reader logic (rendering, preferences, Flash It, TTS, exports, add-to-list)
- `reader.css` — themes/layout/progress/toast styling

### Side panel surface

- `sidepanel.html` — side panel UI shell
- `sidepanel.js` — ES-module entry point and event wiring
- `sidepanel.css` — side panel styles, settings, modal UI
- `sidepanel/state.js` — shared mutable state and constants
- `sidepanel/utils.js` — common helpers
- `sidepanel/auth.js` — Google auth UI/actions
- `sidepanel/settings.js` — settings menu + floater toggle
- `sidepanel/tab-detection.js` — tab classification + Save Selection visibility
- `sidepanel/reading-list-add.js` — add/save-selection ingestion pipeline
- `sidepanel/reading-list-render.js` — render/edit/remove list cards + storage info
- `sidepanel/epub-build.js` — merged EPUB generation
- `sidepanel/x4-modal.js` — X4 modal orchestration (regen/send/download)

### Libraries & assets

- `libs/Readability.js` — Mozilla Readability (vendor)
- `libs/jszip.min.js` — JSZip (vendor)
- `rules.json` — declarativeNetRequest referer fixes for blocked CDNs
- `icons/*` — extension and floater icons

## Complete repository file roles

### Root runtime/config files

- `manifest.json` — extension manifest and capability declarations
- `background.js` — service worker orchestration and cross-surface messaging
- `content.js` — extraction logic injected into webpage context
- `selection.js` — Save Selection and floating launcher on regular pages
- `db.js` — IndexedDB helper API for extension pages
- `reader.html` / `reader.js` / `reader.css` — full reader experience
- `sidepanel.html` / `sidepanel.js` / `sidepanel.css` — side panel shell + entry
- `privacy-policy.html` — public privacy policy page
- `readeasy-postmessage-listener.js` — web app helper for postMessage handoff
- `rules.json` — network header rewrite rules for blocked image CDNs

### Side panel module files

- `sidepanel/state.js` — shared side panel state
- `sidepanel/utils.js` — helper utilities
- `sidepanel/auth.js` — Google auth UI + flow hooks
- `sidepanel/settings.js` — settings view and floater toggle wiring
- `sidepanel/tab-detection.js` — active-tab type detection and UI visibility
- `sidepanel/reading-list-add.js` — save/add pipelines
- `sidepanel/reading-list-render.js` — list rendering/edit/remove flows
- `sidepanel/epub-build.js` — merged EPUB generation primitives
- `sidepanel/x4-modal.js` — X4 modal flow and upload orchestration

### Vendor/resource folders

- `libs/` — third-party libraries (`Readability`, `JSZip`)
- `icons/` — extension icons used by Chrome UI and floating launcher
- `_metadata/generated_indexed_rulesets/_ruleset1` — Chrome-generated ruleset artifact

### Documentation folder

- `docs/INDEX.md` — central docs index
- `docs/PROJECT_SUMMARY.md` — condensed project status + invariants
- `docs/PROJECT_ARCHITECTURE.md` — this architecture hub
- `docs/PROJECT_ARCHITECTURE_FOUNDATION_AND_SYSTEM_MAP.md` — architecture foundations, system map, contracts, storage, and core patterns
- `docs/PROJECT_ARCHITECTURE_WORKFLOWS_AND_HISTORY.md` — workflows, implementation tasks, chronological history, and continuation notes
- `docs/sprints/SPRINTS_INDEX.md` — month-by-month sprint history index
- `docs/sprints/SPRINT_TEMPLATE.md` — reusable template for future monthly sprint files
- remaining docs in `docs/` — setup, testing, feature-specific and workflow references

## Message/storage contracts

Canonical contracts are preserved in the split architecture parts and summarized in:

- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)

## Documentation navigation

Use [INDEX.md](INDEX.md) to navigate all docs by purpose (architecture, setup, testing, features, and history).

