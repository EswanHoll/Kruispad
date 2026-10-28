/**
 * Mount contract under GekkoFlow (ADR-0001):
 * - SPA at /kruispad/
 * - APIs at /api/kruispad/*
 * Vite `base` and React Router `basename` must stay aligned with APP_BASENAME.
 */

export const APP_BASENAME = "/kruispad";

/** Absolute API paths on the shared GekkoFlow host (not under the SPA base). */
export const API = {
  notify: "/api/kruispad/notify",
  action: "/api/kruispad/action",
} as const;

/** Resolve API origin from APP_BASE_URL (which includes /kruispad). */
export function apiOriginFromAppBase(appBaseUrl: string): string {
  try {
    return new URL(appBaseUrl).origin;
  } catch {
    return "http://localhost:5173";
  }
}
