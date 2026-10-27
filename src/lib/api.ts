import { supabase } from "./supabase";
import type {
  AuditEvent,
  PaymentRequest,
  PaymentRequestInput,
  PaymentType,
  Profile,
  RequestAttachment,
  WorkflowAction,
} from "./types";

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from("profiles").select("*").order("full_name");
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function setUserRole(userId: string, role: Profile["role"]): Promise<Profile> {
  const { data, error } = await supabase.rpc("admin_set_role", {
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
  return data as Profile;
}

export async function createRequest(input: PaymentRequestInput): Promise<PaymentRequest> {
  const { data, error } = await supabase.rpc("create_payment_request", {
    p_date_requested: input.date_requested,
    p_beneficiary_name: input.beneficiary_name,
    p_payment_type: input.payment_type,
    p_description: input.description,
    p_amount: input.amount,
  });
  if (error) throw error;
  return data as PaymentRequest;
}

export async function saveRequest(
  id: string,
  input: PaymentRequestInput,
): Promise<PaymentRequest> {
  const { data, error } = await supabase.rpc("save_payment_request", {
    p_id: id,
    p_date_requested: input.date_requested,
    p_beneficiary_name: input.beneficiary_name,
    p_payment_type: input.payment_type,
    p_description: input.description,
    p_amount: input.amount,
  });
  if (error) throw error;
  return data as PaymentRequest;
}

export async function listMyRequests(userId: string): Promise<PaymentRequest[]> {
  const { data, error } = await supabase
    .from("payment_requests")
    .select("*")
    .eq("initiator_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PaymentRequest[];
}

export async function listByStatus(status: PaymentRequest["status"]): Promise<PaymentRequest[]> {
  const { data, error } = await supabase
    .from("payment_requests")
    .select("*")
    .eq("status", status)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PaymentRequest[];
}

export async function listAllRequests(): Promise<PaymentRequest[]> {
  const { data, error } = await supabase
    .from("payment_requests")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PaymentRequest[];
}

export async function getRequest(id: string): Promise<PaymentRequest | null> {
  const { data, error } = await supabase
    .from("payment_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as PaymentRequest | null;
}

export async function listAttachments(requestId: string): Promise<RequestAttachment[]> {
  const { data, error } = await supabase
    .from("request_attachments")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as RequestAttachment[];
}

export async function listAudit(requestId: string): Promise<AuditEvent[]> {
  const { data, error } = await supabase
    .from("audit_events")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AuditEvent[];
}

export async function uploadAttachment(
  requestId: string,
  userId: string,
  file: File,
): Promise<RequestAttachment> {
  const allowed = ["application/pdf", "image/jpeg", "image/png"];
  if (!allowed.includes(file.type)) {
    throw new Error("Only PDF, JPG, and PNG files are accepted");
  }
  const safeName = file.name.replace(/[^\w.-]+/g, "_");
  const path = `${userId}/${requestId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("payment-attachments")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.rpc("register_attachment", {
    p_request_id: requestId,
    p_storage_path: path,
    p_file_name: file.name,
    p_content_type: file.type,
    p_byte_size: file.size,
  });
  if (error) throw error;
  return data as RequestAttachment;
}

export async function transition(
  action: WorkflowAction,
  requestId: string,
  reason?: string,
): Promise<PaymentRequest> {
  const map: Record<WorkflowAction, string> = {
    save_draft: "save_payment_request",
    submit: "submit_payment_request",
    fred_approve: "fred_approve",
    fred_decline: "fred_decline",
    anton_approve: "anton_approve",
    anton_decline: "anton_decline",
    finance_pay: "finance_pay",
    finance_decline: "finance_decline",
    print_document: "print_document",
  };

  if (action === "save_draft") {
    throw new Error("Use saveRequest for draft saves");
  }

  const fn = map[action];
  const args =
    action === "fred_decline" || action === "anton_decline" || action === "finance_decline"
      ? { p_id: requestId, p_reason: reason }
      : { p_id: requestId };

  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;

  // Fire-and-forget notification; failures must not roll back the transition.
  void fetch("/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, action }),
  }).catch(() => undefined);

  return data as PaymentRequest;
}

export type DashboardStats = {
  pending: number;
  approvedThisMonth: number;
  totalSpendZar: number;
};

export async function dashboardStats(
  role: Profile["role"],
  userId: string,
): Promise<DashboardStats> {
  let pendingQuery = supabase.from("payment_requests").select("id", { count: "exact", head: true });
  if (role === "initiator") {
    pendingQuery = pendingQuery.eq("initiator_id", userId).in("status", ["drafted", "submitted"]);
  } else if (role === "approver_fred") {
    pendingQuery = pendingQuery.eq("status", "submitted").eq("fred_status", "pending");
  } else if (role === "approver_anton") {
    pendingQuery = pendingQuery.eq("status", "submitted").eq("anton_status", "pending");
  } else if (role === "finance") {
    pendingQuery = pendingQuery.eq("status", "fully_approved");
  } else if (role === "admin") {
    pendingQuery = pendingQuery.eq("status", "paid");
  }

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const approvedQuery = supabase
    .from("payment_requests")
    .select("id", { count: "exact", head: true })
    .in("status", ["fully_approved", "paid", "document_printed"])
    .gte("updated_at", start.toISOString());

  const spendQuery = supabase
    .from("payment_requests")
    .select("amount")
    .in("status", ["paid", "document_printed"]);

  const [pending, approved, spend] = await Promise.all([pendingQuery, approvedQuery, spendQuery]);
  if (pending.error) throw pending.error;
  if (approved.error) throw approved.error;
  if (spend.error) throw spend.error;

  const totalSpendZar = (spend.data ?? []).reduce(
    (sum, row) => sum + Number((row as { amount: number }).amount),
    0,
  );

  return {
    pending: pending.count ?? 0,
    approvedThisMonth: approved.count ?? 0,
    totalSpendZar,
  };
}

export function todayIsoDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

export type { PaymentType };
