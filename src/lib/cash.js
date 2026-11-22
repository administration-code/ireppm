import "server-only";

// Cash Chuck collects from tenants, and his deposits of it (0084). Server only: uses the admin client.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const CASH_KINDS = { rent: "Rent", last_month_rent: "Last month's rent", key_deposit: "Key deposit", other: "Other" };
const torontoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const cents = (n) => Math.round(Number(n) * 100);

export async function cashPartner(sb, partner) {
  if (!partner) return null;
  const { data } = await sb.from("partners").select("id, name, collects_cash").eq("id", partner.id).maybeSingle();
  return data?.collects_cash ? data : null;
}

function checkDate(d, label) {
  const today = torontoToday();
  if (!ISO.test(String(d || ""))) return `Choose the date ${label}.`;
  if (d > today) return `The date ${label} can't be in the future.`;
  if (daysBetween(d, today) > 62) return `That date is more than two months ago. Ask Rosie to record it.`;
  return null;
}

// Tenancies Chuck can log cash for: current tenancies where IRep collects the rent. People who have paid
// cash before come first.
export async function cashTenancies(sb) {
  const { data } = await sb
    .from("tenancies")
    .select("id, rent, status, collects_rent, unit:units(label, property:properties(*)), tenancy_tenants(full_name, is_primary, created_at)")
    .in("status", ["active", "notice", "upcoming"]);
  const { data: cash } = await sb.from("payments").select("tenancy_id").eq("method", "cash").not("tenancy_id", "is", null);
  const payers = new Set((cash || []).map((p) => p.tenancy_id));
  return (data || [])
    .filter((t) => (t.collects_rent !== false || t.unit?.property?.is_practice) && !t.unit?.property?.archived)
    .map((t) => {
      const people = [...(t.tenancy_tenants || [])].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || String(a.created_at).localeCompare(String(b.created_at)));
      return {
        id: t.id,
        names: people.map((p) => p.full_name).filter(Boolean).join(", ") || "Tenant",
        place: [t.unit?.property?.address, t.unit?.label].filter(Boolean).join(", "),
        address: t.unit?.property?.address || "",
        practice: Boolean(t.unit?.property?.is_practice),
        rent: t.rent == null ? null : Number(t.rent),
        paysCash: payers.has(t.id),
      };
    })
    .sort((a, b) => Number(b.practice) - Number(a.practice) || Number(b.paysCash) - Number(a.paysCash) || a.address.localeCompare(b.address, "en-CA", { numeric: true }) || a.place.localeCompare(b.place, "en-CA", { numeric: true }));
}

// What Chuck sees: cash he's holding and his recent deposits.
export async function cashSummary(sb, partnerId) {
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const [{ data: held }, { data: deposits }] = await Promise.all([
    sb.from("cash_collections").select("id, tenancy_id, amount, collected_on, kind, note, created_at").eq("partner_id", partnerId).eq("status", "held").order("collected_on"),
    sb
      .from("cash_deposits")
      .select("id, deposited_on, amount, method, note, bank_transaction_id, cash_collections(id, tenancy_id, amount, collected_on, kind)")
      .eq("partner_id", partnerId)
      .gte("deposited_on", since)
      .order("deposited_on", { ascending: false }),
  ]);
  return { held: held || [], deposits: deposits || [] };
}

export async function logCollection(sb, partner, input) {
  const amount = Number(input?.amount);
  if (!(amount > 0) || amount > 20000) return { error: "Enter the amount of cash." };
  if (cents(amount) !== Math.round(amount * 100)) return { error: "Enter the amount in dollars and cents." };
  const bad = checkDate(input?.collected_on, "you got the cash");
  if (bad) return { error: bad };
  const kind = CASH_KINDS[input?.kind] ? input.kind : "rent";
  const tenancies = await cashTenancies(sb);
  const t = tenancies.find((x) => x.id === input?.tenancy_id);
  if (!t) return { error: "Choose the tenant." };
  const note = String(input?.note || "").trim().slice(0, 500) || null;

  const { data: pay, error: payErr } = await sb
    .from("payments")
    .insert({
      tenancy_id: t.id,
      amount,
      received_on: input.collected_on,
      method: "cash",
      kind,
      source: "manual",
      payer_name: t.names.split(", ")[0],
      received_by: partner.name?.match(/\(([^)]+)\)/)?.[1] || partner.name || "Chuck",
      notes: ["Cash logged by Chuck in the Agent Portal.", note].filter(Boolean).join(" "),
    })
    .select("id, period")
    .single();
  if (payErr) return { error: "That didn't save. Try again, or tell Rosie." };
  const { data: row, error } = await sb
    .from("cash_collections")
    .insert({ partner_id: partner.id, tenancy_id: t.id, amount, collected_on: input.collected_on, kind, note, payment_id: pay.id })
    .select("id")
    .single();
  if (error) {
    await sb.from("payments").delete().eq("id", pay.id);
    return { error: "That didn't save. Try again, or tell Rosie." };
  }
  return { ok: true, id: row.id, tenant: t.names, place: t.place, period: pay.period };
}

// Undo a cash entry Chuck made by mistake, while he's still holding it.
export async function cancelCollection(sb, partner, id) {
  const { data: c } = await sb.from("cash_collections").select("id, status, payment_id").eq("id", id).eq("partner_id", partner.id).maybeSingle();
  if (!c) return { error: "That entry wasn't found." };
  if (c.status !== "held") return { error: "That cash is already deposited. Ask Rosie to change it." };
  if (c.payment_id) {
    const { data: linked } = await sb.from("bank_transaction_links").select("id").eq("payment_id", c.payment_id).limit(1);
    if (linked?.length) return { error: "That payment is already matched to the bank. Ask Rosie to change it." };
    const { error } = await sb.from("payments").delete().eq("id", c.payment_id);
    if (error) return { error: "That month is locked. Ask Rosie to change it." };
  }
  await sb.from("cash_collections").update({ status: "cancelled", payment_id: null }).eq("id", c.id);
  return { ok: true };
}

export async function recordDeposit(sb, partner, input) {
  const ids = Array.isArray(input?.ids) ? input.ids.map(String).slice(0, 50) : [];
  if (!ids.length) return { error: "Tick the cash you deposited." };
  const bad = checkDate(input?.deposited_on, "you deposited it");
  if (bad) return { error: bad };
  const method = input?.method === "etransfer" ? "etransfer" : "bank_deposit";
  const { data: held } = await sb.from("cash_collections").select("id, amount, collected_on").eq("partner_id", partner.id).eq("status", "held").in("id", ids);
  if ((held || []).length !== ids.length) return { error: "Some of that cash is already deposited. Refresh the page." };
  if (held.some((c) => c.collected_on > input.deposited_on)) return { error: "The deposit date is before you got some of that cash." };
  const total = held.reduce((s, c) => s + cents(c.amount), 0);
  const amount = input?.amount === undefined || input?.amount === "" ? total / 100 : Number(input.amount);
  if (!(amount > 0)) return { error: "Enter the amount you deposited." };
  const note = String(input?.note || "").trim().slice(0, 500) || null;
  if (cents(amount) !== total && !note) return { error: "The amount is different from the cash you ticked. Add a note saying why." };

  const { data: dep, error } = await sb
    .from("cash_deposits")
    .insert({ partner_id: partner.id, deposited_on: input.deposited_on, amount, method, note })
    .select("id")
    .single();
  if (error) return { error: "That didn't save. Try again, or tell Rosie." };
  await sb.from("cash_collections").update({ status: "deposited", deposit_id: dep.id }).in("id", ids);
  const matched = await matchCashDeposits(sb, [dep.id]);
  return { ok: true, id: dep.id, matched: matched.matched > 0 };
}

// Match bank deposits of Chuck's cash to the operating account's bank lines: same amount, a "DEPOSIT" line
// posted from the deposit day to 4 days after, not already matched. Each cash payment is linked to the line,
// so the bank line shows as matched in the reconciliation. Only when the amounts agree exactly; anything else
// is left for staff.
export async function matchCashDeposits(sb, ids = null) {
  let q = sb.from("cash_deposits").select("id, deposited_on, amount, method, cash_collections(id, amount, payment_id, status)").is("bank_transaction_id", null).eq("method", "bank_deposit");
  if (ids) q = q.in("id", ids);
  const { data: deps } = await q;
  const { data: acct } = await sb.from("bank_accounts").select("id").eq("kind", "operating").eq("active", true);
  const accounts = (acct || []).map((a) => a.id);
  let matched = 0;
  for (const d of deps || []) {
    const items = (d.cash_collections || []).filter((c) => c.status === "deposited" && c.payment_id);
    const sum = items.reduce((s, c) => s + cents(c.amount), 0);
    if (!items.length || sum !== cents(d.amount) || !accounts.length) continue;
    const end = new Date(Date.parse(`${d.deposited_on}T12:00:00Z`) + 4 * 86400000).toISOString().slice(0, 10);
    const { data: lines } = await sb
      .from("bank_transactions")
      .select("id, status")
      .in("account_id", accounts)
      .eq("amount", d.amount)
      .ilike("description", "DEPOSIT%")
      .gte("posted_on", d.deposited_on)
      .lte("posted_on", end)
      .eq("status", "unmatched");
    if ((lines || []).length !== 1) continue;
    const line = lines[0];
    const { data: taken } = await sb.from("bank_transaction_links").select("id").eq("bank_transaction_id", line.id).limit(1);
    if (taken?.length) continue;
    const { error } = await sb.from("bank_transaction_links").insert(items.map((c) => ({ bank_transaction_id: line.id, payment_id: c.payment_id, amount: Number(c.amount) })));
    if (error) {
      console.error("[cash] match failed:", error.message);
      continue;
    }
    await sb
      .from("bank_transactions")
      .update({ note: `Cash deposited by Chuck (${items.length} payment${items.length === 1 ? "" : "s"}), logged in the Agent Portal.` })
      .eq("id", line.id)
      .is("note", null);
    await sb.from("cash_deposits").update({ bank_transaction_id: line.id, matched_at: new Date().toISOString() }).eq("id", d.id);
    matched += 1;
  }
  return { matched };
}
