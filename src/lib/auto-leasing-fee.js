import "server-only";
import { sendMail, staffEmails } from "@/lib/application-review";
import { primaryTenant } from "@/lib/rent";

// Leasing fees added automatically once a new tenancy's first month and last month's rent are both in
// (runs in the daily job). Managed properties: a leasing fee line on that month's landlord statement.
// Leasing-only: a draft leasing fee invoice. The standard rate (half a month's rent + HST) is used; staff change
// it to MLS or remove it on the statement or invoice. The Rishi/Chuck split and loan shares follow automatically
// (leasing_fee_splits reads statement lines, and invoice lines once the invoice is sent).

const STARTS_FROM = "2026-11-01"; // new tenancies from here on; earlier ones were billed by hand
const cents = (n) => Math.round(Number(n || 0) * 100);
const money = (n) => `$${(Math.round(Number(n) * 100) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthStart = (d) => `${String(d).slice(0, 7)}-01`;
const nextMonth = (p) => {
  const [y, m] = p.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

export async function autoLeasingFees(sb) {
  const { data: rates } = await sb.from("service_rates").select("key, amount").in("key", ["leasing_standard", "hst"]);
  const rate = Object.fromEntries((rates || []).map((r) => [r.key, Number(r.amount)]));
  const months = rate.leasing_standard > 0 ? rate.leasing_standard : 0.5;
  const hstPct = rate.hst >= 0 ? rate.hst : 13;

  const { data: tenancies } = await sb
    .from("tenancies")
    .select(
      "id, rent, start_date, last_month_deposit, status, unit:units(id, label, management_type, property:properties(id, address, owner_id)), tenancy_tenants(full_name, is_primary, created_at)"
    )
    .gte("start_date", STARTS_FROM)
    .in("status", ["upcoming", "active", "notice"]);
  const list = (tenancies || []).filter((t) => Number(t.rent) > 0 && t.unit?.property?.id);
  if (!list.length) return { added: 0 };
  const ids = list.map((t) => t.id);

  const [{ data: billed }, { data: invoiced }, { data: pays }] = await Promise.all([
    sb.from("statement_items").select("tenancy_id").eq("kind", "leasing_fee").in("tenancy_id", ids),
    sb.from("invoices").select("staff_note").ilike("staff_note", "%auto-leasing:%"),
    sb.from("payments").select("tenancy_id, kind, method, received_on, period, status").in("tenancy_id", ids).in("status", ["matched", "split"]),
  ]);
  const done = new Set([
    ...(billed || []).map((b) => b.tenancy_id),
    ...(invoiced || []).flatMap((i) => [...String(i.staff_note || "").matchAll(/auto-leasing:([0-9a-f-]{36})/g)].map((m) => m[1])),
  ]);

  const added = [];
  for (const t of list) {
    if (done.has(t.id)) continue;
    const mine = (pays || []).filter((p) => p.tenancy_id === t.id && p.method !== "last_month_applied");
    const first = mine.filter((p) => p.kind === "rent" && (!p.period || p.period >= monthStart(t.start_date))).sort((a, b) => a.received_on.localeCompare(b.received_on))[0];
    const lmrNeeded = Number(t.last_month_deposit || 0) > 0;
    const lmr = mine.filter((p) => p.kind === "last_month_rent").sort((a, b) => a.received_on.localeCompare(b.received_on))[0];
    if (!first || (lmrNeeded && !lmr)) continue;

    const when = [first.received_on, lmr?.received_on].filter(Boolean).sort().pop();
    const fee = Math.round(Number(t.rent) * months * 100) / 100;
    const hst = Math.round(fee * hstPct) / 100;
    const total = (cents(fee) + cents(hst)) / 100;
    const who = primaryTenant(t);
    const label = t.unit.label || "unit";
    const description = `Leasing fee: ${who}, ${label} (${money(fee)} + HST)`;
    const place = [t.unit.property.address, label].join(", ");

    if (t.unit.management_type === "leasing_only") {
      const { data: owner } = t.unit.property.owner_id
        ? await sb.from("owners").select("name, email, mailing_address").eq("id", t.unit.property.owner_id).maybeSingle()
        : { data: null };
      const { data: inv, error } = await sb
        .from("invoices")
        .insert({
          status: "draft",
          owner_id: t.unit.property.owner_id,
          property_id: t.unit.property.id,
          bill_to_name: owner?.name || t.unit.property.address,
          bill_to_email: owner?.email || null,
          bill_to_address: owner?.mailing_address || null,
          title: `Leasing fee: ${place}`,
          issue_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }),
          hst_percent: hstPct,
          staff_note: `Made automatically when first and last were received (${when}). auto-leasing:${t.id}`,
        })
        .select("id")
        .single();
      if (error) {
        console.error("[auto-leasing] invoice failed:", error.message);
        continue;
      }
      await sb.from("invoice_lines").insert({ invoice_id: inv.id, sort: 1, category: "leasing_fee", description: `Leasing fee: ${who}, ${place}`, quantity: months, unit_price: Number(t.rent), taxable: true });
      added.push({ place, total, kind: "invoice", when, link: `/admin/invoices/${inv.id}` });
    } else {
      let period = monthStart(when);
      let res = await sb.from("statement_items").insert({ property_id: t.unit.property.id, period, kind: "leasing_fee", tenancy_id: t.id, description, amount: -total }).select("id").single();
      if (res.error && /lock|closed|period/i.test(res.error.message || "")) {
        period = nextMonth(period); // that month is locked: put it on the next statement
        res = await sb.from("statement_items").insert({ property_id: t.unit.property.id, period, kind: "leasing_fee", tenancy_id: t.id, description, amount: -total }).select("id").single();
      }
      if (res.error) {
        console.error("[auto-leasing] statement line failed:", res.error.message);
        continue;
      }
      added.push({ place, total, kind: "statement", when, period });
    }
  }

  if (added.length) {
    await sendMail({
      to: staffEmails(),
      subject: `Leasing fee${added.length === 1 ? "" : "s"} added: ${added.map((a) => a.place).join("; ")}`.slice(0, 150),
      lines: [
        "First and last month's rent are in, so the leasing fee was added at the standard rate (half a month's rent + HST):",
        added
          .map((a) =>
            a.kind === "invoice"
              ? `• ${a.place}: ${money(a.total)} on a draft invoice (leasing-only). Check it and send it.`
              : `• ${a.place}: ${money(a.total)} on the ${a.period.slice(0, 7)} landlord statement.`
          )
          .join("\n"),
        "If it was an MLS lease, a roommate replacement with no fee, or a different arrangement, change or remove it on the statement or invoice. Rishi's and Chuck's shares follow automatically.",
      ],
      link: "https://ireppm.ca/admin/accounting/commissions",
      linkLabel: "Open Commissions & Loans",
    }).catch((err) => console.error("[auto-leasing] email failed:", err?.message || err));
  }
  return { added: added.length };
}
