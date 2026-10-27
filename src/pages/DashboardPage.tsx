import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { dashboardStats, type DashboardStats } from "@/lib/api";
import { formatZar } from "@/lib/format";

export function DashboardPage() {
  const { profile, user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || !user) return;
    void dashboardStats(profile.role, user.id)
      .then(setStats)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [profile, user]);

  return (
    <div className="rise">
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>
      <p style={{ maxWidth: "42rem" }}>
        Role-specific summary for pending work, approvals this month, and paid spend.
      </p>
      {error && <p className="panel" style={{ color: "var(--kp-danger)" }}>{error}</p>}
      <div className="stat-grid">
        <div className="stat">
          <div>Pending for you</div>
          <div className="value">{stats?.pending ?? "—"}</div>
        </div>
        <div className="stat">
          <div>Approved this month</div>
          <div className="value">{stats?.approvedThisMonth ?? "—"}</div>
        </div>
        <div className="stat">
          <div>Total paid spend</div>
          <div className="value">{stats ? formatZar(stats.totalSpendZar) : "—"}</div>
        </div>
      </div>
      <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        {(profile?.role === "initiator" || profile?.role === "admin") && (
          <Link className="btn btn-primary" to="/requests/new">
            New request
          </Link>
        )}
        {(profile?.role === "approver_fred" ||
          profile?.role === "approver_anton" ||
          profile?.role === "admin") && (
          <Link className="btn btn-secondary" to="/queues/approval">
            Approval queue
          </Link>
        )}
        {(profile?.role === "finance" || profile?.role === "admin") && (
          <Link className="btn btn-secondary" to="/queues/payment">
            Payment queue
          </Link>
        )}
        {profile?.role === "admin" && (
          <Link className="btn btn-secondary" to="/queues/print">
            Print queue
          </Link>
        )}
      </div>
    </div>
  );
}
