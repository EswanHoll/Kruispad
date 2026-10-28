import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/auth/useAuth";
import { supabase } from "@/lib/supabase";

export function LoginPage() {
  const { session, configured } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/";

  if (session) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const basename = "/kruispad";
      const path = from === "/login" ? "/" : from;
      const redirectTo = `${window.location.origin}${basename}${path === "/" ? "/" : path}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo,
          // Invite-only: Auth users must already exist (operator invite).
          shouldCreateUser: false,
        },
      });
      if (error) throw error;
      setSent(true);
      toast.success("Magic link sent — check your email");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send magic link";
      toast.error(
        /signups not allowed|user not found|unable to validate/i.test(message)
          ? "No invite for this email. Ask an admin to invite you first."
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-hero">
      <form className="login-card rise" onSubmit={onSubmit}>
        <h1>Kruispad</h1>
        <p style={{ marginTop: 0, color: "var(--kp-teal)", fontWeight: 600 }}>
          Payment Request Approval Workflow
        </p>
        <p style={{ color: "var(--kp-teal)" }}>
          Initiators sign in with a <strong>magic link</strong> — invite-only, no password.
          Approvers and Finance usually act from email action buttons without signing in.
        </p>
        {!configured && (
          <p style={{ color: "var(--kp-danger)", fontWeight: 600 }}>
            Frontend Supabase env vars are missing. Sync from Bitwarden (`SUPABASE_*__SHARED`).
          </p>
        )}
        {sent ? (
          <p className="panel" style={{ margin: 0 }}>
            Link sent to <strong>{email}</strong>. Open it on this device to continue.
          </p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy || !configured}
              style={{ width: "100%" }}
            >
              {busy ? "Sending…" : "Email me a magic link"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
