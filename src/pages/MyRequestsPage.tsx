import { useEffect, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { RequestTable } from "@/components/RequestTable";
import { listMyRequests } from "@/lib/api";
import type { PaymentRequest } from "@/lib/types";

export function MyRequestsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PaymentRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void listMyRequests(user.id)
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed"));
  }, [user]);

  return (
    <div className="rise">
      <h1 style={{ marginTop: 0 }}>My requests</h1>
      {error && <p style={{ color: "var(--kp-danger)" }}>{error}</p>}
      <RequestTable rows={rows} />
    </div>
  );
}
