Prepare a Chrome Web Store release zip. $ARGUMENTS

If $ARGUMENTS is provided, use it as the new version number (e.g. "2.1.0"). Otherwise, ask the user what the new version should be before proceeding.

---

**Step 1 — Update version in manifest.json**

Read manifest.json, find the `"version"` field, and update it to the new version number. Show the before and after value.

**Step 2 — Commit the version bump**

Stage and commit manifest.json with message: `chore: bump version to <new-version>`

**Step 3 — Generate release.md**

Generate a `release.md` file in the project root containing two sections:

**Section A — New features in this version**

Look at the git log since the previous version tag (or since the last `feat: v*` commit) to identify what changed. List each new feature with a short heading and 1–2 sentence description. Also list any notable bug fixes.

**Section B — Chrome Web Store permission justifications**

Read the `permissions` and `host_permissions` fields from `manifest.json` and write a copy-paste-ready justification for each one. Base the justifications on what the extension actually does (extraction, reading list, floater, auth, EPUB/PDF export, context menus, etc.). Use plain prose, no bullet points within each justification.

**Step 4 — Build the zip**

Create a zip file named `readeasy-<new-version>.zip` in the project root, including only the files that belong in a Chrome extension package, plus `release.md`:

```
manifest.json
background.js
content.js
selection.js
db.js
rules.json
reader.html
reader.js
reader.css
reader/article.js
reader/auth.js
reader/edit-mode.js
reader/epub.js
reader/flash-it.js
reader/preferences.js
reader/state.js
reader/tts.js
sidepanel.html
sidepanel.js
sidepanel.css
sidepanel/auth.js
sidepanel/epub-build.js
sidepanel/pdf-build.js
sidepanel/reading-list-add.js
sidepanel/reading-list-render.js
sidepanel/settings.js
sidepanel/state.js
sidepanel/tab-detection.js
sidepanel/utils.js
sidepanel/x4-modal.js
readeasy-postmessage-listener.js
privacy-policy.html
libs/Readability.js
libs/jszip.min.js
icons/icon16.png
icons/icon32.png
icons/icon48.png
icons/icon128.png
icons/icon.svg
release.md
```

Use this command to build it from the project root:
```
zip -r readeasy-<new-version>.zip manifest.json background.js content.js selection.js db.js rules.json reader.html reader.js reader.css reader/ sidepanel.html sidepanel.js sidepanel.css sidepanel/ readeasy-postmessage-listener.js privacy-policy.html libs/ icons/ release.md -x "**/.DS_Store"
```

**Step 5 — Verify**

Run `unzip -l readeasy-<new-version>.zip` and confirm:
- manifest.json is present and shows the correct version (`grep version` inside the zip)
- release.md is present in the zip
- No docs/, .claude/, .git/, .DS_Store, or *.pem files are included
- File count looks reasonable (should be ~40-50 files)

**Step 6 — Report**

Print a summary:
- New version
- Zip filename and size
- Full path to the zip file (ready to drag into the Chrome Web Store developer dashboard)
