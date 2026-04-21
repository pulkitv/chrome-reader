# Sprint 2026-04 — Sidepanel Rearchitecture + Floater Reliability

## Sprint goal
Improve cross-surface discoverability and reliability while reducing sidepanel maintenance risk through modular architecture.

## Why this sprint existed
- Prior workflows exposed UX friction in save-selection and add-to-list behavior.
- Long-lived tabs and large tab sets revealed floater consistency issues.
- Sidepanel monolith complexity made iterative development risky.

## Major initiatives delivered

### 1) Selection-save UX redesign (non-intrusive path)
**Why**
- On-page intrusive marker behavior did not meet UX expectations.

**What was built**
- Selection-save moved to sidepanel-driven action
- `selection.js` repurposed for message-driven selected HTML extraction
- Repeated selection saves made unique via URL hash suffix

**Detail**
- Preserved feature capability while removing in-page disruption.

**References**
- Commit era: `7d8d2ba`, `71054e6` (marker prototype/hardening), later replaced by sidepanel pattern

---

### 2) Sidepanel UX polish and state decoupling
**Why**
- Save Selection visibility was incorrectly coupled to current-card reset behavior.

**What was built**
- Compact plus-button add UX in current card
- Dedicated visibility logic for Save Selection based on tab class

**Detail**
- Prevented regressions where Save Selection disappeared after add actions.

**Reference**
- Commit: `d454174`

---

### 3) Floating launcher, settings, and auth surface
**Why**
- Needed fast in-page entry points and user controls without opening the toolbar first.

**What was built**
- Draggable floating launcher with two-option menu (reader / sidepanel)
- Sidepanel settings page with synced floater toggle
- Sidepanel Google sign-in/sign-out with normalized auth state
- Featurebase feedback links in reader and sidepanel
- Reader top-nav merge shortcut restored

**Detail**
- Improved discoverability and control across regular webpages.
- Introduced synchronized settings/auth behavior across tabs.

---

### 4) Sidepanel modularization (ES module migration)
**Why**
- Growing sidepanel complexity required maintainable boundaries and shared state discipline.

**What was built**
- Monolithic sidepanel split into focused modules under `sidepanel/`
- Shared state introduced via `sidepanel/state.js`
- Entrypoint changed to module-based initialization

**Detail**
- Reduced coupling and made future feature work safer.

**Reference**
- Commit: `3513076`

---

### 5) Floater cross-tab reliability hardening
**Why**
- Disable/enable behavior could leave stale or non-interactive artifacts in long-lived tabs.

**What was built**
- Force cleanup path for stale artifacts on disable
- Background fallback cleanup injection for dormant listeners
- Re-enable reinjection strategy for immediate recovery
- Idempotent/self-healing selection script behavior

**Detail**
- Achieved near-symmetric floater toggle behavior across large tab sets.

**Reference**
- Commit: `983339c`

## Sprint outcomes
- UX and reliability both improved across reader, sidepanel, and webpage surfaces.
- Sidepanel became structurally maintainable for future development.
- Floater and selection workflows reached production-grade consistency.

## Additional note
- This sprint includes multiple iterative waves across April 17–18 and associated precursor work documented in canonical chronology.
