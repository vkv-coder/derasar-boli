const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // Verify caller is logged in
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': authHeader, 'apikey': anonKey }
    })
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: corsHeaders })
    }
    const userData = await userRes.json()

    // Verify caller is admin
    const profileRes = await fetch(`${supabaseUrl}/rest/v1/dr_profiles?id=eq.${userData.id}&select=role,org_id`, {
      headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'apikey': serviceRoleKey, 'Accept': 'application/json' }
    })
    const profiles = await profileRes.json()
    if (!profiles.length || profiles[0].role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: corsHeaders })
    }

    // Only ever look up emails for profiles inside the caller's own org —
    // never touch auth.users for ids outside this set, since a Supabase
    // project here holds more than one temple's (org's) users.
    const orgProfilesRes = await fetch(`${supabaseUrl}/rest/v1/dr_profiles?org_id=eq.${profiles[0].org_id}&select=id`, {
      headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'apikey': serviceRoleKey, 'Accept': 'application/json' }
    })
    const orgProfiles = await orgProfilesRes.json()

    const emails: Record<string, string | null> = {}
    for (const p of orgProfiles) {
      const uRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${p.id}`, {
        headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'apikey': serviceRoleKey }
      })
      if (uRes.ok) {
        const u = await uRes.json()
        emails[p.id] = u.email || null
      }
    }

    return new Response(JSON.stringify({ emails }), { status: 200, headers: corsHeaders })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Exception: ' + err.message }), { status: 500, headers: corsHeaders })
  }
})
