# ADR-0001 — Stack and host (supersedes spec §2.1)

**Status:** Accepted · **Date:** 2026-10-27 · **Deciders:** Eswan Holl (owner)  
**Amended by:** [ADR-0003](0003-email-action-links-and-shared-schema.md) (shared Supabase + `kruispad` schema)  
**Linear:** [GST-459](https://linear.app/gekkotech/issue/GST-459/kruispad-payment-request-workflow-app-v1)

## Context

Spec v1.3 §2.1 proposed Manus Web Dev (`web-db-user`): React/Vite/TS/Tailwind, Node API, MySQL/TiDB + Drizzle, Manus OAuth, S3. Portfolio policy forbids sandbox/Manus-as-product ([GekkoStack ADR-0015](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0015-no-sandbox-product-builds.md)). Owner directed alignment with GekkoFlow’s portable stack so GekkoFlow can hub/link this app.

## Decision

1. **Host:** Vercel (product path: PR → `main` → documented Vercel project).
2. **App:** React + Vite + TypeScript + Tailwind.
3. **Backend data plane:** **Existing shared Supabase project** (Postgres, Auth, Storage). Kruispad objects live in schema **`kruispad`** — not a new Supabase project ([ADR-0003](0003-email-action-links-and-shared-schema.md)).
4. **Server enforcement:** Postgres RPCs in `kruispad` for workflow transitions + `audit_events`; Vercel `/api/*` for notify + email-action execution.
5. **Secrets:** Bitwarden Secrets Manager at runtime via `bws` ([ADR-0017](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0017-bitwarden-secrets-manager-runtime.md)); names [ADR-0006](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0006-secret-naming-convention.md). Use the **single existing GekkoStack BWS project**. Reuse shared Supabase secret names; Kruispad-only rows use `__PROJ_KRUISPAD`.
6. Spec §2.1 Manus OAuth / MySQL / Manus host are **superseded**. Workflow behaviour in §§2.2–2.7 remains authoritative.

## Consequences

- (+) Matches GekkoFlow skills and hub deep-link story; avoids extra Supabase cost.
- (+) RLS + Auth + Storage shared infrastructure with schema isolation.
- (−) Owner exposes `kruispad` on PostgREST, creates Vercel project, saves BWS rows (SECRETS_INVENTORY).
- (−) Auth users are shared-project Auth users; roles still live in `kruispad.profiles`.
