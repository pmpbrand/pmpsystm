import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'
import { sha256, hashIP, hashText } from '../_shared/crypto.ts'
import { validateConfession } from '../_shared/validation.ts'
import { generateTicketCode } from '../_shared/ticket.ts'

/**
 * Verify Cloudflare Turnstile token
 */
async function verifyTurnstile(token: string, secret: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret,
        response: token,
      }),
    })

    const data = await response.json()
    
    if (data.success === true) {
      return { valid: true }
    } else {
      console.error('Turnstile verification failed:', JSON.stringify(data))
      return { 
        valid: false, 
        error: data['error-codes']?.join(', ') || 'Verification failed' 
      }
    }
  } catch (error) {
    console.error('Turnstile verification error:', error)
    return { valid: false, error: 'Verification request failed' }
  }
}

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
 * Check rate limits using submission_guard table
 */
async function checkRateLimits(
  supabase: any,
  ipHash: string,
  fpHash: string,
  textHash: string
): Promise<{ allowed: boolean; reason?: string }> {
  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)

  // Check 24h limits per ip_hash
  const { count: ipCount24h } = await supabase
    .from('submission_guard')
    .select('*', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', twentyFourHoursAgo.toISOString())

  if (ipCount24h && ipCount24h >= 3) {
    return { allowed: false, reason: 'Maximum 3 confessions per 24 hours' }
  }

  // Check 24h limits per fp_hash
  const { count: fpCount24h } = await supabase
    .from('submission_guard')
    .select('*', { count: 'exact', head: true })
    .eq('fp_hash', fpHash)
    .gte('created_at', twentyFourHoursAgo.toISOString())

  if (fpCount24h && fpCount24h >= 2) {
    return { allowed: false, reason: 'Maximum 2 confessions per 24 hours per device' }
  }

  // Check 10-minute cooldown per ip_hash
  const { count: ipCooldown } = await supabase
    .from('submission_guard')
    .select('*', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', tenMinutesAgo.toISOString())

  if (ipCooldown && ipCooldown > 0) {
    return { allowed: false, reason: 'Please wait 10 minutes between submissions' }
  }

  // Check 10-minute cooldown per fp_hash
  const { count: fpCooldown } = await supabase
    .from('submission_guard')
    .select('*', { count: 'exact', head: true })
    .eq('fp_hash', fpHash)
    .gte('created_at', tenMinutesAgo.toISOString())

  if (fpCooldown && fpCooldown > 0) {
    return { allowed: false, reason: 'Please wait 10 minutes between submissions' }
  }

  // Check for duplicate text_hash from same ip_hash or fp_hash in last 24h
  const { count: duplicateCount } = await supabase
    .from('submission_guard')
    .select('*', { count: 'exact', head: true })
    .eq('text_hash', textHash)
    .or(`ip_hash.eq.${ipHash},fp_hash.eq.${fpHash}`)
    .gte('created_at', twentyFourHoursAgo.toISOString())

  if (duplicateCount && duplicateCount > 0) {
    return { allowed: false, reason: 'Duplicate confession detected' }
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
    const { confessionText, turnstileToken, fpHash } = body

    // Validate required fields
    if (!confessionText || !turnstileToken || !fpHash) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Verify Turnstile token
    const turnstileSecret = Deno.env.get('TURNSTILE_SECRET')
    if (!turnstileSecret) {
      console.error('TURNSTILE_SECRET not configured')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const turnstileResult = await verifyTurnstile(turnstileToken, turnstileSecret)
    if (!turnstileResult.valid) {
      console.error('Turnstile verification failed:', turnstileResult.error)
      console.error('Token received:', turnstileToken.substring(0, 20) + '...')
      return new Response(
        JSON.stringify({ error: `Invalid verification token: ${turnstileResult.error || 'Verification failed'}` }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Validate confession text
    const validation = validateConfession(confessionText)
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
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

    // Hash IP address
    const clientIP = getClientIP(req)
    const ipHashSalt = Deno.env.get('IP_HASH_SALT') || ''
    if (!ipHashSalt) {
      console.error('IP_HASH_SALT not configured')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const ipHash = await hashIP(clientIP, ipHashSalt)
    const fpHashProcessed = await sha256(fpHash) // Re-hash fingerprint for consistency
    const textHash = await hashText(confessionText)

    // Check rate limits
    const rateLimitCheck = await checkRateLimits(supabase, ipHash, fpHashProcessed, textHash)
    if (!rateLimitCheck.allowed) {
      return new Response(
        JSON.stringify({ error: rateLimitCheck.reason }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Insert confession
    const trimmedText = confessionText.trim()
    const { data: confessionData, error: confessionError } = await supabase
      .from('confessions')
      .insert({
        text: trimmedText,
        text_hash: textHash,
      })
      .select('id')
      .single()

    if (confessionError) {
      console.error('Database error inserting confession:', confessionError)
      return new Response(
        JSON.stringify({ error: 'Failed to save confession' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Generate unique ticket code (retry on conflict)
    let ticketCode = generateTicketCode()
    let attempts = 0
    const maxAttempts = 10

    while (attempts < maxAttempts) {
      const { error: ticketError } = await supabase
        .from('tickets')
        .insert({
          code: ticketCode,
        })

      if (!ticketError) {
        break // Success
      }

      if (ticketError.code === '23505') {
        // Unique constraint violation, generate new code
        ticketCode = generateTicketCode()
        attempts++
      } else {
        // Other error
        console.error('Database error inserting ticket:', ticketError)
        return new Response(
          JSON.stringify({ error: 'Failed to generate ticket' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }
    }

    if (attempts >= maxAttempts) {
      return new Response(
        JSON.stringify({ error: 'Failed to generate unique ticket code' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Insert submission_guard record
    const { error: guardError } = await supabase
      .from('submission_guard')
      .insert({
        ip_hash: ipHash,
        fp_hash: fpHashProcessed,
        text_hash: textHash,
      })

    if (guardError) {
      console.error('Database error inserting submission_guard:', guardError)
      // Don't fail the request, just log it
    }

    // Return success with ticket code
    return new Response(
      JSON.stringify({
        code: ticketCode,
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
