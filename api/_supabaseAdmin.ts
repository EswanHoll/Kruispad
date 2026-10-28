import { createClient } from "@supabase/supabase-js";

export function env(name: string, ...aliases: string[]): string | undefined {
  for (const key of [name, ...aliases]) {
    const value = process.env[key];
    if (value) return value;
  }
  return undefined;
}

export type AdminClient = ReturnType<typeof createAdminClient>;

export function createAdminClient() {
  const supabaseUrl = env("SUPABASE_URL__SHARED", "SUPABASE_URL", "VITE_SUPABASE_URL");
  const serviceKey = env(
    "SUPABASE_SERVICE_ROLE_KEY__SHARED",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  if (!supabaseUrl || !serviceKey) {
    throw new Error("supabase_not_configured");
  }
  return createClient(supabaseUrl, serviceKey, {
    db: { schema: "kruispad" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function appBaseUrl(): string {
  return (
    env("APP_BASE_URL__PROJ_KRUISPAD", "APP_BASE_URL", "VITE_APP_BASE_URL") ??
    "http://localhost:5173/kruispad"
  );
}

/** Host origin for /api/kruispad/* (APP_BASE_URL includes the /kruispad mount path). */
export function apiOrigin(): string {
  try {
    return new URL(appBaseUrl()).origin;
  } catch {
    return "http://localhost:5173";
  }
}
