import { getBrowserClient } from "@/lib/supabase";

export async function loadDashboard() {
  const sb = getBrowserClient();
  const [{ data, error }, awaiting, early] = await Promise.all([
    sb.rpc("staff_dashboard"),
    sb.from("signature_requests").select("id", { count: "exact", head: true }).in("status", ["draft", "sent", "delivered"]),
    sb
      .from("n11_requests")
      .select("id, termination_date, tenancy:tenancies(unit:units(label, property:properties(address)))")
      .eq("status", "requested")
      .order("created_at", { ascending: true }),
  ]);
  if (error) throw error;
  return {
    ...(data || {}),
    awaiting_signatures: awaiting.count || 0,
    early_moveouts: early.data || [],
    recon_late: await loadReconLate(sb),
  };
}

function torontoToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

// Last month should be locked by the 15th; returns that month when it isn't.
async function loadReconLate(sb) {
  try {
    const { year, month, day } = torontoToday();
    if (day < 15) return null;
    const prev = month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, "0")}-01`;
    const [{ data: accounts, error: aErr }, { data: recons, error: rErr }] = await Promise.all([
      sb.from("bank_accounts").select("id, opening_date").eq("active", true),
      sb.from("reconciliations").select("account_id, status").eq("period", prev),
    ]);
    if (aErr || rErr) return null;
    const locked = new Set((recons || []).filter((r) => r.status === "locked").map((r) => r.account_id));
    const late = (accounts || []).filter((a) => a.opening_date && a.opening_date.slice(0, 7) <= prev.slice(0, 7) && !locked.has(a.id));
    return late.length ? { period: prev, count: late.length } : null;
  } catch {
    return null;
  }
}

export const num = (v) => Number(v || 0);

export function percent(part, whole) {
  const w = num(whole);
  if (!w) return 0;
  return Math.min(100, Math.round((num(part) / w) * 100));
}

export const place = (address, unit) => [address, unit].filter(Boolean).join(", ") || "Unknown address";

export function updatedText(at, now) {
  if (!at) return "";
  const mins = Math.floor((now - at) / 60000);
  if (mins < 1) return "Updated just now";
  if (mins === 1) return "Updated 1 minute ago";
  if (mins < 60) return `Updated ${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  return `Updated ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
