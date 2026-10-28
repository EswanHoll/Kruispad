import type { VercelRequest } from "@vercel/node";
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

function headerValue(req: VercelRequest, name: string): string | undefined {
  const raw = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * Authorize POST /api/kruispad/notify:
 * 1) shared secret `KRUISPAD_NOTIFY_SECRET__PROJ_KRUISPAD` via header, or
 * 2) valid Supabase user JWT (Bearer).
 */
export async function assertNotifyAuthorized(req: VercelRequest): Promise<void> {
  const expected = env("KRUISPAD_NOTIFY_SECRET__PROJ_KRUISPAD", "KRUISPAD_NOTIFY_SECRET");
  const provided =
    headerValue(req, "x-kruispad-notify-secret") ??
    headerValue(req, "x-kruispad-notify-key");
  if (expected && provided && provided === expected) {
    return;
  }

  const auth = headerValue(req, "authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) {
      const supabase = createAdminClient();
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data.user) return;
    }
  }

  throw new Error("unauthorized");
}
