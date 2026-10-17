import "server-only";

// Text messages through Twilio. Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM
// (the Twilio number, e.g. +15195550123). Without them, nothing is sent and callers fall back to email.
export const smsConfigured = () =>
  Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

export function toE164(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function sendSms(to, body) {
  const numbers = (Array.isArray(to) ? to : String(to || "").split(",")).map(toE164).filter(Boolean);
  if (!smsConfigured() || !numbers.length) return { sent: 0, skipped: true };
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  let sent = 0;
  for (const n of numbers) {
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: n, From: process.env.TWILIO_FROM, Body: String(body).slice(0, 640) }),
      });
      if (res.ok) sent += 1;
      else console.error("[sms] Twilio error:", res.status, await res.text().catch(() => ""));
    } catch (err) {
      console.error("[sms] send failed:", err?.message || err);
    }
  }
  return { sent };
}

// Chuck's mobile for showing requests (comma-separated for more than one).
export const showingsPhones = () => process.env.SHOWINGS_SMS || "";
