import { getBrowserClient } from "@/lib/supabase";
import { PACKAGES } from "@/lib/site";

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

export const PROPERTY_FIELDS =
  "id, address, city, postal_code, owner_name, owner_email, owner_phone, management_package, notes, archived";
export const UNIT_FIELDS = "id, property_id, label, unit_type, beds, baths, market_rent, status, listing_id, notes";
export const TENANCY_FIELDS =
  "id, unit_id, status, start_date, end_date, move_out_date, rent, rent_due_day, last_month_deposit, key_deposit, payprop_reference, application_id, notes, created_at";
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

export function wholeDollars(value, label, { required = false } = {}) {
  const v = String(value ?? "").trim();
  if (!v) return required ? `Enter the ${label} in whole dollars, like 1850.` : "";
  if (!/^\d+$/.test(v) || (required && Number(v) <= 0)) return `Enter the ${label} in whole dollars, like 1850.`;
  return "";
}

export const dollarsOrNull = (v) => (String(v ?? "").trim() ? parseInt(v, 10) : null);

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
  const rent = wholeDollars(f.rent, "monthly rent", { required: true });
  if (rent) return rent;
  const day = Number(f.rent_due_day);
  if (!Number.isInteger(day) || day < 1 || day > 28) return "Rent due day must be a number from 1 to 28.";
  return wholeDollars(f.last_month_deposit, "last month's rent deposit") || wholeDollars(f.key_deposit, "key deposit");
}

export function tenancyRow(f) {
  return {
    start_date: f.start_date,
    end_date: f.end_date || null,
    rent: parseInt(f.rent, 10),
    rent_due_day: Number(f.rent_due_day),
    last_month_deposit: dollarsOrNull(f.last_month_deposit),
    key_deposit: dollarsOrNull(f.key_deposit),
    payprop_reference: orNull(f.payprop_reference),
    notes: orNull(f.notes),
  };
}

export function tenancyForm(t) {
  return {
    start_date: text(t?.start_date),
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
