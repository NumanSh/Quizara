import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

// Fail at boot with a specific message. Without this the server starts, then
// every authenticated request fails inside `supabase.auth.getUser` and silently
// falls through the auth middleware as an anonymous request.
if (!supabaseUrl || !supabaseServiceKey) {
  const missing = [
    !supabaseUrl && "SUPABASE_URL",
    !supabaseServiceKey && "SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)",
  ].filter(Boolean).join(", ");
  throw new Error(`api-server cannot start: missing ${missing}. Set it in the environment or .env.`);
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
