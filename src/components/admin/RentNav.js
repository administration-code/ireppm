"use client";

import Link from "next/link";

const LINKS = [
  ["/admin/rent", "Collection"],
  ["/admin/rent/match", "To Match"],
  ["/admin/rent/new", "Record a Payment"],
  ["/admin/rent/payprop", "PayProp Batch"],
];

export default function RentNav({ current, unmatched = 0 }) {
  return (
    <nav className="admin-tabs" aria-label="Rent sections">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>
          {label}
          {href === "/admin/rent/match" && unmatched ? (
            <span className="tab-count">
              {unmatched}
              <span className="visually-hidden"> to match</span>
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function RentHead({ title, intro, children }) {
  return (
    <div className="admin-head">
      <div style={{ display: "grid", gap: 8 }}>
        <h1 className="admin-title">{title}</h1>
        {intro ? <p className="small">{intro}</p> : null}
      </div>
      {children}
    </div>
  );
}
