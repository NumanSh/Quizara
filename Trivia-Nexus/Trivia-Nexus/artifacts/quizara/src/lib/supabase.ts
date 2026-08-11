import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// Fail loudly and specifically. `createClient("", "")` throws a generic
// "supabaseUrl is required" from inside the SDK, which reads like a library bug
// rather than a missing .env — and the app does not boot either way.
if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl && "VITE_SUPABASE_URL",
    !supabaseAnonKey && "VITE_SUPABASE_ANON_KEY",
  ].filter(Boolean).join(", ");
  throw new Error(
    `Quizara cannot start: missing ${missing}. ` +
    `Add them to artifacts/quizara/.env (Vite only exposes variables prefixed with VITE_).`,
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
