# ReadEasy Cloud Sync — Web App Integration Guide

## Overview

ReadEasy stores articles in your Supabase project, segregated by Google identity. A user's articles are accessible to any app that can verify their Google identity and has your Supabase secret key.

---

## Supabase Schema

**Table: `public.articles`** (one row per saved article — points to the *current* version)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key (auto-generated) |
| `google_uid` | `text` | Stable Google user ID — the partition key |
| `google_email` | `text` | User's Google email (informational) |
| `local_id` | `integer` | Extension-local IndexedDB ID (not meaningful in web app) |
| `title` | `text` | Current article title |
| `url` | `text` | Original source URL |
| `site_name` | `text` | Publisher/site name |
| `added_date` | `bigint` | Unix timestamp (ms) when first captured |
| `content_path` | `text` | Storage path of the **latest** content (read verbatim — see "Storage paths" below) |
| `content_hash` | `text` | djb2 hex hash of the latest HTML (dedup signal) |
| `version_count` | `int` | Number of versions (denormalized counter; matches max `version_number` in `article_versions`) |
| `synced_at` | `bigint` | Unix timestamp (ms) of last sync / re-open |

**Unique constraint:** `(google_uid, url)` — one row per user per article URL.

**Table: `public.article_versions`** (one row per saved version — full history)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `article_id` | `uuid` | FK → `articles.id`, `ON DELETE CASCADE` |
| `google_uid` | `text` | Duplicated for direct user-scoped queries |
| `version_number` | `int` | 1, 2, 3, … (unique per `article_id`) |
| `title` | `text` | Title as of this version |
| `content_path` | `text` | Storage path of this specific version's HTML |
| `content_hash` | `text` | djb2 of this version's HTML |
| `saved_from` | `text` | `'chrome_extension'` or `'web_app'` |
| `is_original_capture` | `boolean` | `true` only on the very first capture for an article |
| `created_at` | `bigint` | Unix timestamp (ms) |

**Storage bucket: `article-content`** (private)

- **New layout** (used for all new captures and post-migration articles): `articles/{google_uid}/{article_id}/latest` and `articles/{google_uid}/{article_id}/v1`, `v2`, `v3`, …
- **Legacy layout** (pre-versioning articles, until they're next edited in the extension): `{google_uid}/{sha256(url)[0:32]}.html`
- **Always read `content_path` verbatim from the row** — both `articles.content_path` and `article_versions.content_path` are full storage paths. Do not reconstruct them.

---

## Authentication

The web app must verify the user's Google identity server-side to get a trusted `google_uid`. Use **Google's OAuth 2.0 / OpenID Connect** with the same Google client. The `google_uid` is `sub` in the ID token or `id` from the userinfo endpoint.

**Never use the Supabase secret key in browser/client code.** All Supabase queries that touch user data must run in a server-side context (Next.js API route, server action, edge function, etc.).

---

## Environment Variables (server-side only)

```
SUPABASE_URL=https://pcyjafpopnjtjqaelycy.supabase.co
SUPABASE_SECRET_KEY=<your secret key>   # Never expose to the browser
```

---

## Code Examples

### Install

```bash
npm install @supabase/supabase-js
```

### Initialize (server-side only)

```js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)
```

### List all articles for a user

```js
async function getArticles(googleUid) {
  const { data, error } = await supabase
    .from('articles')
    .select('id, title, url, site_name, added_date, synced_at, content_path')
    .eq('google_uid', googleUid)
    .order('added_date', { ascending: false })

  if (error) throw error
  return data
}
```

### Fetch article HTML content

```js
async function getArticleContent(contentPath) {
  const { data, error } = await supabase.storage
    .from('article-content')
    .download(contentPath)

  if (error) throw error
  return await data.text()   // full self-contained HTML string
}
```

### Generate a short-lived signed URL (for client-side rendering)

If you prefer to load the HTML in the browser directly rather than proxying through your server:

```js
async function getArticleSignedUrl(contentPath) {
  const { data, error } = await supabase.storage
    .from('article-content')
    .createSignedUrl(contentPath, 3600)  // valid for 1 hour

  if (error) throw error
  return data.signedUrl
}
```

### Full page example (Next.js server component)

```js
// app/articles/page.js  (server component)
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from 'next-auth'   // or your auth library

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

export default async function ArticlesPage() {
  const session = await getServerSession()
  const googleUid = session?.user?.id   // must be the Google sub/id, not email

  const { data: articles } = await supabase
    .from('articles')
    .select('*')
    .eq('google_uid', googleUid)
    .order('added_date', { ascending: false })

  return (
    <ul>
      {articles.map(article => (
        <li key={article.id}>
          <a href={`/articles/${encodeURIComponent(article.content_path)}`}>
            {article.title}
          </a>
          <span>{article.site_name}</span>
          <time>{new Date(article.added_date).toLocaleDateString()}</time>
        </li>
      ))}
    </ul>
  )
}
```

---

## Rendering Article HTML — preserve all user formatting

The stored HTML is the **exact output of the extension's reader view, including any in-reader edits the user made**. Your web app's reader must render it without stripping any inline styling, or the user will see their highlights, colors, font sizes, and bold/italic disappear.

### What formatting will appear in the HTML

Users can edit articles inside the extension's reader. All of the following round-trip into the saved HTML as inline tags / styles:

| Edit | Markup it produces |
|---|---|
| Highlight | `<span style="background-color: #FFE066;">…</span>` (yellow / green / blue / red / custom) |
| Text color | `<font color="#…">…</font>` or `<span style="color: …">` |
| Font size | `<font style="font-size: 24px;">…</font>` |
| Bold / italic / underline | `<b>`, `<i>`, `<u>` (or `<strong>` / `<em>`) |
| Link | `<a href="…" target="_blank" rel="noopener">` |
| Inline image | `<img src="data:image/png;base64,…">` (also true for all original article images — they are base64-embedded for self-containment) |
| Note callout | `<hr class="note-sep"><div class="note-block">…</div><hr class="note-sep">` |
| Horizontal rule | `<hr>` |

These styles are **inline on each element**. There is no external stylesheet to load — everything required to render the article correctly is in the HTML string itself.

### Do not strip `style`, `class`, `<font>`, `<span>`, or `<b>`/`<i>`

Most HTML sanitizers (including DOMPurify's stricter presets, `sanitize-html` with defaults, Readability re-runs, Markdown converters) will remove the `style` attribute and/or the `<font>` tag. **If you run the HTML through any of those, the user's formatting will vanish.** The article was already sanitized by the extension on save (scripts, `on*` handlers, and `<iframe>` are removed), so re-sanitizing is unnecessary and harmful.

### Recommended renderer — iframe sandbox

The safest and highest-fidelity option. Complete CSS isolation, no risk of host-page styles leaking in and overriding the user's formatting:

```jsx
<iframe
  srcDoc={htmlContent}
  sandbox="allow-same-origin"
  style={{ width: '100%', height: '100%', border: 'none' }}
/>
```

If you want the iframe to inherit your reader's typography (font family, line height, theme colors) while still preserving the user's inline highlights and colors, inject a base stylesheet:

```jsx
const wrapped = `
  <!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: Georgia, serif; line-height: 1.7; color: #222; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
    img  { max-width: 100%; height: auto; }
    /* DO NOT add rules that override background-color, color, font-size,
       font-weight, font-style on inline elements — those carry user edits. */
  </style></head><body>${htmlContent}</body></html>
`;

<iframe srcDoc={wrapped} sandbox="allow-same-origin" />
```

### Alternative — DOMPurify with style preserved

If you need the article inline in the host document (no iframe), use DOMPurify configured to keep `style`, `class`, and the formatting tags:

```js
import DOMPurify from 'isomorphic-dompurify'

const clean = DOMPurify.sanitize(htmlContent, {
  ADD_ATTR: ['style', 'class', 'target', 'rel', 'color'],
  ADD_TAGS: ['font'],                  // legacy tag used by execCommand for color/size
  FORBID_TAGS: ['script', 'iframe'],   // belt-and-suspenders — extension already stripped these
});

<div className="article-body" dangerouslySetInnerHTML={{ __html: clean }} />
```

Scope your own CSS so it doesn't override user formatting:

```css
.article-body { font-family: Georgia, serif; line-height: 1.7; }
/* Do NOT write rules like:
     .article-body span { background: none !important; }
     .article-body * { color: inherit !important; }
   — they will erase user highlights and colors. */
```

### Quick sanity check

After wiring up rendering, save an article in the extension, open the reader, **highlight a sentence in yellow**, save, then load that article in the web app. The yellow highlight should appear in the web reader exactly as it does in the extension. If it doesn't, your renderer is stripping `style` or `<span>` — review the sanitizer config.

---

## Freshness / cache invalidation

`synced_at` (Unix ms) updates every time the extension touches the article — both on edits (content changed) and on simple re-opens (just timestamp bump). Use it as your cache key.

- **Server-side `download()`** hits the Supabase API directly and is never cached — always fresh.
- **Signed URLs in the browser** can be cached by the browser HTTP cache. If you see stale content after a user edits, append `synced_at` as a cache buster:

```js
const url = `${signedUrl}&v=${article.synced_at}`
```

- **If you persist article HTML in your own DB / KV / CDN**, refetch whenever the row's `synced_at` advances past your cached copy's timestamp.

---

## Version history

The extension and web app share a single versioning model. Every explicit save creates a new immutable row in `article_versions` and a new file at a unique `v{n}` path; `articles.content_path` always points to the freshest `latest` file (which is a mirror of the newest `v{n}`).

### Listing versions for an article

```js
async function getVersions(articleId, googleUid) {
  const { data, error } = await supabase
    .from('article_versions')
    .select('id, version_number, title, content_path, saved_from, is_original_capture, created_at')
    .eq('article_id', articleId)
    .eq('google_uid', googleUid)
    .order('version_number', { ascending: false })

  if (error) throw error
  return data
}
```

### Fetching the HTML of a specific version

```js
async function getVersionContent(version) {
  const { data, error } = await supabase.storage
    .from('article-content')
    .download(version.content_path)   // verbatim — works for new and legacy paths
  if (error) throw error
  return await data.text()
}
```

### Web-app save flow (when a user edits in the web reader)

The contract is the same as the extension's: every save creates a new version unless the body is byte-identical to `articles.content_hash`. Recommended implementation:

1. Compute `simpleHash(htmlContent)` — djb2, 8-char hex. Equivalent to:
    ```js
    function simpleHash(str) {
      let hash = 5381;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
        hash |= 0;
      }
      return (hash >>> 0).toString(16);
    }
    ```
2. Server-side: look up the existing `articles` row.
3. If the new hash matches `existing.content_hash` → only `UPDATE articles SET title, site_name, synced_at` (no new version).
4. If different (or no row exists yet — though the web app should never create rows; only the extension can do first capture):
   - Compute `versionNum = existing.version_count + 1`.
   - `latestPath = articles/{google_uid}/{article_id}/latest`
   - `versionPath = articles/{google_uid}/{article_id}/v{versionNum}`
   - Upload the new HTML to both paths (use `upsert: true` on the latest path so it overwrites).
   - `UPDATE articles SET title, site_name, content_path = latestPath, content_hash = newHash, version_count = versionNum, synced_at = now WHERE id = ?`.
   - `INSERT INTO article_versions { article_id, google_uid, version_number: versionNum, title, content_path: versionPath, content_hash: newHash, saved_from: 'web_app', is_original_capture: false, created_at: now }`.

You can do all of this directly with the Supabase secret key on the server side, or you can call the extension's `sync-article` Edge Function with `{ source: 'web_app', autoSaveOnly: false, ... }`. Either produces the same end state.

### Restoring a prior version

A "restore" is just a save of an older version's content. It does NOT overwrite or delete any existing version row — the older versions stay intact, and the restore becomes a new entry at the top of the history (with `saved_from: 'web_app'`). This keeps the version log strictly append-only and gives users an undo if they restore by mistake.

```js
async function restoreVersion(articleId, googleUid, versionRowToRestore) {
  // 1. Download that version's HTML
  const { data: blob } = await supabase.storage
    .from('article-content')
    .download(versionRowToRestore.content_path)
  const htmlContent = await blob.text()

  // 2. Run the normal web-app save flow above with this htmlContent
  //    → creates a new article_versions row, increments version_count,
  //      updates articles.content_path + content_hash + synced_at.
}
```

---

## Key Invariants

- `google_uid` is the canonical user identifier — query by this, not by email.
- `articles.content_path` is a full storage path stored in the column — read it verbatim. New articles use `articles/{uid}/{id}/latest`; pre-versioning articles use `{uid}/{sha256(url)}.html` until they're next edited in the extension (which migrates them).
- `added_date` = when the article was first captured (never overwritten); `synced_at` = last time the extension/web app touched it (use as cache key).
- HTML files are 1–5 MB, fully self-contained with embedded base64 images. No external asset loading needed.
- The same article (same URL) always maps to the same `articles` row. The latest content overwrites `latest` in storage; older content remains preserved under its own `v{n}` path.
- Version history is append-only. Edits, "open in webapp" handoffs, and restores all add new rows — they never modify or remove existing ones (except via cascade on article deletion).
- The HTML has already been sanitized by the extension (scripts, `on*` handlers, `<iframe>` removed). Do not re-sanitize in a way that strips `style`, `class`, or `<font>` — that would erase user highlights and colors.
- The web app should **never create new `articles` rows** — first capture only happens through the Chrome extension (it's the only surface that can scrape a source page). The web app reads existing rows and creates new `article_versions` rows on edit.
