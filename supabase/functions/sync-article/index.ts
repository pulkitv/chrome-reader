import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FREE_ARTICLE_LIMIT = 10

async function verifyGoogleToken(token: string) {
  const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!resp.ok) return null
  const { id, email } = await resp.json()
  return { googleUid: id as string, googleEmail: email as string }
}

async function isProUser(googleEmail: string) {
  const email = String(googleEmail || '').toLowerCase()
  if (!email) return false

  const { data, error } = await supabase
    .from('user_entitlements')
    .select('is_pro')
    .eq('google_email_lower', email)
    .maybeSingle()

  if (error) throw new Error(`Entitlement lookup failed: ${error.message}`)
  return data?.is_pro === true
}

async function removeArticleFilesAndRow(googleUid: string, article: { id: string, content_path?: string | null }) {
  const dirPath = `articles/${googleUid}/${article.id}`
  const filesToDelete: string[] = []

  const { data: files } = await supabase.storage
    .from('article-content')
    .list(dirPath)

  if (files) {
    for (const file of files) {
      filesToDelete.push(`${dirPath}/${file.name}`)
    }
  }

  if (article.content_path && !article.content_path.startsWith('articles/')) {
    filesToDelete.push(article.content_path)
  }

  await Promise.allSettled([
    supabase.from('articles').delete().eq('id', article.id),
    filesToDelete.length > 0
      ? supabase.storage.from('article-content').remove(filesToDelete)
      : Promise.resolve(),
  ])
}

async function ensureFreeArticleSlot(googleUid: string, googleEmail: string) {
  if (await isProUser(googleEmail)) return

  let { count, error } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('google_uid', googleUid)

  if (error) throw new Error(`Article count failed: ${error.message}`)

  while ((count ?? 0) >= FREE_ARTICLE_LIMIT) {
    const { data: oldest, error: oldestErr } = await supabase
      .from('articles')
      .select('id, content_path')
      .eq('google_uid', googleUid)
      .order('added_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (oldestErr) throw new Error(`Oldest article lookup failed: ${oldestErr.message}`)
    if (!oldest) return

    await removeArticleFilesAndRow(googleUid, oldest)
    count = (count ?? 1) - 1
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const {
      googleAccessToken, localId, title, url, siteName, addedDate,
      contentHash, touchOnly, source, autoSaveOnly
    } = body

    if (!googleAccessToken || !url) {
      return new Response('Bad request', { status: 400, headers: CORS })
    }

    const identity = await verifyGoogleToken(googleAccessToken)
    if (!identity) return new Response('Unauthorized', { status: 401, headers: CORS })
    const { googleUid, googleEmail } = identity

    const now = Date.now()

    // touchOnly: bump synced_at on an existing article (used on re-opens)
    if (touchOnly) {
      await supabase.from('articles')
        .update({ synced_at: now })
        .match({ google_uid: googleUid, url })
      return new Response(JSON.stringify({ action: 'touched' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // Look up existing row
    const { data: existing } = await supabase
      .from('articles')
      .select('id, content_hash, version_count, added_date, content_path')
      .match({ google_uid: googleUid, url })
      .maybeSingle()

    // autoSaveOnly: silent re-open save for an already-saved article.
    // Touch synced_at only — never create a new version, never re-upload,
    // never overwrite stored content_hash. Explicit edits go through the
    // normal versioning flow below.
    if (autoSaveOnly && existing) {
      await supabase.from('articles')
        .update({ synced_at: now, local_id: localId ?? 0 })
        .eq('id', existing.id)
      return new Response(JSON.stringify({
        action:    'touched',
        articleId: existing.id,
      }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // Body unchanged — update metadata (title may have changed) but don't
    // create a new version and don't re-upload content.
    if (existing && existing.content_hash === contentHash) {
      await supabase.from('articles')
        .update({
          synced_at: now,
          local_id:  localId ?? 0,
          title:     title    || '',
          site_name: siteName || '',
        })
        .match({ google_uid: googleUid, url })
      return new Response(JSON.stringify({
        action:       'no_change',
        articleId:    existing.id,
        versionCount: existing.version_count ?? 1
      }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    if (!existing) {
      await ensureFreeArticleSlot(googleUid, googleEmail)
    }

    // Legacy migration: if the existing row predates versioning, its
    // content_path won't be under `articles/`. Backfill a v1 article_versions
    // row pointing to the old file so version history starts from the
    // original captured content, not from this edit. The next save then
    // proceeds as v2 at the new path. Old file at the old path becomes an
    // orphan (cleanable later) — it stays readable in the meantime.
    if (existing && existing.content_path && !existing.content_path.startsWith('articles/')) {
      const { error: backfillErr } = await supabase.from('article_versions').insert({
        article_id:          existing.id,
        google_uid:          googleUid,
        version_number:      1,
        title:               title || '',
        content_path:        existing.content_path,
        content_hash:        existing.content_hash || '',
        saved_from:          'chrome_extension',
        is_original_capture: true,
        created_at:          existing.added_date || now,
      })
      // Tolerate duplicate-key errors so retries don't blow up if a previous
      // attempt got past the backfill but failed downstream.
      if (backfillErr && !backfillErr.message.includes('duplicate')) {
        throw new Error(`Legacy backfill failed: ${backfillErr.message}`)
      }
    }

    // New article OR content has changed → create a new version.
    const articleId  = existing?.id ?? crypto.randomUUID()
    const versionNum = (existing?.version_count ?? 0) + 1
    const isOriginal = !existing
    const savedFrom  = source === 'web_app' ? 'web_app' : 'chrome_extension'

    const basePath    = `articles/${googleUid}/${articleId}`
    const latestPath  = `${basePath}/latest`
    const versionPath = `${basePath}/v${versionNum}`

    if (existing) {
      // Update existing row — never overwrite `id` or `added_date`
      const { error: dbErr } = await supabase.from('articles').update({
        google_email:  googleEmail,
        local_id:      localId ?? 0,
        title:         title    || '',
        site_name:     siteName || '',
        content_path:  latestPath,
        content_hash:  contentHash || '',
        version_count: versionNum,
        synced_at:     now,
      }).eq('id', existing.id)
      if (dbErr) throw new Error(`DB update failed: ${dbErr.message}`)
    } else {
      // First capture — insert new row
      const { error: dbErr } = await supabase.from('articles').insert({
        id:            articleId,
        google_uid:    googleUid,
        google_email:  googleEmail,
        local_id:      localId ?? 0,
        title:         title    || '',
        url:           url,
        site_name:     siteName || '',
        added_date:    addedDate || now,
        content_path:  latestPath,
        content_hash:  contentHash || '',
        version_count: versionNum,
        synced_at:     now,
      })
      if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`)
    }

    // Record this version
    const { error: verErr } = await supabase.from('article_versions').insert({
      article_id:          articleId,
      google_uid:          googleUid,
      version_number:      versionNum,
      title:               title || '',
      content_path:        versionPath,
      content_hash:        contentHash || '',
      saved_from:          savedFrom,
      is_original_capture: isOriginal,
      created_at:          now,
    })
    if (verErr) throw new Error(`Version insert failed: ${verErr.message}`)

    // Signed upload URLs for both paths (upsert overwrites any existing file)
    const [latestUrl, versionUrl] = await Promise.all([
      supabase.storage.from('article-content').createSignedUploadUrl(latestPath,  { upsert: true }),
      supabase.storage.from('article-content').createSignedUploadUrl(versionPath, { upsert: true }),
    ])
    if (latestUrl.error)  throw new Error(`latest signed URL failed: ${latestUrl.error.message}`)
    if (versionUrl.error) throw new Error(`version signed URL failed: ${versionUrl.error.message}`)

    return new Response(JSON.stringify({
      action:           existing ? 'versioned' : 'created',
      articleId,
      versionNumber:    versionNum,
      latestSignedUrl:  latestUrl.data.signedUrl,
      versionSignedUrl: versionUrl.data.signedUrl,
    }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('[sync-article]', err)
    return new Response(err.message, { status: 500, headers: CORS })
  }
})
