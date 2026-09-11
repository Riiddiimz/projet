const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not configured.");
}

if (!supabaseServiceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

module.exports = { supabase };
