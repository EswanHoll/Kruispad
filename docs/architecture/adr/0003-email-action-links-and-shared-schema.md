# ADR-0003 — Email action links and shared schema

**Status:** Accepted · **Date:** 2026-10-27 · **Updated:** 2026-10-28 · **Deciders:** Eswan Holl (owner)  
**Linear:** [GST-459](https://linear.app/gekkotech/issue/GST-459/kruispad-payment-request-workflow-app-v1)

## Context

Approvers and Finance need low-friction action without full login. Spec §2.7 notifications must not embed HTML forms. A dedicated Supabase project would add cost; shared GekkoFlow Supabase already exists.

## Decision

1. **Shared Supabase:** reuse the existing shared project; isolate Kruispad in schema **`kruispad`** (PostgREST-exposed).
2. **Email action links:** Notification emails contain **links** (not HTML forms) to `/kruispad/action/:token`. Tokens are opaque, single-use, expiring; hashes stored in `kruispad.action_tokens`; execute via SECURITY DEFINER RPC with `audit_events.payload.channel = email_link`.
3. **Magic-link auth:** Initiators sign in with Supabase Auth magic link using **`shouldCreateUser: false`** (invite-only). Profile rows are created only when a pending `kruispad.invites` row matches the new Auth user email.
4. **Email provider:** **Existing SendGrid** already on GekkoFlow / BWS — env names **`SENDGRID_API_KEY`** and **`SENDGRID_FROM_EMAIL`**. Do not create a new SendGrid key. Preferred verified sender: **`noreply@gekkoflow.com`** (also verified: `notifications@gekkotech.co.za`, `webleads@gekkotech.co.za`). Authenticated domains include `gekkoflow.com` and `gekkotech.co.za`.
5. **Resend:** not used (owner decision 28 Oct 2026 — use existing SendGrid).
6. **Secrets:** Reuse shared Supabase catalog names (`SUPABASE_*__SHARED`); reuse SendGrid host names; keep `APP_BASE_URL__PROJ_KRUISPAD` and `KRUISPAD_NOTIFY_SECRET__PROJ_KRUISPAD`. See SECRETS_INVENTORY.

## Consequences

- (+) No extra email vendor or Supabase bill.
- (−) Owner must keep `SENDGRID_FROM_EMAIL` on a verified sender and expose schema `kruispad`.
- (−) Invite + Auth user provisioning is an operator step before first magic link.
