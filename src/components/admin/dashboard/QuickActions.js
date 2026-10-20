import Link from "next/link";

const ACTIONS = [
  { href: "/admin/maintenance/new", label: "Log maintenance" },
  { href: "/admin/rent/new", label: "Record a payment" },
  { href: "/admin/signatures/new", label: "Send for signature" },
  { href: "/admin/inspections/new", label: "Start an inspection" },
  { href: "/admin/listings/new", label: "New listing" },
  { href: "/admin/hours", label: "Log my hours" },
];

export default function QuickActions() {
  return (
    <section className="dash-quick boxed" aria-labelledby="dash-quick-title">
      <h2 id="dash-quick-title" className="eyebrow">
        Quick Actions
      </h2>
      <ul>
        {ACTIONS.map((a) => (
          <li key={a.href}>
            <Link href={a.href} className="dash-quick-link">
              <span>{a.label}</span>
              <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
