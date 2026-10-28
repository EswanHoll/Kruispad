import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/auth/useAuth";
import { ROLE_LABELS, type AppRole } from "@/lib/types";

const NAV: { to: string; label: string; roles: AppRole[] | "all" }[] = [
  { to: "/", label: "Dashboard", roles: "all" },
  { to: "/requests/new", label: "New Request", roles: ["initiator", "admin"] },
  { to: "/my-requests", label: "My Requests", roles: ["initiator", "admin"] },
  { to: "/queues/approval", label: "Approval Queue", roles: ["approver_fred", "approver_anton", "admin"] },
  { to: "/queues/payment", label: "Payment Queue", roles: ["finance", "admin"] },
  { to: "/queues/print", label: "Print Queue", roles: ["admin"] },
  { to: "/all-requests", label: "All Requests", roles: ["admin"] },
  { to: "/admin/users", label: "Users", roles: ["admin"] },
];

export function AppLayout() {
  const { profile, signOut, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const fromGekkoflow = new URLSearchParams(location.search).get("from") === "gekkoflow";

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.pathname]);

  const links = useMemo(() => {
    const role = profile?.role;
    if (!role) return [];
    return NAV.filter((item) => item.roles === "all" || item.roles.includes(role));
  }, [profile?.role]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">Kruispad</div>
          <div className="brand-sub">Payment Requests</div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: "0.35rem", flex: 1 }}>
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              end={item.to === "/"}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ fontSize: "0.9rem", color: "#d7f5f0" }}>
          <div style={{ fontWeight: 700, color: "#ffffff" }}>{profile?.full_name || user?.email}</div>
          <div>{profile ? ROLE_LABELS[profile.role] : "…"}</div>
          {fromGekkoflow && (
            <a
              href="https://gekkoflow.com"
              style={{ display: "inline-block", marginTop: "0.75rem", color: "#ffffff", fontWeight: 700 }}
            >
              ← Back to GekkoFlow
            </a>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: "0.85rem", color: "#ffffff", borderColor: "rgba(255,255,255,0.35)" }}
            onClick={() => void signOut().then(() => navigate("/login"))}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
