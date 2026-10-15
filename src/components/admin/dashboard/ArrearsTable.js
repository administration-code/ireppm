import Link from "next/link";
import { money } from "@/lib/format";
import { shortDate } from "@/lib/rent";
import { num, place } from "@/lib/dashboard";

export default function ArrearsTable({ arrears }) {
  const top = arrears?.top || [];
  return (
    <section className="panel-box dash-section" aria-labelledby="dash-arrears-title">
      <div className="dash-section-head">
        <h2 id="dash-arrears-title">Arrears</h2>
        <Link href="/admin/rent" className="small dash-link">
          See all
        </Link>
      </div>

      {top.length ? (
        <div className="dash-table">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Tenant</th>
                <th scope="col" className="r">
                  Balance
                </th>
                <th scope="col">Last paid</th>
              </tr>
            </thead>
            <tbody>
              {top.map((a) => (
                <tr key={a.tenancy_id}>
                  <td>
                    <Link
                      className="addr dash-row-link"
                      href={a.unit_id ? `/admin/units/${a.unit_id}#tenancy-${a.tenancy_id}` : "/admin/rent"}
                    >
                      {a.tenant || "Tenant"}
                    </Link>
                    <div className="small">{place(a.address, a.unit)}</div>
                    {a.has_n4 ? <span className="pill ns-served">N4 served</span> : null}
                  </td>
                  <td className="r dash-owed">{money(num(a.balance))}</td>
                  <td className="small">{a.last_paid_on ? shortDate(a.last_paid_on) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small">No tenants are behind on rent.</p>
      )}
    </section>
  );
}
