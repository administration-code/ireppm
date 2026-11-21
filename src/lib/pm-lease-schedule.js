import "server-only";
import { ds, getRecipients } from "@/lib/docusign";

// Schedule A, Part 5 of the management contract: one row per unit or room at the property, from the
// current tenancies (vacant units say so). Up to 12 rows, the number the contract has room for.
const MAX_ROWS = 12;
const day = (iso) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "";
const cad = (n) => `$${Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function pmLeaseRows(sb, propertyId) {
  if (!propertyId) return [];
  const { data: units } = await sb
    .from("units")
    .select("id, label, status, tenancies(id, status, start_date, end_date, rent, tenancy_tenants(full_name, is_primary))")
    .eq("property_id", propertyId);
  // IRep's format: one row per tenant, the unit repeated on each row, the same dates on every row of a
  // shared lease, and the rent on the first row only ("Incl. above" on the others).
  return (units || [])
    .filter((u) => u.status !== "offline")
    .sort((a, b) => String(a.label).localeCompare(String(b.label), "en", { numeric: true }))
    .flatMap((u) => {
      const t = (u.tenancies || []).find((x) => ["active", "notice"].includes(x.status));
      if (!t) return [[u.label, "Vacant", "", "", ""]];
      const names = [...(t.tenancy_tenants || [])]
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        .map((p) => p.full_name)
        .filter(Boolean);
      const start = day(t.start_date);
      const end = t.end_date ? day(t.end_date) : "Month to month";
      return (names.length ? names : ["Tenant"]).map((name, i) => [u.label, name, start, end, i === 0 ? cad(t.rent) : "Incl. above"]);
    })
    .slice(0, MAX_ROWS);
}

// Puts the rows into the draft's lease schedule fields (anchored to "/pmL{row}c{col}/"). The landlord
// can still correct them before signing.
export async function fillLeaseSchedule(envelopeId, rows) {
  if (!rows?.length) return 0;
  const env = await getRecipients(envelopeId, true);
  let filled = 0;
  for (const s of env.signers || []) {
    const tabs = (s.tabs?.textTabs || [])
      .map((t) => {
        const m = /^\/pmL(\d+)c(\d)\/$/.exec(String(t.anchorString || ""));
        const value = m ? rows[Number(m[1]) - 1]?.[Number(m[2]) - 1] : undefined;
        return value === undefined ? null : { tabId: t.tabId, value: String(value) };
      })
      .filter(Boolean);
    if (!tabs.length) continue;
    await ds(`/envelopes/${envelopeId}/recipients/${s.recipientId}/tabs`, { method: "PUT", body: { textTabs: tabs } });
    filled += tabs.length;
  }
  return filled;
}
