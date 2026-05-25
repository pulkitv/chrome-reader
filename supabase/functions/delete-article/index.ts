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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { googleAccessToken, localId } = await req.json()
    if (!googleAccessToken || localId == null) {
      return new Response('Bad request', { status: 400, headers: CORS })
    }

    // Verify Google token → get stable user identity
    const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${googleAccessToken}` }
    })
    if (!userResp.ok) return new Response('Unauthorized', { status: 401, headers: CORS })
    const { id: googleUid } = await userResp.json()

    const contentPath = `${googleUid}/${localId}.html`

    await Promise.allSettled([
      supabase.from('articles')
        .delete()
        .match({ google_uid: googleUid, local_id: localId }),
      supabase.storage
        .from('article-content')
        .remove([contentPath])
    ])

    return new Response('OK', { headers: CORS })
  } catch (err) {
    console.error('[delete-article]', err)
    return new Response(err.message, { status: 500, headers: CORS })
  }
})
