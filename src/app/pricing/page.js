import Link from "next/link";
import { COMPARISON, PACKAGES } from "@/lib/site";

export const metadata = {
  title: "Property management pricing",
  description:
    "Property management packages for Windsor landlords from $175/month, plus tenant placement for half of one month's rent.",
};

export default function PricingPage() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Packages and pricing</span>
          <h1>Simple monthly management fees</h1>
          <p className="lead">
            Pick the level of care your property needs. Every package includes rent collection and full tenant
            management.
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
                  Ask for a quote
                </Link>
              ) : null}
            </div>
          ))}
        </div>

        <div className="leasing">
          <div className="big">½ month</div>
          <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <h3>Leasing and tenant placement</h3>
            <p className="pmuted" style={{ fontSize: ".9375rem" }}>
              Advertising, showings, screening with a credit check, and a signed Ontario Standard Lease. Charged once,
              when the tenant moves in, at half of one month's rent.
            </p>
          </div>
          <Link className="btn primary" href="/about#inquiry">
            Get started
          </Link>
        </div>

        <div className="table-wrap">
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
