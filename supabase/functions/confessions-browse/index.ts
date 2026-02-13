import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'
import { validateTicketCode } from '../_shared/ticket.ts'

const SUPABASE_URL = Deno.env.get('SUPA_URL') || ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPA_SERVICE_ROLE_KEY') || ''

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeCode(code: string): string {
  return code ? code.trim().toUpperCase() : ''
}

async function ensureTicketExists(
  supabase: ReturnType<typeof createClient>,
  code: string
): Promise<{ ok: true; code: string } | { ok: false; message: string }> {
  const normalized = normalizeCode(code)
  if (!validateTicketCode(normalized)) {
    return { ok: false, message: 'Invalid or unknown ticket.' }
  }

  const { data, error } = await supabase
    .from('tickets')
    .select('code')
    .eq('code', normalized)
    .single()

  if (error || !data) {
    return { ok: false, message: 'Invalid or unknown ticket.' }
  }

  return { ok: true, code: normalized }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const code = url.searchParams.get('code') || ''
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500)
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10))

      const ticketCheck = await ensureTicketExists(supabase, code)
      if (!ticketCheck.ok) {
        return jsonResponse({ ok: false, error: ticketCheck.message }, 400)
      }

      const { data: confessions, error: confError } = await supabase
        .from('confessions')
        .select('id, text, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (confError) {
        console.error('List confessions error:', confError)
        return jsonResponse({ error: 'Failed to load confessions' }, 500)
      }

      const ids = (confessions || []).map((c: { id: string }) => c.id)
      let voteCounts: Record<string, number> = {}
      let votedConfessionId: string | null = null

      if (ids.length > 0) {
        const { data: votes } = await supabase
          .from('confession_votes')
          .select('confession_id, ticket_code')
          .in('confession_id', ids)

        const byConfession: Record<string, number> = {}
        for (const vote of votes || []) {
          byConfession[vote.confession_id] = (byConfession[vote.confession_id] || 0) + 1
          if (vote.ticket_code === ticketCheck.code) {
            votedConfessionId = vote.confession_id
          }
        }
        voteCounts = byConfession
      }

      const list = (confessions || []).map((c: { id: string; text: string; created_at: string }) => ({
        id: c.id,
        text: c.text,
        created_at: c.created_at,
        vote_count: voteCounts[c.id] || 0,
        voted_by_me: votedConfessionId === c.id,
      }))

      return jsonResponse({
        ok: true,
        confessions: list,
        voted_confession_id: votedConfessionId,
      })
    }

    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action || ''
    const code = body.code || ''

    if (action === 'validate_ticket') {
      const result = await ensureTicketExists(supabase, code)
      if (result.ok) {
        return jsonResponse({ ok: true })
      }
      return jsonResponse({ ok: false, message: result.message }, 400)
    }

    if (action === 'vote') {
      const confessionId = body.confessionId || body.confession_id || ''
      const ticketCheck = await ensureTicketExists(supabase, code)
      if (!ticketCheck.ok) {
        return jsonResponse({ ok: false, message: ticketCheck.message }, 400)
      }

      const { data: confession } = await supabase
        .from('confessions')
        .select('id')
        .eq('id', confessionId)
        .single()

      if (!confession) {
        return jsonResponse({ ok: false, message: 'Confession not found.' }, 400)
      }

      const { data: existing } = await supabase
        .from('confession_votes')
        .select('ticket_code')
        .eq('ticket_code', ticketCheck.code)
        .single()

      if (existing) {
        return jsonResponse({ ok: false, message: 'You have already used your vote.' }, 200)
      }

      const { error: insertErr } = await supabase
        .from('confession_votes')
        .insert({
          ticket_code: ticketCheck.code,
          confession_id: confessionId,
        })

      if (insertErr) {
        if (insertErr.code === '23505') {
          return jsonResponse({ ok: false, message: 'You have already used your vote.' }, 200)
        }
        console.error('Vote insert error:', insertErr)
        return jsonResponse({ error: 'Failed to record vote' }, 500)
      }

      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Unknown action. Use action: "validate_ticket" or "vote".' }, 400)
  } catch (err) {
    console.error('confessions-browse error:', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
