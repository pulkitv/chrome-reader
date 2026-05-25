Do a security review of the current uncommitted changes in this Chrome extension, focused on extension-specific attack surfaces.

Run `git diff HEAD` to see all changes, then check for:

**Message passing (high priority)**
- Any new `chrome.runtime.onMessage` listener — does it validate `sender.id === chrome.runtime.id` or `sender.origin`?
- Any new `window.addEventListener('message', ...)` — does it check `event.origin` against the expected webapp origin?
- Handlers in readeasy-postmessage-listener.js — are new message types handled with origin validation?

**Content injection**
- Any `innerHTML =` or `insertAdjacentHTML` set from untrusted input (tab titles, article content, user-provided text)?
- Any new `chrome.scripting.executeScript` calls — is the target tab validated (no `chrome://` pages)?

**Permissions**
- Does manifest.json add any new host permissions, API permissions, or content script matches beyond what's needed?

**Storage**
- Any new keys written to `chrome.storage.sync` that could leak auth state or PII?

**fetch / network**
- New `fetch()` calls from content script context — note that extension context bypasses CORS but content script does not

Report: a short list of findings (if any), severity, and suggested fix. If no issues found, say so explicitly.
