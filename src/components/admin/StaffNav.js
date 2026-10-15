import Link from "next/link";
import { TABS } from "@/lib/admin-requests";

const SECTIONS = [
  { key: "listings", href: "/admin/listings", label: "Listings", count: "drafts", note: "drafts", muted: true },
  { key: "maintenance", href: "/admin/maintenance", label: "Maintenance", count: "maintenanceNew", note: "new" },
  { key: "rent", href: "/admin/rent", label: "Rent", count: "unmatchedPayments", note: "to match" },
  { key: "turnovers", href: "/admin/turnovers", label: "Turnovers", count: "openTurnovers", note: "open", muted: true },
  { key: "payouts", href: "/admin/payouts", label: "Landlord payouts" },
  { key: "letters", href: "/admin/letters", label: "Landlord letters" },
  { key: "notices", href: "/admin/notices", label: "Notices" },
  { key: "properties", href: "/admin/properties", label: "Properties" },
  { key: "owners", href: "/admin/owners", label: "Owners" },
  { key: "partners", href: "/admin/partners", label: "Partners" },
  { key: "rates", href: "/admin/rates", label: "Add-ons & rates" },
];

function Count({ value, note, muted }) {
  if (!value) return null;
  return (
    <span className={muted ? "tab-count muted" : "tab-count"}>
      {value}
      <span className="visually-hidden"> {note}</span>
    </span>
  );
}

// `active` is "dashboard", a request tab key, or a section key. `counts` may be null while loading.
export default function StaffNav({ active, counts }) {
  const c = counts || {};
  return (
    <nav className="admin-tabs" aria-label="Staff sections">
      <Link href="/admin" aria-current={active === "dashboard" ? "page" : undefined}>
        Dashboard
      </Link>
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/admin/requests?tab=${t.key}`}
          scroll={false}
          aria-current={active === t.key ? "page" : undefined}
        >
          {t.label}
          <Count value={c[t.key]} note="new" />
        </Link>
      ))}
      {SECTIONS.map((s) => (
        <Link key={s.key} href={s.href} aria-current={active === s.key ? "page" : undefined}>
          {s.label}
          {s.count ? <Count value={c[s.count]} note={s.note} muted={s.muted} /> : null}
        </Link>
      ))}
    </nav>
  );
}
