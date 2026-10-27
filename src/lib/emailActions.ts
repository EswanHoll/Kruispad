import type { WorkflowAction } from "./types";

/** Actions that may be minted for email deep links. */
export const EMAIL_ACTIONS = [
  "fred_approve",
  "fred_decline",
  "anton_approve",
  "anton_decline",
  "finance_pay",
  "finance_decline",
  "print_document",
] as const satisfies readonly WorkflowAction[];

export type EmailAction = (typeof EMAIL_ACTIONS)[number];

export function isEmailAction(action: string): action is EmailAction {
  return (EMAIL_ACTIONS as readonly string[]).includes(action);
}

export function actionRequiresReason(action: EmailAction): boolean {
  return action === "fred_decline" || action === "anton_decline" || action === "finance_decline";
}

export function actionButtonLabel(action: EmailAction): string {
  switch (action) {
    case "fred_approve":
    case "anton_approve":
      return "Approve";
    case "fred_decline":
    case "anton_decline":
    case "finance_decline":
      return "Decline";
    case "finance_pay":
      return "Mark Paid";
    case "print_document":
      return "Mark Printed";
    default: {
      const _x: never = action;
      return _x;
    }
  }
}

export function buildActionUrl(baseUrl: string, rawToken: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/action/${encodeURIComponent(rawToken)}`;
}

export function isTokenExpired(expiresAt: string | Date, now = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export function isTokenUsable(opts: {
  usedAt: string | Date | null;
  expiresAt: string | Date;
  now?: Date;
}): boolean {
  if (opts.usedAt) return false;
  return !isTokenExpired(opts.expiresAt, opts.now);
}
