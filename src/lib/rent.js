import { getBrowserClient } from "@/lib/supabase";

export const METHOD_LABEL = {
  etransfer: "e-Transfer",
  payprop: "PayProp",
  cash: "Cash",
  direct_deposit: "Direct deposit",
  cheque: "Cheque",
  last_month_applied: "Last month's rent applied",
  paid_to_owner: "Paid to landlord directly",
  other: "Other",
};

export const PAYMENT_KIND_LABEL = {
  rent: "Rent",
  last_month_rent: "Last month's rent deposit",
  key_deposit: "Key deposit",
  other: "Other",
};

export const CHARGE_KIND_LABEL = {
  rent: "Rent",
  opening_balance: "Opening balance",
  chargeback: "Chargeback",
  fee: "Fee",
  other: "Other",
};

// Charge kinds staff can add by hand (rent charges come from generate_rent_charges).
export const MANUAL_CHARGE_KINDS = ["opening_balance", "chargeback", "fee", "other"];

export const CURRENT_STATUSES = ["upcoming", "active", "notice"];

export const RENT_TENANCY_SELECT =
  "id, status, rent, start_date, move_out_date, payprop_reference, unit:units(id, label, property:properties(id, address, city)), tenancy_tenants(full_name, email, is_primary, created_at)";

export function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

// "2026-10" for the current month in Windsor.
export const thisMonth = () => todayISO().slice(0, 7);

// "2026-10" or "2026-10-14" -> "2026-10-01"
export function periodOf(value) {
  const m = /^(\d{4})-(\d{2})/.exec(String(value || ""));
  return m ? `${m[1]}-${m[2]}-01` : null;
}

export function monthLabel(period) {
  if (!period) return "—";
  const d = new Date(`${String(period).slice(0, 7)}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return period;
  return d.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
}

export function shortDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export function primaryTenant(tenancy) {
  const list = [...(tenancy?.tenancy_tenants || [])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || String(a.created_at).localeCompare(String(b.created_at))
  );
  return list[0]?.full_name || "No tenant recorded";
}

export function tenancyAddress(tenancy) {
  const u = tenancy?.unit;
  if (!u) return "";
  return [u.property?.address, u.label].filter(Boolean).join(", ");
}

export const tenancyLabel = (t) => `${primaryTenant(t)} — ${tenancyAddress(t)}`;

// Everything a tenancy can be searched by: every tenant's name plus the address.
export const tenancySearchText = (t) =>
  [...(t.tenancy_tenants || []).map((p) => p.full_name), tenancyAddress(t), t.unit?.property?.city]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export const cents = (v) => Math.round(Number(v || 0) * 100);

export function checkAmount(value, label = "amount", { allowNegative = false } = {}) {
  const v = String(value ?? "").trim();
  const re = allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/;
  if (!re.test(v) || Number(v) === 0 || (!allowNegative && Number(v) <= 0)) {
    return `Enter the ${label} in dollars, like 1850 or 533.33${allowNegative ? " (use a minus sign for a credit)" : ""}.`;
  }
  return "";
}

// Staff list of tenancies to match payments against. Current ones first, then past ones.
export async function loadTenancyOptions({ includePast = true } = {}) {
  let q = getBrowserClient().from("tenancies").select(RENT_TENANCY_SELECT);
  if (!includePast) q = q.in("status", CURRENT_STATUSES);
  const { data, error } = await q;
  if (error) throw new Error("We couldn't load tenancies. Refresh the page to try again.");
  return (data || []).sort(
    (a, b) =>
      Number(b.status !== "ended") - Number(a.status !== "ended") || tenancyAddress(a).localeCompare(tenancyAddress(b))
  );
}

export async function countUnmatched() {
  const { count } = await getBrowserClient()
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("status", "unmatched");
  return count || 0;
}

// RLS turns a blocked write into "0 rows", so ask for the rows back.
export async function savePayment(id, changes) {
  const { data, error } = await getBrowserClient().from("payments").update(changes).eq("id", id).select("id");
  if (error || !data?.length) throw new Error("That didn't save. Try again.");
}
