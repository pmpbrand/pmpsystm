import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

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
    const { action, adminSecret, ...params } = body

    // Verify admin secret
    const expectedAdminSecret = Deno.env.get('ADMIN_SECRET')
    if (!expectedAdminSecret || adminSecret !== expectedAdminSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
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

    // Handle different actions
    if (action === 'create_lottery') {
      const { name } = params
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: 'Lottery name is required' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const { data, error } = await supabase
        .from('lotteries')
        .insert({
          name: name.trim(),
        })
        .select('id, name, created_at')
        .single()

      if (error) {
        console.error('Database error creating lottery:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to create lottery' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      return new Response(
        JSON.stringify({ ok: true, lottery: data }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (action === 'pick_winners') {
      const { lotteryId, count, fromDate, toDate } = params

      if (!lotteryId) {
        return new Response(
          JSON.stringify({ error: 'Lottery ID is required' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const winnerCount = parseInt(count) || 10
      if (winnerCount < 1 || winnerCount > 1000) {
        return new Response(
          JSON.stringify({ error: 'Winner count must be between 1 and 1000' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // Verify lottery exists
      const { data: lotteryData, error: lotteryError } = await supabase
        .from('lotteries')
        .select('id, name')
        .eq('id', lotteryId)
        .single()

      if (lotteryError || !lotteryData) {
        return new Response(
          JSON.stringify({ error: 'Lottery not found' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // Build query for tickets
      let ticketsQuery = supabase
        .from('tickets')
        .select('code')

      // Apply date filters if provided
      if (fromDate) {
        ticketsQuery = ticketsQuery.gte('created_at', fromDate)
      }
      if (toDate) {
        ticketsQuery = ticketsQuery.lte('created_at', toDate)
      }

      // Get all tickets (we'll randomize in application code)
      const { data: allTickets, error: ticketsError } = await ticketsQuery

      if (ticketsError) {
        console.error('Database error fetching tickets:', ticketsError)
        return new Response(
          JSON.stringify({ error: 'Failed to fetch tickets' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      if (!allTickets || allTickets.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No tickets found' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // Get existing winners for this lottery to avoid duplicates
      const { data: existingWinners } = await supabase
        .from('lottery_winners')
        .select('ticket_code')
        .eq('lottery_id', lotteryId)

      const existingCodes = new Set(existingWinners?.map(w => w.ticket_code) || [])

      // Filter out already-selected tickets
      const availableTickets = allTickets.filter(t => !existingCodes.has(t.code))

      if (availableTickets.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No available tickets (all already selected)' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // Randomize and pick winners
      const shuffled = [...availableTickets].sort(() => Math.random() - 0.5)
      const selectedTickets = shuffled.slice(0, Math.min(winnerCount, shuffled.length))

      // Insert winners (ignore conflicts for safety)
      const winnersToInsert = selectedTickets.map(t => ({
        lottery_id: lotteryId,
        ticket_code: t.code,
      }))

      const { data: insertedWinners, error: insertError } = await supabase
        .from('lottery_winners')
        .upsert(winnersToInsert, {
          onConflict: 'lottery_id,ticket_code',
          ignoreDuplicates: true,
        })
        .select()

      if (insertError) {
        console.error('Database error inserting winners:', insertError)
        return new Response(
          JSON.stringify({ error: 'Failed to insert winners' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      return new Response(
        JSON.stringify({
          ok: true,
          lottery: lotteryData,
          winnersSelected: insertedWinners?.length || 0,
          winners: insertedWinners,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      {
        status: 400,
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

