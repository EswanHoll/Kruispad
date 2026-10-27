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

React + Vite + TypeScript + Tailwind on **Vercel**; **Supabase** (Auth, Postgres, Storage). Spec §2.1 Manus/MySQL stack is superseded by [ADR-0001](docs/architecture/adr/0001-stack-and-host.md).

## Local setup

1. Node 22+, `pnpm` 10+.
2. Copy `.env.example` → `.env.local` and fill **names** from operator Bitwarden values (never commit values).
3. `pnpm install`
4. `pnpm dev` — Vite on http://localhost:5173
5. Apply migrations when a Supabase project exists: `pnpm db:push` (requires CLI + BWS-hydrated credentials).

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
| `pnpm dev` | Vite dev server |
| `pnpm build` | Production client + API bundle check |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest (state machine + concurrent dual approval) |
| `pnpm db:push` | `supabase db push` (needs project) |

## Secrets

Names only: [docs/architecture/SECRETS_INVENTORY.md](docs/architecture/SECRETS_INVENTORY.md). Runtime: Bitwarden Secrets Manager (`bws`). **Never GitHub secrets. Never print values.**

## GekkoFlow hub

Deep links and `?from=gekkoflow` return behaviour: [ARCHITECTURE.md § GekkoFlow hub linking](docs/architecture/ARCHITECTURE.md#gekkoflow-hub-linking).

## Owner steps (not done by agents)

1. Create Supabase project for Kruispad; save URL/keys under `__PROJ_KRUISPAD` in the **existing** GekkoStack BWS project.
2. Create Vercel project linked to this repo; sync `VITE_*` from BWS.
3. Add SendGrid from-address + API key names in BWS.
4. Invite real users in Supabase Auth; Admin assigns roles in `/admin/users` (do not seed real emails in git).
5. Set DNS only when ready for a custom domain (optional).
