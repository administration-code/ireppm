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

export function lawnSnowAdvice(lot) {
  if (!lot) return "Lot size not in the City's data: measure or check the survey.";
  if (lot <= 4500) return "Standard lot (up to 4,500 sq ft): standard $50/month lawn & snow.";
  if (lot <= 10000) return "Over the 4,500 sq ft standard: keep at $50 or quote a custom price.";
  if (lot <= 20000) return "Large lot: custom lawn & snow quote (e.g. $75/month on a 1-year term).";
  return "Very large lot: custom lawn & snow quote (e.g. $125/month on a 1-year term).";
}

