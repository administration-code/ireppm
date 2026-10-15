import Link from "next/link";
import { num } from "@/lib/dashboard";

function Counts({ rows }) {
  return (
    <dl className="dash-counts">
      {rows.map(([label, value, urgent]) => (
        <div key={label} className={num(value) ? (urgent ? "urgent" : "") : "zero"}>
          <dt>{label}</dt>
          <dd>{num(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ActivitySummaries({ data }) {
  const m = data.maintenance || {};
  const l = data.leasing || {};
  const owners = data.owners || {};

  return (
    <section className="panel-box dash-section" aria-labelledby="dash-activity-title">
      <h2 id="dash-activity-title" className="visually-hidden">
        Maintenance and leasing
      </h2>

      <div className="dash-sub">
        <div className="dash-section-head">
          <h3>Maintenance</h3>
          <Link href="/admin/maintenance" className="small dash-link">
            Open maintenance →
          </Link>
        </div>
        <Counts
          rows={[
            ["Open", m.open],
            ["New", m.new],
            ["Emergencies", m.emergencies, true],
            ["Awaiting owner", m.awaiting_owner],
            ["Scheduled, next 7 days", m.scheduled_next_7_days],
            ["Completed this month", m.completed_this_month],
          ]}
        />
      </div>

      <div className="dash-sub">
        <div className="dash-section-head">
          <h3>Leasing</h3>
          <span className="dash-links small">
            <Link href="/admin/listings" className="dash-link">
              Listings
            </Link>
            <Link href="/admin/requests" className="dash-link">
              Requests
            </Link>
          </span>
        </div>
        <Counts
          rows={[
            ["Listings live", l.listings_available],
            ["Draft listings", l.listings_draft],
            ["Showing requests", l.showings_requested],
            ["Showings booked", l.showings_upcoming],
            ["New applications", l.applications_new],
            ["Landlord inquiries", l.landlord_inquiries_new],
          ]}
        />
      </div>

      <p className="small">
        <Link href="/admin/owners" className="dash-link">
          Landlord portal: {num(owners.portal_linked)} of {num(owners.total)} owners signed in
        </Link>
      </p>
    </section>
  );
}
