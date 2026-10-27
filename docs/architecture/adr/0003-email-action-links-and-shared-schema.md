# ADR-0003 — Email action links + `kruispad` schema on shared Supabase

**Status:** Accepted · **Date:** 2026-10-27 · **Deciders:** Eswan Holl (owner)  
**Amends:** [ADR-0001](0001-stack-and-host.md) · **Implements:** Spec §2.7 with reduced login friction

## Context

Users (especially Fred, Anton, Finance, Admin) should rarely need a password session to act. Approvers open an email and approve/decline from a single-purpose page. Separately, cost pressure forbids a dedicated Supabase project for Kruispad.

## Decision

1. **Schema:** All Kruispad tables, enums, and RPCs live in Postgres schema **`kruispad`** inside the **existing shared Supabase project** (GekkoDB / portfolio Supabase). Do **not** create a new Supabase project for Kruispad.
2. **Email action links:** Notification emails contain **links** (not HTML forms) to `/action/:token`. Tokens are:
   - opaque high-entropy secrets (32 bytes hex)
   - stored only as SHA-256 hashes in `kruispad.action_tokens`
   - bound to **recipient + request + action**
   - **single-use** (`used_at`) and **expiring** (default 168h)
3. **No-login page:** Shows request summary + attachment signed links. Approve / Mark Paid / Mark Printed confirm in one click. Decline collects a reason, then submits.
4. **Same RPCs:** `kruispad.execute_email_action` validates the token then calls the same `apply_*` transition helpers used by session wrappers; audit `payload.channel = 'email_link'`.
5. **Initiators:** Magic-link sign-in (Supabase Auth OTP / email link) — no password required to submit.
6. **Secrets:** Reuse shared Supabase catalog names (`SUPABASE_*__SHARED`); keep Kruispad-only SendGrid/app URL under `__PROJ_KRUISPAD`. See SECRETS_INVENTORY.

## Consequences

- (+) Lower friction for parallel approvers; one less billable Supabase project.
- (+) Audit trail still authoritative; channel distinguished in payload.
- (−) Owner must expose schema `kruispad` on the shared project's PostgREST API settings.
- (−) Schema cohabitation requires careful RLS and naming so Kruispad never reads other products' tables.
