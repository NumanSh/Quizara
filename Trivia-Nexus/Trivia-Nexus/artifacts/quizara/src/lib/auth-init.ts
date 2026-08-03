import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { supabase } from "./supabase";

export function initAuth() {
  const apiUrl = import.meta.env.VITE_API_URL || "";
  setBaseUrl(apiUrl);

  setAuthTokenGetter(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  });
}
