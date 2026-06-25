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

async function verifyGoogleToken(token: string) {
  const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!resp.ok) return null
  const { id } = await resp.json()
  return id as string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { googleAccessToken, url, localId } = await req.json()
    if (!googleAccessToken || (!url && localId == null)) {
      return new Response('Bad request', { status: 400, headers: CORS })
    }

    const googleUid = await verifyGoogleToken(googleAccessToken)
    if (!googleUid) return new Response('Unauthorized', { status: 401, headers: CORS })

    // Look up article — prefer (google_uid, url); fall back to (google_uid, local_id)
    let query = supabase.from('articles').select('id, content_path').eq('google_uid', googleUid)
    query = url ? query.eq('url', url) : query.eq('local_id', localId)
    const { data: article } = await query.maybeSingle()

    if (!article) {
      // Already gone — idempotent success
      return new Response('OK', { headers: CORS })
    }

    // Collect every storage file to delete:
    // (a) everything under articles/{uid}/{id}/ — the versioned layout
    // (b) the legacy content_path if it points outside that directory
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

    // article_versions rows cascade via FK ON DELETE CASCADE
    await Promise.allSettled([
      supabase.from('articles').delete().eq('id', article.id),
      filesToDelete.length > 0
        ? supabase.storage.from('article-content').remove(filesToDelete)
        : Promise.resolve(),
    ])

    return new Response('OK', { headers: CORS })
  } catch (err) {
    console.error('[delete-article]', err)
    return new Response(err.message, { status: 500, headers: CORS })
  }
})
