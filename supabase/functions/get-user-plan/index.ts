import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

const FREE_ARTICLE_LIMIT = 10

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function verifyGoogleToken(token: string) {
  const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!resp.ok) return null
  const { id, email } = await resp.json()
  return {
    googleUid: id as string,
    googleEmail: String(email || '').toLowerCase()
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { googleAccessToken } = await req.json()
    if (!googleAccessToken) {
      return new Response('Bad request', { status: 400, headers: CORS })
    }

    const identity = await verifyGoogleToken(googleAccessToken)
    if (!identity) return new Response('Unauthorized', { status: 401, headers: CORS })
    const { googleUid, googleEmail } = identity

    const [{ data: entitlement }, { count, error: countError }] = await Promise.all([
      supabase
        .from('user_entitlements')
        .select('is_pro, plan, subscription_status')
        .eq('google_email_lower', googleEmail)
        .maybeSingle(),
      supabase
        .from('articles')
        .select('*', { count: 'exact', head: true })
        .eq('google_uid', googleUid),
    ])

    if (countError) throw new Error(`Count failed: ${countError.message}`)

    const isPro = entitlement?.is_pro === true

    return new Response(JSON.stringify({
      isPro,
      plan: isPro ? (entitlement?.plan || 'pro') : 'free',
      subscriptionStatus: entitlement?.subscription_status || 'free',
      articleLimit: isPro ? null : FREE_ARTICLE_LIMIT,
      articleCount: count ?? 0,
    }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('[get-user-plan]', err)
    return new Response(err.message, { status: 500, headers: CORS })
  }
})
