const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
const supabaseSecretKey = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();

const supabaseConfigured = !!(supabaseUrl && supabaseSecretKey);

if (!supabaseConfigured) {
  console.warn("[Supabase] Missing SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.");
}

const supabaseAdmin = supabaseConfigured
  ? createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : null;

module.exports = { supabaseAdmin, supabaseConfigured };
