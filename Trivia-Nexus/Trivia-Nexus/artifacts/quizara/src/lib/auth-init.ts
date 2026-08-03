import { setAuthTokenGetter } from "@workspace/api-client-react";
import { supabase } from "./supabase";

export function initAuth() {
  setAuthTokenGetter(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  });
}
