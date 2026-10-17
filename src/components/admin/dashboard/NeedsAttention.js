import Link from "next/link";
import { longDate, money } from "@/lib/format";
import { monthLabel } from "@/lib/rent";
import { num, plural } from "@/lib/dashboard";

function attentionItems(d) {
  const m = d.maintenance || {};
  const l = d.leasing || {};
  const p = d.payouts || {};
  const match = d.to_match || {};
  const letters = d.letters || {};
  const early = (d.early_moveouts || []).map((r) => {
    const unit = r.tenancy?.unit;
    const place = [unit?.property?.address, unit?.label].filter(Boolean).join(", ") || "a tenancy";
    return {
      key: `n11-${r.id}`,
      n: 1,
      text: () => `Early move-out request: ${place} for ${longDate(r.termination_date)}`,
      href: "/admin/notices",
    };
  });
  return [
    ...early,
    { n: num(m.emergencies), text: (n) => plural(n, "emergency", "emergencies"), href: "/admin/maintenance", urgent: true },
    { n: num(m.new), text: (n) => plural(n, "new maintenance request"), href: "/admin/maintenance" },
    {
      n: num(match.count),
      text: (n) => `${plural(n, "payment")} to match · ${money(match.amount)}`,
      href: "/admin/rent/match",
    },
    { n: num(m.awaiting_owner), text: (n) => `${plural(n, "owner approval")} pending`, href: "/admin/maintenance" },
    {
      n: num(p.ready_now),
      text: (n) => `${plural(n, "landlord")} ready to be paid · ${money(p.to_pay)} to pay`,
      href: "/admin/payouts",
    },
    {
      n: num(letters.drafts),
      text: (n) => `${plural(n, "draft landlord letter")}${letters.period ? ` for ${monthLabel(letters.period)}` : ""}`,
      href: "/admin/letters",
    },
    {
      n: d.recon_late ? 1 : 0,
      text: () => `${monthLabel(d.recon_late.period)} bank reconciliation isn't locked yet`,
      href: `/admin/accounting?month=${d.recon_late?.period?.slice(0, 7) || ""}`,
      urgent: true,
    },
    { n: num(l.showings_requested), text: (n) => plural(n, "new showing request"), href: "/admin/requests?tab=showings" },
    { n: num(l.applications_new), text: (n) => plural(n, "new application"), href: "/admin/requests?tab=applications" },
    {
      n: num(l.landlord_inquiries_new),
      text: (n) => plural(n, "new landlord inquiry", "new landlord inquiries"),
      href: "/admin/requests?tab=inquiries",
    },
  ].filter((item) => item.n > 0);
}

export default function NeedsAttention({ data }) {
  const items = attentionItems(data);
  return (
    <section className="dash-attention" aria-labelledby="dash-attention-title">
      <h2 id="dash-attention-title" className="eyebrow">
        Needs attention
      </h2>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.key || item.href + item.n + item.urgent}>
              <Link href={item.href} className={item.urgent ? "dash-alert urgent" : "dash-alert"}>
                {item.text(item.n)}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">Nothing needs attention right now.</p>
      )}
    </section>
  );
}
