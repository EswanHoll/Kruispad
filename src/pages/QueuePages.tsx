import { useEffect, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { RequestTable } from "@/components/RequestTable";
import { listAllRequests, listByStatus } from "@/lib/api";
import type { PaymentRequest } from "@/lib/types";

export function ApprovalQueuePage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<PaymentRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listByStatus("submitted")
      .then((data) => {
        if (profile?.role === "approver_fred") {
          setRows(data.filter((row) => row.fred_status === "pending"));
        } else if (profile?.role === "approver_anton") {
          setRows(data.filter((row) => row.anton_status === "pending"));
        } else {
          setRows(data);
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed"));
  }, [profile?.role]);

  return (
    <div className="rise">
      <h1 style={{ marginTop: 0 }}>Approval queue</h1>
      {error && <p style={{ color: "var(--kp-danger)" }}>{error}</p>}
      <RequestTable rows={rows} />
    </div>
  );
}

function StatusQueue({ title, status }: { title: string; status: PaymentRequest["status"] }) {
  const [rows, setRows] = useState<PaymentRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listByStatus(status)
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed"));
  }, [status]);

  return (
    <div className="rise">
      <h1 style={{ marginTop: 0 }}>{title}</h1>
      {error && <p style={{ color: "var(--kp-danger)" }}>{error}</p>}
      <RequestTable rows={rows} />
    </div>
  );
}

export function PaymentQueuePage() {
  return <StatusQueue title="Payment queue" status="fully_approved" />;
}

export function PrintQueuePage() {
  return <StatusQueue title="Print queue" status="paid" />;
}

export function AllRequestsPage() {
  const [rows, setRows] = useState<PaymentRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listAllRequests()
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <div className="rise">
      <h1 style={{ marginTop: 0 }}>All requests</h1>
      {error && <p style={{ color: "var(--kp-danger)" }}>{error}</p>}
      <RequestTable rows={rows} />
    </div>
  );
}
