import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import type { AppRole } from "@/lib/types";

export function RequireAuth({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: AppRole[];
}) {
  const { loading, session, profile, configured } = useAuth();
  const location = useLocation();

  if (loading) {
    return <p className="panel">Loading session…</p>;
  }

  if (!configured) {
    return (
      <div className="panel">
        <h2>Supabase not configured</h2>
        <p>
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> from Bitwarden
          names in <code>docs/architecture/SECRETS_INVENTORY.md</code> (owner step).
        </p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && profile && !roles.includes(profile.role) && profile.role !== "admin") {
    return (
      <div className="panel">
        <h2>Not authorised</h2>
        <p>Your role cannot open this view.</p>
      </div>
    );
  }

  return children;
}
