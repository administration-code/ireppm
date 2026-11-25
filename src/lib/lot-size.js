import "server-only";
import parcels from "@/data/windsor-parcels.json";

// Lot size from the City of Windsor parcel data (open data, Oct 2025): [lot sq ft, frontage ft, depth ft].
// GET ?address=3882 Howard Ave  with  Authorization: Bearer <staff token>
const SUFFIXES = new Set(["AVE", "AVENUE", "ST", "STREET", "RD", "ROAD", "DR", "DRIVE", "CRES", "CRESCENT", "BLVD", "BOULEVARD", "CRT", "CT", "COURT", "LANE", "LN", "PL", "PLACE", "WAY", "TERR", "TER", "CIR", "PKWY", "E", "W", "N", "S", "EAST", "WEST", "NORTH", "SOUTH"]);

export function lookupLot(address) {
  const first = String(address || "").split(",")[0].toUpperCase().replace(/[.#]/g, " ").replace(/\s+/g, " ").trim();
  const m = first.match(/^(\d+(?:\s*-\s*\d+)?)\s+(.+)$/);
  if (!m) return null;
  const num = m[1].replace(/\s+/g, "");
  const words = m[2].split(" ").filter((w) => !/^(UNIT|APT|SUITE)$/.test(w));
  const tries = [];
  for (let end = words.length; end >= 1; end--) {
    const w = words.slice(0, end);
    tries.push(w.join(" "));
    if (!SUFFIXES.has(w[w.length - 1])) continue;
  }
  const nums = num.includes("-") ? [num, ...num.split("-")] : [num];
  for (const n of nums)
    for (const street of tries) {
      const hit = parcels[`${n} ${street}`];
      if (hit) return { key: `${n} ${street}`, lot: hit[0] || null, frontage: hit[1] || null, depth: hit[2] || null };
    }
  return null;
}

// Lawn and snow plan by lot size: under 4,500 sq ft $50/month; under 12,500 sq ft $75/month; larger: custom rate.
export const LAWN_TIERS = [
  { max: 4500, monthly: 50, label: "Lot under 4,500 sq ft" },
  { max: 12500, monthly: 75, label: "Lot under 12,500 sq ft" },
];
export function lawnSnowAdvice(lot) {
  if (!lot) return "Lot size not in the City's data: measure or check the survey.";
  if (lot < 4500) return "Under 4,500 sq ft: $50/month lawn & snow.";
  if (lot < 12500) return "Under 12,500 sq ft: $75/month lawn & snow.";
  return "12,500 sq ft or more: custom lawn & snow rate.";
}
