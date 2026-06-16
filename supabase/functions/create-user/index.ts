import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No auth header' }), { status: 401, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Service role key not available' }), { status: 500, headers: corsHeaders })
    }

    const supabaseAdmin = createClient(supabaseUrl!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Verify caller session
    const supabaseUser = createClient(supabaseUrl!, anonKey!, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session: ' + (userError?.message || 'no user') }), { status: 401, headers: corsHeaders })
    }

    // Verify caller is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles').select('role').eq('id', user.id).single()
    if (profileError) {
      return new Response(JSON.stringify({ error: 'Profile lookup failed: ' + profileError.message }), { status: 500, headers: corsHeaders })
    }
    if (!profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required, your role: ' + profile?.role }), { status: 403, headers: corsHeaders })
    }

    const body = await req.json()
    const { email, password, full_name, role } = body

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: 'Missing fields: email, password, full_name required' }), { status: 400, headers: corsHeaders })
    }

    // Create user via admin API
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role }
    })

    if (error) {
      return new Response(JSON.stringify({ error: error.message, code: error.code }), { status: 400, headers: corsHeaders })
    }

    if (data.user) {
      const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({ id: data.user.id, full_name, role })
      if (profileErr) {
        return new Response(JSON.stringify({ error: 'User created but profile failed: ' + profileErr.message }), { status: 500, headers: corsHeaders })
      }
    }

    return new Response(JSON.stringify({ user: data.user }), { status: 200, headers: corsHeaders })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Exception: ' + err.message }), { status: 500, headers: corsHeaders })
  }
})
