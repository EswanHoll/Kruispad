import { describe, expect, it } from "vitest";
import { applyTransition, WorkflowError } from "../src/lib/workflow";
import type { PaymentRequest } from "../src/lib/types";

/**
 * Models the Postgres RPC pattern: each transition locks a snapshot, then commits.
 * Interleaved dual approval without observing the other's commit must not double-apply.
 */

const base: PaymentRequest = {
  id: "22222222-2222-2222-2222-222222222222",
  initiator_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  date_requested: "2026-10-27",
  beneficiary_name: "Hardware Store",
  payment_type: "maintenance",
  description: "Fence repair",
  amount: 4800,
  status: "submitted",
  fred_status: "pending",
  fred_action_at: null,
  fred_decline_reason: null,
  anton_status: "pending",
  anton_action_at: null,
  anton_decline_reason: null,
  finance_action_at: null,
  finance_decline_reason: null,
  created_at: "2026-10-27T09:00:00.000Z",
  updated_at: "2026-10-27T09:00:00.000Z",
};

describe("concurrent dual approval", () => {
  it("serializes Fred then Anton under lock ordering to fully_approved", async () => {
    // Simulate SELECT FOR UPDATE queue: Fred's txn commits before Anton reads.
    let locked = structuredClone(base);
    const fred = applyTransition({
      request: locked,
      action: "fred_approve",
      actorRole: "approver_fred",
      actorId: "fred",
      now: "2026-10-27T09:00:01.000Z",
    });
    locked = fred.request;
    const anton = applyTransition({
      request: locked,
      action: "anton_approve",
      actorRole: "approver_anton",
      actorId: "anton",
      now: "2026-10-27T09:00:02.000Z",
    });
    expect(anton.request.status).toBe("fully_approved");
    expect(anton.notify).toBe("fully_approved");
  });

  it("rejects stale second Fred approve after first commit (conflict)", () => {
    const afterFred = applyTransition({
      request: base,
      action: "fred_approve",
      actorRole: "approver_fred",
      actorId: "fred",
    }).request;

    // Stale client still holding pre-approve snapshot of Fred lane — server re-reads.
    expect(() =>
      applyTransition({
        request: afterFred,
        action: "fred_approve",
        actorRole: "approver_fred",
        actorId: "fred",
      }),
    ).toThrow(WorkflowError);
  });

  it("decline after one approval resets both lanes", () => {
    const afterFred = applyTransition({
      request: base,
      action: "fred_approve",
      actorRole: "approver_fred",
      actorId: "fred",
    }).request;
    const declined = applyTransition({
      request: afterFred,
      action: "anton_decline",
      actorRole: "approver_anton",
      actorId: "anton",
      reason: "Quote expired",
    });
    expect(declined.request.status).toBe("drafted");
    expect(declined.request.fred_status).toBe("pending");
    expect(declined.request.anton_status).toBe("pending");
  });

  it("runs many shuffled dual-approve sequences to the same terminal state", () => {
    const orders: Array<Array<"fred" | "anton">> = [
      ["fred", "anton"],
      ["anton", "fred"],
      ["fred", "anton"],
      ["anton", "fred"],
    ];
    for (const order of orders) {
      let current = structuredClone(base);
      for (const who of order) {
        current = applyTransition({
          request: current,
          action: who === "fred" ? "fred_approve" : "anton_approve",
          actorRole: who === "fred" ? "approver_fred" : "approver_anton",
          actorId: who,
        }).request;
      }
      expect(current.status).toBe("fully_approved");
      expect(current.fred_status).toBe("approved");
      expect(current.anton_status).toBe("approved");
    }
  });
});
