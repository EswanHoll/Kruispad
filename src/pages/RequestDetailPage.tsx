import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/auth/useAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { getRequest, listAttachments, listAudit, transition } from "@/lib/api";
import { formatSast, formatZar } from "@/lib/format";
import {
  PAYMENT_TYPE_LABELS,
  type AuditEvent,
  type PaymentRequest,
  type RequestAttachment,
  type WorkflowAction,
} from "@/lib/types";
import { canEditRequest } from "@/lib/workflow";
import { supabase } from "@/lib/supabase";

export function RequestDetailPage() {
  const { id } = useParams();
  const { profile, user } = useAuth();
  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const [attachments, setAttachments] = useState<RequestAttachment[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    const [req, atts, events] = await Promise.all([
      getRequest(id),
      listAttachments(id),
      listAudit(id),
    ]);
    setRequest(req);
    setAttachments(atts);
    setAudit(events);
  }, [id]);

  useEffect(() => {
    void reload().catch((e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to load"),
    );
  }, [reload]);

  async function run(action: WorkflowAction, needsReason = false) {
    if (!id) return;
    if (needsReason && !reason.trim()) {
      toast.error("Decline reason is required");
      return;
    }
    setBusy(true);
    try {
      await transition(action, id, reason.trim() || undefined);
      setReason("");
      toast.success("Updated");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function openFile(path: string) {
    const { data, error } = await supabase.storage.from("kruispad-attachments").createSignedUrl(path, 120);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (!request || !profile || !user) {
    return <p className="panel">Loading…</p>;
  }

  const editable = canEditRequest(request, profile.role, user.id);

  return (
    <div className="rise" style={{ display: "grid", gap: "1.25rem", maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{request.beneficiary_name}</h1>
          <p style={{ margin: "0.35rem 0 0" }}>
            <StatusBadge status={request.status} /> · {PAYMENT_TYPE_LABELS[request.payment_type]} ·{" "}
            {formatZar(Number(request.amount))}
          </p>
        </div>
        {editable && (
          <Link className="btn btn-secondary" to={`/requests/${request.id}/edit`}>
            Edit draft
          </Link>
        )}
      </div>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Details</h2>
        <p>
          <strong>Date requested:</strong> {request.date_requested}
        </p>
        <div dangerouslySetInnerHTML={{ __html: request.description }} />
        <p>
          <strong>Fred:</strong> {request.fred_status}
          {request.fred_action_at ? ` · ${formatSast(request.fred_action_at)}` : ""}
        </p>
        <p>
          <strong>Anton:</strong> {request.anton_status}
          {request.anton_action_at ? ` · ${formatSast(request.anton_action_at)}` : ""}
        </p>
        <h3>Attachments</h3>
        <ul>
          {attachments.map((a) => (
            <li key={a.id}>
              <button type="button" className="btn btn-ghost" onClick={() => void openFile(a.storage_path)}>
                {a.file_name}
              </button>
            </li>
          ))}
          {attachments.length === 0 && <li>None</li>}
        </ul>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Actions</h2>
        <div className="field">
          <label htmlFor="reason">Decline reason (when declining)</label>
          <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          {(profile.role === "approver_fred" || profile.role === "admin") &&
            request.status === "submitted" &&
            request.fred_status === "pending" && (
              <>
                <button className="btn btn-primary" disabled={busy} onClick={() => void run("fred_approve")}>
                  Fred approve
                </button>
                <button
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => void run("fred_decline", true)}
                >
                  Fred decline
                </button>
              </>
            )}
          {(profile.role === "approver_anton" || profile.role === "admin") &&
            request.status === "submitted" &&
            request.anton_status === "pending" && (
              <>
                <button className="btn btn-primary" disabled={busy} onClick={() => void run("anton_approve")}>
                  Anton approve
                </button>
                <button
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => void run("anton_decline", true)}
                >
                  Anton decline
                </button>
              </>
            )}
          {(profile.role === "finance" || profile.role === "admin") &&
            request.status === "fully_approved" && (
              <>
                <button className="btn btn-primary" disabled={busy} onClick={() => void run("finance_pay")}>
                  Mark paid
                </button>
                <button
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => void run("finance_decline", true)}
                >
                  Finance decline
                </button>
              </>
            )}
          {profile.role === "admin" && request.status === "paid" && (
            <button className="btn btn-primary" disabled={busy} onClick={() => void run("print_document")}>
              Mark document printed
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Audit timeline</h2>
        <ul className="timeline">
          {audit.map((event) => (
            <li key={event.id}>
              <strong>{event.action}</strong>
              <div style={{ fontSize: "0.9rem" }}>
                {event.from_status ?? "—"} → {event.to_status ?? "—"} · {formatSast(event.created_at)}
              </div>
              {event.reason && <div>Reason: {event.reason}</div>}
            </li>
          ))}
          {audit.length === 0 && <li>No events yet.</li>}
        </ul>
      </section>
    </div>
  );
}
