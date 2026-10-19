// Maintenance that isn't tied to one leased unit: shared areas and outside of the
// building ("whole property"), or someone living at the property who isn't on an
// IRep lease ("other"). Each is stored as a hidden helper unit on the property,
// created the first time it's needed. They're "leasing_only" and "offline" so
// they never count toward fees, occupancy or the owner portal.

import { currentTenancy } from "@/lib/admin-properties";

export const SPECIAL_UNITS = {
  whole: { label: "Whole property", option: "Whole property (shared areas & outside)" },
  other: { label: "Other (not an IRep lease)", option: "Other: lives here, not on an IRep lease" },
};

export const SPECIAL_VALUE = { whole: "__whole", other: "__other" };

const LABELS = Object.fromEntries(Object.entries(SPECIAL_UNITS).map(([k, v]) => [v.label, k]));

export function specialKind(unit) {
  return unit ? LABELS[unit.label] || null : null;
}

export const isSpecialUnit = (unit) => Boolean(specialKind(unit));

export const regularUnits = (units = []) =>
  units.filter((u) => !isSpecialUnit(u)).sort((a, b) => String(a.label).localeCompare(String(b.label), "en-CA", { numeric: true }));

// Returns the helper unit's id for this property, creating it if needed.
export async function ensureSpecialUnit(sb, propertyId, kind) {
  const label = SPECIAL_UNITS[kind].label;
  const found = await sb.from("units").select("id").eq("property_id", propertyId).eq("label", label).maybeSingle();
  if (found.data) return found.data.id;
  const made = await sb
    .from("units")
    .insert({
      property_id: propertyId,
      label,
      unit_type: "House",
      status: "offline",
      management_type: "leasing_only",
      notes: "Created automatically for maintenance that isn't tied to one leased unit.",
    })
    .select("id")
    .single();
  if (made.data) return made.data.id;
  // Someone else may have created it at the same moment.
  const again = await sb.from("units").select("id").eq("property_id", propertyId).eq("label", label).maybeSingle();
  if (again.data) return again.data.id;
  throw made.error || new Error("Could not create the helper unit.");
}

// Current tenants across the given properties (with units → tenancies → tenancy_tenants).
export function currentTenants(properties = []) {
  const out = [];
  for (const p of properties) {
    for (const u of p.units || []) {
      if (isSpecialUnit(u)) continue;
      const t = currentTenancy(u.tenancies || []);
      if (!t) continue;
      for (const [i, person] of (t.tenancy_tenants || []).entries()) {
        out.push({
          key: `${t.id}-${i}`,
          name: person.full_name || "",
          email: person.email || "",
          phone: person.phone || "",
          primary: Boolean(person.is_primary),
          property_id: p.id,
          property: p,
          unit_id: u.id,
          unit_label: u.label,
          tenancy_id: t.id,
        });
      }
    }
  }
  return out.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

const digits = (s) => String(s || "").replace(/\D/g, "");

export function tenantMatches(t, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return false;
  const d = digits(q);
  if (d.length >= 3 && digits(t.phone).includes(d)) return true;
  return [t.name, t.email].some((v) => v.toLowerCase().includes(q));
}
