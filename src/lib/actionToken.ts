import { createHash, randomBytes } from "node:crypto";
import { isTokenUsable, type EmailAction } from "./emailActions";

export {
  EMAIL_ACTIONS,
  actionButtonLabel,
  actionRequiresReason,
  buildActionUrl,
  isEmailAction,
  isTokenExpired,
  isTokenUsable,
  type EmailAction,
} from "./emailActions";

/** Generate opaque token + sha256 hex hash (matches Postgres kruispad.sha256_hex). */
export function mintOpaqueToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function assertTokenBinding(opts: {
  tokenRecipientId: string;
  expectedRecipientId: string;
  tokenAction: EmailAction;
  expectedAction: EmailAction;
  tokenRequestId: string;
  expectedRequestId: string;
  usedAt: string | null;
  expiresAt: string;
}): void {
  if (opts.tokenRecipientId !== opts.expectedRecipientId) {
    throw new Error("token recipient mismatch");
  }
  if (opts.tokenAction !== opts.expectedAction) {
    throw new Error("token action mismatch");
  }
  if (opts.tokenRequestId !== opts.expectedRequestId) {
    throw new Error("token request mismatch");
  }
  if (!isTokenUsable({ usedAt: opts.usedAt, expiresAt: opts.expiresAt })) {
    throw new Error("token not usable");
  }
}
