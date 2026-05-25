Based on the current uncommitted changes (`git diff --name-only HEAD`), tell me exactly what I need to reload in Chrome to test them.

Use this reload matrix from CLAUDE.md:

| Changed file | What to do |
|---|---|
| background.js, manifest.json, rules.json | Full extension reload at chrome://extensions (service worker + DNR rules don't hot-reload) |
| content.js, selection.js | Extension reload + navigate to a fresh tab (content scripts only inject into new navigations) |
| reader/*.js, reader.html, reader.css | Just reopen the reader tab — no extension reload needed |
| sidepanel/*.js, sidepanel.html, sidepanel.css | Just close and reopen the side panel |
| db.js | Reload extension if used by background; reopen sidepanel if used only there |

List each changed file, its required action, and then give a single consolidated "minimum reload" instruction that covers everything.
