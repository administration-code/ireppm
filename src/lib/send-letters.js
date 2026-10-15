import { getBrowserClient } from "@/lib/supabase";

// Calls /api/letters/send with the signed-in staff member's token.
export async function sendLetters(ids) {
  const { data } = await getBrowserClient().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Your sign-in has expired. Sign in again and retry.");
  const res = await fetch("/api/letters/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ids }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The letters didn't send. Try again.");
  return body; // { sent: [{id, to}], skipped: [{id, reason}], failed: [{id}] }
}

export function sendSummary({ sent = [], skipped = [], failed = [] }) {
  const parts = [`Sent ${sent.length} ${sent.length === 1 ? "letter" : "letters"}.`];
  if (skipped.length) parts.push(`Skipped ${skipped.length}: ${skipped.map((s) => s.name || "owner").join(", ")} (${skipped[0].reason}).`);
  if (failed.length) parts.push(`${failed.length} didn't send — try again.`);
  return parts.join(" ");
}
