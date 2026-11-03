# Kruispad Workflow — Vision

## Why this exists
Kruispad Hazeldean is a church and NPO. It pays suppliers and people through a payment-request approval workflow that currently runs on Rethink Workflow, a paid third-party service that is shutting down. This app replaces it.

## What it is
A small, purpose-built Payment Request Approval Workflow:

1. An initiator submits a payment request, with its attachments.
2. Two approvers, Fred Louw and Anton Prinsloo, approve in parallel.
3. Finance executes the payment.
4. Admin prints or files the document.

Approvers, Finance and Admin act through **email action links** (signed, single-use tokens) with no login. Initiators sign in with an **invite-only magic link**. Every step is written to an **audit trail**.

## Principles
- **Minimal cost.** An NPO should not pay per-seat workflow fees. The app runs inside the existing GekkoFlow Vercel project and the existing shared Supabase (schema `kruispad`), and sends email through the existing SendGrid account. No new Vercel, Supabase or Bitwarden projects.
- **Simple for four people.** The workflow has four users today: Fred, Anton, Frikkie and Elsje, plus an admin. Clarity beats configurability.
- **Audit first.** Who requested, who approved, who paid and who filed it, with timestamps, is always recoverable.
- **Invite-only and least privilege.** No self-signup. Privileged database functions are service-role only. No secrets or real users in git; secrets live in Bitwarden Secrets Manager (GekkoStack).
- **Hubbed by GekkoFlow.** Hosted at `gekkoflow.com/kruispad`, like the other GekkoTech custom apps.

## History migration
Rethink's legacy payment requests are imported so Kruispad keeps one continuous record and an audit report. The basic-field export covers 2,238 requests. The full export (custom fields, history, attachments) has been requested from Rethink's support (Dewey). The import starts only once that data arrives.

## Done means
- All four users plus the admin are invited and can act on a request end to end.
- A real request has gone from submission to payment and filing using only email links and the app.
- Rethink history is imported, or archived and reported, with an audit trail.
- Running cost is effectively zero beyond the existing shared infrastructure.

## Not in scope (v1)
Multi-tenant use, general-purpose workflow building, new infrastructure, accounting integration, and payment execution inside the app. Finance still pays through the bank.
