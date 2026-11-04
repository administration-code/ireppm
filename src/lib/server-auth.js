import "server-only";
import { mfaSatisfied } from "@/lib/staff-mfa";

// Who is calling an API route, from the "Authorization: Bearer <token>" header.
// `sb` is the server's admin client.

export async function userFromRequest(sb, request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  return error || !data?.user ? null : { user: data.user, token };
}

export async function staffFromRequest(sb, request) {
  const who = await userFromRequest(sb, request);
  if (!who || !mfaSatisfied(who.user, who.token)) return null;
  const { data: profile } = await sb.from("profiles").select("role").eq("id", who.user.id).maybeSingle();
  return profile && ["staff", "admin"].includes(profile.role) ? who.user : null;
}

// The partner (vendor or showing agent) whose email matches the signed-in account.
export async function partnerFromRequest(sb, request) {
  const who = await userFromRequest(sb, request);
  const email = String(who?.user?.email || "").trim().toLowerCase();
  if (!email) return null;
  const { data: partners } = await sb.from("partners").select("id, name, phone, email").eq("active", true).not("email", "is", null);
  const partner = (partners || []).find((p) => String(p.email).trim().toLowerCase() === email);
  return partner ? { ...partner, userId: who.user.id } : null;
}

// The owner record(s) linked to the signed-in account (owners.profile_id).
export async function ownerIdsFromRequest(sb, request) {
  const who = await userFromRequest(sb, request);
  if (!who) return [];
  const { data } = await sb.from("owners").select("id").eq("profile_id", who.user.id);
  return (data || []).map((o) => o.id);
}

// Properties a partner is assigned to, with their regular units.
export async function partnerProperties(sb, partnerId) {
  const { data: links } = await sb.from("property_agents").select("property_id").eq("partner_id", partnerId);
  const ids = [...new Set((links || []).map((l) => l.property_id))];
  if (!ids.length) return [];
  const { data } = await sb.from("properties").select("id, address, city, units(id, label)").in("id", ids).eq("archived", false).order("address");
  return (data || []).map((p) => ({
    id: p.id,
    address: p.address,
    city: p.city,
    units: (p.units || [])
      .filter((u) => u.label !== "Whole property" && !/^Other \(/.test(u.label))
      .map((u) => ({ id: u.id, label: u.label }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), "en-CA", { numeric: true })),
  }));
}
