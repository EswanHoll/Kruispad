# ADR-0001 — Stack and host (supersedes spec §2.1)

**Status:** Accepted · **Date:** 2026-10-27 · **Deciders:** Eswan Holl (owner)  
**Linear:** [GST-459](https://linear.app/gekkotech/issue/GST-459/kruispad-payment-request-workflow-app-v1)

## Context

Spec v1.3 §2.1 proposed Manus Web Dev (`web-db-user`): React/Vite/TS/Tailwind, Node API, MySQL/TiDB + Drizzle, Manus OAuth, S3. Portfolio policy forbids sandbox/Manus-as-product ([GekkoStack ADR-0015](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0015-no-sandbox-product-builds.md)). Owner directed alignment with GekkoFlow’s portable stack so GekkoFlow can hub/link this app.

## Decision

1. **Host:** Vercel (product path: PR → `main` → documented Vercel project).
2. **App:** React + Vite + TypeScript + Tailwind.
3. **Backend data plane:** Supabase — Postgres, Auth, Storage (private bucket for PDF/JPG/PNG).
4. **Server enforcement:** Postgres RPCs for workflow transitions + `audit_events`; Vercel `/api/*` for email notify.
5. **Secrets:** Bitwarden Secrets Manager at runtime via `bws` ([ADR-0017](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0017-bitwarden-secrets-manager-runtime.md)); names [ADR-0006](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0006-secret-naming-convention.md) with scope `__PROJ_KRUISPAD`. Use the **single existing GekkoStack BWS project** — do not create a new per-product BWS project.
6. Spec §2.1 Manus OAuth / MySQL / Manus host are **superseded** for implementation. Workflow behaviour in §§2.2–2.7 remains authoritative.

## Consequences

- (+) Matches GekkoFlow skills and hub deep-link story.
- (+) RLS + Auth + Storage in one project.
- (−) Owner must create Supabase + Vercel projects and Bitwarden secret rows (names in SECRETS_INVENTORY).
- (−) Separate Supabase Auth from GekkoFlow (no cross-origin session) unless a later ADR adds SSO.
