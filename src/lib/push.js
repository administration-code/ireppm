import "server-only";
import { createCipheriv, createECDH, createHmac, randomBytes } from "node:crypto";
import { importJWK, SignJWT } from "jose";

// Free phone notifications (Web Push, RFC 8030/8291/8292) with no outside service: the server encrypts each
// message for the phone and sends it to the phone's push service (Apple, Google or Mozilla) itself.
// Keys: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel (made on /admin/settings/push).

const SUBJECT = "mailto:administration@ireppm.ca";
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const fromB64u = (s) => Buffer.from(String(s || ""), "base64url");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

export const pushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const vapidPublicKey = () => (process.env.VAPID_PUBLIC_KEY || "").trim();

async function vapidHeader(endpoint) {
  const pub = fromB64u(vapidPublicKey());
  const key = await importJWK(
    { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: (process.env.VAPID_PRIVATE_KEY || "").trim() },
    "ES256"
  );
  const jwt = await new SignJWT({ sub: SUBJECT })
    .setProtectedHeader({ typ: "JWT", alg: "ES256" })
    .setAudience(new URL(endpoint).origin)
    .setExpirationTime("12h")
    .sign(key);
  return `vapid t=${jwt}, k=${vapidPublicKey()}`;
}

// aes128gcm content encoding (RFC 8291), one record.
function encrypt(sub, payload) {
  const uaPublic = fromB64u(sub.p256dh);
  const authSecret = fromB64u(sub.auth);
  const ecdh = createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const salt = randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

async function sendOne(sb, sub, message) {
  try {
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: { Authorization: await vapidHeader(sub.endpoint), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: message.urgent ? "high" : "normal" },
      body: encrypt(sub, JSON.stringify(message)),
    });
    if (res.status === 404 || res.status === 410) {
      await sb.from("push_subscriptions").delete().eq("id", sub.id); // that phone turned notifications off
      return false;
    }
    if (!res.ok) {
      await sb.from("push_subscriptions").update({ last_error: `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}` }).eq("id", sub.id);
      return false;
    }
    await sb.from("push_subscriptions").update({ last_sent_at: new Date().toISOString(), last_error: null }).eq("id", sub.id);
    return true;
  } catch (err) {
    console.error("[push] send failed:", err?.message || err);
    return false;
  }
}

// Sends { title, body, url } to every phone a partner (or user) turned notifications on for. Never throws.
export async function pushTo(sb, { partnerId, userId }, message) {
  if (!pushConfigured() || (!partnerId && !userId)) return { sent: 0 };
  try {
    let q = sb.from("push_subscriptions").select("id, endpoint, p256dh, auth");
    q = partnerId ? q.eq("partner_id", partnerId) : q.eq("user_id", userId);
    const { data } = await q;
    const msg = { title: String(message.title || "IRep").slice(0, 80), body: String(message.body || "").slice(0, 240), url: message.url || "/agent", urgent: Boolean(message.urgent), tag: message.tag || undefined };
    const results = await Promise.all((data || []).map((s) => sendOne(sb, s, msg)));
    return { sent: results.filter(Boolean).length };
  } catch (err) {
    console.error("[push] failed:", err?.message || err);
    return { sent: 0 };
  }
}

// Chuck's partner record, for notifications about his work.
export async function chuckPartnerId(sb) {
  const { DEFAULT_DELIVERER } = await import("@/lib/lease-defaults");
  const { data } = await sb.from("partners").select("id").ilike("email", DEFAULT_DELIVERER.email).limit(1);
  return data?.[0]?.id || null;
}
