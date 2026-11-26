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

    // Verify caller is admin or master_admin
    const profileRes = await fetch(`${supabaseUrl}/rest/v1/dr_profiles?id=eq.${userData.id}&select=role,org_id`, {
      headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'apikey': serviceRoleKey, 'Accept': 'application/json' }
    })
    const profiles = await profileRes.json()
    if (!profiles.length || !['admin', 'master_admin'].includes(profiles[0].role)) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: corsHeaders })
    }

    const { userId, action } = await req.json()
    if (!userId || !['pause', 'resume', 'promote', 'demote'].includes(action)) {
      return new Response(JSON.stringify({ error: 'userId and a valid action are required' }), { status: 400, headers: corsHeaders })
    }

    if (userId === userData.id) {
      return new Response(JSON.stringify({ error: 'Cannot change your own account this way' }), { status: 400, headers: corsHeaders })
    }

    // Target user must be in the caller's own org
    const targetRes = await fetch(`${supabaseUrl}/rest/v1/dr_profiles?id=eq.${userId}&select=org_id,role,status`, {
      headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'apikey': serviceRoleKey, 'Accept': 'application/json' }
    })
    const targets = await targetRes.json()
    if (!targets.length || targets[0].org_id !== profiles[0].org_id) {
      return new Response(JSON.stringify({ error: 'User not found in your organization' }), { status: 403, headers: corsHeaders })
    }
    const target = targets[0]

    // The Master Admin account is never touched through this endpoint —
    // same invariant as delete-user: an org must always keep exactly one.
    if (target.role === 'master_admin') {
      return new Response(JSON.stringify({ error: 'The Master Admin account cannot be changed here' }), { status: 403, headers: corsHeaders })
    }

    // Pausing/resuming an Admin is as sensitive as removing one — only the
    // Master Admin may do it. Any admin/master_admin may pause/resume an
    // Operator.
    if ((action === 'pause' || action === 'resume') && target.role === 'admin' && profiles[0].role !== 'master_admin') {
      return new Response(JSON.stringify({ error: 'Only the Master Admin can pause/resume an Admin' }), { status: 403, headers: corsHeaders })
    }

    // Changing Admin <-> Operator is only ever done by the Master Admin,
    // same reasoning as create/remove Admin.
    if ((action === 'promote' || action === 'demote') && profiles[0].role !== 'master_admin') {
      return new Response(JSON.stringify({ error: 'Only the Master Admin can change a user between Admin and Operator' }), { status: 403, headers: corsHeaders })
    }
    if (action === 'promote' && target.role !== 'operator') {
      return new Response(JSON.stringify({ error: 'User is already an Admin' }), { status: 400, headers: corsHeaders })
    }
    if (action === 'demote' && target.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'User is not an Admin' }), { status: 400, headers: corsHeaders })
    }

    let patch: Record<string, unknown> = {}
    if (action === 'pause') patch = { status: 'paused' }
    if (action === 'resume') patch = { status: 'approved' }
    if (action === 'promote') patch = { role: 'admin' }
    // Demoting back to Operator also strips the separate entry-lock
    // override flag, since that permission shouldn't outlive Admin status.
    if (action === 'demote') patch = { role: 'operator', can_override_lock: false }

    const updateRes = await fetch(`${supabaseUrl}/rest/v1/dr_profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(patch)
    })

    if (!updateRes.ok) {
      const err = await updateRes.text()
      return new Response(JSON.stringify({ error: err }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Exception: ' + err.message }), { status: 500, headers: corsHeaders })
  }
})
