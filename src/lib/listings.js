import { getServerClient, supabaseConfigured } from "./supabase";
import { SAMPLE_LISTINGS } from "./sample-listings";

const FIELDS =
  "id, slug, address, unit, neighbourhood, city, property_type, beds, baths, sqft, rent, available_on, utilities, parking, laundry, description, features, photos, videos";

// Returns { listings, sample } — sample is true when the database isn't connected yet.
export async function getListings() {
  const db = getServerClient();
  if (!db) return { listings: SAMPLE_LISTINGS, sample: true };
  // Link-only vacancies (marketed on Facebook) don't show in the search. Falls back to the plain query if the
  // visibility column isn't there yet (migration 0085).
  let { data, error } = await db
    .from("listings")
    .select(`${FIELDS}, visibility`)
    .eq("status", "available")
    .order("available_on", { ascending: true, nullsFirst: true });
  if (error && /visibility/.test(error.message || "")) {
    ({ data, error } = await db.from("listings").select(FIELDS).eq("status", "available").order("available_on", { ascending: true, nullsFirst: true }));
  }
  if (!error) data = (data || []).filter((l) => l.visibility !== "link");
  if (error) {
    console.error("Could not load listings:", error.message);
    return { listings: [], sample: false, error: true };
  }
  return { listings: data || [], sample: false };
}

export async function getListing(slug) {
  const db = getServerClient();
  if (!db) {
    return { listing: SAMPLE_LISTINGS.find((l) => l.slug === slug) || null, sample: true };
  }
  let { data, error } = await db.from("listings").select(`${FIELDS}, visibility`).eq("slug", slug).eq("status", "available").maybeSingle();
  if (error && /visibility/.test(error.message || "")) ({ data, error } = await db.from("listings").select(FIELDS).eq("slug", slug).eq("status", "available").maybeSingle());
  if (error) console.error("Could not load listing:", error.message);
  return { listing: data || null, sample: false };
}

export { supabaseConfigured };
