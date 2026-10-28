import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { inviteUser, listProfiles, setUserRole } from "@/lib/api";
import { ROLE_LABELS, type AppRole, type Profile } from "@/lib/types";

const ROLES = Object.keys(ROLE_LABELS) as AppRole[];

export function UsersPage() {
  const [rows, setRows] = useState<Profile[]>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("initiator");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listProfiles()
      .then(setRows)
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onRoleChange(userId: string, next: AppRole) {
    try {
      const updated = await setUserRole(userId, next);
      setRows((prev) => prev.map((p) => (p.id === userId ? updated : p)));
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await inviteUser(email.trim(), fullName.trim(), role);
      toast.success("Invite recorded — provision the Auth user, then they can magic-link in");
      setEmail("");
      setFullName("");
      setRole("initiator");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rise">
      <h1 style={{ marginTop: 0 }}>Users</h1>
      <p>
        Profiles are <strong>invite-only</strong>. Record an invite here, then create the Auth user
        (operator). Magic link uses <code>shouldCreateUser: false</code> — no open sign-up. Do not
        seed real emails in git.
      </p>

      <form className="panel" onSubmit={onInvite} style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Invite</h2>
        <div className="field">
          <label htmlFor="invite-email">Email</label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="invite-name">Full name</label>
          <input
            id="invite-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="invite-role">Role</label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save invite"}
        </button>
      </form>

      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.full_name}</td>
                <td>{row.email}</td>
                <td>
                  <select
                    value={row.role}
                    onChange={(e) => void onRoleChange(row.id, e.target.value as AppRole)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
