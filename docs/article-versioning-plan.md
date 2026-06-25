# Article Versioning Plan

## Overview

The system consists of two surfaces:

- **Chrome Extension** — captures articles in reader view, allows editing, and allows re-fetching fresh content from the source page
- **Web App** — displays saved articles, allows editing, and shows version history

Each surface has a distinct responsibility. The Chrome extension is the only surface that can interact with the source URL. The web app is read/edit only.

---

## Existing Schema

The current `articles` table is as follows and must not be altered destructively:

```sql
articles:
  id             uuid     PRIMARY KEY
  google_uid     text
  google_email   text
  local_id       int4
  title          text
  url            text
  site_name      text
  added_date     int8       -- Unix timestamp in milliseconds
  content_path   text       -- Path to content file in Supabase Storage
  synced_at      int8       -- Unix timestamp in milliseconds
  content_hash   text       -- Hash of content, nullable
```

---

## Schema Changes

### 1. Add `version_count` to `articles`

```sql
ALTER TABLE articles
ADD COLUMN version_count int DEFAULT 1;
```

This is a denormalized counter so the UI can display "v3" without querying `article_versions`.

---

### 2. Create `article_versions` table

```sql
CREATE TABLE article_versions (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id       uuid    REFERENCES articles(id) ON DELETE CASCADE,
  google_uid       text    NOT NULL,
  version_number   int     NOT NULL,
  title            text,
  content_path     text    NOT NULL,  -- Path to the versioned content file in Supabase Storage
  content_hash     text,              -- Hash of content at the time of this version
  saved_from       text    CHECK (saved_from IN ('chrome_extension', 'web_app')),
  is_original_capture boolean DEFAULT false,
  created_at       int8    NOT NULL   -- Unix timestamp in milliseconds, consistent with articles table
);
```

Key design decisions:
- `content_path` follows the same pattern as `articles.content_path` — each version's content is a separate file in Supabase Storage
- `content_hash` is carried over per version so you can detect duplicate saves (see save logic below)
- `google_uid` is duplicated here to make user-scoped queries straightforward without always joining `articles`
- `created_at` uses `int8` millisecond timestamps to stay consistent with `added_date` and `synced_at` in the existing table

---

## Supabase Storage — File Path Convention

Since content is stored as files, establish a clear path convention so versioned files are organised and easy to clean up:

```
articles/{google_uid}/{article_id}/latest         ← always the current version (what articles.content_path points to)
articles/{google_uid}/{article_id}/v1             ← original capture
articles/{google_uid}/{article_id}/v2
articles/{google_uid}/{article_id}/v3
...
```

- `articles.content_path` always points to the `latest` file
- Each version in `article_versions` has its own `content_path` pointing to the corresponding versioned file (e.g. `v1`, `v2`)
- On every save: write the new content to both the versioned path (`v{n}`) and overwrite the `latest` path

---

## Save Logic

### Before every save — check the hash

Before writing anything, compute the hash of the new content and compare it to `articles.content_hash`. If the hashes match, the content has not changed — skip the save entirely. This prevents duplicate version entries when the user saves without making changes.

```js
if (newContentHash === existingArticle.content_hash) {
  return // nothing changed, do not create a new version
}
```

---

### Chrome Extension — First capture of a new article

1. Check if a row exists in `articles` for this `url` + `google_uid`
2. If no row exists:
   - Upload content to Storage at `articles/{google_uid}/{article_id}/v1`
   - Also write the same content to `articles/{google_uid}/{article_id}/latest`
   - Insert into `articles` with `content_path = '.../latest'`, `content_hash = <hash>`, `version_count = 1`
   - Insert into `article_versions` with `version_number = 1`, `content_path = '.../v1'`, `saved_from = 'chrome_extension'`, `is_original_capture = true`
3. If a row already exists for this URL, load the existing `latest` content into the reader view — do not overwrite

---

### Chrome Extension — User edits and saves

1. Compute hash of new content — if it matches `articles.content_hash`, abort
2. Upload new content to Storage at `articles/{google_uid}/{article_id}/v{new_version_number}`
3. Overwrite `articles/{google_uid}/{article_id}/latest` with the same new content
4. `UPDATE articles SET content_hash = <new_hash>, synced_at = <now>, version_count = version_count + 1 WHERE id = <article_id>`
5. `INSERT INTO article_versions` with `version_number = <new_version_count>`, `content_path = '.../v{n}'`, `saved_from = 'chrome_extension'`

---

### Chrome Extension — User reloads fresh from source page

This option is only available in the Chrome extension, not in the web app.

When opening reader view on a URL that already has a saved article, show the user two explicit options:

```
[ Open Saved Version ]     [ Reload Fresh from Page ]
```

- **Open Saved Version** — loads content from `articles/{google_uid}/{article_id}/latest`
- **Reload Fresh from Page** — scrapes the live DOM and runs the same flow as "User edits and saves" above, with `saved_from = 'chrome_extension'`

The previous version is always preserved in `article_versions`. Nothing is lost on a fresh reload.

---

### Web App — User edits and saves

1. Compute hash of new content — if it matches `articles.content_hash`, abort
2. Upload new content to Storage at `articles/{google_uid}/{article_id}/v{new_version_number}`
3. Overwrite `articles/{google_uid}/{article_id}/latest`
4. `UPDATE articles SET content_hash = <new_hash>, synced_at = <now>, version_count = version_count + 1 WHERE id = <article_id>`
5. `INSERT INTO article_versions` with `version_number = <new_version_count>`, `content_path = '.../v{n}'`, `saved_from = 'web_app'`

The web app does **not** have a "Refresh from source" option. That is reserved for the Chrome extension only.

---

## Reading Logic

### Chrome Extension — Opening reader view on a known URL

- Query `articles` for matching `url` + `google_uid`
- If found: fetch content from `articles.content_path` (the `latest` file in Storage)
- If not found: scrape the page and run the first capture flow

### Web App — Article list view

- Query `articles` filtered by `google_uid`
- Display `title`, `site_name`, `synced_at`, `version_count`

### Web App — Article detail view

- Fetch content from `articles.content_path` (the `latest` file) for the main reading view
- Query `article_versions WHERE article_id = ? ORDER BY version_number DESC` for the version history panel

---

## Version History UI (Web App)

Display a version history panel on the article detail page:

| Column | Display |
|---|---|
| `version_number` | "v1", "v2", "v3" |
| `is_original_capture` | Label as "Original capture" if true |
| `saved_from` | "Chrome Extension" or "Web App" |
| `created_at` | Human-readable datetime (convert from int8 ms timestamp) |

### Restoring a prior version

1. Fetch the content file from that version's `content_path` in Storage
2. Overwrite `articles/{google_uid}/{article_id}/latest` with the restored content
3. Compute and store the new `content_hash`
4. Increment `version_count`
5. Insert a new row into `article_versions` with `saved_from = 'web_app'` — the restore action is itself logged as a version

---

## Row Level Security (RLS)

Since the app uses `google_uid` as a plain text field rather than Supabase's built-in `auth.uid()`, RLS must be enforced at the application layer unless you map Google UIDs to Supabase auth users.

**Recommended approach:** In every query from both the extension and the web app, always include `.eq('google_uid', currentUser.google_uid)` as a filter. Never query without scoping to the current user.

If you later want database-level RLS, you can create a Supabase auth user per Google account and store the mapping, then use policies like:

```sql
-- Example only if google_uid is mapped to Supabase auth users
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own articles"
ON articles FOR ALL
USING (google_uid = auth.jwt() ->> 'sub');

ALTER TABLE article_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own article versions"
ON article_versions FOR ALL
USING (google_uid = auth.jwt() ->> 'sub');
```

---

## Summary of Surface Responsibilities

| Action | Chrome Extension | Web App |
|---|---|---|
| Capture new article | ✅ | ❌ |
| Load saved version | ✅ | ✅ |
| Edit and save | ✅ | ✅ |
| Reload fresh from source | ✅ | ❌ |
| View version history | ❌ | ✅ |
| Restore a prior version | ❌ | ✅ |
