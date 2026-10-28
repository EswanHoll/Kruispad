# Kruispad — Payment Request Approval Workflow

Digitises expense submission, **parallel dual approval** (Fred Louw + Anton Prinsloo), Finance payment, and Admin print/file for Kruispad.

| | |
|--|--|
| **Repo** | https://github.com/EswanHoll/Kruispad |
| **Linear** | [GST-459](https://linear.app/gekkotech/issue/GST-459/kruispad-payment-request-workflow-app-v1) |
| **Spec** | [WorkflowApp/…Spec.md](WorkflowApp/Payment_Request_Approval_Workflow_Spec.md) v1.3 |
| **Architecture** | [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) |
| **Agents** | [AGENTS.md](AGENTS.md) — read [GekkoStack AGENTS.md](https://github.com/EswanHoll/GekkoStack/blob/main/AGENTS.md) first |

## Stack

React + Vite + TypeScript + Tailwind, **hosted inside the existing GekkoFlow Vercel project** at `/kruispad/` (APIs `/api/kruispad/*`). Data: **existing shared Supabase** schema **`kruispad`** — no new Vercel or Supabase project ([ADR-0001](docs/architecture/adr/0001-stack-and-host.md), [ADR-0003](docs/architecture/adr/0003-email-action-links-and-shared-schema.md)). Spec §2.1 Manus/MySQL stack is superseded.

Approvers/Finance/Admin act via **email action links** (single-use tokens → `/kruispad/action/:token`). Initiators use **invite-only magic-link** sign-in (`shouldCreateUser: false`). Email via **existing SendGrid** (`SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL`).

## Local setup

1. Node 22+, `pnpm` 10+.
2. Copy `.env.example` → `.env.local` and fill **names** from operator Bitwarden values (never commit values).
3. `pnpm install`
4. `pnpm dev` — Vite on http://localhost:5173/kruispad/ (set `VITE_BASE_PATH=/` for root-path local UI)
5. Apply migrations when ready: `pnpm db:push` (requires CLI + BWS-hydrated credentials).

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Vite dev server (base `/kruispad/`) |
| `pnpm build` | Production client build |
| `pnpm prepare:gekkoflow-mount` | Emit `mount/` for GekkoFlow Vercel |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest (state machine + concurrent dual approval) |
| `pnpm db:push` | `supabase db push` (needs project) |

## Secrets

Names only: [docs/architecture/SECRETS_INVENTORY.md](docs/architecture/SECRETS_INVENTORY.md). Runtime: Bitwarden Secrets Manager (`bws`). **Never GitHub secrets. Never print values.**

## GekkoFlow host

Mount contract: [docs/architecture/GEKKOFLOW_HOSTING.md](docs/architecture/GEKKOFLOW_HOSTING.md). Hub deep links: [ARCHITECTURE.md § GekkoFlow hub linking](docs/architecture/ARCHITECTURE.md#gekkoflow-hub-linking).

## Owner steps (not done by agents)

1. On the **existing shared Supabase** project: expose PostgREST schema `kruispad`, apply `supabase/migrations`, ensure Auth email magic links are enabled and Site URL / redirect allow `https://gekkoflow.com/kruispad`.
2. Reuse shared BWS Supabase names (`SUPABASE_*__SHARED`) and existing SendGrid (`SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` — prefer verified `noreply@gekkoflow.com`); add `APP_BASE_URL__PROJ_KRUISPAD` and `KRUISPAD_NOTIFY_SECRET__PROJ_KRUISPAD`; sync into the **GekkoFlow** Vercel env (see [SECRETS_INVENTORY](docs/architecture/SECRETS_INVENTORY.md)).
3. Ensure GekkoFlow `build:vercel` fetches/builds the Kruispad mount (no separate Vercel project).
4. Admin records invites in `/kruispad/admin/users`; operator provisions Auth users; users magic-link in (do not seed real emails in git).
5. Do **not** create a separate Vercel or Supabase project for Kruispad.
