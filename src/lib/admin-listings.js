export const PHOTO_BUCKET = "listing-photos";
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_ACCEPT = PHOTO_TYPES.join(",");
export const MAX_PHOTO_MB = 10;

export const PROPERTY_TYPES = ["Apartment", "House", "Townhouse", "Room"];

export const STATUS_LABEL = {
  draft: "Draft",
  available: "Available",
  leased: "Leased",
  archived: "Archived",
};

export const STATUS_ORDER = { draft: 0, available: 1, leased: 2, archived: 3 };

export const SAVED_MESSAGE = {
  draft: "Saved as a draft. It's hidden from the website.",
  available: "Published. It will show on the website within a minute.",
  leased: "Marked as leased. It's no longer shown on the website.",
};

export const LISTING_FIELDS =
  "id, slug, address, unit, neighbourhood, city, property_type, beds, baths, sqft, rent, available_on, utilities, parking, laundry, description, features, photos, status, utilities_included, parking_option, parking_spots, parking_instructions, laundry_option";

export function slugify(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function photoPathFromUrl(url) {
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
  const i = String(url || "").indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}
