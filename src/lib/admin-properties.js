import { getBrowserClient } from "@/lib/supabase";
import { PACKAGES } from "@/lib/site";
import { money } from "@/lib/format";

export const PACKAGE_LABEL = {
  leasing_only: "Leasing only",
  ...Object.fromEntries(PACKAGES.map((p) => [p.key, p.name])),
};

export const UNIT_TYPES = ["Apartment", "House", "Townhouse", "Room"];

export const UNIT_STATUS = {
  occupied: "Occupied",
  vacant: "Vacant",
  turnover: "Turnover",
  offline: "Offline",
};

export const TENANCY_STATUS = {
  upcoming: "Upcoming",
  active: "Active",
  notice: "Notice given",
  ended: "Ended",
};

export const CURRENT_TENANCY = ["upcoming", "active", "notice"];

export const UNIT_MANAGEMENT = {
  managed: "Managed",
  leasing_only: "Leasing only",
};

export const OWNER_TYPES = {
  individual: "Individual",
  corporation: "Corporation",
};

export const OWNER_FIELDS = "id, legacy_id, name, entity_type, email, phone, mailing_address, payout_method, notes";

export const PROPERTY_FIELDS =
  "id, address, city, postal_code, owner_id, management_package, notes, archived, monthly_fee, agreement_start, agreement_renewal, renewal_notice_sent_on, lot_size_sqft, fee_billed_separately, unit_count, custom_fee, fee_discount, promo_discount, promo_start, promo_end, promo_note";

// Standard monthly fee before HST, mirroring public.standard_management_fee: the package's base fee
// (property + first unit) plus the additional-unit rate for each unit after the first.
// Returns null for packages with no list price (commercial, leasing only) or while rates load.
const BASE_FEE_KEY = { standard: "base_fee", maintenance: "base_fee_maintenance", protection: "base_fee_protection" };
export const FEE_RATE_KEYS = [...Object.values(BASE_FEE_KEY), "additional_unit"];

export function standardFee(rates, pkg, units) {
  const baseKey = BASE_FEE_KEY[pkg || "standard"];
  if (!rates || !baseKey || rates[baseKey] == null || rates.additional_unit == null) return null;
  const n = Math.max(1, parseInt(units, 10) || 1);
  return Number(rates[baseKey]) + Number(rates.additional_unit) * (n - 1);
}
export const PROPERTY_SELECT = `${PROPERTY_FIELDS}, owner:owners(id, name, entity_type, email, phone)`;
export const UNIT_FIELDS =
  "id, property_id, label, unit_type, beds, baths, market_rent, status, management_type, listing_id, notes";
export const TENANCY_FIELDS =
  "id, unit_id, status, start_date, start_date_estimated, end_date, move_out_date, rent, rent_due_day, last_month_deposit, key_deposit, payprop_reference, email_service_consent, application_id, notes, created_at";

export const RATE_CATEGORIES = {
  management: "Management",
  addon: "Add-ons",
  leasing: "Leasing",
  tax: "Tax",
  rent_control: "Rent control",
  maintenance: "Maintenance",
};

export const DEFAULT_HST_PERCENT = 13;

const plainNumber = (n) => Number(n).toLocaleString("en-CA", { maximumFractionDigits: 2 });

export function formatRate(amount, unit) {
  if (amount === null || amount === undefined) return "Not set";
  const n = Number(amount);
  switch (unit) {
    case "per_month":
      return `${money(n)} / month`;
    case "one_time":
      return `${money(n)} one-time`;
    case "per_job":
      return `${money(n)} per job`;
    case "months_of_rent":
      return `${plainNumber(n)} ${n === 1 ? "month" : "months"} of rent`;
    case "percent":
      return `${plainNumber(n)}%`;
    case "days":
      return `${plainNumber(n)} ${n === 1 ? "day" : "days"}`;
    case "months":
      return `${plainNumber(n)} ${n === 1 ? "month" : "months"}`;
    default:
      return plainNumber(n);
  }
}

export function feeWithHst(fee, hstPercent = DEFAULT_HST_PERCENT) {
  if (fee === null || fee === undefined) return "Not set";
  const total = Math.round(Number(fee) * (1 + Number(hstPercent) / 100) * 100) / 100;
  return `${money(fee)} + HST = ${money(total)}`;
}

const DAY = 24 * 60 * 60 * 1000;

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.round((Date.parse(dateStr + "T00:00:00Z") - Date.parse(todayISO() + "T00:00:00Z")) / DAY);
}

export function renewalBadge(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return { kind: "none", text: "Not set" };
  if (days < 0) return { kind: "lapsed", text: `Lapsed ${-days} ${days === -1 ? "day" : "days"} ago` };
  if (days === 0) return { kind: "soon", text: "Renews today" };
  if (days <= 60) return { kind: "soon", text: `Renews in ${days} ${days === 1 ? "day" : "days"}` };
  return { kind: "later", text: prettyDate(dateStr) };
}
export const TENANT_FIELDS = "id, tenancy_id, profile_id, full_name, email, phone, is_primary, created_at";

export function prettyDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
}

export function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

export const propertyTitle = (p) => (p ? [p.address, p.city].filter(Boolean).join(", ") : "");

export function bedsBaths(u) {
  const parts = [];
  if (u.beds !== null && u.beds !== undefined) parts.push(`${Number(u.beds)} bed`);
  if (u.baths !== null && u.baths !== undefined) parts.push(`${Number(u.baths)} bath`);
  return parts.join(" · ");
}

export const text = (v) => (v === null || v === undefined ? "" : String(v));
export const orNull = (v) => (String(v ?? "").trim() ? String(v).trim() : null);

export function checkDollars(value, label, { required = false } = {}) {
  const v = String(value ?? "").trim();
  const message = `Enter the ${label} in dollars, like 1850 or 533.33.`;
  if (!v) return required ? message : "";
  if (!/^\d+(\.\d{1,2})?$/.test(v) || (required && Number(v) <= 0)) return message;
  return "";
}

export const dollars = (v) => Math.round(Number(String(v).trim()) * 100) / 100;
export const dollarsOrNull = (v) => (String(v ?? "").trim() ? dollars(v) : null);

export function sortTenants(list) {
  return [...list].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || String(a.created_at).localeCompare(String(b.created_at))
  );
}

// The current tenancy is the active/notice one; otherwise an upcoming one.
export function currentTenancy(tenancies) {
  return (
    tenancies.find((t) => t.status === "active" || t.status === "notice") ||
    tenancies.find((t) => t.status === "upcoming") ||
    null
  );
}

export const ONE_CURRENT_MESSAGE =
  "This unit already has an active tenancy (or one with notice given). End that tenancy before starting a new one.";

// Creates the tenancy as "upcoming" first so a failed tenant insert can be rolled back
// without the database trigger changing the unit's status.
export async function createTenancy({ unitId, tenancy, tenants }) {
  const sb = getBrowserClient();
  const wantedStatus = tenancy.start_date <= todayISO() ? "active" : "upcoming";

  const created = await sb
    .from("tenancies")
    .insert({ ...tenancy, unit_id: unitId, status: "upcoming" })
    .select("id")
    .single();
  if (created.error) throw new Error("We couldn't create the tenancy. Check the fields and try again.");
  const tenancyId = created.data.id;

  const people = await sb.from("tenancy_tenants").insert(tenants.map((t) => ({ ...t, tenancy_id: tenancyId })));
  if (people.error) {
    await sb.from("tenancies").delete().eq("id", tenancyId);
    throw new Error("We couldn't save the tenants, so the tenancy wasn't created. Try again.");
  }

  if (wantedStatus === "active") {
    const activated = await sb.from("tenancies").update({ status: "active" }).eq("id", tenancyId).select("id");
    if (activated.error || !activated.data?.length) {
      await sb.from("tenancies").delete().eq("id", tenancyId);
      throw new Error(activated.error?.code === "23505" ? ONE_CURRENT_MESSAGE : "We couldn't start the tenancy. Try again.");
    }
  }
  return { id: tenancyId, status: wantedStatus };
}

export function validateTenancy(f) {
  if (!f.start_date) return "Add the start date.";
  if (f.end_date && f.end_date < f.start_date) return "The end date must be after the start date.";
  const rent = checkDollars(f.rent, "monthly rent", { required: true });
  if (rent) return rent;
  const day = Number(f.rent_due_day);
  if (!Number.isInteger(day) || day < 1 || day > 28) return "Rent due day must be a number from 1 to 28.";
  return checkDollars(f.last_month_deposit, "last month's rent deposit") || checkDollars(f.key_deposit, "key deposit");
}

export function tenancyRow(f) {
  return {
    start_date: f.start_date,
    start_date_estimated: Boolean(f.start_date_estimated),
    end_date: f.end_date || null,
    rent: dollars(f.rent),
    rent_due_day: Number(f.rent_due_day),
    last_month_deposit: dollarsOrNull(f.last_month_deposit),
    key_deposit: dollarsOrNull(f.key_deposit),
    payprop_reference: orNull(f.payprop_reference),
    email_service_consent: orNull(f.email_service_consent),
    notes: orNull(f.notes),
  };
}

export function tenancyForm(t) {
  return {
    start_date: text(t?.start_date),
    start_date_estimated: Boolean(t?.start_date_estimated),
    email_service_consent: text(t?.email_service_consent),
    end_date: text(t?.end_date),
    rent: text(t?.rent),
    rent_due_day: t ? text(t.rent_due_day) : "1",
    last_month_deposit: text(t?.last_month_deposit),
    key_deposit: text(t?.key_deposit),
    payprop_reference: text(t?.payprop_reference),
    notes: text(t?.notes),
  };
}

export function validateTenant(p) {
  if (!p.full_name.trim()) return "Add the tenant's full name.";
  if (p.email.trim() && !/^\S+@\S+\.\S+$/.test(p.email.trim())) return "Check the tenant's email address.";
  return "";
}
