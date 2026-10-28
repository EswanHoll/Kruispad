import { describe, expect, it } from "vitest";
import {
  assertTokenBinding,
  buildActionUrl,
  hashToken,
  mintOpaqueToken,
} from "../src/lib/actionToken";
import {
  actionButtonLabel,
  actionRequiresReason,
  isEmailAction,
  isTokenUsable,
} from "../src/lib/emailActions";

describe("email action tokens", () => {
  it("mints opaque tokens whose hash matches sha256 hex", () => {
    const { raw, hash } = mintOpaqueToken();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashToken(raw));
    expect(hash).not.toBe(raw);
  });

  it("builds action URLs without embedding forms", () => {
    const url = buildActionUrl("https://gekkoflow.com/kruispad", "abc123");
    expect(url).toBe("https://gekkoflow.com/kruispad/action/abc123");
    expect(url.includes("<form")).toBe(false);
  });

  it("labels and reason rules match product verbs", () => {
    expect(actionButtonLabel("fred_approve")).toBe("Approve");
    expect(actionButtonLabel("finance_pay")).toBe("Mark Paid");
    expect(actionButtonLabel("print_document")).toBe("Mark Printed");
    expect(actionRequiresReason("fred_decline")).toBe(true);
    expect(actionRequiresReason("finance_pay")).toBe(false);
    expect(isEmailAction("submit")).toBe(false);
    expect(isEmailAction("anton_approve")).toBe(true);
  });

  it("enforces single-use + expiry + recipient/request/action binding", () => {
    const base = {
      tokenRecipientId: "rec-1",
      expectedRecipientId: "rec-1",
      tokenAction: "fred_approve" as const,
      expectedAction: "fred_approve" as const,
      tokenRequestId: "req-1",
      expectedRequestId: "req-1",
      usedAt: null as string | null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    expect(() => assertTokenBinding(base)).not.toThrow();

    expect(() =>
      assertTokenBinding({ ...base, expectedRecipientId: "other" }),
    ).toThrow(/recipient/);

    expect(() =>
      assertTokenBinding({ ...base, expectedAction: "fred_decline" }),
    ).toThrow(/action/);

    expect(() =>
      assertTokenBinding({ ...base, usedAt: new Date().toISOString() }),
    ).toThrow(/not usable/);

    expect(() =>
      assertTokenBinding({
        ...base,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    ).toThrow(/not usable/);

    expect(
      isTokenUsable({
        usedAt: null,
        expiresAt: new Date(Date.now() + 10_000).toISOString(),
      }),
    ).toBe(true);
  });
});
