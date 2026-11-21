"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/emails", label: "Drafts & Sent" },
  { href: "/admin/emails/new", label: "New Email" },
  { href: "/admin/emails/templates", label: "Templates" },
];

export default function EmailTabs({ title, subtitle }) {
  const pathname = usePathname();
  return (
    <div className="stack">
      <div className="admin-head">
        <div>
          <p className="eyebrow">Staff · Emails</p>
          <h1 className="admin-title">{title}</h1>
          {subtitle ? <p className="small">{subtitle}</p> : null}
        </div>
      </div>
      <nav className="admin-tabs" aria-label="Email sections">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={pathname === t.href ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
