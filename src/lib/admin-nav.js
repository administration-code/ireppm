import { getBrowserClient } from "@/lib/supabase";

export const COUNTS_EVENT = "staff-counts-refresh";

// Call after an action that changes a menu count (matching a payment, a status change, etc.).
export function refreshStaffCounts() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COUNTS_EVENT));
}

const head = { count: "exact", head: true };

export async function loadNavCounts() {
  const sb = getBrowserClient();
  if (!sb) return {};
  const queries = {
    showings: sb.from("showing_requests").select("id", head).eq("status", "requested"),
    applications: sb.from("applications").select("id", head).in("status", ["submitted", "reviewing"]),
    inquiries: sb.from("landlord_inquiries").select("id", head).eq("status", "new"),
    drafts: sb.from("listings").select("id", head).eq("status", "draft"),
    maintenanceNew: sb.from("maintenance_requests").select("id", head).eq("status", "new"),
    unmatchedPayments: sb.from("payments").select("id", head).eq("status", "unmatched"),
    openTurnovers: sb.from("turnovers").select("id", head).not("status", "in", "(leased,cancelled)"),
    awaitingSignatures: sb.from("signature_requests").select("id", head).in("status", ["draft", "sent", "delivered"]),
  };
  const keys = Object.keys(queries);
  const results = await Promise.all(Object.values(queries));
  return Object.fromEntries(keys.map((k, i) => [k, results[i].count || 0]));
}
