import { describe, expect, it } from "vitest";
import {
  applyConcurrentApprovals,
  applyTransition,
  queueFilter,
  WorkflowError,
} from "../src/lib/workflow";
import type { PaymentRequest } from "../src/lib/types";

const NOW = "2026-10-27T10:00:00.000Z";

function baseRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    initiator_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    date_requested: "2026-10-27",
    beneficiary_name: "Supplier Pty Ltd",
    payment_type: "expense",
    description: "Office supplies",
    amount: 1250.5,
    status: "drafted",
    fred_status: "pending",
    fred_action_at: null,
    fred_decline_reason: null,
    anton_status: "pending",
    anton_action_at: null,
    anton_decline_reason: null,
    finance_action_at: null,
    finance_decline_reason: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

describe("workflow transitions", () => {
  it("submits a complete drafted request", () => {
    const result = applyTransition({
      request: baseRequest(),
      action: "submit",
      actorRole: "initiator",
      actorId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      attachmentCount: 1,
      now: NOW,
    });
    expect(result.toStatus).toBe("submitted");
    expect(result.notify).toBe("submitted");
    expect(result.request.fred_status).toBe("pending");
    expect(result.request.anton_status).toBe("pending");
  });

  it("rejects submit without attachments", () => {
    expect(() =>
      applyTransition({
        request: baseRequest(),
        action: "submit",
        actorRole: "initiator",
        actorId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        attachmentCount: 0,
      }),
    ).toThrow(WorkflowError);
  });

  it("auto-advances when both approvers approve (Fred then Anton)", () => {
    const submitted = baseRequest({ status: "submitted" });
    const afterFred = applyTransition({
      request: submitted,
      action: "fred_approve",
      actorRole: "approver_fred",
      actorId: "fred",
      now: NOW,
    });
    expect(afterFred.toStatus).toBe("submitted");
    expect(afterFred.notify).toBe("partial_approve");

    const afterAnton = applyTransition({
      request: afterFred.request,
      action: "anton_approve",
      actorRole: "approver_anton",
      actorId: "anton",
      now: "2026-10-27T10:00:01.000Z",
    });
    expect(afterAnton.toStatus).toBe("fully_approved");
    expect(afterAnton.notify).toBe("fully_approved");
  });

  it("auto-advances when both approvers approve (Anton then Fred)", () => {
    const submitted = baseRequest({ status: "submitted" });
    const afterAnton = applyTransition({
      request: submitted,
      action: "anton_approve",
      actorRole: "approver_anton",
      actorId: "anton",
      now: NOW,
    });
    const afterFred = applyTransition({
      request: afterAnton.request,
      action: "fred_approve",
      actorRole: "approver_fred",
      actorId: "fred",
      now: "2026-10-27T10:00:01.000Z",
    });
    expect(afterFred.toStatus).toBe("fully_approved");
  });

  it("handles concurrent dual approval orderings to fully_approved", () => {
    const submitted = baseRequest({ status: "submitted" });
    const a = applyConcurrentApprovals(submitted, ["fred", "anton"]);
    const b = applyConcurrentApprovals(submitted, ["anton", "fred"]);
    expect(a.status).toBe("fully_approved");
    expect(b.status).toBe("fully_approved");
    expect(a.fred_status).toBe("approved");
    expect(a.anton_status).toBe("approved");
    expect(b.fred_status).toBe("approved");
    expect(b.anton_status).toBe("approved");
  });

  it("rejects a second Fred approve (idempotent conflict)", () => {
    const afterFred = applyTransition({
      request: baseRequest({ status: "submitted" }),
      action: "fred_approve",
      actorRole: "approver_fred",
      actorId: "fred",
    }).request;
    expect(() =>
      applyTransition({
        request: afterFred,
        action: "fred_approve",
        actorRole: "approver_fred",
        actorId: "fred",
      }),
    ).toThrow(/already acted/);
  });

  it("Fred decline resets to drafted and clears lanes", () => {
    const result = applyTransition({
      request: baseRequest({
        status: "submitted",
        anton_status: "approved",
        anton_action_at: NOW,
      }),
      action: "fred_decline",
      actorRole: "approver_fred",
      actorId: "fred",
      reason: "Missing invoice detail",
      now: NOW,
    });
    expect(result.toStatus).toBe("drafted");
    expect(result.reason).toBe("Missing invoice detail");
    expect(result.request.fred_status).toBe("pending");
    expect(result.request.anton_status).toBe("pending");
    expect(result.notify).toBe("declined");
  });

  it("requires decline reason", () => {
    expect(() =>
      applyTransition({
        request: baseRequest({ status: "submitted" }),
        action: "anton_decline",
        actorRole: "approver_anton",
        actorId: "anton",
        reason: "   ",
      }),
    ).toThrow(/Decline reason/);
  });

  it("finance pay and print complete the path", () => {
    const paid = applyTransition({
      request: baseRequest({
        status: "fully_approved",
        fred_status: "approved",
        anton_status: "approved",
      }),
      action: "finance_pay",
      actorRole: "finance",
      actorId: "finance",
      now: NOW,
    });
    expect(paid.toStatus).toBe("paid");
    expect(paid.notify).toBe("paid");

    const printed = applyTransition({
      request: paid.request,
      action: "print_document",
      actorRole: "admin",
      actorId: "admin",
      now: NOW,
    });
    expect(printed.toStatus).toBe("document_printed");
    expect(printed.notify).toBe("printed");
  });

  it("finance decline resets lanes to drafted", () => {
    const result = applyTransition({
      request: baseRequest({
        status: "fully_approved",
        fred_status: "approved",
        anton_status: "approved",
      }),
      action: "finance_decline",
      actorRole: "finance",
      actorId: "finance",
      reason: "Bank details incomplete",
    });
    expect(result.toStatus).toBe("drafted");
    expect(result.request.fred_status).toBe("pending");
    expect(result.request.anton_status).toBe("pending");
  });

  it("queue filters match role views", () => {
    expect(queueFilter("submitted", "approver_fred", "pending", "approved")).toBe(true);
    expect(queueFilter("submitted", "approver_fred", "approved", "pending")).toBe(false);
    expect(queueFilter("submitted", "approver_anton", "approved", "pending")).toBe(true);
    expect(queueFilter("fully_approved", "finance")).toBe(true);
    expect(queueFilter("paid", "admin")).toBe(true);
  });
});
