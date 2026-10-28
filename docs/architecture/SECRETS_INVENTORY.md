# Secrets inventory — Kruispad

**Status:** READY_FOR_OPERATOR  
**Product / project:** Kruispad · **Repo:** [EswanHoll/Kruispad](https://github.com/EswanHoll/Kruispad)  
**Linear:** [GST-459](https://linear.app/gekkotech/issue/GST-459/kruispad-payment-request-workflow-app-v1) · **Date:** 2026-10-28  

> **Names and scopes only. Never paste values into this file, PRs, or agent chat.**  
> Runtime store: **Bitwarden Secrets Manager** ([ADR-0017](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0017-bitwarden-secrets-manager-runtime.md)). Naming: [ADR-0006](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0006-secret-naming-convention.md). **Never GitHub secrets.**  
> **BWS project:** existing GekkoStack Secrets Manager project only.  
> **Host:** existing **GekkoFlow** Vercel project — no Kruispad Vercel project ([ADR-0001](adr/0001-stack-and-host.md)).  
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

## Email — existing SendGrid (reuse; do not mint a new key)

| # | Secret name (exact) | Scope | Required for | Notes |
|---|---------------------|-------|--------------|-------|
| 6 | `SENDGRID_API_KEY` | ORG / host | Email notify | **Same name as GekkoFlow Vercel / BWS** |
| 7 | `SENDGRID_FROM_EMAIL` | ORG / host | Email notify | Configurable sender. Prefer **`noreply@gekkoflow.com`** (verified). Also verified: `notifications@gekkotech.co.za`, `webleads@gekkotech.co.za`. Authenticated domains include `gekkoflow.com`, `gekkotech.co.za`. |

## Kruispad-only (`__PROJ_KRUISPAD`)

| # | Secret name (exact) | Scope | Required for | Notes |
|---|---------------------|-------|--------------|-------|
| 8 | `APP_BASE_URL__PROJ_KRUISPAD` | PROJ | Email + magic-link redirects | Production mount, e.g. `https://gekkoflow.com/kruispad` |
| 9 | `KRUISPAD_NOTIFY_SECRET__PROJ_KRUISPAD` | PROJ | POST `/api/kruispad/notify` | Shared secret for server→notify; browser uses Bearer JWT |
| 10 | `VITE_SUPABASE_URL` | host sync | Frontend build | Synced from `SUPABASE_URL__SHARED` into GekkoFlow / mount build |
| 11 | `VITE_SUPABASE_ANON_KEY` | host sync | Frontend build | Synced from `SUPABASE_ANON_KEY__SHARED` |

**Removed:** `VERCEL_PROJECT_ID__PROJ_KRUISPAD`, `RESEND_API_KEY__PROJ_KRUISPAD`, `RESEND_FROM__PROJ_KRUISPAD`.

## Presence checklist

| Secret name | Verdict (`SET` / `MISSING`) |
|-------------|----------------------------|
| `SUPABASE_URL__SHARED` | |
| `SUPABASE_ANON_KEY__SHARED` | |
| `SUPABASE_SERVICE_ROLE_KEY__SHARED` | |
| `SUPABASE_PROJECT_REF__SHARED` | |
| `SUPABASE_DB_PASSWORD__SHARED` | |
| `SENDGRID_API_KEY` | |
| `SENDGRID_FROM_EMAIL` | |
| `APP_BASE_URL__PROJ_KRUISPAD` | |
| `KRUISPAD_NOTIFY_SECRET__PROJ_KRUISPAD` | |

## Status log

| When | Who | Note |
|------|-----|------|
| 2026-10-27 | Cursor agent | Inventory drafted |
| 2026-10-27 | Cursor agent | Cost decision: shared Supabase + `kruispad` schema |
| 2026-10-27 | Cursor agent | Email provider briefly Resend |
| 2026-10-28 | Cursor agent | Host: GekkoFlow Vercel only |
| 2026-10-28 | Eswan / agent | Email: **existing SendGrid** (`SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL`); drop Resend |
| | | Operator ensures `SENDGRID_FROM_EMAIL=noreply@gekkoflow.com` (or other verified) on GekkoFlow Vercel |
