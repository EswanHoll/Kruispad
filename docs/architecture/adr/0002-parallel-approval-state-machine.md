# ADR-0002 — Parallel approval state machine

**Status:** Accepted · **Date:** 2026-10-27 · **Deciders:** Eswan Holl (owner)  
**Implements:** Spec v1.3 §2.3

## Context

Legacy sequential approval is replaced by **parallel** approval: Fred Louw and Anton Prinsloo both act on `submitted` requests. Either decline resets the request; both approvals auto-advance to `fully_approved`. Concurrent clicks must not corrupt state.

## Decision

### Macro statuses

| Code | Status |
|------|--------|
| 01 | `drafted` |
| 02 | `submitted` |
| 03 | `fully_approved` |
| 04 | `paid` |
| 05 | `document_printed` |

### Approver lanes

Independent columns: `fred_status`, `anton_status` ∈ `pending` | `approved` | `declined`, plus action timestamps and decline reasons. Finance decline uses `finance_decline_reason` / `finance_action_at`.

### Transitions (server-only RPCs)

| Action | From | To / effect | Actor role |
|--------|------|-------------|------------|
| `save_draft` | new / `drafted` | `drafted` | `initiator` (owner) |
| `submit` | `drafted` | `submitted`; lanes → `pending` | `initiator` (owner); required fields + ≥1 attachment |
| `fred_approve` | `submitted` | set Fred approved; if both approved → `fully_approved` | `approver_fred` |
| `fred_decline` | `submitted` | `drafted`; reset both lanes | `approver_fred` + reason |
| `anton_approve` | `submitted` | set Anton approved; if both approved → `fully_approved` | `approver_anton` |
| `anton_decline` | `submitted` | `drafted`; reset both lanes | `approver_anton` + reason |
| `finance_pay` | `fully_approved` | `paid` | `finance` |
| `finance_decline` | `fully_approved` | `drafted`; reset lanes | `finance` + reason |
| `print_document` | `paid` | `document_printed` | `admin` |

### Concurrency

Each transition RPC:

1. `SELECT … FOR UPDATE` on the payment request row.
2. Re-check preconditions (status, role, lane already decided).
3. Apply update + insert `audit_events` in the same transaction.
4. On dual approve, auto-advance is atomic with the second approve.

Client UI may optimistically disable buttons; **Postgres is the authority**.

### Audit

Every transition writes `audit_events` (`request_id`, `actor_id`, `action`, `from_status`, `to_status`, `reason`, `payload`, `created_at`). Detail views render a timeline from this table.

## Consequences

- (+) Spec §2.3 enforceable under race.
- (+) Declines always return editable drafts with reasons preserved in audit.
- (−) Clients must call RPCs — direct `UPDATE payment_requests` of status columns is denied by RLS.
