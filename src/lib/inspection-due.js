import "server-only";

// Inspections are twice a year, in two seasons:
//   pre-winter  Oct 1 – Nov 30   (the first round, fall 2026, runs to Dec 31, 2026)
//   post-winter Mar 1 – Apr 30
// A property is done for a season once it has an inspection dated inside that season.
export const SEASONS = [
  { key: "spring", name: "Post-winter", from: "03-01", to: "04-30" },
  { key: "fall", name: "Pre-winter", from: "10-01", to: "11-30" },
];
const FIRST_ROUND_END = "2026-12-31";
export const DUE_SOON_DAYS = 14;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

function windowsAround(t) {
  const y = Number(t.slice(0, 4));
  const list = [];
  for (const yr of [y - 1, y, y + 1])
    for (const s of SEASONS) {
      let end = `${yr}-${s.to}`;
      if (s.key === "fall" && yr === 2026) end = FIRST_ROUND_END;
      list.push({ key: s.key, name: s.name, start: `${yr}-${s.from}`, end, year: yr });
    }
  return list.sort((a, b) => a.start.localeCompare(b.start));
}

// The season that applies today: the one we're in, else the last one that ended (and the next one).
export function currentSeason(t = today()) {
  const w = windowsAround(t);
  const inNow = w.find((x) => x.start <= t && t <= x.end) || null;
  const lastEnded = [...w].reverse().find((x) => x.end < t) || null;
  const next = w.find((x) => x.start > t) || null;
  return { inNow, lastEnded, next };
}
export const seasonLabel = (w) => (w ? `${w.name} ${w.year}` : "");

// For each property: last inspection, the season it's due in, any scheduled visit, and how urgent.
// state: "overdue" (last season ended without one) | "soon" (in season, ending within 14 days) |
//        "due" (in season, not done yet) | "done" (done for this season) | "ok" (between seasons, last one done).
export async function inspectionsDue(sb, properties) {
  const ids = properties.map((p) => p.id);
  if (!ids.length) return [];
  const [{ data }, visitsRes] = await Promise.all([
    sb.from("inspection_reports").select("property_id, inspected_on").in("property_id", ids).in("status", ["submitted", "sent", "closed"]).order("inspected_on", { ascending: false }).limit(2000),
    sb.from("inspection_visits").select("id, property_id, scheduled_at, notice_sent_at, notice_count, notified").in("property_id", ids).eq("status", "scheduled").order("scheduled_at"),
  ]);
  const visits = visitsRes.error ? [] : visitsRes.data || [];
  const reports = data || [];
  const t = today();
  const { inNow, lastEnded, next } = currentSeason(t);
  const rank = { overdue: 0, soon: 1, due: 2, done: 3, ok: 4 };
  return properties
    .map((p) => {
      const mine = reports.filter((r) => r.property_id === p.id);
      const last = mine[0]?.inspected_on || null;
      const doneIn = (w) => w && mine.some((r) => r.inspected_on >= w.start && r.inspected_on <= w.end);
      let state, season, due, inDays;
      if (inNow) {
        season = inNow;
        due = inNow.end;
        inDays = daysBetween(t, due);
        state = doneIn(inNow) ? "done" : inDays <= DUE_SOON_DAYS ? "soon" : "due";
      } else if (lastEnded && !doneIn(lastEnded)) {
        season = lastEnded;
        due = lastEnded.end;
        inDays = daysBetween(t, due);
        state = "overdue";
      } else {
        season = next;
        due = next?.end || null;
        inDays = due ? daysBetween(t, due) : null;
        state = "ok";
      }
      const visit = visits.find((v) => v.property_id === p.id) || null;
      return {
        id: p.id,
        address: p.address,
        last,
        due,
        inDays,
        state,
        season: seasonLabel(season),
        window: season ? { start: season.start, end: season.end } : null,
        next: next ? { label: seasonLabel(next), start: next.start, end: next.end } : null,
        visit: visit && { id: visit.id, at: visit.scheduled_at, noticeSent: visit.notice_sent_at, notified: (visit.notified || []).length },
      };
    })
    .sort((a, b) => rank[a.state] - rank[b.state] || String(a.visit?.at || "~").localeCompare(String(b.visit?.at || "~")) || a.address.localeCompare(b.address, "en", { numeric: true }));
}

// "Needs doing" = not done this season (or last season missed).
export const needsInspection = (x) => ["overdue", "soon", "due"].includes(x.state);

// The vendor's managed properties (inspections are only for those).
export async function managedOf(sb, properties) {
  if (!properties.length) return [];
  const { data } = await sb.from("units").select("property_id").in("property_id", properties.map((p) => p.id)).eq("management_type", "managed");
  const ok = new Set((data || []).map((u) => u.property_id));
  return properties.filter((p) => ok.has(p.id));
}

// Pay for one inspection, added to the contractor's ledger once per report.
export async function recordInspectionPay(sb, partnerId, reportId, { address, inspectedOn, propertyId = null }) {
  // Practice inspections (1 Practice St) aren't paid.
  if (propertyId) {
    const { data: prop } = await sb.from("properties").select("is_practice").eq("id", propertyId).maybeSingle();
    if (prop?.is_practice) return { skipped: "practice" };
  }
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
    property_id: propertyId,
    inspection_report_id: reportId,
  });
  return error ? { error: error.message } : { amount, hst };
}
