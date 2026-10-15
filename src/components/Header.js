"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IRepMark } from "./Brand";
import { useAuth } from "./AuthProvider";
import { useStaff } from "@/lib/useStaff";
import { useOwner } from "@/lib/useOwner";

const NAV = [
  ["/", "Home"],
  ["/properties", "Properties"],
  ["/pricing", "Pricing"],
  ["/about", "About"],
];

export default function Header() {
  const path = usePathname() || "/";
  const { user, openSignIn } = useAuth();
  const { isStaff } = useStaff();
  const { isOwner } = useOwner();
  const isCurrent = (href) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="brand" aria-label="IRep Property Management home">
          <IRepMark />
          <span className="wm">
            <b>IREP</b>
            <i>PROPERTY MANAGEMENT</i>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} aria-current={isCurrent(href) ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        {isStaff ? (
          <Link className="staff-link" href="/admin" aria-current={path.startsWith("/admin") ? "page" : undefined}>
            Staff
          </Link>
        ) : null}
        {isOwner ? (
          <Link className="staff-link" href="/owner" aria-current={path.startsWith("/owner") ? "page" : undefined}>
            Owner portal
          </Link>
        ) : null}
        {user ? (
          <Link className="acct-btn" href="/account">
            My profile
          </Link>
        ) : (
          <button className="acct-btn" onClick={() => openSignIn("/account")}>
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}
