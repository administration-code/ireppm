// Structured listing details (migration 0032) and the plain-English text shown on the public page.

export const UTILITIES = ["Heat", "Hydro", "Water", "Gas", "Hot water tank", "Internet", "Air conditioning"];
const CORE = ["Heat", "Hydro", "Water"];

export const PARKING_OPTIONS = {
  included: "Included",
  assigned: "Assigned spot(s)",
  first_come: "First come, first served",
  street: "Street parking only",
  not_included: "Not included",
};

export const LAUNDRY_OPTIONS = {
  included: "Included",
  pay_per_use: "Pay per use",
  not_included: "Not included",
};

export const COMMON_FEATURES = [
  "Central air",
  "Dishwasher",
  "Microwave",
  "Gas stove",
  "Updated kitchen",
  "Hardwood floors",
  "Fenced yard",
  "Backyard",
  "Balcony",
  "Deck or patio",
  "Garage",
  "Storage",
  "Finished basement",
  "Separate entrance",
  "Fireplace",
  "Furnished",
  "Security cameras",
  "Smoke-free",
  "On a bus route",
  "Near the University of Windsor",
  "Near St. Clair College",
  "Near downtown",
  "Near shopping",
];

const list = (items) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export function utilitiesText(selected) {
  const sel = selected || [];
  if (sel.includes("none")) return "Not included: tenant pays all utilities";
  if (!sel.length) return "";
  const inc = UTILITIES.filter((u) => sel.includes(u)).map((u) => u.toLowerCase());
  const missing = CORE.filter((u) => !sel.includes(u)).map((u) => u.toLowerCase());
  if (!missing.length) return `All inclusive (${list(inc)})`;
  return `Included: ${list(inc)}. Tenant pays ${list(missing)}`;
}

export function parkingText(option, spots) {
  if (!option) return "";
  const n = Number(spots) || 0;
  const count = n ? ` (${n} spot${n === 1 ? "" : "s"})` : "";
  if (option === "included") return `Included${count}`;
  if (option === "assigned") return `Assigned${count}`;
  return PARKING_OPTIONS[option] || "";
}

export const laundryText = (option) => LAUNDRY_OPTIONS[option] || "";
