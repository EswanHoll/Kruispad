# Secrets inventory — Kruispad

**Status:** READY_FOR_OPERATOR  
**Product / project:** Kruispad · **Repo:** [EswanHoll/Kruispad](https://github.com/EswanHoll/Kruispad)  
**Linear:** [GST-459](https://linear.app/gekkotech/issue/GST-459/kruispad-payment-request-workflow-app-v1) · **Date:** 2026-10-27  

> **Names and scopes only. Never paste values into this file, PRs, or agent chat.**  
> Runtime store: **Bitwarden Secrets Manager** ([ADR-0017](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0017-bitwarden-secrets-manager-runtime.md)). Naming: [ADR-0006](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0006-secret-naming-convention.md). **Never GitHub secrets.**  
> **BWS project:** use the **existing GekkoStack Secrets Manager project** (do **not** create a new per-product BWS project). Grant the deploy/CI machine account access to that project.

## Bootstrap

| Name | Scope | BWS project | Notes |
|------|-------|-------------|-------|
| `BWS_ACCESS_TOKEN` | machine account | — | Only host bootstrap credential; hydrates ADR-0006 names via `bws` |

## Kruispad project secrets (`__PROJ_KRUISPAD`)

| # | Secret name (exact) | Scope | Required for | Notes |
|---|---------------------|-------|--------------|-------|
| 1 | `SUPABASE_URL__PROJ_KRUISPAD` | PROJ | Build / runtime | Project URL (public) |
| 2 | `SUPABASE_ANON_KEY__PROJ_KRUISPAD` | PROJ | Browser + CI build | Anon key (RLS-enforced) |
| 3 | `SUPABASE_SERVICE_ROLE_KEY__PROJ_KRUISPAD` | PROJ | Server / migrations / notify | **Server only** — never expose to Vite |
| 4 | `SUPABASE_PROJECT_REF__PROJ_KRUISPAD` | PROJ | CLI `db push` | Project ref |
| 5 | `SUPABASE_DB_PASSWORD__PROJ_KRUISPAD` | PROJ | Migrations | DB password |
| 6 | `SENDGRID_API_KEY__PROJ_KRUISPAD` | PROJ | Email notify | Prefer project key; may temporarily alias org SendGrid if operator chooses |
| 7 | `SENDGRID_FROM__PROJ_KRUISPAD` | PROJ | Email notify | Verified from-address |
| 8 | `APP_BASE_URL__PROJ_KRUISPAD` | PROJ | Email deep links | e.g. production Vercel URL once known |
| 9 | `VERCEL_PROJECT_ID__PROJ_KRUISPAD` | PROJ | Deploy scripts | After Vercel project exists |
| 10 | `VITE_SUPABASE_URL` | local/Vercel env sync | Frontend build | Synced **from** `SUPABASE_URL__PROJ_KRUISPAD` by deploy/sync script — not a second store of truth |
| 11 | `VITE_SUPABASE_ANON_KEY` | local/Vercel env sync | Frontend build | Synced **from** `SUPABASE_ANON_KEY__PROJ_KRUISPAD` |

Org deploy tokens already in GekkoStack catalog (reuse; do not duplicate): `VERCEL_TOKEN__SHARED` / successors, `BWS_ACCESS_TOKEN`.

## Presence checklist (agent, after operator saves)

| Secret name | Verdict (`SET` / `MISSING`) |
|-------------|----------------------------|
| `SUPABASE_URL__PROJ_KRUISPAD` | |
| `SUPABASE_ANON_KEY__PROJ_KRUISPAD` | |
| `SUPABASE_SERVICE_ROLE_KEY__PROJ_KRUISPAD` | |
| `SUPABASE_PROJECT_REF__PROJ_KRUISPAD` | |
| `SUPABASE_DB_PASSWORD__PROJ_KRUISPAD` | |
| `SENDGRID_API_KEY__PROJ_KRUISPAD` | |
| `SENDGRID_FROM__PROJ_KRUISPAD` | |
| `APP_BASE_URL__PROJ_KRUISPAD` | |
| `VERCEL_PROJECT_ID__PROJ_KRUISPAD` | |

## Status log

| When | Who | Note |
|------|-----|------|
| 2026-10-27 | Cursor agent | Inventory drafted — READY_FOR_OPERATOR |
| | | Operator creates Supabase + Vercel projects; saves BWS rows |
| | | Presence PASS — production deploy unblocked |
