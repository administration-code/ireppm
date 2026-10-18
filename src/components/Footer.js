import Link from "next/link";
import { SITE } from "@/lib/site";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div>
          <b>{SITE.name}</b>
          Residential property management and leasing in Windsor and across Essex County. Part of the IRep
          Realty family.
          <div style={{ marginTop: 10 }}>{SITE.email}</div>
          {SITE.phone ? <div>{SITE.phone}</div> : null}
          {SITE.facebook ? (
            <a href={SITE.facebook} target="_blank" rel="noopener noreferrer">
              Facebook
            </a>
          ) : null}
        </div>
        <div>
          <b>Renters</b>
          <Link href="/properties">Available Rentals</Link>
          <Link href="/account">My Documents</Link>
          <Link href="/account">My Applications</Link>
        </div>
        <div>
          <b>Landlords</b>
          <Link href="/landlords">Why Landlords Choose IRep</Link>
          <Link href="/pricing">Packages and Pricing</Link>
          <Link href="/landlords#estimate">Free Rent Estimate</Link>
          <Link href="/guides">Landlord Guides</Link>
          <Link href="/reviews">Reviews</Link>
          <Link href="/about#inquiry">Talk to Us</Link>
        </div>
        <div>
          <b>Sign in</b>
          <Link href="/account">Tenants and Applicants</Link>
          <Link href="/owner">Landlord Portal</Link>
          <Link href="/agent">Partner Portal</Link>
          <Link href="/admin">Staff</Link>
        </div>
        <div className="legal">
          © {new Date().getFullYear()} {SITE.name} · <Link href="/resources" style={{ display: "inline" }}>Resources</Link> · <Link href="/privacy" style={{ display: "inline" }}>Privacy Policy</Link>
        </div>
      </div>
    </footer>
  );
}
