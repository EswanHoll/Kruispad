import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listProfiles, setUserRole } from "@/lib/api";
import { ROLE_LABELS, type AppRole, type Profile } from "@/lib/types";

const ROLES = Object.keys(ROLE_LABELS) as AppRole[];

export function UsersPage() {
  const [rows, setRows] = useState<Profile[]>([]);

  useEffect(() => {
    void listProfiles()
      .then(setRows)
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onRoleChange(userId: string, role: AppRole) {
    try {
      const updated = await setUserRole(userId, role);
      setRows((prev) => prev.map((p) => (p.id === userId ? updated : p)));
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <div className="rise">
      <h1 style={{ marginTop: 0 }}>Users</h1>
      <p>Assign roles after users sign up via Supabase Auth. Do not seed real emails in git.</p>
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
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
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
