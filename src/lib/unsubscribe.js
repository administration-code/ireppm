import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// CASL: every promotional email carries a one-click unsubscribe link. The link is signed, so
// nobody can unsubscribe someone else by guessing the address. Opt-outs live in email_optouts (0045).
const secret = () => process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const cleanEmail = (e) => String(e || "").trim().toLowerCase();

export function unsubscribeToken(email) {
  return createHmac("sha256", secret()).update(`unsubscribe:${cleanEmail(email)}`).digest("base64url").slice(0, 32);
}

export function validToken(email, token) {
  if (!secret() || !email || !token) return false;
  const a = Buffer.from(unsubscribeToken(email));
  const b = Buffer.from(String(token));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unsubscribeLink(siteUrl, email) {
  return `${siteUrl}/unsubscribe?e=${encodeURIComponent(cleanEmail(email))}&t=${unsubscribeToken(email)}`;
}

// Addresses (lower-case) in `list` that have unsubscribed, or null if the list can't be read
// (then promotional mail isn't sent at all, rather than risk mailing someone who opted out).
export async function optedOut(admin, list) {
  const emails = [...new Set(list.map(cleanEmail).filter(Boolean))];
  if (!emails.length) return new Set();
  const { data, error } = await admin.from("email_optouts").select("email").in("email", emails);
  if (error) {
    console.error("[unsubscribe] couldn't read opt-outs:", error.message);
    return null;
  }
  return new Set((data || []).map((r) => r.email));
}
