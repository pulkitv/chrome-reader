# ReadEasy Cloud Sync — Web App Integration Guide

## Overview

ReadEasy stores articles in your Supabase project, segregated by Google identity. A user's articles are accessible to any app that can verify their Google identity and has your Supabase secret key.

---

## Supabase Schema

**Table: `public.articles`**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key (auto-generated) |
| `google_uid` | `text` | Stable Google user ID — the partition key |
| `google_email` | `text` | User's Google email (informational) |
| `local_id` | `integer` | Extension-local IndexedDB ID (not meaningful in web app) |
| `title` | `text` | Article title |
| `url` | `text` | Original source URL |
| `site_name` | `text` | Publisher/site name |
| `added_date` | `bigint` | Unix timestamp (ms) when first saved |
| `content_path` | `text` | Storage path: `{google_uid}/{sha256(url)[0:32]}.html` |
| `content_hash` | `text` | djb2 hex hash of HTML content (dedup signal) |
| `synced_at` | `bigint` | Unix timestamp (ms) of last sync |

**Unique constraint:** `(google_uid, url)` — one row per user per article URL.

**Storage bucket: `article-content` (private)**
- Each file is self-contained HTML with all images embedded as base64 data URIs.
- Path format: `{google_uid}/{sha256(url)[0:32]}.html`

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

## Rendering Article HTML

The stored HTML is self-contained — all images are base64-embedded. Render it safely:

```js
// Option A: iframe sandbox (safest — complete CSS isolation)
<iframe
  srcDoc={htmlContent}
  sandbox="allow-same-origin"
  style={{ width: '100%', border: 'none' }}
/>

// Option B: dangerouslySetInnerHTML with DOMPurify (if you need CSS access)
import DOMPurify from 'isomorphic-dompurify'
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlContent) }} />
```

---

## Key Invariants

- `google_uid` is the canonical user identifier — query by this, not by email.
- `content_path` is derived from `sha256(url)`, not `local_id` — it is stable across re-saves.
- `added_date` = when the user first saved it; `synced_at` = last time the extension touched it.
- HTML files are 1–5 MB, fully self-contained with embedded base64 images. No external asset loading needed.
- The same article (same URL) always maps to the same row and the same file path.
