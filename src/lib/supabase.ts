import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anon);

/** Client scoped to schema `kruispad` on the shared Supabase project. */
export const supabase = createClient(url ?? "http://localhost:54321", anon ?? "public-anon-key", {
  db: { schema: "kruispad" },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
