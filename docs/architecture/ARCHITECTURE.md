# ARCHITECTURE — Kruispad Payment Request Workflow

**Status:** Accepted · **Date:** 2026-10-27 · **Linear:** [GST-459](https://linear.app/gekkotech/issue/GST-459/kruispad-payment-request-workflow-app-v1)  
**Repo:** https://github.com/EswanHoll/Kruispad  
**Behaviour spec:** [WorkflowApp/Payment_Request_Approval_Workflow_Spec.md](../../WorkflowApp/Payment_Request_Approval_Workflow_Spec.md) v1.3

## Purpose

Digitise Kruispad expense submission, **parallel dual approval** (Fred Louw + Anton Prinsloo), Finance payment, and Admin document print/file — with role-based UI, private attachments, audit trail, and email notifications.

## Non-goals

- Multi-tenant SaaS (single organisation)
- Sandbox / Manus preview as product host ([portfolio ADR-0015](https://github.com/EswanHoll/GekkoStack/blob/main/docs/portfolio-architecture/decisions/ADR-0015-no-sandbox-product-builds.md))
- Seeding real user accounts from this repo

## Stack (overrides spec §2.1)

| Layer | Choice | Notes |
|-------|--------|-------|
| Host | **Vercel** | Ship via PR → `main` → Vercel project (owner creates project) |
| Frontend | React 19 + Vite + TypeScript + Tailwind | Mirrors [GekkoFlow](https://github.com/EswanHoll/GekkoFlow) UI stack |
| Auth / DB / Storage | **Existing shared Supabase** | Schema **`kruispad`** only — no new Supabase project ([ADR-0003](adr/0003-email-action-links-and-shared-schema.md)) |
| State machine | `kruispad` RPCs (`SECURITY DEFINER`) + `audit_events` | Concurrent dual approval under row lock |
| Email actions | SendGrid + `/action/:token` pages | Signed single-use tokens; no HTML forms in email |
| Auth UX | Magic link for initiators | Approvers/finance/admin act via email links |
| Secrets | Bitwarden (`bws`) | Shared Supabase names + `__PROJ_KRUISPAD` for SendGrid/app URL |

Decision records: [ADR-0001](adr/0001-stack-and-host.md), [ADR-0002](adr/0002-parallel-approval-state-machine.md), [ADR-0003](adr/0003-email-action-links-and-shared-schema.md).

## Context (C4 L1)

```mermaid
C4Context
    title Kruispad Payment Request Workflow — System Context
    Person(initiator, "Initiator", "Staff / volunteer drafts and submits requests")
    Person(fred, "Fred Louw", "Approver (parallel)")
    Person(anton, "Anton Prinsloo", "Approver (parallel)")
    Person(finance, "Frikkie Geyser", "Finance — pay / decline")
    Person(admin, "Elsje / Admin", "Print queue + user admin")
    System(app, "Kruispad Workflow", "Vercel SPA + API routes")
    System_Ext(supabase, "Supabase", "Auth, Postgres, private Storage")
    System_Ext(sendgrid, "SendGrid", "Transactional email")
    System_Ext(gekkoflow, "GekkoFlow", "Optional hub — deep links into this app")
    Rel(initiator, app, "Uses")
    Rel(fred, app, "Approves / declines")
    Rel(anton, app, "Approves / declines")
    Rel(finance, app, "Pays / declines")
    Rel(admin, app, "Prints / manages")
    Rel(app, supabase, "Auth, RLS data, files")
    Rel(app, sendgrid, "Notifications §2.7")
    Rel(gekkoflow, app, "Hub link / return URL")
```

## Container sketch

```mermaid
flowchart LR
  Browser["Browser SPA\nReact + Vite"] --> Vercel["Vercel\nstatic + /api/*"]
  Vercel --> SB[(Supabase\nAuth + Postgres + Storage)]
  Vercel -->|"bws at runtime"| BWS["Bitwarden SM\nGekkoStack project"]
  Vercel --> SG[SendGrid]
  GekkoFlow["GekkoFlow hub"] -.->|"deep link"| Browser
```

## Roles → capabilities

| Role | Capabilities |
|------|----------------|
| `initiator` | Create/edit drafts, submit, view own requests |
| `approver_fred` | Approval queue — Fred approve/decline |
| `approver_anton` | Approval queue — Anton approve/decline |
| `finance` | Payment queue — pay / decline with reason |
| `admin` | Print queue, all requests, manage profiles |

Macro statuses: `drafted` → `submitted` → `fully_approved` → `paid` → `document_printed`. Decline at any approval/payment stage resets to `drafted` and clears approver fields.

## GekkoFlow hub linking

GekkoFlow may present or link to this app without owning its data:

| Concern | Contract |
|---------|----------|
| Base URL | Production host once assigned (owner); local `http://localhost:5173` |
| Deep links | `/` dashboard · `/requests/new` · `/requests/:id` · `/my-requests` · `/queues/approval` · `/queues/payment` · `/queues/print` · `/all-requests` · `/login` |
| Auth | Supabase Auth email/password (or magic link when enabled). Hub opens Kruispad in a new tab; users sign in to the Kruispad Supabase project. No shared session cookie across origins. |
| Return / hub | Optional query `?from=gekkoflow` — UI shows “Back to GekkoFlow” → `https://gekkoflow.com` |
| Embedding | Prefer top-level navigation (not iframe) so Auth redirects work |

Do not couple Kruispad schema into GekkoFlow-DB. Hub is presentation/link only until a later ADR says otherwise.

## Email action flow

```mermaid
sequenceDiagram
  participant App as Vercel app
  participant API as /api/notify
  participant Mail as SendGrid
  participant User as Approver/Finance
  participant Act as /action/:token
  participant DB as kruispad RPCs

  App->>DB: transition (session or prior email)
  App->>API: POST notify
  API->>DB: mint_action_token (hash stored)
  API->>Mail: summary + attachment links + Approve/Decline URLs
  User->>Act: open link (no login)
  Act->>DB: peek_action_token / execute_email_action
  Note over DB: same apply_* helpers; audit channel=email_link
```

## Constraints

- Secrets: names only in git; values only in Bitwarden ([SECRETS_INVENTORY.md](SECRETS_INVENTORY.md)).
- Attachments: private Storage bucket `kruispad-attachments` (PDF/JPG/PNG).
- PostgREST must expose schema `kruispad` on the shared project.
- CI: lint, typecheck, test — no secrets in GitHub Actions.
- Deploy: merge to `main` → Vercel; apply migrations to shared Supabase with BWS-hydrated credentials.
