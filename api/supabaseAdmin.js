/* ============================================================
   BASELINE — api/supabaseAdmin.js
   Server-only Supabase client, authenticated with the service-role
   key. This bypasses Row Level Security, so it must never be used
   to run a query built from unchecked client input — only from
   trusted server logic (Stripe webhook, trial init, referral grants).
   Never import this from anything served to the browser.
   ============================================================ */
const { createClient } = require('@supabase/supabase-js');

let client = null;

function getSupabaseAdmin() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL is not set');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

module.exports = { getSupabaseAdmin };
