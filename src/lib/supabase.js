import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

let browserClient = null;

// One shared client in the browser; keeps the signed-in session in local storage.
export function getBrowserClient() {
  if (!supabaseConfigured) return null;
  if (typeof window === "undefined") return null;
  if (!browserClient) {
    browserClient = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return browserClient;
}

// Read-only client for server components (public data such as listings).
export function getServerClient() {
  if (!supabaseConfigured) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
