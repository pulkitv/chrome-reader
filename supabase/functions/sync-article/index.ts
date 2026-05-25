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

// Stable storage path derived from SHA-256 of URL — survives local_id changes
async function urlToContentPath(googleUid: string, url: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url))
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
  return `${googleUid}/${hex}.html`
}

async function verifyGoogleToken(token: string) {
  const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!resp.ok) return null
  const { id, email } = await resp.json()
  return { googleUid: id as string, googleEmail: email as string }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const { googleAccessToken, localId, title, url, siteName, addedDate, contentHash, touchOnly } = body

    if (!googleAccessToken || !url) {
      return new Response('Bad request', { status: 400, headers: CORS })
    }

    const identity = await verifyGoogleToken(googleAccessToken)
    if (!identity) return new Response('Unauthorized', { status: 401, headers: CORS })
    const { googleUid, googleEmail } = identity

    const now = Date.now()

    // touchOnly: article already exists and content is identical — just update the timestamp
    if (touchOnly) {
      await supabase.from('articles')
        .update({ synced_at: now })
        .match({ google_uid: googleUid, url })
      return new Response(JSON.stringify({ action: 'touched' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const contentPath = await urlToContentPath(googleUid, url)

    // Check for existing entry by (google_uid, url)
    const { data: existing } = await supabase
      .from('articles')
      .select('content_hash')
      .match({ google_uid: googleUid, url })
      .maybeSingle()

    // Same content — only bump the timestamp, skip storage upload
    if (existing && existing.content_hash === contentHash) {
      await supabase.from('articles')
        .update({ synced_at: now, local_id: localId ?? 0 })
        .match({ google_uid: googleUid, url })
      return new Response(JSON.stringify({ action: 'no_change' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // Content is new or changed — upsert metadata and return signed upload URL
    const { error: dbErr } = await supabase.from('articles').upsert({
      google_uid:   googleUid,
      google_email: googleEmail,
      local_id:     localId ?? 0,
      title:        title    || '',
      url:          url,
      site_name:    siteName || '',
      added_date:   addedDate || now,
      content_path: contentPath,
      content_hash: contentHash || '',
      synced_at:    now,
      synced_at:   now,
    }, { onConflict: 'google_uid,url' })
    if (dbErr) throw new Error(`DB upsert failed: ${dbErr.message}`)

    const { data, error: urlErr } = await supabase.storage
      .from('article-content')
      .createSignedUploadUrl(contentPath)
    if (urlErr) throw new Error(`Signed URL failed: ${urlErr.message}`)

    return new Response(JSON.stringify({
      action: existing ? 'updated' : 'created',
      signedUrl: data.signedUrl
    }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('[sync-article]', err)
    return new Response(err.message, { status: 500, headers: CORS })
  }
})
