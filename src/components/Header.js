"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IRepMark } from "./Brand";
import { useAuth } from "./AuthProvider";
import { useStaff } from "@/lib/useStaff";
import { useOwner } from "@/lib/useOwner";
import { usePartner } from "@/lib/usePartner";

const NAV = [
  ["/", "Home"],
  ["/properties", "Properties"],
  ["/landlords", "For landlords"],
  ["/pricing", "Pricing"],
  ["/guides", "Guides"],
  ["/about", "About"],
];

// One sign-in for everyone; this only decides where they land afterwards.
const SIGN_IN = [
  ["/account", "Tenants and applicants"],
  ["/owner", "Landlords"],
  ["/agent", "Partners"],
  ["/admin", "Staff"],
];

export default function Header() {
  const path = usePathname() || "/";
  const { user, openSignIn } = useAuth();
  const { isStaff } = useStaff();
  const { isOwner } = useOwner();
  const { isPartner } = usePartner();
  const isCurrent = (href) => (href === "/" ? path === "/" : path.startsWith(href));

  // Remember which page the menu was opened on, so changing page closes it.
  const [openOn, setOpenOn] = useState(null);
  const menuOpen = openOn === path;
  const closeMenu = () => setOpenOn(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpenOn(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const current = (href) => (path.startsWith(href) ? "page" : undefined);

  // Share the header's height so the staff menu can stick just below it.
  const headerRef = useRef(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const set = () => document.documentElement.style.setProperty("--site-header-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header className="site-header" ref={headerRef}>
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
          <Link className="staff-link" href="/admin" aria-current={current("/admin")}>
            Staff
          </Link>
        ) : null}
        {isOwner ? (
          <Link className="staff-link" href="/owner" aria-current={current("/owner")}>
            Owner portal
          </Link>
        ) : null}
        {isPartner ? (
          <Link className="staff-link" href="/agent" aria-current={current("/agent")}>
            Partner portal
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
        <button
          type="button"
          className="menu-btn"
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          onClick={() => setOpenOn(menuOpen ? null : path)}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </div>
      <div id="site-menu" className="site-menu" hidden={!menuOpen}>
        <div className="wrap">
          {isStaff || isOwner || isPartner ? (
            <div className="site-menu-portals">
              {isStaff ? (
                <Link className="site-menu-portal" href="/admin" aria-current={current("/admin")} onClick={closeMenu}>
                  Staff
                </Link>
              ) : null}
              {isOwner ? (
                <Link className="site-menu-portal" href="/owner" aria-current={current("/owner")} onClick={closeMenu}>
                  Owner portal
                </Link>
              ) : null}
              {isPartner ? (
                <Link className="site-menu-portal" href="/agent" aria-current={current("/agent")} onClick={closeMenu}>
                  Partner portal
                </Link>
              ) : null}
            </div>
          ) : null}
          <nav aria-label="Main menu">
            {NAV.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={isCurrent(href) ? "page" : undefined}
                onClick={closeMenu}
              >
                {label}
              </Link>
            ))}
          </nav>
          {user ? (
            <Link className="site-menu-acct" href="/account" onClick={closeMenu}>
              My profile
            </Link>
          ) : (
            <div className="site-menu-signin">
              <span>Sign in</span>
              {SIGN_IN.map(([next, label]) => (
                <button
                  key={next}
                  type="button"
                  className="site-menu-acct"
                  onClick={() => {
                    closeMenu();
                    openSignIn(next);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
