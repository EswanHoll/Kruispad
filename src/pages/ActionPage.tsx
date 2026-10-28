import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { actionButtonLabel, actionRequiresReason, isEmailAction } from "@/lib/emailActions";
import { formatZar } from "@/lib/format";
import { API } from "@/lib/paths";
import { PAYMENT_TYPE_LABELS, type PaymentType } from "@/lib/types";

type Preview = {
  action: string;
  requiresReason: boolean;
  expiresAt: string;
  usedAt: string | null;
  recipientName: string;
  request: {
    id: string;
    beneficiary_name: string;
    amount: number;
    payment_type: PaymentType;
    description: string;
    status: string;
    date_requested: string;
  };
  attachments: { file_name: string; url: string | null; byte_size: number }[];
};

export function ActionPage() {
  const { token = "" } = useParams();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    void fetch(`${API.action}?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Invalid link");
        setPreview(body as Preview);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [token]);

  async function onConfirm(e?: FormEvent) {
    e?.preventDefault();
    if (!preview || !isEmailAction(preview.action)) return;
    if (actionRequiresReason(preview.action) && !reason.trim()) {
      toast.error("Decline reason is required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(API.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason: reason.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Action failed");
      setDone(true);
      toast.success("Done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="login-hero">
        <div className="login-card">
          <h1>Kruispad</h1>
          <p style={{ color: "var(--kp-danger)", fontWeight: 700 }}>{error}</p>
          <p>This link may be expired, already used, or invalid.</p>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="login-hero">
        <div className="login-card">Loading secure action…</div>
      </div>
    );
  }

  const expired = new Date(preview.expiresAt).getTime() <= Date.now();
  const unusable = Boolean(preview.usedAt) || expired;
  const label = isEmailAction(preview.action)
    ? actionButtonLabel(preview.action)
    : preview.action;
  const needsReason = isEmailAction(preview.action) && actionRequiresReason(preview.action);

  return (
    <div className="login-hero">
      <div className="login-card rise" style={{ width: "min(560px, 100%)" }}>
        <h1>Kruispad</h1>
        <p style={{ marginTop: 0, fontWeight: 600, color: "var(--kp-teal)" }}>
          Hello {preview.recipientName || "there"} — confirm <strong>{label}</strong>
        </p>

        {done ? (
          <div className="panel">
            <p style={{ fontWeight: 700, marginTop: 0 }}>Action recorded.</p>
            <p>Audit trail updated with channel = email link. You can close this tab.</p>
            <Link className="btn btn-secondary" to="/login">
              Magic link sign-in (optional)
            </Link>
          </div>
        ) : (
          <form onSubmit={onConfirm}>
            <div className="panel" style={{ marginBottom: "1rem" }}>
              <h2 style={{ marginTop: 0 }}>{preview.request.beneficiary_name}</h2>
              <p>
                {PAYMENT_TYPE_LABELS[preview.request.payment_type]} ·{" "}
                {formatZar(Number(preview.request.amount))} · {preview.request.date_requested}
              </p>
              <div dangerouslySetInnerHTML={{ __html: preview.request.description }} />
              <h3>Attachments</h3>
              <ul>
                {preview.attachments.map((a) => (
                  <li key={a.file_name}>
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer">
                        {a.file_name}
                      </a>
                    ) : (
                      a.file_name
                    )}
                  </li>
                ))}
                {preview.attachments.length === 0 && <li>None</li>}
              </ul>
              {unusable && (
                <p style={{ color: "var(--kp-danger)", fontWeight: 700 }}>
                  {preview.usedAt ? "This link was already used." : "This link has expired."}
                </p>
              )}
            </div>

            {needsReason && !unusable && (
              <div className="field">
                <label htmlFor="reason">Decline reason</label>
                <textarea
                  id="reason"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            )}

            <button className="btn btn-primary" type="submit" disabled={busy || unusable} style={{ width: "100%" }}>
              {busy ? "Working…" : label}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
