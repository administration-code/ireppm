// Inspection reports: property checks, each unit's appliances, and recommended improvements
// that the landlord approves or declines line by line (migration 0058).

export const CONDITION = { fair: "Fair", needs_replacement: "Needs replacement", none: "Not there" };
export const GUTTER = { fair: "Fair", needs_replacement: "Needs replacement", none: "No gutters" };
export const ROOF = { fair: "Fair", needs_repair: "Needs repair", not_checked: "Couldn't check" };
// Property-level parts that can have photos (0089).
export const PHOTO_PARTS = [
  ["furnace", "Furnace"],
  ["water_valve", "Water shut-off"],
  ["gutters", "Gutters"],
  ["roof", "Roof"],
  ["pests", "Pests"],
  ["exterior", "Outside and yard"],
  ["notes", "Other"],
];
export const APPLIANCES = [
  ["stove", "Stove"],
  ["fridge", "Fridge"],
  ["washer", "Washer"],
  ["dryer", "Dryer"],
];
export const DECISION = { pending: "Waiting for landlord", approved: "Approved", declined: "Declined" };
export const REPORT_STATUS = { draft: "Being written", submitted: "Ready to review", sent: "Sent to landlord", closed: "Closed" };

// Quotes on the inspection (0090): Chuck prices each repair and improvement; the landlord approves each one.
export const HST_PERCENT = 13;
// On every inspection notice and report: what this inspection is (and isn't).
export const INSPECTION_DISCLAIMER =
  "Please note: this is a general walk-through for IRep Property Management's records and reporting only. It is not a professional home, building or safety inspection.";
export const QUOTE_CONTACT = { name: "Chuck", email: "chuck@ireppm.ca" };
export const QUOTE_DISCLAIMER =
  "The amounts above are good-faith estimates based on a visual inspection of accessible areas on the date of this report. " +
  "They are not a fixed quote or a guarantee of final cost. Final pricing may vary with labour time, materials and finishes selected, " +
  "site conditions, and any concealed or pre-existing deficiencies identified once work begins. No work will proceed without your " +
  "written approval, and any change to the approved estimate will be confirmed with you in writing before additional costs are incurred. " +
  "Approved work is completed by IRep Property Management's contractor and billed on a separate invoice; it is not deducted from rent " +
  "collected. All amounts are in Canadian dollars; HST is charged at 13%.";

// "850", "$1,200.50" → 850 / 1200.5; anything else → null.
export function priceValue(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 1000000 ? Math.round(n * 100) / 100 : null;
}
export function quoteTotals(prices) {
  const cents = prices.map(priceValue).filter((n) => n !== null).reduce((a, n) => a + Math.round(n * 100), 0);
  const hst = Math.round((cents * HST_PERCENT) / 100);
  return { subtotal: cents / 100, hst: hst / 100, total: (cents + hst) / 100, priced: prices.filter((p) => priceValue(p) !== null).length };
}

const APPLIANCE_CATEGORY = "appliance";
// The checks marked as needing work become quote lines, ahead of the improvements.
// Returns [{ key, source: "check", description, unit_id, unit_label, photos, category }].
export function checkItems(form) {
  const out = [];
  const ph = form.photos || {};
  if (form.gutter_condition === "needs_replacement")
    out.push({ key: "gutters", description: "Gutters: replace", unit_id: "", photos: ph.gutters || [], category: "roof_structure" });
  if (form.roof_condition === "needs_repair")
    out.push({ key: "roof", description: "Roof repair", unit_id: "", photos: ph.roof || [], category: "roof_structure" });
  if (form.pests === "yes")
    out.push({ key: "pests", description: "Pest control", unit_id: "", photos: ph.pests || [], category: "pests", note: form.pests_note || "" });
  for (const u of form.units || []) {
    for (const [k, l] of APPLIANCES) {
      if (u[k] === "needs_replacement")
        out.push({
          key: `unit:${u.unit_id}:${k}`,
          description: `${l}: replace`,
          unit_id: u.unit_id,
          unit_label: u.label,
          photos: u.photos?.[k] || [],
          category: APPLIANCE_CATEGORY,
        });
    }
  }
  return out.map((i) => ({ ...i, source: "check" }));
}

// Maintenance category for an approved line.
export function itemCategory(item) {
  const k = String(item?.source_key || "");
  if (k === "gutters" || k === "roof") return "roof_structure";
  if (k === "pests") return "pests";
  if (k.startsWith("unit:")) return "appliance";
  return "other";
}

export const SUGGESTIONS = [
  "Kitchen update",
  "Deep cleaning",
  "Light fixture replacement",
  "Washroom refresh",
  "Fresh paint",
  "Flooring replacement",
  "Caulking and grout",
  "New window coverings",
  "Smoke and CO alarm replacement",
  "Exterior cleanup",
];

export const yesNo = (v) => (v === true ? "Yes" : v === false ? "No" : "Not checked");

export const blankUnit = (unit) => ({ unit_id: unit.id, label: unit.label, stove: "", fridge: "", washer: "", dryer: "", notes: "", photos: {} });
export const blankItem = () => ({ key: Math.random().toString(36).slice(2), unit_id: "", description: "", details: "", photos: [] });

// Keeps only well-formed photo entries; with `prefix`, only files the person uploaded themselves.
const MAX_PER_PART = 12;
export function cleanPhotos(list, prefix = null) {
  return (Array.isArray(list) ? list : [])
    .filter((p) => typeof p?.path === "string" && p.path && !p.path.includes("..") && (!prefix || p.path.startsWith(prefix)))
    .slice(0, MAX_PER_PART)
    .map((p) => ({ path: p.path, name: String(p.name || "").slice(0, 120) }));
}
export function cleanPhotoMap(map, keys, prefix = null) {
  const out = {};
  for (const k of keys) {
    const list = cleanPhotos(map?.[k], prefix);
    if (list.length) out[k] = list;
  }
  return out;
}
const UNIT_PHOTO_KEYS = ["stove", "fridge", "washer", "dryer", "notes"];

const bool = (v) => (v === "yes" ? true : v === "no" ? false : null);
const cond = (v) => (CONDITION[v] ? v : null);
const text = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

// Check the form; returns an error message or "".
export function reportProblem(form) {
  if (!form.property_id) return "Choose the property.";
  if (!form.inspected_on) return "Add the inspection date.";
  for (const i of form.items || []) {
    if (!i.description.trim() && i.details.trim()) return "Every improvement needs a short name, like “Deep cleaning”.";
  }
  return "";
}

// Saves a report with its units and improvement items using the given Supabase client
// (staff client in the browser, or the server's admin client for vendors). Returns the report id.
export async function saveReport(sb, form, { partnerId = null, inspectedBy = null, createdBy = null, allowedUnitIds = null, photoPrefix = null } = {}) {
  const extra = {
    photos: cleanPhotoMap(form.photos, PHOTO_PARTS.map(([k]) => k), photoPrefix),
    roof_condition: ROOF[form.roof_condition] ? form.roof_condition : null,
  };
  const base = {
      property_id: form.property_id,
      inspected_on: form.inspected_on,
      partner_id: partnerId,
      inspected_by: text(inspectedBy, 120),
      furnace_filter_swapped: bool(form.furnace_filter_swapped),
      water_valve_set: bool(form.water_valve_set),
      gutter_condition: GUTTER[form.gutter_condition] ? form.gutter_condition : null,
      pests: bool(form.pests),
      pests_note: text(form.pests_note, 1000),
      notes: text(form.notes, 4000),
      created_by: createdBy,
  };
  // Before migration 0089 the photo and roof columns aren't there: save without them.
  let { data: report, error } = await sb.from("inspection_reports").insert({ ...base, ...extra }).select("id").single();
  const hasPhotos = !(error && /photos|roof_condition/.test(error.message || ""));
  if (!hasPhotos) ({ data: report, error } = await sb.from("inspection_reports").insert(base).select("id").single());
  if (error) throw new Error("The report didn't save. Try again.");

  const ok = (unitId) => !allowedUnitIds || allowedUnitIds.includes(unitId);
  const units = (form.units || [])
    .filter((u) => ok(u.unit_id))
    .map((u) => ({
      report_id: report.id,
      unit_id: u.unit_id,
      stove: cond(u.stove),
      fridge: cond(u.fridge),
      washer: cond(u.washer),
      dryer: cond(u.dryer),
      notes: text(u.notes, 2000),
      ...(hasPhotos ? { photos: cleanPhotoMap(u.photos, UNIT_PHOTO_KEYS, photoPrefix) } : {}),
    }));
  const prices = form.prices || {};
  const checkDetails = form.check_details || {};
  const checks = checkItems(form).map((c) => ({
    unit_id: c.unit_id && ok(c.unit_id) ? c.unit_id : null,
    description: c.description,
    details: text(checkDetails[c.key], 2000) || text(c.note, 2000),
    price: priceValue(prices[c.key]),
    photos: c.photos,
    source: "check",
    source_key: c.key,
  }));
  const improvements = (form.items || [])
    .filter((i) => i.description.trim())
    .map((i) => ({
      unit_id: i.unit_id && ok(i.unit_id) ? i.unit_id : null,
      description: i.description.trim().slice(0, 200),
      details: text(i.details, 2000),
      price: priceValue(prices[i.key]),
      photos: i.photos,
      source: "improvement",
      source_key: null,
    }));
  let items = [...checks, ...improvements].map((i, n) => ({
    report_id: report.id,
    property_id: form.property_id,
    unit_id: i.unit_id,
    sort: n,
    description: i.description,
    details: i.details,
    added_by: text(inspectedBy, 120),
    price: i.price,
    ...(hasPhotos ? { photos: cleanPhotos(i.photos, photoPrefix) } : {}),
    source: i.source,
    source_key: i.source_key,
  }));
  const u = units.length ? await sb.from("inspection_report_units").insert(units) : { error: null };
  let it = items.length ? await sb.from("improvement_items").insert(items) : { error: null };
  // Before migration 0090 there's no source column: save without it (check lines still save as items).
  if (it.error && /source/.test(it.error.message || "")) {
    items = items.map(({ source, source_key, ...rest }) => rest);
    it = await sb.from("improvement_items").insert(items);
  }
  if (u.error || it.error) {
    await sb.from("inspection_reports").delete().eq("id", report.id);
    throw new Error("The report didn't save. Try again.");
  }
  return report.id;
}

export const REPORT_SELECT = `*,
  property:properties(id, address, city, postal_code, owner:owners(id, name, email)),
  partner:partners(name, company, email),
  units:inspection_report_units(*, unit:units(label)),
  items:improvement_items(*, unit:units(label))`;

// Loads one report with everything needed to show it (works with the staff or admin client).
export async function loadReport(sb, id) {
  const { data, error } = await sb.from("inspection_reports").select(REPORT_SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  data.units = (data.units || []).sort((a, b) =>
    String(a.unit?.label).localeCompare(String(b.unit?.label), "en-CA", { numeric: true })
  );
  data.items = (data.items || []).sort((a, b) => a.sort - b.sort || String(a.created_at).localeCompare(String(b.created_at)));
  return data;
}

export const ownerReportUrl = (id) => `https://ireppm.ca/owner/improvements/${encodeURIComponent(id)}`;

// Every photo path in a report (for making viewing links in one go).
export function reportPhotoPaths(r) {
  const paths = [];
  const add = (list) => (Array.isArray(list) ? list : []).forEach((p) => p?.path && paths.push(p.path));
  Object.values(r?.photos || {}).forEach(add);
  (r?.units || []).forEach((u) => Object.values(u?.photos || {}).forEach(add));
  (r?.items || []).forEach((i) => add(i?.photos));
  return [...new Set(paths)];
}

// Drafts (0090): the unfinished form, saved as the vendor goes. Photos are already uploaded ({ path, name }).
export function draftForm(form) {
  const keep = { ...form };
  const json = JSON.stringify(keep);
  if (json.length > 400000) throw new Error("This report is too big to save. Try removing some photos.");
  return JSON.parse(json);
}
