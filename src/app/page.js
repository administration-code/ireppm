import Link from "next/link";
import HomeSearch from "@/components/HomeSearch";
import { getListings } from "@/lib/listings";
import { LANDLORD_PROMISES, SITE } from "@/lib/site";

export const revalidate = 60;

export default async function HomePage() {
  const { listings } = await getListings();

  return (
    <>
      <section className="hero">
        <div className="wrap grid">
          <div className="copy">
            <span className="eyebrow">Windsor-Essex Property Management</span>
            <h1>
              Windsor rentals, <em>managed properly.</em>
            </h1>
            <p className="lead">
              We find, screen and look after tenants for residential landlords across Windsor and Essex County, and we
              make renting from us simple: browse what's available, book a showing, and apply online with your documents
              ready.
            </p>
            <div className="row">
              <Link className="btn primary" href="/pricing">
                See Management Packages
              </Link>
              <Link className="btn ghost" href="/properties">
                Browse Rentals
              </Link>
            </div>
          </div>
          <HomeSearch count={listings.length} />
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <div className="split">
            <div>
              <span className="eyebrow">For Landlords</span>
              <h3>Hand us the keys, keep the income.</h3>
              <ul>
                <li>Every applicant screened, and you approve every tenant</li>
                <li>Rent received by the 7th is paid out to you by the 7th</li>
                <li>Your own owner portal with monthly statements and a T776-ready year end</li>
                <li>One year to start, then month to month at the same rate</li>
              </ul>
              <div className="row">
                <Link className="btn primary" href="/landlords">
                  Why Landlords Choose IRep
                </Link>
                <Link className="btn ghost" href="/landlords#estimate">
                  Free Rent Estimate
                </Link>
              </div>
            </div>
            <div>
              <span className="eyebrow">For Renters</span>
              <h3>Apply once, with everything attached.</h3>
              <ul>
                <li>See every unit we have available right now</li>
                <li>Book a showing with just your email and phone</li>
                <li>Keep your ID and income documents in one profile</li>
                <li>Submit applications in a couple of clicks</li>
              </ul>
              <div>
                <Link className="btn ghost" href="/properties">
                  See Available Rentals
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap stack" style={{ gap: 24 }}>
          <div className="head" style={{ marginBottom: 0 }}>
            <span className="eyebrow">Our Promises to Landlords</span>
            <h2>What You Can Count On</h2>
          </div>
          <ul className="landlord-strip">
            {LANDLORD_PROMISES.map(([t, d]) => (
              <li key={t}>
                <b>{t}</b>
                <span>{d}</span>
              </li>
            ))}
          </ul>
          <div>
            <Link className="btn ghost" href="/landlords#calculator">
              Work Out Your Monthly Fee
            </Link>
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <div className="head">
            <span className="eyebrow">How Placement Works</span>
            <h2>From Vacant to Rented</h2>
          </div>
          <ol className="steps">
            <li>
              <b>List</b>
              <span>We photograph the unit, set the rent with you and publish the listing.</span>
            </li>
            <li>
              <b>Show</b>
              <span>Renters book showings online; every request is answered within 24 hours and we run every viewing.</span>
            </li>
            <li>
              <b>Screen</b>
              <span>ID, income and a credit check through a screening service, then you approve the tenant.</span>
            </li>
            <li>
              <b>Lease</b>
              <span>Ontario Standard Lease, signed electronically, deposits collected.</span>
            </li>
            <li>
              <b>Manage</b>
              <span>Rent collection, maintenance and inspections for the life of the tenancy.</span>
            </li>
          </ol>
        </div>
      </section>

      <section className="block">
        <div className="wrap area">
          <div className="stack">
            <span className="eyebrow">Where We Work</span>
            <h2>Windsor first, all of Essex County.</h2>
            <p className="lead">
              Most of the homes we manage are in Windsor, from Walkerville and Downtown to the University district and the
              East End. We also manage across the county.
            </p>
          </div>
          <div className="towns">
            {SITE.towns.map((t) => (
              <span key={t} className={t === SITE.primaryCity ? "town main" : "town"}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
