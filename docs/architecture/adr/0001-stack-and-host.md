# ADR-0001 — Stack and host (supersedes spec §2.1)

**Status:** Accepted · **Date:** 2026-10-27 · **Updated:** 2026-10-28 · **Deciders:** Eswan Holl (owner)  
**Amended by:** [ADR-0003](0003-email-action-links-and-shared-schema.md) (shared Supabase + `kruispad` schema)  
**Linear:** [GST-459](https://linear.app/gekkotech/issue/GST-459/kruispad-payment-request-workflow-app-v1)

## Context

Spec v1.3 §2.1 proposed Manus Web Dev (`web-db-user`): React/Vite/TS/Tailwind, Node API, MySQL/TiDB + Drizzle, Manus OAuth, S3. Portfolio policy forbids sandbox/Manus-as-product ([GekkoStack ADR-0015](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0015-no-sandbox-product-builds.md)).

An earlier draft of this ADR assumed a **dedicated Kruispad Vercel project**. Owner decision (Eswan, 28 Oct 2026): Kruispad must **not** get its own Vercel or Supabase project. It runs inside the **existing GekkoFlow Vercel project** and the **existing shared GekkoFlow Supabase** (schema `kruispad`), presented/hubbed by GekkoFlow.

## Decision

1. **Host:** Existing [GekkoFlow](https://github.com/EswanHoll/GekkoFlow) **Vercel project only**. No `VERCEL_PROJECT_ID__PROJ_KRUISPAD`. No standalone Kruispad `vercel.json` deploy target.
2. **Mount:** SPA at **`/kruispad/`**; serverless APIs at **`/api/kruispad/*`** (`notify`, `action`). Vite `base` + React Router `basename` = `/kruispad`. GekkoFlow rewrites and Finance-hub link surface the app.
3. **App:** React + Vite + TypeScript + Tailwind (same portable stack as GekkoFlow).
4. **Backend data plane:** **Existing shared Supabase project** (Postgres, Auth, Storage). Objects live in schema **`kruispad`** — not a new Supabase project ([ADR-0003](0003-email-action-links-and-shared-schema.md)).
5. **Server enforcement:** Postgres RPCs in `kruispad` for workflow transitions + `audit_events`; mounted `/api/kruispad/*` handlers for notify + email-action execution.
6. **Secrets:** Bitwarden Secrets Manager at runtime via `bws` ([ADR-0017](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0017-bitwarden-secrets-manager-runtime.md)); names [ADR-0006](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0006-secret-naming-convention.md). **Single existing GekkoStack BWS project.** Reuse `SUPABASE_*__SHARED`. Keep `RESEND_*__PROJ_KRUISPAD` and `APP_BASE_URL__PROJ_KRUISPAD` (production value includes the mount, e.g. `https://gekkoflow.com/kruispad`). Sync env into the **GekkoFlow** Vercel project — never GitHub secrets.
7. Spec §2.1 Manus OAuth / MySQL / Manus host are **superseded**. Workflow behaviour in §§2.2–2.7 remains authoritative.

## Consequences

- (+) Zero extra Vercel/Supabase bill; matches GekkoFlow hub story.
- (+) RLS + Auth + Storage shared infrastructure with schema isolation.
- (−) Owner exposes `kruispad` on PostgREST, mounts build artifacts into GekkoFlow, saves BWS rows (SECRETS_INVENTORY), and configures Auth Site URL / redirects for `/kruispad`.
- (−) Auth users are shared-project Auth users; roles still live in `kruispad.profiles`.
- (−) Deploy path is GekkoFlow’s `build:vercel` + mount kit — not a separate Kruispad Vercel project.

## Mount contract

See [GEKKOFLOW_HOSTING.md](../GEKKOFLOW_HOSTING.md). Kruispad remains its own git repo; GekkoFlow consumes a prepared mount (`dist` → `dist/public/kruispad`, bundled handlers → `api/kruispad/`).
