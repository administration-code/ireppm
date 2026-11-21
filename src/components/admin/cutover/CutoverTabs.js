"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/cutover", label: "Opening Balances" },
  { href: "/admin/cutover/compare", label: "Parallel Run" },
  { href: "/admin/cutover/parity", label: "Tracker Parity" },
];

export default function CutoverTabs({ title, subtitle }) {
  const pathname = usePathname();
  return (
    <div className="stack">
      <div className="admin-head">
        <div>
          <p className="eyebrow">Accounting · Tracker Cutover</p>
          <h1 className="admin-title">{title}</h1>
          {subtitle ? <p className="small">{subtitle}</p> : null}
        </div>
      </div>
      <nav className="admin-tabs" aria-label="Cutover sections">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={pathname === t.href ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

// Loose match between a label typed in the tracker and a portal row: every word of the label
// (numbers and words of 3+ letters) must appear in the row's text.
export function looseMatch(label, text) {
  const words = String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => /\d/.test(w) || w.length >= 3)
    .filter((w) => !["ave", "avenue", "street", "road", "unit", "the", "and", "apt"].includes(w));
  if (!words.length) return false;
  const hay = String(text || "").toLowerCase();
  return words.every((w) => hay.includes(w));
}

// "label, amount" or "label<TAB>amount" per line; amounts may have $ and commas, or be in brackets.
export function parsePasted(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t|,(?=[^,]*$)/);
      if (parts.length < 2) return null;
      const label = parts.slice(0, -1).join(" ").trim();
      let raw = parts[parts.length - 1].trim();
      const neg = /^\(.*\)$/.test(raw) || raw.startsWith("-");
      raw = raw.replace(/[()$,\s-]/g, "");
      const amount = Number(raw);
      if (!label || !Number.isFinite(amount)) return null;
      return { label, amount: neg ? -amount : amount };
    })
    .filter(Boolean);
}
