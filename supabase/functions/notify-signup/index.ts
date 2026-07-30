const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
    if (!botToken || !chatId) {
      return new Response(JSON.stringify({ error: 'Telegram not configured' }), { status: 500, headers: corsHeaders })
    }

    const { sanghName, email, phone } = await req.json()
    if (!sanghName || !email || !phone) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: corsHeaders })
    }

    const text = `🛕 New Derasar Boli Sangh registration\n\n`
      + `Sangh: ${sanghName}\n`
      + `Email: ${email}\n`
      + `Phone: ${phone}\n\n`
      + `Approve in Supabase: set dr_organizations.status and dr_profiles.status to 'approved' for this Sangh.`

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    const tgData = await tgRes.json()

    return new Response(JSON.stringify({ sent: !!tgData.ok, error: tgData.ok ? undefined : tgData.description }), {
      status: 200,
      headers: corsHeaders,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Exception: ' + err.message }), { status: 500, headers: corsHeaders })
  }
})
