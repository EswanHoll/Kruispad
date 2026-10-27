# Secrets inventory — Kruispad

**Status:** READY_FOR_OPERATOR  
**Product / project:** Kruispad · **Repo:** [EswanHoll/Kruispad](https://github.com/EswanHoll/Kruispad)  
**Linear:** [GST-459](https://linear.app/gekkotech/issue/GST-459/kruispad-payment-request-workflow-app-v1) · **Date:** 2026-10-27  

> **Names and scopes only. Never paste values into this file, PRs, or agent chat.**  
> Runtime store: **Bitwarden Secrets Manager** ([ADR-0017](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0017-bitwarden-secrets-manager-runtime.md)). Naming: [ADR-0006](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0006-secret-naming-convention.md). **Never GitHub secrets.**  
> **BWS project:** existing GekkoStack Secrets Manager project only.  
> **Supabase:** reuse the **existing shared** project — schema `kruispad` ([ADR-0003](adr/0003-email-action-links-and-shared-schema.md)). Do **not** create a new Supabase project.

## Bootstrap

| Name | Scope | Notes |
|------|-------|-------|
| `BWS_ACCESS_TOKEN` | machine account | Only host bootstrap credential |

## Shared Supabase (reuse — do not duplicate)

| # | Secret name (exact) | Scope | Required for | Notes |
|---|---------------------|-------|--------------|-------|
| 1 | `SUPABASE_URL__SHARED` | SHARED | Build / runtime | Existing project URL |
| 2 | `SUPABASE_ANON_KEY__SHARED` | SHARED | Browser | Anon key (RLS) |
| 3 | `SUPABASE_SERVICE_ROLE_KEY__SHARED` | SHARED | Server / migrations / notify / action | **Server only** |
| 4 | `SUPABASE_PROJECT_REF__SHARED` | SHARED | CLI | Existing project ref |
| 5 | `SUPABASE_DB_PASSWORD__SHARED` | SHARED | Migrations | Existing DB password |

Owner step: expose PostgREST schema **`kruispad`** on this project (Dashboard → Settings → API → Exposed schemas).

## Kruispad-only (`__PROJ_KRUISPAD`)

| # | Secret name (exact) | Scope | Required for | Notes |
|---|---------------------|-------|--------------|-------|
| 6 | `RESEND_API_KEY__PROJ_KRUISPAD` | PROJ | Email notify | Resend free tier (~3,000/mo); replaces SendGrid |
| 7 | `RESEND_FROM__PROJ_KRUISPAD` | PROJ | Email notify | Verified from-address in Resend |
| 8 | `APP_BASE_URL__PROJ_KRUISPAD` | PROJ | Email + magic-link redirects | Production Vercel URL |
| 9 | `VERCEL_PROJECT_ID__PROJ_KRUISPAD` | PROJ | Deploy scripts | After Vercel project exists |
| 10 | `VITE_SUPABASE_URL` | host sync | Frontend | Synced from `SUPABASE_URL__SHARED` |
| 11 | `VITE_SUPABASE_ANON_KEY` | host sync | Frontend | Synced from `SUPABASE_ANON_KEY__SHARED` |

## Presence checklist

| Secret name | Verdict (`SET` / `MISSING`) |
|-------------|----------------------------|
| `SUPABASE_URL__SHARED` | |
| `SUPABASE_ANON_KEY__SHARED` | |
| `SUPABASE_SERVICE_ROLE_KEY__SHARED` | |
| `SUPABASE_PROJECT_REF__SHARED` | |
| `SUPABASE_DB_PASSWORD__SHARED` | |
| `RESEND_API_KEY__PROJ_KRUISPAD` | |
| `RESEND_FROM__PROJ_KRUISPAD` | |
| `APP_BASE_URL__PROJ_KRUISPAD` | |
| `VERCEL_PROJECT_ID__PROJ_KRUISPAD` | |

## Status log

| When | Who | Note |
|------|-----|------|
| 2026-10-27 | Cursor agent | Inventory drafted |
| 2026-10-27 | Cursor agent | Cost decision: shared Supabase + `kruispad` schema |
| 2026-10-27 | Cursor agent | Email provider: **Resend** (SendGrid free tier gone) |
| | | Operator exposes schema + saves Resend/app URL rows |
| | | Presence PASS — production deploy unblocked |
