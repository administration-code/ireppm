import Link from "next/link";
import FeeCalculator from "@/components/FeeCalculator";
import InquiryForm from "@/components/InquiryForm";
import { LANDLORD_PROMISES, LANDLORD_PROTECTIONS } from "@/lib/site";

export const metadata = {
  title: "Property management for Windsor landlords",
  description:
    "Screened tenants, showings answered within 24 hours, payouts by the 7th and a T776-ready year end. See your costs and get a free rent estimate.",
};

export default function LandlordsPage() {
  return (
    <>
      <section className="block">
        <div className="wrap">
          <div className="head">
            <span className="eyebrow">For landlords</span>
            <h1>Know what&apos;s happening with your rental, every month.</h1>
            <p className="lead">
              IRep finds and screens your tenants, collects the rent, handles repairs and inspections, and shows you all
              of it in your own owner portal. One year to start, then month to month at the same rate.
            </p>
            <div className="row">
              <Link className="btn primary" href="#estimate">Get a free rent estimate</Link>
              <Link className="btn ghost" href="#calculator">Work out your fee</Link>
            </div>
            <p className="small" style={{ marginTop: 12 }}>
              <Link href="/reviews?who=landlord">Read what landlords say about us</Link>
            </p>
          </div>

          <ul className="promises">
            {LANDLORD_PROMISES.map(([t, d]) => (
              <li key={t}>
                <b>{t}</b>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="block">
        <div className="wrap portal-preview">
          <div className="stack" style={{ gap: 14, minWidth: 0 }}>
            <span className="eyebrow">Your owner portal</span>
            <h2>Every dollar, every month, in one place.</h2>
            <p className="lead">Sign in any time to see:</p>
            <ul className="tick-list">
              <li>Rent collected and what was paid out to you, month by month</li>
              <li>A monthly summary and landlord letters</li>
              <li>Applicants waiting for your decision</li>
              <li>Repairs that need your OK, and what they cost</li>
              <li>Your tenants&apos; insurance, and your year-end statement for your T776</li>
            </ul>
          </div>
          <figure className="mock-portal" aria-label="Example of the owner portal monthly summary, with sample figures">
            <div className="mock-bar"><i /><i /><i /><span>ireppm.ca/owner</span></div>
            <div className="mock-body">
              <div className="mock-row">
                <b>October 2026</b>
                <span className="pill st-available">Paid out Oct 7</span>
              </div>
              <table className="mock-table">
                <tbody>
                  <tr><td>Rent collected</td><td className="num">$3,700.00</td></tr>
                  <tr><td>Management fee + HST</td><td className="num">−$226.00</td></tr>
                  <tr><td>Lawn &amp; snow + HST</td><td className="num">−$56.50</td></tr>
                  <tr className="tot"><td>Sent to you</td><td className="num">$3,417.50</td></tr>
                </tbody>
              </table>
              <div className="mock-row">
                <span>Applicant for Unit 2</span>
                <span className="pill st-draft">Your decision</span>
              </div>
            </div>
            <figcaption className="pmuted">Sample figures.</figcaption>
          </figure>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <div className="head">
            <span className="eyebrow">How we protect your property</span>
            <h2>Good tenants, kept on track.</h2>
          </div>
          <ul className="protect-grid">
            {LANDLORD_PROTECTIONS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="pmuted" style={{ marginTop: 18 }}>
            Want to know how notices work and when you&apos;re involved? Read our{" "}
            <Link href="/guides">landlord guides</Link>.
          </p>
        </div>
      </section>

      <section className="block" id="calculator">
        <div className="wrap">
          <div className="head">
            <span className="eyebrow">Fee calculator</span>
            <h2>What would it cost?</h2>
            <p className="lead">Pick a package and your number of units. No setup fee and no long lock-in.</p>
          </div>
          <FeeCalculator />
        </div>
      </section>

      <section className="block" id="estimate">
        <div className="wrap estimate">
          <div className="stack" style={{ gap: 14, minWidth: 0 }}>
            <span className="eyebrow">Free rent estimate</span>
            <h2>What could your property rent for?</h2>
            <p className="lead">
              Tell us about the home and we&apos;ll reply within one business day with a rent range based on what&apos;s
              renting near you right now. No obligation.
            </p>
          </div>
          <div className="boxed">
            <InquiryForm estimate id="estimate-form" />
          </div>
        </div>
      </section>
    </>
  );
}
