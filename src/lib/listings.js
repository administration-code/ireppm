import { getServerClient, supabaseConfigured } from "./supabase";
import { SAMPLE_LISTINGS } from "./sample-listings";

const FIELDS =
  "id, slug, address, unit, neighbourhood, city, property_type, beds, baths, sqft, rent, available_on, utilities, parking, laundry, pets, description, features, photos";

// Returns { listings, sample } — sample is true when the database isn't connected yet.
export async function getListings() {
  const db = getServerClient();
  if (!db) return { listings: SAMPLE_LISTINGS, sample: true };
  const { data, error } = await db
    .from("listings")
    .select(FIELDS)
    .eq("status", "available")
    .order("available_on", { ascending: true, nullsFirst: true });
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
  const { data, error } = await db
    .from("listings")
    .select(FIELDS)
    .eq("slug", slug)
    .eq("status", "available")
    .maybeSingle();
  if (error) console.error("Could not load listing:", error.message);
  return { listing: data || null, sample: false };
}

export { supabaseConfigured };
