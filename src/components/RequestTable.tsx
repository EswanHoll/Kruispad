import { Link } from "react-router-dom";
import { formatSast, formatZar } from "@/lib/format";
import { PAYMENT_TYPE_LABELS, type PaymentRequest } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

export function RequestTable({ rows }: { rows: PaymentRequest[] }) {
  if (rows.length === 0) {
    return <p className="panel">No requests in this view.</p>;
  }

  return (
    <div className="panel rise" style={{ overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Beneficiary</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.beneficiary_name || "—"}</strong>
              </td>
              <td>{PAYMENT_TYPE_LABELS[row.payment_type]}</td>
              <td>{formatZar(Number(row.amount))}</td>
              <td>
                <StatusBadge status={row.status} />
              </td>
              <td>{formatSast(row.updated_at)}</td>
              <td>
                <Link className="btn btn-ghost" to={`/requests/${row.id}`}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
