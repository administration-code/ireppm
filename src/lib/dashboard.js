import { getBrowserClient } from "@/lib/supabase";

export async function loadDashboard() {
  const sb = getBrowserClient();
  const [{ data, error }, awaiting] = await Promise.all([
    sb.rpc("staff_dashboard"),
    sb.from("signature_requests").select("id", { count: "exact", head: true }).in("status", ["draft", "sent", "delivered"]),
  ]);
  if (error) throw error;
  return { ...(data || {}), awaiting_signatures: awaiting.count || 0 };
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
