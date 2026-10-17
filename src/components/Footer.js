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
          <Link href="/properties">Available rentals</Link>
          <Link href="/account">My documents</Link>
          <Link href="/account">My applications</Link>
        </div>
        <div>
          <b>Landlords</b>
          <Link href="/pricing">Packages and pricing</Link>
          <Link href="/about#inquiry">Talk to us</Link>
        </div>
        <div className="legal">
          © {new Date().getFullYear()} {SITE.name} · <Link href="/resources" style={{ display: "inline" }}>Resources</Link> · <Link href="/privacy" style={{ display: "inline" }}>Privacy policy</Link>
        </div>
      </div>
    </footer>
  );
}
