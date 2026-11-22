import "server-only";
import { SITE } from "@/lib/site";

// Vacancies a partner (Chuck) starts from the Agent Portal (0085). Only units at properties where the partner
// does showings. Server only: uses the admin client.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = ["Apartment", "House", "Townhouse", "Room"];
export const UTILITY_CHOICES = {
  all: { label: "All utilities included", value: ["Heat", "Hydro", "Water"], text: "All utilities included" },
  water: { label: "Water included, tenant pays hydro and gas", value: ["Water"], text: "Water included; tenant pays hydro and gas" },
  none: { label: "Tenant pays all utilities", value: ["none"], text: "Tenant pays all utilities" },
};
const slugify = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
const longDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric" });

async function showingProperties(sb, partnerId) {
  const { data } = await sb.from("property_agents").select("property_id").eq("partner_id", partnerId).eq("role", "showings");
  return [...new Set((data || []).map((r) => r.property_id))];
}

export function postText(l) {
  const where = [l.address, l.unit].filter(Boolean).join(", ");
  const kind = l.property_type === "Room" ? "Room for rent" : `${l.beds} bed, ${l.baths} bath ${String(l.property_type).toLowerCase()} for rent`;
  return [
    `${kind} at ${where}, ${l.city || "Windsor"}`,
    `$${Number(l.rent).toLocaleString("en-CA")}/month${l.utilities ? ` · ${l.utilities}` : ""}`,
    l.available_on ? `Available ${longDate(l.available_on)}` : "Available now",
    l.description ? `\n${l.description}` : "",
    `\nApply online: ${SITE.url}/properties/${l.slug}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// Units Chuck can start a vacancy for, and his open vacancies.
export async function vacancyBoard(sb, partnerId) {
  const ids = await showingProperties(sb, partnerId);
  if (!ids.length) return { units: [], vacancies: [] };
  const { data: props } = await sb
    .from("properties")
    .select("id, address, city, archived, units(id, label, listing_id, tenancies(status, move_out_date, end_date))")
    .in("id", ids)
    .eq("archived", false)
    .order("address");
  const units = [];
  const listingIds = [];
  for (const p of props || []) {
    for (const u of p.units || []) {
      if (u.label === "Whole property" || /^Other \(/.test(u.label || "")) continue;
      const current = (u.tenancies || []).find((t) => ["active", "notice"].includes(t.status));
      units.push({
        id: u.id,
        place: [p.address, u.label].filter(Boolean).join(", "),
        state: !current ? "vacant" : current.status === "notice" ? `moving out ${current.move_out_date || current.end_date || ""}`.trim() : "rented",
        listing_id: u.listing_id,
      });
      if (u.listing_id) listingIds.push(u.listing_id);
    }
  }
  let vacancies = [];
  if (listingIds.length) {
    const { data: ls } = await sb
      .from("listings")
      .select("id, slug, address, unit, city, property_type, beds, baths, rent, available_on, utilities, description, status, visibility, created_at")
      .in("id", listingIds)
      .eq("status", "available");
    const live = ls || [];
    const [{ data: apps }, { data: shows }] = await Promise.all([
      live.length ? sb.from("applications").select("listing_id, status").in("listing_id", live.map((l) => l.id)) : { data: [] },
      live.length ? sb.from("showing_requests").select("listing_id, status").in("listing_id", live.map((l) => l.id)) : { data: [] },
    ]);
    vacancies = live.map((l) => ({
      ...l,
      unit_id: units.find((u) => u.listing_id === l.id)?.id || null,
      link: `${SITE.url}/properties/${l.slug}`,
      post: postText(l),
      applications: (apps || []).filter((a) => a.listing_id === l.id && !["withdrawn"].includes(a.status)).length,
      showings: (shows || []).filter((s) => s.listing_id === l.id && ["requested", "rescheduled", "confirmed"].includes(s.status)).length,
    }));
  }
  const liveIds = new Set(vacancies.map((v) => v.id));
  return { units: units.map((u) => ({ ...u, hasVacancy: liveIds.has(u.listing_id) })), vacancies };
}

function checkInput(input) {
  const rent = Math.round(Number(input?.rent));
  if (!(rent >= 100 && rent <= 20000)) return { error: "Enter the monthly rent." };
  if (input?.available_on && !ISO.test(String(input.available_on))) return { error: "Choose the date it's available." };
  const type = TYPES.includes(input?.property_type) ? input.property_type : "Apartment";
  const beds = type === "Room" ? 1 : Number(input?.beds);
  const baths = Number(input?.baths);
  if (!(beds >= 0 && beds <= 10)) return { error: "Enter the number of bedrooms." };
  if (!(baths >= 0.5 && baths <= 10)) return { error: "Enter the number of bathrooms." };
  const util = UTILITY_CHOICES[input?.utilities] || null;
  return {
    row: {
      rent,
      available_on: input?.available_on || null,
      property_type: type,
      beds,
      baths,
      utilities: util?.text || null,
      utilities_included: util?.value || [],
      description: String(input?.description || "").trim().slice(0, 1500) || null,
      visibility: input?.visibility === "public" ? "public" : "link",
    },
  };
}

export async function startVacancy(sb, partner, input) {
  const board = await vacancyBoard(sb, partner.id);
  const unit = board.units.find((u) => u.id === input?.unit_id);
  if (!unit) return { error: "Choose the unit." };
  if (unit.hasVacancy) return { error: "That unit already has a vacancy up. Change it below instead." };
  const checked = checkInput(input);
  if (checked.error) return checked;
  const { data: u } = await sb.from("units").select("id, label, property:properties(address, city)").eq("id", unit.id).single();
  const row = {
    ...checked.row,
    address: u.property.address,
    unit: u.label && !/^(main|whole home)$/i.test(u.label) ? u.label : null,
    city: u.property.city || "Windsor",
    status: "available",
    created_by_partner: partner.id,
  };
  const base = slugify([row.address, row.unit].filter(Boolean).join(" ")) || "rental";
  let res = await sb.from("listings").insert({ ...row, slug: base }).select("id, slug").single();
  if (res.error?.code === "23505") res = await sb.from("listings").insert({ ...row, slug: `${base}-${Math.random().toString(36).slice(2, 6)}` }).select("id, slug").single();
  if (res.error) {
    console.error("[vacancies] create failed:", res.error.message);
    return { error: "That didn't save. Try again, or tell Rosie." };
  }
  await sb.from("units").update({ listing_id: res.data.id }).eq("id", unit.id);
  return { ok: true, id: res.data.id, link: `${SITE.url}/properties/${res.data.slug}` };
}

async function ownVacancy(sb, partner, id) {
  const board = await vacancyBoard(sb, partner.id);
  return board.vacancies.find((v) => v.id === id) || null;
}

export async function updateVacancy(sb, partner, input) {
  const v = await ownVacancy(sb, partner, String(input?.id || ""));
  if (!v) return { error: "That vacancy wasn't found." };
  const checked = checkInput(input);
  if (checked.error) return checked;
  const { error } = await sb.from("listings").update(checked.row).eq("id", v.id);
  return error ? { error: "That didn't save. Try again." } : { ok: true };
}

// Take it down: rented, or no longer available. Applications already in stay with IRep.
export async function closeVacancy(sb, partner, input) {
  const v = await ownVacancy(sb, partner, String(input?.id || ""));
  if (!v) return { error: "That vacancy wasn't found." };
  const { error } = await sb.from("listings").update({ status: input?.rented ? "leased" : "archived" }).eq("id", v.id);
  return error ? { error: "That didn't save. Try again." } : { ok: true };
}
