# Sprint 2026-01 — Foundation + Reader Core

## Sprint goal
Establish a stable Manifest V3 Chrome extension baseline for distraction-free reading with a production-ready reader surface.

## Why this sprint existed
- Build the core product value first: extract article content and render it cleanly.
- Validate end-to-end extension architecture before adding advanced features.
- Create durable storage and UI patterns that later sprints could extend.

## Major initiatives delivered

### 1) Core extension architecture and extraction pipeline
**Why**
- The product required a reliable path from webpage content to clean reader output.

**What was built**
- Base MV3 architecture with service worker, content extraction path, and reader tab rendering.
- Readability-based extraction flow and session handoff pattern.

**Detail**
- Toolbar click triggers extraction.
- Extracted article is stored in session storage and rendered in reader view.
- This became the long-term backbone used by later floater and sidepanel entry paths.

**Reference**
- Commit: `0375d98` (foundation)

---

### 2) Reader UI and personalization baseline
**Why**
- Clean reading UX needed immediate user controls for comfort and accessibility.

**What was built**
- Theme switching (light/sepia/dark)
- Font size and width controls
- Progress bar and keyboard shortcut baseline
- Preference persistence in synced storage

**Detail**
- Established the settings model later reused by other UX features.
- Created a consistent control pattern for future toolbar additions.

---

### 3) Flash It speed reading system
**Why**
- Different readers need assisted pacing and focus modes.

**What was built**
- Multi-mode speed reading foundations (overlay + inline modes)
- Adaptive pacing based on word length and punctuation
- Playback controls with resume behavior

**Detail**
- Introduced non-trivial DOM word extraction and highlighting mechanics.
- Set patterns for stateful playback that informed later TTS synchronization work.

---

### 4) Single-article EPUB export baseline
**Why**
- Offline portability was a core value for long-form reading.

**What was built**
- EPUB generation with JSZip
- Image embedding path and metadata handling

**Detail**
- Early cross-origin image handling and replacement logic were implemented.
- This seeded the stronger image normalization and dedup improvements in later sprints.

## Sprint outcomes
- A complete and usable v1 architecture was established.
- The extension could extract, render, personalize, and export a single article.
- January provided the core contracts that all subsequent sprints extended.

## Risks discovered during sprint
- Cross-origin image behavior required hardening for consistent EPUB output.
- Large feature surface in `reader.js` signaled future modularization needs.
