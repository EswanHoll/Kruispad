# DESIGN-2026-10-27 — Payment Request Approval Workflow UI

**Status:** Accepted · **Owner:** Eswan Holl / GekkoTech · **Spec:** [v1.3](../../WorkflowApp/Payment_Request_Approval_Workflow_Spec.md)

## Problem

Replace Rethink Workflow “Payment Request Approval Workflow V1.0” with a purpose-built app: draft → parallel approve → pay → print, with audit and email.

## Users

Initiators; Fred Louw & Anton Prinsloo (parallel approvers); Frikkie Geyser (Finance); Elsje / Admin.

## Screens (spec §2.5)

| Route | View | Roles |
|-------|------|-------|
| `/` | Dashboard (role-specific counts) | All authenticated |
| `/requests/new`, `/requests/:id/edit` | New / Edit Request | Initiator (draft owner) |
| `/my-requests` | My Requests | Initiator |
| `/queues/approval` | Approval Queue | Fred, Anton |
| `/queues/payment` | Payment Queue | Finance |
| `/queues/print` | Print Queue | Admin |
| `/all-requests` | All Requests | Admin |
| `/requests/:id` | Detail + audit timeline | Per RLS |
| `/login` | Sign in | Public |
| `/admin/users` | Profile role management | Admin |

## UI rules (spec §2.5)

- Left sidebar navigation; clicking a nav item scrolls the main content to top.
- No grey text on dark surfaces — white or bright text; bold headings; body ≥ 14px.
- Status badges; list → detail drill-down.
- Form: Date requested, Beneficiary, Payment type (Expense / Maintenance / Donation), rich description, Amount ZAR, file upload (PDF/JPG/PNG, ≥1 on Submit). Actions: **Save** (draft) and **Submit** (confirm dialog).

## Visual direction

Internal ops app: deep teal sidebar (`#0B3D3A`), warm paper content (`#F7F3EC`), accent coral for primary actions (`#C45C26`), display font **Fraunces**, UI font **Figtree**. Avoid purple-gradient / Inter defaults.

## Acceptance

- All screens reachable for correct roles only.
- Parallel approval and decline-with-reason match [ADR-0002](../architecture/adr/0002-parallel-approval-state-machine.md).
- Audit timeline on detail.
- Notifications §2.7 via email API.
