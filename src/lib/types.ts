export type AppRole =
  | "initiator"
  | "approver_fred"
  | "approver_anton"
  | "finance"
  | "admin";

export type RequestStatus =
  | "drafted"
  | "submitted"
  | "fully_approved"
  | "paid"
  | "document_printed";

export type LaneStatus = "pending" | "approved" | "declined";

export type PaymentType = "expense" | "maintenance" | "donation";

export type WorkflowAction =
  | "save_draft"
  | "submit"
  | "fred_approve"
  | "fred_decline"
  | "anton_approve"
  | "anton_decline"
  | "finance_pay"
  | "finance_decline"
  | "print_document";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  created_at: string;
  updated_at: string;
}

export interface PaymentRequest {
  id: string;
  initiator_id: string;
  date_requested: string;
  beneficiary_name: string;
  payment_type: PaymentType;
  description: string;
  amount: number;
  status: RequestStatus;
  fred_status: LaneStatus;
  fred_action_at: string | null;
  fred_decline_reason: string | null;
  anton_status: LaneStatus;
  anton_action_at: string | null;
  anton_decline_reason: string | null;
  finance_action_at: string | null;
  finance_decline_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestAttachment {
  id: string;
  request_id: string;
  storage_path: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  uploaded_by: string;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  request_id: string;
  actor_id: string | null;
  action: string;
  from_status: RequestStatus | null;
  to_status: RequestStatus | null;
  reason: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface PaymentRequestInput {
  date_requested: string;
  beneficiary_name: string;
  payment_type: PaymentType;
  description: string;
  amount: number;
}

export const STATUS_LABELS: Record<RequestStatus, string> = {
  drafted: "01 Drafted",
  submitted: "02 Submitted",
  fully_approved: "03 Fully Approved",
  paid: "04 Paid",
  document_printed: "05 Document Printed",
};

export const ROLE_LABELS: Record<AppRole, string> = {
  initiator: "Initiator",
  approver_fred: "Fred Louw (Approver)",
  approver_anton: "Anton Prinsloo (Approver)",
  finance: "Finance",
  admin: "Admin",
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  expense: "Expense",
  maintenance: "Maintenance",
  donation: "Donation",
};
