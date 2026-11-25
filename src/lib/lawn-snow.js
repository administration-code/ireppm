import "server-only";

// Lawn and snow: which properties have it in their contract, what's charged, and the last visits.
//   Included: the property has the Snow/Lawn add-on (or a Maintenance/Protection package, which includes it).
//   Not on a plan (à la carte): the landlord pays the per-visit rate for each visit.
export const INCLUDED_PACKAGES = ["maintenance", "protection"];
// Included properties: the lawn is cut at least every 40 days during lawn season. Snow is as needed:
// tenants call Chuck. Properties not on the plan: snow is the tenant's or landlord's job unless the
// city issues a notice; lawn and snow visits happen only when the landlord (or IRep) asks.
export const LAWN_MAX_DAYS = 40;
// Plan price by lot size: $50 under 4,500 sq ft, $75 under 12,500 sq ft, custom rate above.
export const tierLabel = (amount) =>
  amount === 50 ? "Lot under 4,500 sq ft" : amount === 75 ? "Lot under 12,500 sq ft" : "Custom rate (lot 12,500 sq ft or more)";
export const LAWN_SEASON = { from: "04-15", to: "10-31" };
export const SNOW_NOTE = {
  included: "Snow: as needed. Tenants call Chuck to arrange it.",
  alaCarte: "Snow: the tenant's or landlord's job, unless the city issues a notice. Only when the landlord asks.",
};
const torontoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// When the next cut is due at an included property (null outside lawn season).
export function lawnDue(lastCut, t = torontoToday()) {
  const y = t.slice(0, 4);
  const start = `${y}-${LAWN_SEASON.from}`;
  const end = `${y}-${LAWN_SEASON.to}`;
  if (t < start || t > end) return null;
  const from = lastCut && lastCut >= start ? lastCut : start;
  const due = addDays(from, LAWN_MAX_DAYS);
  const days = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${t}T12:00:00Z`)) / 86400000);
  return { due, days, overdue: days < 0 };
}

export async function lawnSnowBoard(sb, properties) {
  const ids = properties.map((p) => p.id);
  if (!ids.length) return { included: [], alaCarte: [], rates: { monthly: 50, visit: 75 } };
  const [{ data: props }, { data: addons }, { data: rates }, visitsRes] = await Promise.all([
    sb.from("properties").select("id, address, city, management_package").in("id", ids),
    sb.from("property_addons").select("property_id, addon_key, monthly_price, notes").in("addon_key", ["snow_lawn", "snow_lawn_visit"]).in("property_id", ids),
    sb.from("service_rates").select("key, amount").in("key", ["snow_lawn", "snow_lawn_visit"]),
    sb.from("service_visits").select("id, property_id, kind, visited_on, photos, note, created_at, charge_amount").in("property_id", ids).order("visited_on", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
  ]);
  const reqRes = await sb.from("lawn_snow_requests").select("id, property_id, kind, note, created_at").in("property_id", ids).eq("status", "open").order("created_at");
  const requests = reqRes.error ? [] : reqRes.data || [];
  const rate = (k, d) => Number((rates || []).find((r) => r.key === k)?.amount ?? d);
  const monthly = rate("snow_lawn", 50);
  const visit = rate("snow_lawn_visit", 75);
  // snow_lawn = on the monthly plan; snow_lawn_visit = a per-visit price set for this property (large lots).
  const addonBy = new Map((addons || []).filter((a) => a.addon_key === "snow_lawn").map((a) => [a.property_id, a]));
  const visitBy = new Map((addons || []).filter((a) => a.addon_key === "snow_lawn_visit").map((a) => [a.property_id, a]));
  let visits = visitsRes.error ? null : visitsRes.data || [];
  if (!visits) {
    const r = await sb.from("service_visits").select("id, property_id, kind, visited_on, photos, note, created_at").in("property_id", ids).order("visited_on", { ascending: false }).limit(1000);
    visits = r.data || [];
  }
  const rows = (props || [])
    .map((p) => {
      const mine = visits.filter((v) => v.property_id === p.id);
      const last = (k) => mine.find((v) => v.kind === k) || null;
      const addon = addonBy.get(p.id);
      const own = visitBy.get(p.id);
      const visitPrice = own?.monthly_price != null ? Number(own.monthly_price) : visit;
      const included = Boolean(addon) || INCLUDED_PACKAGES.includes(p.management_package);
      return {
        id: p.id,
        address: p.address,
        included,
        fee: included
          ? addon
            ? {
                amount: Number(addon.monthly_price ?? monthly),
                per: "month",
                label: tierLabel(Number(addon.monthly_price ?? monthly)),
              }
            : { amount: null, per: "month", label: "Included in the package" }
          : { amount: visitPrice, per: "visit", label: visitPrice > visit ? "Custom rate (larger lot), billed to the landlord per visit" : "Billed to the landlord per visit" },
        lastLawn: last("lawn") && { on: last("lawn").visited_on, photos: (last("lawn").photos || []).length },
        lastSnow: last("snow") && { on: last("snow").visited_on, photos: (last("snow").photos || []).length },
        requests: requests.filter((r) => r.property_id === p.id).map((r) => ({ id: r.id, kind: r.kind, note: r.note, on: r.created_at.slice(0, 10) })),
        lawnDue: included ? lawnDue(last("lawn")?.visited_on || null) : null,
        snowNote: included ? SNOW_NOTE.included : SNOW_NOTE.alaCarte,
        recent: mine.slice(0, 5).map((v) => ({ id: v.id, kind: v.kind, on: v.visited_on, photos: (v.photos || []).length, note: v.note })),
      };
    })
    .sort((a, b) => a.address.localeCompare(b.address, "en", { numeric: true }));
  return { included: rows.filter((r) => r.included), alaCarte: rows.filter((r) => !r.included), rates: { monthly, visit }, ready: true, canRequest: !reqRes.error };
}
