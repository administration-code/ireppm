import Link from "next/link";
import { money } from "@/lib/format";
import { shortDate } from "@/lib/rent";
import { NOTICE_FORMS, NOTICE_STATUS } from "@/lib/notices";
import { num, place, plural } from "@/lib/dashboard";

export default function OpenNotices({ notices }) {
  const list = notices?.list || [];
  return (
    <section className="panel-box dash-section" aria-labelledby="dash-notices-title">
      <div className="dash-section-head">
        <h2 id="dash-notices-title">Open Notices</h2>
        <Link href="/admin/notices" className="small dash-link">
          All notices →
        </Link>
      </div>
      <p className="small">
        {plural(num(notices?.open), "open notice")} · {num(notices?.served_this_month)} served this month
      </p>

      {list.length ? (
        <ul className="dash-list">
          {list.map((n) => (
            <li key={n.id} className="dash-item">
              <span>
                <span className="addr">
                  {n.form}
                  {NOTICE_FORMS[n.form] ? ` · ${NOTICE_FORMS[n.form]}` : ""}
                </span>
                <span className="small dash-block">
                  {n.tenant || "Tenant"} · {place(n.address, n.unit)}
                </span>
                <span className="small dash-block">
                  Served {shortDate(n.served_on)}
                  {n.effective_date ? ` · effective ${shortDate(n.effective_date)}` : ""}
                  {num(n.amount) ? ` · ${money(n.amount)}` : ""}
                </span>
              </span>
              <span className={`pill ns-${n.status}`}>{NOTICE_STATUS[n.status] || n.status}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">No open notices.</p>
      )}
    </section>
  );
}
