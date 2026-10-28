import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/auth/useAuth";
import { DescriptionEditor } from "@/components/DescriptionEditor";
import {
  createRequest,
  getRequest,
  listAttachments,
  saveRequest,
  todayIsoDate,
  transition,
  uploadAttachment,
} from "@/lib/api";
import type { PaymentType, RequestAttachment } from "@/lib/types";

const empty = {
  date_requested: todayIsoDate(),
  beneficiary_name: "",
  payment_type: "expense" as PaymentType,
  description: "",
  amount: "",
};

export function RequestFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState(empty);
  const [attachments, setAttachments] = useState<RequestAttachment[]>([]);
  const [requestId, setRequestId] = useState<string | null>(id ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const req = await getRequest(id);
      if (!req) {
        toast.error("Request not found");
        navigate("/my-requests");
        return;
      }
      if (req.status !== "drafted") {
        toast.message("Only drafted requests are editable");
        navigate(`/requests/${id}`);
        return;
      }
      setForm({
        date_requested: req.date_requested,
        beneficiary_name: req.beneficiary_name,
        payment_type: req.payment_type,
        description: req.description,
        amount: String(req.amount),
      });
      setAttachments(await listAttachments(id));
    })();
  }, [id, navigate]);

  async function ensureSaved(): Promise<string> {
    if (!user) throw new Error("Not signed in");
    const payload = {
      date_requested: form.date_requested,
      beneficiary_name: form.beneficiary_name.trim(),
      payment_type: form.payment_type,
      description: form.description.trim(),
      amount: Number(form.amount || 0),
    };
    if (requestId) {
      await saveRequest(requestId, payload);
      return requestId;
    }
    const created = await createRequest(payload);
    setRequestId(created.id);
    return created.id;
  }

  async function onSave(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      const savedId = await ensureSaved();
      toast.success("Draft saved");
      if (!isEdit) navigate(`/requests/${savedId}/edit`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(fileList: FileList | null) {
    if (!fileList?.length || !user) return;
    setBusy(true);
    try {
      const savedId = await ensureSaved();
      for (const file of Array.from(fileList)) {
        const att = await uploadAttachment(savedId, user.id, file);
        setAttachments((prev) => [...prev, att]);
      }
      toast.success("File uploaded");
      if (!isEdit) navigate(`/requests/${savedId}/edit`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (!window.confirm("Submit this request for parallel approval by Fred and Anton?")) return;
    setBusy(true);
    try {
      const savedId = await ensureSaved();
      const currentAttachments = await listAttachments(savedId);
      if (currentAttachments.length < 1) {
        throw new Error("Attach at least one PDF, JPG, or PNG before submitting");
      }
      await transition("submit", savedId);
      toast.success("Submitted for approval");
      navigate(`/requests/${savedId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rise" style={{ maxWidth: 720 }}>
      <h1 style={{ marginTop: 0 }}>{isEdit ? "Edit request" : "New request"}</h1>
      <form className="panel" onSubmit={onSave}>
        <div className="field">
          <label htmlFor="date_requested">Date requested</label>
          <input
            id="date_requested"
            type="date"
            required
            value={form.date_requested}
            onChange={(e) => setForm((f) => ({ ...f, date_requested: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="beneficiary_name">Beneficiary name</label>
          <input
            id="beneficiary_name"
            maxLength={255}
            required
            value={form.beneficiary_name}
            onChange={(e) => setForm((f) => ({ ...f, beneficiary_name: e.target.value }))}
          />
        </div>
        <fieldset className="field" style={{ border: "none", padding: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: "0.35rem" }}>Payment type</legend>
          {(["expense", "maintenance", "donation"] as PaymentType[]).map((type) => (
            <label key={type} style={{ display: "inline-flex", gap: "0.4rem", marginRight: "1rem" }}>
              <input
                type="radio"
                name="payment_type"
                checked={form.payment_type === type}
                onChange={() => setForm((f) => ({ ...f, payment_type: type }))}
              />
              {type[0].toUpperCase() + type.slice(1)}
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="description">Description</label>
          <DescriptionEditor
            key={requestId ?? "new"}
            id="description"
            value={form.description}
            onChange={(description) => setForm((f) => ({ ...f, description }))}
          />
        </div>
        <div className="field">
          <label htmlFor="amount">Amount (ZAR)</label>
          <input
            id="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="files">Attachments (PDF, JPG, PNG)</label>
          <input
            id="files"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            multiple
            onChange={(e) => void onUpload(e.target.files)}
          />
          <ul>
            {attachments.map((a) => (
              <li key={a.id}>
                {a.file_name} ({Math.round(a.byte_size / 1024)} KB)
              </li>
            ))}
          </ul>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn btn-secondary" type="submit" disabled={busy}>
            Save
          </button>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onSubmit()}>
            Submit
          </button>
        </div>
      </form>
    </div>
  );
}
