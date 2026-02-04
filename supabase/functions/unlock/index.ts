import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'
import { validateTicketCode } from '../_shared/ticket.ts'
import { hashIP, sha256 } from '../_shared/crypto.ts'

/**
 * Get client IP from request headers
 */
function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIP = req.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }
  return 'unknown'
}

/**
 * Check unlock rate limit (30 attempts per hour per IP)
 */
async function checkUnlockRateLimit(
  supabase: any,
  ipHash: string
): Promise<{ allowed: boolean; reason?: string }> {
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  // Count unlock attempts in last hour
  // We'll use submission_guard with a special marker or just check by ip_hash
  // For simplicity, we'll check all submission_guard entries for this IP in last hour
  // In production, you might want a separate unlock_guard table
  const { count } = await supabase
    .from('submission_guard')
    .select('*', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', oneHourAgo.toISOString())

  if (count && count >= 30) {
    return { allowed: false, reason: 'Too many unlock attempts. Please try again later.' }
  }

  return { allowed: true }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  try {
    // Parse request body
    const body = await req.json()
    const { code, lotteryId } = body

    // Validate ticket code format
    if (!code || !validateTicketCode(code)) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Invalid ticket code format' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPA_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPA_SERVICE_ROLE_KEY') || ''
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Determine lottery ID
    let finalLotteryId = lotteryId
    if (!finalLotteryId) {
      finalLotteryId = Deno.env.get('CURRENT_LOTTERY_ID')
    }

    if (!finalLotteryId) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Lottery ID not specified' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Check rate limit
    const clientIP = getClientIP(req)
    const ipHashSalt = Deno.env.get('IP_HASH_SALT') || ''
    if (ipHashSalt) {
      const ipHash = await hashIP(clientIP, ipHashSalt)
      const rateLimitCheck = await checkUnlockRateLimit(supabase, ipHash)
      if (!rateLimitCheck.allowed) {
        return new Response(
          JSON.stringify({ ok: false, message: rateLimitCheck.reason }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Get lottery name first
    const { data: lotteryData } = await supabase
      .from('lotteries')
      .select('name')
      .eq('id', finalLotteryId)
      .single()

    const lotteryName = lotteryData?.name || 'Lottery'

    // Check if ticket is a winner for this lottery
    const { data: winnerData, error: winnerError } = await supabase
      .from('lottery_winners')
      .select('lottery_id, ticket_code, claimed_at')
      .eq('lottery_id', finalLotteryId)
      .eq('ticket_code', code)
      .single()

    if (winnerError || !winnerData) {
      return new Response(
        JSON.stringify({ ok: false, message: 'The archive remains silent.' }),
        {
          status: 200, // Still 200, but with ok: false
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Check if already claimed
    if (winnerData.claimed_at) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Already claimed.' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Update claimed_at
    const { error: updateError } = await supabase
      .from('lottery_winners')
      .update({ claimed_at: new Date().toISOString() })
      .eq('lottery_id', finalLotteryId)
      .eq('ticket_code', code)

    if (updateError) {
      console.error('Database error updating claimed_at:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to process claim' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Return success
    return new Response(
      JSON.stringify({
        ok: true,
        message: 'ACCESS GRANTED',
        lotteryName,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error processing request:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

