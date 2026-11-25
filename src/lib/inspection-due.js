import "server-only";

// Inspections are twice a year: the next one is due 6 months after the last.
export const INSPECTION_MONTHS = 6;
export const DUE_SOON_DAYS = 30;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const addMonths = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

// For each property: the last finished inspection, when the next is due, and how urgent it is.
// state: "overdue" | "soon" (within 30 days) | "ok" | "never". Sorted most urgent first.
export async function inspectionsDue(sb, properties) {
  const ids = properties.map((p) => p.id);
  if (!ids.length) return [];
  const { data } = await sb
    .from("inspection_reports")
    .select("property_id, inspected_on")
    .in("property_id", ids)
    .in("status", ["submitted", "sent", "closed"])
    .order("inspected_on", { ascending: false })
    .limit(1000);
  const last = {};
  for (const r of data || []) if (!last[r.property_id]) last[r.property_id] = r.inspected_on;
  const t = today();
  const rank = { overdue: 0, never: 1, soon: 2, ok: 3 };
  return properties
    .map((p) => {
      const l = last[p.id] || null;
      const due = l ? addMonths(l, INSPECTION_MONTHS) : null;
      const inDays = due ? daysBetween(t, due) : null;
      const state = !l ? "never" : inDays < 0 ? "overdue" : inDays <= DUE_SOON_DAYS ? "soon" : "ok";
      return { id: p.id, address: p.address, last: l, due, inDays, state };
    })
    .sort((a, b) => rank[a.state] - rank[b.state] || String(a.due || "").localeCompare(String(b.due || "")) || a.address.localeCompare(b.address, "en", { numeric: true }));
}

// The vendor's managed properties (inspections are only for those).
export async function managedOf(sb, properties) {
  if (!properties.length) return [];
  const { data } = await sb.from("units").select("property_id").in("property_id", properties.map((p) => p.id)).eq("management_type", "managed");
  const ok = new Set((data || []).map((u) => u.property_id));
  return properties.filter((p) => ok.has(p.id));
}

// Pay for one inspection, added to the contractor's ledger once per report.
export async function recordInspectionPay(sb, partnerId, reportId, { address, inspectedOn }) {
  const { data: p } = await sb.from("partners").select("inspection_pay, charges_hst").eq("id", partnerId).maybeSingle();
  const amount = Number(p?.inspection_pay || 0);
  if (!(amount > 0)) return { skipped: true };
  const hst = p?.charges_hst ? Math.round(amount * 13) / 100 : 0;
  const { error } = await sb.from("partner_ledger").insert({
    partner_id: partnerId,
    kind: "inspection",
    entry_date: inspectedOn,
    amount,
    hst,
    notes: `Inspection: ${address}`,
    inspection_report_id: reportId,
  });
  return error ? { error: error.message } : { amount, hst };
}
