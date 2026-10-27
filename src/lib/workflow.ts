import type {
  AppRole,
  LaneStatus,
  PaymentRequest,
  RequestStatus,
  WorkflowAction,
} from "./types";

export class WorkflowError extends Error {
  code: "forbidden" | "invalid_state" | "validation" | "conflict" | "not_found";

  constructor(
    message: string,
    code: "forbidden" | "invalid_state" | "validation" | "conflict" | "not_found",
  ) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
  }
}

export interface TransitionInput {
  request: PaymentRequest;
  action: WorkflowAction;
  actorRole: AppRole;
  actorId: string;
  reason?: string;
  attachmentCount?: number;
  now?: string;
}

export interface TransitionResult {
  request: PaymentRequest;
  fromStatus: RequestStatus;
  toStatus: RequestStatus;
  auditAction: string;
  reason: string | null;
  notify:
    | "submitted"
    | "partial_approve"
    | "fully_approved"
    | "declined"
    | "paid"
    | "printed"
    | null;
}

function resetLanes(
  _request: PaymentRequest,
  now: string,
): Pick<
  PaymentRequest,
  | "fred_status"
  | "fred_action_at"
  | "fred_decline_reason"
  | "anton_status"
  | "anton_action_at"
  | "anton_decline_reason"
  | "finance_action_at"
  | "finance_decline_reason"
  | "updated_at"
> {
  return {
    fred_status: "pending",
    fred_action_at: null,
    fred_decline_reason: null,
    anton_status: "pending",
    anton_action_at: null,
    anton_decline_reason: null,
    finance_action_at: null,
    finance_decline_reason: null,
    updated_at: now,
  };
}

function requireOwner(request: PaymentRequest, actorId: string) {
  if (request.initiator_id !== actorId) {
    throw new WorkflowError("Only the document owner may edit this request", "forbidden");
  }
}

function requireReason(reason: string | undefined): string {
  const trimmed = reason?.trim() ?? "";
  if (!trimmed) {
    throw new WorkflowError("Decline reason is required", "validation");
  }
  return trimmed;
}

function assertStatus(request: PaymentRequest, expected: RequestStatus) {
  if (request.status !== expected) {
    throw new WorkflowError(
      `Request must be ${expected} (currently ${request.status})`,
      "invalid_state",
    );
  }
}

/**
 * Pure transition engine mirroring Postgres RPCs (ADR-0002).
 * Used by unit tests and client-side validation before RPC calls.
 */
export function applyTransition(input: TransitionInput): TransitionResult {
  const now = input.now ?? new Date().toISOString();
  const { request, action, actorRole, actorId } = input;
  const fromStatus = request.status;

  switch (action) {
    case "save_draft": {
      if (actorRole !== "initiator" && actorRole !== "admin") {
        throw new WorkflowError("Only initiators may save drafts", "forbidden");
      }
      requireOwner(request, actorId);
      if (request.status !== "drafted") {
        throw new WorkflowError("Only drafted requests are editable", "invalid_state");
      }
      return {
        request: { ...request, updated_at: now },
        fromStatus,
        toStatus: "drafted",
        auditAction: "save_draft",
        reason: null,
        notify: null,
      };
    }

    case "submit": {
      if (actorRole !== "initiator" && actorRole !== "admin") {
        throw new WorkflowError("Only initiators may submit", "forbidden");
      }
      requireOwner(request, actorId);
      assertStatus(request, "drafted");
      if (!request.beneficiary_name.trim()) {
        throw new WorkflowError("Beneficiary name is required", "validation");
      }
      if (!request.description.trim()) {
        throw new WorkflowError("Description is required", "validation");
      }
      if (!(request.amount > 0)) {
        throw new WorkflowError("Amount must be a positive ZAR value", "validation");
      }
      if ((input.attachmentCount ?? 0) < 1) {
        throw new WorkflowError("At least one attachment is required to submit", "validation");
      }
      const next: PaymentRequest = {
        ...request,
        status: "submitted",
        fred_status: "pending",
        anton_status: "pending",
        fred_action_at: null,
        anton_action_at: null,
        fred_decline_reason: null,
        anton_decline_reason: null,
        finance_action_at: null,
        finance_decline_reason: null,
        updated_at: now,
      };
      return {
        request: next,
        fromStatus,
        toStatus: "submitted",
        auditAction: "submit",
        reason: null,
        notify: "submitted",
      };
    }

    case "fred_approve": {
      if (actorRole !== "approver_fred" && actorRole !== "admin") {
        throw new WorkflowError("Only Fred may perform this approval", "forbidden");
      }
      assertStatus(request, "submitted");
      if (request.fred_status !== "pending") {
        throw new WorkflowError("Fred has already acted on this request", "conflict");
      }
      const fredApproved: LaneStatus = "approved";
      const both =
        fredApproved === "approved" && request.anton_status === "approved";
      const next: PaymentRequest = {
        ...request,
        fred_status: fredApproved,
        fred_action_at: now,
        fred_decline_reason: null,
        status: both ? "fully_approved" : "submitted",
        updated_at: now,
      };
      return {
        request: next,
        fromStatus,
        toStatus: next.status,
        auditAction: both ? "fred_approve_fully" : "fred_approve",
        reason: null,
        notify: both ? "fully_approved" : "partial_approve",
      };
    }

    case "fred_decline": {
      if (actorRole !== "approver_fred" && actorRole !== "admin") {
        throw new WorkflowError("Only Fred may decline as Fred", "forbidden");
      }
      assertStatus(request, "submitted");
      const reason = requireReason(input.reason);
      // Spec: revert to Drafted and reset both approver statuses to Pending.
      // Decline reason is retained on the audit event, not on reset lanes.
      const next: PaymentRequest = {
        ...request,
        status: "drafted",
        ...resetLanes(request, now),
      };
      return {
        request: next,
        fromStatus,
        toStatus: "drafted",
        auditAction: "fred_decline",
        reason,
        notify: "declined",
      };
    }

    case "anton_approve": {
      if (actorRole !== "approver_anton" && actorRole !== "admin") {
        throw new WorkflowError("Only Anton may perform this approval", "forbidden");
      }
      assertStatus(request, "submitted");
      if (request.anton_status !== "pending") {
        throw new WorkflowError("Anton has already acted on this request", "conflict");
      }
      const both = request.fred_status === "approved";
      const next: PaymentRequest = {
        ...request,
        anton_status: "approved",
        anton_action_at: now,
        anton_decline_reason: null,
        status: both ? "fully_approved" : "submitted",
        updated_at: now,
      };
      return {
        request: next,
        fromStatus,
        toStatus: next.status,
        auditAction: both ? "anton_approve_fully" : "anton_approve",
        reason: null,
        notify: both ? "fully_approved" : "partial_approve",
      };
    }

    case "anton_decline": {
      if (actorRole !== "approver_anton" && actorRole !== "admin") {
        throw new WorkflowError("Only Anton may decline as Anton", "forbidden");
      }
      assertStatus(request, "submitted");
      const reason = requireReason(input.reason);
      const next: PaymentRequest = {
        ...request,
        status: "drafted",
        ...resetLanes(request, now),
        updated_at: now,
      };
      return {
        request: next,
        fromStatus,
        toStatus: "drafted",
        auditAction: "anton_decline",
        reason,
        notify: "declined",
      };
    }

    case "finance_pay": {
      if (actorRole !== "finance" && actorRole !== "admin") {
        throw new WorkflowError("Only Finance may mark paid", "forbidden");
      }
      assertStatus(request, "fully_approved");
      const next: PaymentRequest = {
        ...request,
        status: "paid",
        finance_action_at: now,
        finance_decline_reason: null,
        updated_at: now,
      };
      return {
        request: next,
        fromStatus,
        toStatus: "paid",
        auditAction: "finance_pay",
        reason: null,
        notify: "paid",
      };
    }

    case "finance_decline": {
      if (actorRole !== "finance" && actorRole !== "admin") {
        throw new WorkflowError("Only Finance may decline payment", "forbidden");
      }
      assertStatus(request, "fully_approved");
      const reason = requireReason(input.reason);
      const next: PaymentRequest = {
        ...request,
        status: "drafted",
        ...resetLanes(request, now),
      };
      return {
        request: next,
        fromStatus,
        toStatus: "drafted",
        auditAction: "finance_decline",
        reason,
        notify: "declined",
      };
    }

    case "print_document": {
      if (actorRole !== "admin") {
        throw new WorkflowError("Only Admin may print/file documents", "forbidden");
      }
      assertStatus(request, "paid");
      const next: PaymentRequest = {
        ...request,
        status: "document_printed",
        updated_at: now,
      };
      return {
        request: next,
        fromStatus,
        toStatus: "document_printed",
        auditAction: "print_document",
        reason: null,
        notify: "printed",
      };
    }

    default: {
      const _exhaustive: never = action;
      throw new WorkflowError(`Unknown action ${_exhaustive}`, "validation");
    }
  }
}

/** Simulate concurrent dual approval: both start from same snapshot; second must see first's lane. */
export function applyConcurrentApprovals(
  base: PaymentRequest,
  order: ("fred" | "anton")[],
): PaymentRequest {
  let current = structuredClone(base);
  for (const who of order) {
    if (who === "fred") {
      current = applyTransition({
        request: current,
        action: "fred_approve",
        actorRole: "approver_fred",
        actorId: "fred",
      }).request;
    } else {
      current = applyTransition({
        request: current,
        action: "anton_approve",
        actorRole: "approver_anton",
        actorId: "anton",
      }).request;
    }
  }
  return current;
}

export function canEditRequest(request: PaymentRequest, role: AppRole, userId: string): boolean {
  return (
    request.status === "drafted" &&
    request.initiator_id === userId &&
    (role === "initiator" || role === "admin")
  );
}

export function queueFilter(
  status: RequestStatus,
  role: AppRole,
  fredStatus?: LaneStatus,
  antonStatus?: LaneStatus,
): boolean {
  if (role === "approver_fred") {
    return status === "submitted" && (fredStatus ?? "pending") === "pending";
  }
  if (role === "approver_anton") {
    return status === "submitted" && (antonStatus ?? "pending") === "pending";
  }
  if (role === "finance") return status === "fully_approved";
  if (role === "admin") return status === "paid";
  return false;
}
