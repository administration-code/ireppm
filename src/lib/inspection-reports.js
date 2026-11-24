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
export const REPORT_STATUS = { submitted: "Ready to review", sent: "Sent to landlord", closed: "Closed" };

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
  const items = (form.items || [])
    .filter((i) => i.description.trim())
    .map((i, n) => ({
      report_id: report.id,
      property_id: form.property_id,
      unit_id: i.unit_id && ok(i.unit_id) ? i.unit_id : null,
      sort: n,
      description: i.description.trim().slice(0, 200),
      details: text(i.details, 2000),
      added_by: text(inspectedBy, 120),
      ...(hasPhotos ? { photos: cleanPhotos(i.photos, photoPrefix) } : {}),
    }));
  const [u, it] = await Promise.all([
    units.length ? sb.from("inspection_report_units").insert(units) : { error: null },
    items.length ? sb.from("improvement_items").insert(items) : { error: null },
  ]);
  if (u.error || it.error) {
    await sb.from("inspection_reports").delete().eq("id", report.id);
    throw new Error("The report didn't save. Try again.");
  }
  return report.id;
}

export const REPORT_SELECT = `*,
  property:properties(id, address, city, postal_code, owner:owners(id, name, email)),
  partner:partners(name, company),
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
