import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'
import { validateEmail, validateInstagram } from '../_shared/validation.ts'
import { validateTicketCode } from '../_shared/ticket.ts'

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
    const { code, email, instagram } = body

    // Validate ticket code format
    if (!code || !validateTicketCode(code)) {
      return new Response(
        JSON.stringify({ error: 'Invalid ticket code format' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // At least one contact method must be provided
    if (!email && !instagram) {
      return new Response(
        JSON.stringify({ error: 'Email or Instagram must be provided' }),
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

    // Verify ticket code exists
    const { data: ticketData, error: ticketError } = await supabase
      .from('tickets')
      .select('code')
      .eq('code', code)
      .single()

    if (ticketError || !ticketData) {
      return new Response(
        JSON.stringify({ error: 'Ticket code not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Validate and prepare contact data
    const contactData: { ticket_code: string; email?: string; instagram?: string; updated_at: string } = {
      ticket_code: code,
      updated_at: new Date().toISOString(),
    }

    if (email) {
      const trimmedEmail = email.trim()
      if (trimmedEmail.length > 0) {
        if (!validateEmail(trimmedEmail)) {
          return new Response(
            JSON.stringify({ error: 'Invalid email format' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }
        contactData.email = trimmedEmail.toLowerCase()
      }
    }

    if (instagram) {
      const trimmedInstagram = instagram.trim().replace(/^@/, '')
      if (trimmedInstagram.length > 0) {
        if (!validateInstagram(trimmedInstagram)) {
          return new Response(
            JSON.stringify({ error: 'Invalid Instagram handle format' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }
        contactData.instagram = trimmedInstagram
      }
    }

    // Upsert ticket_contacts
    const { error: contactError } = await supabase
      .from('ticket_contacts')
      .upsert(contactData, {
        onConflict: 'ticket_code',
      })

    if (contactError) {
      console.error('Database error upserting ticket_contacts:', contactError)
      return new Response(
        JSON.stringify({ error: 'Failed to save contact information' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Return success
    return new Response(
      JSON.stringify({ ok: true }),
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

