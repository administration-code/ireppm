import Link from "next/link";
import { GUIDES } from "@/lib/guides";

export const metadata = {
  title: "Landlord Guides",
  description: "Plain-language guides for Windsor landlords: notices, rent increases, unpaid rent and renting near the University of Windsor.",
};

export default function GuidesPage() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Landlord Guides</span>
          <h1>Ontario Rental Rules, in Plain Language</h1>
          <p className="lead">How the common notices work, who handles what, and where we need you.</p>
        </div>
        <ul className="guide-list">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`}>
                <b>{g.title}</b>
                <span>{g.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="pmuted" style={{ marginTop: 24 }}>
          Tenants: see our <Link href="/resources">resources page</Link> for your rights and how to pay rent.
        </p>
      </div>
    </section>
  );
}
