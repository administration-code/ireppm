"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IRepMark } from "./Brand";
import { useAuth } from "./AuthProvider";
import { useStaff } from "@/lib/useStaff";
import { useOwner } from "@/lib/useOwner";

const NAV = [
  ["/", "Home"],
  ["/properties", "Properties"],
  ["/landlords", "For landlords"],
  ["/pricing", "Pricing"],
  ["/guides", "Guides"],
  ["/about", "About"],
];

export default function Header() {
  const path = usePathname() || "/";
  const { user, openSignIn } = useAuth();
  const { isStaff } = useStaff();
  const { isOwner } = useOwner();
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
          <Link className="staff-link" href="/admin" aria-current={current("/admin")}>
            Staff
          </Link>
        ) : null}
        {isOwner ? (
          <Link className="staff-link" href="/owner" aria-current={current("/owner")}>
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
          {isStaff || isOwner ? (
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
            <button
              type="button"
              className="site-menu-acct"
              onClick={() => {
                closeMenu();
                openSignIn("/account");
              }}
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
