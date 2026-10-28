# GekkoFlow hosting contract — Kruispad

**Status:** Accepted · **Date:** 2026-10-28 · **Linear:** [GST-459](https://linear.app/gekkotech/issue/GST-459/kruispad-payment-request-workflow-app-v1)  
**Decision:** [ADR-0001](adr/0001-stack-and-host.md)

Kruispad has **no** own Vercel or Supabase project. It is served from the existing GekkoFlow Vercel deployment and the shared Supabase instance (schema `kruispad`).

## URL map

| Surface | Path |
|---------|------|
| SPA | `https://gekkoflow.com/kruispad/` |
| Notify API | `POST /api/kruispad/notify` |
| Action API | `GET|POST /api/kruispad/action` |
| Email / magic-link base | `APP_BASE_URL__PROJ_KRUISPAD` = `https://gekkoflow.com/kruispad` |

Deep links (relative to basename `/kruispad`): `/`, `/requests/new`, `/requests/:id`, `/my-requests`, `/queues/*`, `/login`, `/action/:token`.

## Prepare mount (this repo)

```bash
pnpm install
pnpm run prepare:gekkoflow-mount
```

Writes `mount/`:

- `mount/public/kruispad/**` — Vite build (`base: /kruispad/`)
- `mount/api/kruispad/notify.js` · `action.js` — esbuild bundles of `api/*.ts`

## GekkoFlow integration (host repo)

1. **Rewrites** (before SPA catch-all): `/kruispad` and `/kruispad/*` → `/kruispad/index.html`. Serverless files under `api/kruispad/` win over the GekkoFlow `/api` catch-all via filesystem routing.
2. **Build:** `scripts/mount-kruispad.mjs` copies from `KRUISPAD_MOUNT` (or sibling `../Kruispad/mount`) into `dist/public/kruispad` and `api/kruispad`.
3. **Hub:** Finance L2 item **Kruispad** → full-page navigation to `/kruispad/` (not wouter in-app routing).
4. **Env on GekkoFlow Vercel:** hydrate from BWS — `SUPABASE_*__SHARED`, existing `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` (prefer `noreply@gekkoflow.com`), `APP_BASE_URL__PROJ_KRUISPAD`, `KRUISPAD_NOTIFY_SECRET__PROJ_KRUISPAD`, plus `VITE_SUPABASE_*` synced from shared for the Kruispad SPA build.

## Local Kruispad-only

```bash
VITE_BASE_PATH=/ pnpm dev   # optional root-path local UI
pnpm dev                    # default: http://localhost:5173/kruispad/
```

Do not create a separate Vercel project for this repo.
