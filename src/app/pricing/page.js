import Link from "next/link";
import FeeCalculator from "@/components/FeeCalculator";
import { COMPARISON, PACKAGES } from "@/lib/site";

export const metadata = {
  title: "Property Management Pricing",
  description:
    "Property management packages for Windsor landlords from $175/month, plus tenant placement for half of one month's rent.",
};

export default function PricingPage() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Packages and Pricing</span>
          <h1>Simple Monthly Management Fees</h1>
          <p className="lead">
            Pick the level of care your property needs. Every package includes rent collection, full tenant management
            and your owner portal. One year to start, then month to month at the same rate: no long lock-in.
          </p>
        </div>

        <div className="plans">
          {PACKAGES.map((p) => (
            <div key={p.key} className={p.featured ? "plan pick" : "plan"}>
              <span className="pname">{p.name}</span>
              <span className="amt num">
                {p.price}
                <small> {p.unit}</small>
              </span>
              <span className="pmuted">{p.note}</span>
              <ul>
                {p.items.map((it) => (
                  <li key={it} className={it.startsWith("Everything") ? "inc" : undefined}>
                    {it}
                  </li>
                ))}
              </ul>
              {p.quote ? (
                <Link className="btn ghost" href="/about#inquiry" style={{ marginTop: 4 }}>
                  Ask for a Quote
                </Link>
              ) : null}
            </div>
          ))}
        </div>

        <div className="leasing">
          <div className="big">½ month</div>
          <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <h3>Leasing and Tenant Placement</h3>
            <p className="pmuted" style={{ fontSize: ".9375rem" }}>
              Advertising, showings, screening with a credit check, and a signed Ontario Standard Lease. Charged once,
              when the tenant moves in, at half of one month's rent.
            </p>
          </div>
          <Link className="btn primary" href="/about#inquiry">
            Get Started
          </Link>
        </div>

        <div className="head" id="calculator" style={{ marginTop: 56 }}>
          <span className="eyebrow">Fee Calculator</span>
          <h2>Work Out Your Monthly Fee</h2>
        </div>
        <FeeCalculator />

        <div className="table-wrap" style={{ marginTop: 56 }}>
          <table className="cmp">
            <thead>
              <tr>
                <th>What's included</th>
                <th className="c">Standard</th>
                <th className="c">Maintenance</th>
                <th className="c">Protection</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map(([label, ...cols]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {cols.map((v, i) => (
                    <td key={i} className="c">
                      {v ? (
                        <span className="yes" aria-label="Included">●</span>
                      ) : (
                        <span className="pmuted" aria-label="Not included">–</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
