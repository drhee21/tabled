import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser client used only to listen on the host's broadcast channel.
 * The anon key is public by design. Every table has RLS on with no policies,
 * so this client cannot read any data.
 * Returns null when the public env vars are not set; the page then works
 * without live updates.
 */
export function createRealtimeClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
