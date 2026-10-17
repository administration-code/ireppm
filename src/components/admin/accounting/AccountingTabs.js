"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/accounting", label: "Reconcile" },
  { href: "/admin/accounting/import", label: "Bank imports" },
  { href: "/admin/accounting/year", label: "Year end" },
  { href: "/admin/accounting/landlords", label: "Landlord year-end" },
  { href: "/admin/accounting/commissions", label: "Commissions & loans" },
];

const isCurrent = (pathname, href) =>
  pathname === href || (href !== "/admin/accounting" && pathname?.startsWith(`${href}/`));

export default function AccountingTabs({ title, subtitle, children }) {
  const pathname = usePathname();
  return (
    <div className="stack">
      <div className="admin-head no-print">
        <div>
          <p className="eyebrow">Accounting</p>
          <h1 className="admin-title">{title}</h1>
          {subtitle ? <p className="small">{subtitle}</p> : null}
        </div>
        {children}
      </div>
      <nav className="admin-tabs no-print" aria-label="Accounting sections">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={isCurrent(pathname, t.href) ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
