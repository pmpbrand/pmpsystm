// CORS headers for Edge Functions
// Allow all origins for development (change to specific Webflow domain in production)
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// To restrict to a specific Webflow domain, replace '*' with your domain:
// 'Access-Control-Allow-Origin': 'https://your-site.webflow.io',



