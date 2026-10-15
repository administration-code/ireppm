import { getBrowserClient } from "@/lib/supabase";

export async function loadDashboard() {
  const { data, error } = await getBrowserClient().rpc("staff_dashboard");
  if (error) throw error;
  return data || {};
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
