import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { loadShowingByToken, placeOf, prettyDay } from "@/lib/showings";
import ShowingRespond from "@/components/ShowingRespond";

export const dynamic = "force-dynamic";
export const metadata = { title: "Showing Request", robots: { index: false, follow: false } };

// Private page for Chuck: approve, decline or suggest another time. The link in the email is the key.
export default async function ShowingRespondPage({ searchParams }) {
  const { t } = await searchParams;
  const s = await loadShowingByToken(getSupabaseAdmin(), t);

  return (
    <section className="block">
      <div className="wrap" style={{ maxWidth: 640 }}>
        {!s ? (
          <div className="warnbox">This link isn&apos;t valid. Ask the office to resend the showing request.</div>
        ) : (
          <div className="stack">
            <h1 style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)" }}>Showing Request</h1>
            <div className="boxed">
              <dl className="kv">
                <dt>Rental</dt>
                <dd>{placeOf(s.listing)}</dd>
                <dt>Renter</dt>
                <dd>{s.renter?.full_name || "No name given"}</dd>
                <dt>Phone</dt>
                <dd>{s.renter?.phone ? <a href={`tel:${s.renter.phone}`}>{s.renter.phone}</a> : "Not given"}</dd>
                <dt>Email</dt>
                <dd>{s.renter?.email ? <a href={`mailto:${s.renter.email}`}>{s.renter.email}</a> : "Not given"}</dd>
                <dt>Asked for</dt>
                <dd>
                  {prettyDay(s.preferred_date)}, {s.preferred_time}
                </dd>
                {s.notes ? (
                  <>
                    <dt>Renter&apos;s note</dt>
                    <dd>{s.notes}</dd>
                  </>
                ) : null}
                <dt>Unit</dt>
                <dd>
                  {s.vacant
                    ? "Vacant: same-day showings are fine."
                    : `Occupied (${s.tenants.length} tenant${s.tenants.length === 1 ? "" : "s"} with email): needs 24 hours' written notice.`}
                </dd>
              </dl>
            </div>
            <ShowingRespond
              token={t}
              status={s.status}
              vacant={s.vacant}
              tenantCount={s.tenants.length}
              proposed={s.proposed_date ? `${prettyDay(s.proposed_date)}, ${s.proposed_time}` : ""}
            />
          </div>
        )}
      </div>
    </section>
  );
}
