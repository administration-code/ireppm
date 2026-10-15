import Link from "next/link";
import { money } from "@/lib/format";
import { shortDate } from "@/lib/rent";
import { place } from "@/lib/dashboard";

function Group({ title, note, items, render }) {
  return (
    <div className="dash-sub">
      <h3>{title}</h3>
      {note ? <p className="small">{note}</p> : null}
      {items.length ? <ul className="dash-list">{items.map(render)}</ul> : <p className="small muted">None in the next 60 days.</p>}
    </div>
  );
}

const dateOf = (x) => x.date || x.end_date || x.move_out_date;

export default function ComingUp({ upcoming, today }) {
  const u = upcoming || {};
  return (
    <section className="panel-box dash-section" aria-labelledby="dash-upcoming-title">
      <h2 id="dash-upcoming-title">Coming up in the next 60 days</h2>
      <div className="dash-upcoming">
        <Group
          title="Move-outs"
          items={u.move_outs || []}
          render={(x, i) => (
            <li key={`mo-${i}`} className="dash-item">
              <span>
                <span className="addr">{place(x.address, x.unit)}</span>
                <span className="small"> · {x.tenant || "Tenant"}</span>
              </span>
              <span className="small">{shortDate(dateOf(x))}</span>
            </li>
          )}
        />

        <Group
          title="Leases reaching their end date"
          note="Continues month-to-month unless notice is given."
          items={u.leases_ending || []}
          render={(x, i) => (
            <li key={`le-${i}`} className="dash-item">
              <span>
                <span className="addr">{place(x.address, x.unit)}</span>
                <span className="small"> · {x.tenant || "Tenant"}</span>
              </span>
              <span className="small">{shortDate(dateOf(x))}</span>
            </li>
          )}
        />

        <Group
          title="Management agreement renewals"
          items={u.agreement_renewals || []}
          render={(x, i) => {
            const lapsed = x.renewal && today && x.renewal < today;
            return (
              <li key={`ar-${x.property_id || i}`} className="dash-item">
                <span>
                  <Link className="addr dash-row-link" href={`/admin/properties/${x.property_id}`}>
                    {x.address || "Property"}
                  </Link>
                  {x.owner ? <span className="small"> · {x.owner}</span> : null}
                  {x.notice_sent_on ? <span className="small dash-block">Notice sent {shortDate(x.notice_sent_on)}</span> : null}
                </span>
                <span className="dash-item-end">
                  {lapsed ? <span className="pill dash-lapsed">Lapsed</span> : null}
                  <span className="small">{shortDate(x.renewal)}</span>
                </span>
              </li>
            );
          }}
        />

        <Group
          title="Rent increase review"
          note="Check whether the unit is exempt (first occupied after Nov 15, 2018) before serving an N1 with 90 days' notice."
          items={u.rent_increase_review || []}
          render={(x, i) => (
            <li key={`ri-${x.tenancy_id || i}`} className="dash-item">
              <span>
                <span className="addr">{x.tenant || "Tenant"}</span>
                <span className="small"> · {place(x.address, x.unit)}</span>
                <span className="small dash-block">Current rent {money(x.rent)}</span>
              </span>
              <span className="small">Eligible from {shortDate(x.eligible_on)}</span>
            </li>
          )}
        />
      </div>
    </section>
  );
}
