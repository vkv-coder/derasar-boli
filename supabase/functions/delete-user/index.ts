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

    const { userId } = await req.json()
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId required' }), { status: 400, headers: corsHeaders })
    }

    // Prevent self-deletion
    if (userId === userData.id) {
      return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), { status: 400, headers: corsHeaders })
    }

    // Target user must be in the caller's own org
    const targetRes = await fetch(`${supabaseUrl}/rest/v1/dr_profiles?id=eq.${userId}&select=org_id`, {
      headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'apikey': serviceRoleKey, 'Accept': 'application/json' }
    })
    const targets = await targetRes.json()
    if (!targets.length || targets[0].org_id !== profiles[0].org_id) {
      return new Response(JSON.stringify({ error: 'User not found in your organization' }), { status: 403, headers: corsHeaders })
    }

    // Delete profile first
    await fetch(`${supabaseUrl}/rest/v1/dr_profiles?id=eq.${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'apikey': serviceRoleKey }
    })

    // Delete from auth.users
    const deleteRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'apikey': serviceRoleKey }
    })

    if (!deleteRes.ok) {
      const err = await deleteRes.json()
      return new Response(JSON.stringify({ error: err.msg || err.message || 'Failed to delete user' }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Exception: ' + err.message }), { status: 500, headers: corsHeaders })
  }
})
