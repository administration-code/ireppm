import "server-only";

// Lawn and snow: which properties have it in their contract, what's charged, and the last visits.
//   Included: the property has the Snow/Lawn add-on (or a Maintenance/Protection package, which includes it).
//   Not on a plan (à la carte): the landlord pays the per-visit rate for each visit.
export const INCLUDED_PACKAGES = ["maintenance", "protection"];

export async function lawnSnowBoard(sb, properties) {
  const ids = properties.map((p) => p.id);
  if (!ids.length) return { included: [], alaCarte: [], rates: { monthly: 50, visit: 75 } };
  const [{ data: props }, { data: addons }, { data: rates }, visitsRes] = await Promise.all([
    sb.from("properties").select("id, address, city, management_package").in("id", ids),
    sb.from("property_addons").select("property_id, addon_key, monthly_price, notes").in("addon_key", ["snow_lawn", "snow_lawn_visit"]).in("property_id", ids),
    sb.from("service_rates").select("key, amount").in("key", ["snow_lawn", "snow_lawn_visit"]),
    sb.from("service_visits").select("id, property_id, kind, visited_on, photos, note, created_at").in("property_id", ids).order("visited_on", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
  ]);
  const rate = (k, d) => Number((rates || []).find((r) => r.key === k)?.amount ?? d);
  const monthly = rate("snow_lawn", 50);
  const visit = rate("snow_lawn_visit", 75);
  // snow_lawn = on the monthly plan; snow_lawn_visit = a per-visit price set for this property (large lots).
  const addonBy = new Map((addons || []).filter((a) => a.addon_key === "snow_lawn").map((a) => [a.property_id, a]));
  const visitBy = new Map((addons || []).filter((a) => a.addon_key === "snow_lawn_visit").map((a) => [a.property_id, a]));
  const visits = visitsRes.error ? [] : visitsRes.data || [];
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
                label: addon.monthly_price != null && Number(addon.monthly_price) > monthly ? "Large lot" : "Lawn and snow plan",
              }
            : { amount: null, per: "month", label: "Included in the package" }
          : { amount: visitPrice, per: "visit", label: visitPrice > visit ? "Large lot, billed to the landlord per visit" : "Billed to the landlord per visit" },
        lastLawn: last("lawn") && { on: last("lawn").visited_on, photos: (last("lawn").photos || []).length },
        lastSnow: last("snow") && { on: last("snow").visited_on, photos: (last("snow").photos || []).length },
        recent: mine.slice(0, 5).map((v) => ({ id: v.id, kind: v.kind, on: v.visited_on, photos: (v.photos || []).length, note: v.note })),
      };
    })
    .sort((a, b) => a.address.localeCompare(b.address, "en", { numeric: true }));
  return { included: rows.filter((r) => r.included), alaCarte: rows.filter((r) => !r.included), rates: { monthly, visit }, ready: !visitsRes.error };
}
