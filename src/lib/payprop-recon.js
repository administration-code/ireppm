import "server-only";

const n = (v) => (v === "" || v == null ? null : Number(String(v).replace(/[$,]/g, "")));
const d = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null);
const c = (v) => Math.round(Number(v || 0) * 100);
const dayDiff = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
// "3270 Academy" and "3270 Academy Dr" → "3270 academy"
export const propKey = (s) => {
  const m = String(s || "").toLowerCase().match(/(\d+[a-z]?(?:-\d+)?)\s+([a-z]+)/);
  return m ? `${m[1]} ${m[2]}` : String(s || "").toLowerCase().trim();
};
const nameKey = (s) => String(s || "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
const sameName = (a, b) => {
  const A = nameKey(a);
  const B = nameKey(b);
  return A.length && B.length && (A[0] === B[0] || A[A.length - 1] === B[B.length - 1]);
};

// Rows from PayProp's "All Payments" CSV → payprop_lines records.
export function toLines(rows) {
  return rows
    .filter((r) => r.PaymentRecordID && r.ID)
    .map((r) => ({
      payment_record_id: String(r.PaymentRecordID),
      payprop_payment_id: String(r.ID),
      payprop_property_id: r.PropertyID || null,
      property_name: r.Property || null,
      payor_name: (r.PayorName || "").replace(/\s+/g, " ").trim() || null,
      bank_date: d(r.BankStatementDate),
      paid_amount: n(r.PaidAmount),
      ben_type: r.BenType || null,
      payee_name: r.PayeeName || null,
      after_split: n(r.AfterSplitAmount),
      after_split_tax: n(r.AfterSplitAmountTax),
      transferred_date: d(r.TransferredDate),
      remit_id: r.RemitID || null,
      category: r.PaymentCategory || null,
      raw: r,
    }));
}

// Maps PayProp properties to portal properties by street number and name, keeping staff choices.
export async function mapProperties(sb, lines) {
  const { data: props } = await sb.from("properties").select("id, address");
  const { data: known } = await sb.from("payprop_properties").select("*");
  const map = new Map((known || []).map((k) => [k.payprop_property_id, k]));
  const upserts = [];
  for (const l of lines) {
    if (!l.payprop_property_id || map.get(l.payprop_property_id)?.property_id) continue;
    const hit = (props || []).find((p) => propKey(p.address) === propKey(l.property_name));
    const row = { payprop_property_id: l.payprop_property_id, name: l.property_name, property_id: hit?.id || null, updated_at: new Date().toISOString() };
    map.set(l.payprop_property_id, row);
    upserts.push(row);
  }
  if (upserts.length) await sb.from("payprop_properties").upsert(upserts, { onConflict: "payprop_property_id" });
  return map;
}

// The month's reconciliation: tenant payments, landlord payouts, and IRep's PayProp deposits.
export async function reconcileMonth(sb, month) {
  const start = `${month}-01`;
  const endD = new Date(`${start}T12:00:00Z`);
  endD.setUTCMonth(endD.getUTCMonth() + 1);
  const end = endD.toISOString().slice(0, 10);
  const pad = (iso, days) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

  const [{ data: lines }, { data: maps }, { data: props }] = await Promise.all([
    sb.from("payprop_lines").select("*").or(`and(bank_date.gte.${start},bank_date.lt.${end}),and(transferred_date.gte.${start},transferred_date.lt.${end})`),
    sb.from("payprop_properties").select("*"),
    sb.from("properties").select("id, address"),
  ]);
  const propOf = new Map((maps || []).map((m) => [m.payprop_property_id, m.property_id]));
  const addr = new Map((props || []).map((p) => [p.id, p.address]));
  const all = lines || [];

  // 1. Tenant payments (one per PayProp payment ID), by the date the money reached PayProp.
  const pp = new Map();
  for (const l of all) if (l.bank_date >= start && l.bank_date < end && !pp.has(l.payprop_payment_id)) pp.set(l.payprop_payment_id, l);
  const { data: portalPays } = await sb
    .from("payments")
    .select("id, received_on, amount, payer_name, tenancy:tenancies(unit:units(property_id))")
    .eq("method", "payprop")
    .is("parent_id", null)
    .neq("status", "ignored")
    .gte("received_on", pad(start, -7))
    .lt("received_on", pad(end, 7));
  const unused = new Set((portalPays || []).map((p) => p.id));
  const tenant = [];
  for (const l of [...pp.values()].sort((a, b) => String(a.bank_date).localeCompare(String(b.bank_date)))) {
    const propertyId = propOf.get(l.payprop_property_id);
    const cands = (portalPays || []).filter(
      (p) => unused.has(p.id) && c(p.amount) === c(l.paid_amount) && (!propertyId || p.tenancy?.unit?.property_id === propertyId) && Math.abs(dayDiff(p.received_on, l.bank_date)) <= 7
    );
    cands.sort((a, b) => Number(sameName(b.payer_name, l.payor_name)) - Number(sameName(a.payer_name, l.payor_name)) || Math.abs(dayDiff(a.received_on, l.bank_date)) - Math.abs(dayDiff(b.received_on, l.bank_date)));
    const hit = cands[0];
    if (hit) unused.delete(hit.id);
    tenant.push({
      date: l.bank_date,
      property: l.property_name,
      payor: l.payor_name,
      amount: Number(l.paid_amount),
      status: hit ? (hit.received_on === l.bank_date ? "matched" : "date") : "missing",
      portal: hit ? { id: hit.id, date: hit.received_on, payer: hit.payer_name } : null,
    });
  }
  const portalOnly = (portalPays || [])
    .filter((p) => unused.has(p.id) && p.received_on >= start && p.received_on < end)
    .map((p) => ({ id: p.id, date: p.received_on, amount: Number(p.amount), payer: p.payer_name, property: addr.get(p.tenancy?.unit?.property_id) || "" }));

  // 2. Landlord payouts: PayProp owner shares grouped by remittance, against PayProp payouts recorded in the portal.
  const remits = new Map();
  for (const l of all) {
    if (l.ben_type !== "B" || !(l.transferred_date >= start && l.transferred_date < end)) continue;
    const k = `${l.payprop_property_id}|${l.remit_id}`;
    const r = remits.get(k) || { property: l.property_name, property_id: propOf.get(l.payprop_property_id) || null, payee: l.payee_name, date: l.transferred_date, remit: l.remit_id, amount: 0, payments: 0 };
    r.amount += Number(l.after_split || 0);
    r.payments += 1;
    remits.set(k, r);
  }
  const { data: outs } = await sb
    .from("owner_payouts")
    .select("id, property_id, paid_on, amount, period")
    .eq("method", "payprop")
    .gte("paid_on", pad(start, -5))
    .lt("paid_on", pad(end, 7));
  const outLeft = new Set((outs || []).map((o) => o.id));
  const payouts = [];
  const remitList = [...remits.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const r of remitList) {
    const hit = (outs || []).find((o) => outLeft.has(o.id) && o.property_id === r.property_id && c(o.amount) === c(r.amount) && Math.abs(dayDiff(o.paid_on, r.date)) <= 7);
    if (hit) outLeft.delete(hit.id);
    payouts.push({ ...r, amount: Math.round(r.amount * 100) / 100, status: hit ? (hit.paid_on === r.date ? "matched" : "date") : "unmatched", portal: hit ? { id: hit.id, date: hit.paid_on, amount: Number(hit.amount) } : null });
  }
  // Second pass: same property, PayProp's and the portal's totals for the month agree.
  for (const pid of new Set(payouts.filter((p) => p.status === "unmatched").map((p) => p.property_id))) {
    const pp2 = payouts.filter((p) => p.status === "unmatched" && p.property_id === pid);
    const po = (outs || []).filter((o) => outLeft.has(o.id) && o.property_id === pid && o.paid_on >= pad(start, -5) && o.paid_on < end);
    const a = pp2.reduce((s, p) => s + c(p.amount), 0);
    const b = po.reduce((s, o) => s + c(o.amount), 0);
    if (pid && po.length && a === b) {
      pp2.forEach((p) => (p.status = "month_total"));
      po.forEach((o) => outLeft.delete(o.id));
    } else if (pid && po.length) {
      pp2.forEach((p) => {
        p.status = "differs";
        p.portal = { total: b / 100, count: po.length };
        p.difference = (a - b) / 100;
      });
      po.forEach((o) => outLeft.delete(o.id));
    }
  }
  const payoutsPortalOnly = (outs || [])
    .filter((o) => outLeft.has(o.id) && o.paid_on >= start && o.paid_on < end)
    .map((o) => ({ id: o.id, date: o.paid_on, amount: Number(o.amount), property: addr.get(o.property_id) || "" }));

  // 3. IRep's share (management and other fees), by remittance and payout date, against PayProp deposits at Scotiabank.
  const fees = new Map();
  for (const l of all) {
    if (l.ben_type !== "C" || !(l.transferred_date >= start && l.transferred_date < end)) continue;
    const f = fees.get(l.remit_id) || { remit: l.remit_id, date: l.transferred_date, amount: 0, lines: 0 };
    f.amount += Number(l.after_split || 0);
    f.lines += Number(l.after_split || 0) ? 1 : 0;
    fees.set(l.remit_id, f);
  }
  const { data: bank } = await sb
    .from("bank_transactions")
    .select("id, posted_on, amount, description")
    .ilike("description", "%payprop%")
    .gt("amount", 0)
    .gte("posted_on", start)
    .lt("posted_on", pad(end, 7));
  const bankLeft = new Set((bank || []).map((b) => b.id));
  const irep = [...fees.values()]
    .filter((f) => f.amount > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((f) => {
      const amount = Math.round(f.amount * 100) / 100;
      const near = (bank || []).filter((b) => bankLeft.has(b.id) && dayDiff(b.posted_on, f.date) >= 0 && dayDiff(b.posted_on, f.date) <= 4);
      const exact = near.find((b) => c(b.amount) === c(amount));
      const hit = exact || near[0];
      if (hit) bankLeft.delete(hit.id);
      return { ...f, amount, status: exact ? "matched" : hit ? "differs" : "not_at_bank", bank: hit ? { date: hit.posted_on, amount: Number(hit.amount) } : null, difference: hit && !exact ? Math.round((Number(hit.amount) - amount) * 100) / 100 : null };
    });

  const unmappedProperties = [...new Set(all.filter((l) => !propOf.get(l.payprop_property_id)).map((l) => l.property_name))];
  return {
    month,
    lines: all.length,
    tenant,
    portalOnly,
    payouts,
    payoutsPortalOnly,
    irep,
    unmappedProperties,
    counts: {
      tenantIssues: tenant.filter((t) => t.status === "missing").length + portalOnly.length,
      payoutIssues: payouts.filter((p) => ["unmatched", "differs"].includes(p.status)).length + payoutsPortalOnly.length,
      irepIssues: irep.filter((i) => i.status !== "matched").length,
    },
  };
}
