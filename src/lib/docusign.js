import "server-only";
import { createPrivateKey } from "node:crypto";
import { SignJWT } from "jose";
import { TEMPLATES } from "@/lib/docusign-templates";

// DocuSign eSignature REST client using JWT grant. Server routes only.

const SCOPES = "signature impersonation";
const env = (k) => (process.env[k] || "").trim();

export function isConfigured() {
  return ["DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_USER_ID", "DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_BASE_URI", "DOCUSIGN_OAUTH_BASE", "DOCUSIGN_PRIVATE_KEY"].every(
    (k) => env(k)
  );
}

const oauthHost = () => env("DOCUSIGN_OAUTH_BASE").replace(/^https?:\/\//, "").replace(/\/+$/, "");

function apiBase() {
  const base = env("DOCUSIGN_BASE_URI").replace(/\/+$/, "").replace(/\/restapi.*$/, "");
  return `${base}/restapi/v2.1/accounts/${env("DOCUSIGN_ACCOUNT_ID")}`;
}

export class DocuSignError extends Error {
  constructor(message, { status, code, consentRequired } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.consentRequired = Boolean(consentRequired);
  }
}

// URL an admin opens once to let the integration act for the DocuSign user.
export function consentUrl() {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env("DOCUSIGN_INTEGRATION_KEY"),
    redirect_uri: "https://ireppm.ca/api/docusign/callback",
  });
  return `https://${oauthHost()}/oauth/auth?${params}&scope=signature%20impersonation`;
}

let cached = { token: "", expires: 0 };

async function getToken() {
  if (!isConfigured()) throw new DocuSignError("DocuSign isn't set up yet.", { code: "not_configured" });
  if (cached.token && Date.now() < cached.expires - 60_000) return cached.token;

  const pem = env("DOCUSIGN_PRIVATE_KEY").replace(/\\n/g, "\n");
  const key = createPrivateKey(pem);
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPES })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(env("DOCUSIGN_INTEGRATION_KEY"))
    .setSubject(env("DOCUSIGN_USER_ID"))
    .setAudience(oauthHost())
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch(`https://${oauthHost()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const consentRequired = body.error === "consent_required";
    throw new DocuSignError(
      consentRequired
        ? "DocuSign needs one-time consent before it can send for IRep."
        : `DocuSign sign-in failed: ${body.error_description || body.error || res.status}`,
      { status: res.status, code: body.error, consentRequired }
    );
  }
  cached = { token: body.access_token, expires: Date.now() + (Number(body.expires_in) || 3600) * 1000 };
  return cached.token;
}

export async function ds(path, { method = "GET", body, binary = false } = {}) {
  const token = await getToken();
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: binary ? "application/pdf" : "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new DocuSignError(err.message || `DocuSign returned ${res.status}`, { status: res.status, code: err.errorCode });
  }
  if (binary) return Buffer.from(await res.arrayBuffer());
  if (res.status === 204) return {};
  return res.json().catch(() => ({}));
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
let templateCache = { at: 0, list: null };

async function listTemplates() {
  if (templateCache.list && Date.now() - templateCache.at < 5 * 60_000) return templateCache.list;
  const data = await ds("/templates?count=200&order_by=name");
  templateCache = { at: Date.now(), list: data.envelopeTemplates || [] };
  return templateCache.list;
}

export async function resolveTemplateId(key) {
  const t = TEMPLATES[key];
  if (!t) return null;
  if (env(t.env)) return env(t.env);
  const list = await listTemplates();
  const found = t.names.map((n) => list.find((x) => x.name === n)).find(Boolean);
  return found?.templateId || null;
}

export async function resolveTemplates(keys) {
  const entries = await Promise.all(keys.map(async (k) => [k, await resolveTemplateId(k)]));
  return Object.fromEntries(entries);
}

export async function templateStatus() {
  if (!isConfigured()) return { connected: false, reason: "not_configured", templates: {} };
  try {
    const ids = await resolveTemplates(Object.keys(TEMPLATES));
    return { connected: true, templates: Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, Boolean(v)])) };
  } catch (err) {
    return { connected: false, reason: err.consentRequired ? "consent_required" : "error", message: err.message, templates: {} };
  }
}

export async function templateRecipients(templateId) {
  return ds(`/templates/${templateId}/recipients?include_tabs=true`);
}

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------
export const createEnvelope = (definition) => ds("/envelopes", { method: "POST", body: definition });
export const getEnvelope = (id) => ds(`/envelopes/${id}`);
export const getRecipients = (id, includeTabs = false) =>
  ds(`/envelopes/${id}/recipients${includeTabs ? "?include_tabs=true" : ""}`);
export const getDocument = (id, which) => ds(`/envelopes/${id}/documents/${which}`, { binary: true });

// Template roles we didn't fill (unused tenant slots, no guarantor) stay on a draft envelope as
// blank placeholders, and DocuSign then refuses to send ("missing valid contact information").
export async function removeEmptyRecipients(id) {
  const data = await getRecipients(id);
  const groups = ["signers", "carbonCopies", "certifiedDeliveries", "agents", "editors", "intermediaries", "inPersonSigners"];
  const body = {};
  for (const g of groups) {
    const empty = (data?.[g] || []).filter((r) => !String(r.email || "").trim()).map((r) => ({ recipientId: r.recipientId }));
    if (empty.length) body[g] = empty;
  }
  if (Object.keys(body).length) await ds(`/envelopes/${id}/recipients`, { method: "DELETE", body });
  return body;
}

export const sendDraftEnvelope = (id) => ds(`/envelopes/${id}`, { method: "PUT", body: { status: "sent" } });

export async function senderViewUrl(id, returnUrl) {
  const data = await ds(`/envelopes/${id}/views/sender`, { method: "POST", body: { returnUrl } });
  return data.url;
}

export async function consoleViewUrl(id, returnUrl) {
  const data = await ds("/views/console", { method: "POST", body: { envelopeId: id, returnUrl } });
  return data.url;
}

export async function resendEnvelope(id) {
  const recipients = await getRecipients(id);
  return ds(`/envelopes/${id}/recipients?resend_envelope=true`, { method: "PUT", body: recipients });
}

export const voidEnvelope = (id, reason) =>
  ds(`/envelopes/${id}`, { method: "PUT", body: { status: "voided", voidedReason: reason || "Voided by IRep staff" } });

// Flatten DocuSign's recipient groups into the summary stored on signature_requests.
export function summarizeRecipients(data) {
  const groups = ["signers", "carbonCopies", "certifiedDeliveries", "agents", "editors", "intermediaries", "inPersonSigners"];
  return groups
    .flatMap((g) => data?.[g] || [])
    .map((r) => ({
      recipient_id: r.recipientId,
      role: r.roleName || "",
      name: r.name || r.signerName || "",
      email: r.email || "",
      routing_order: Number(r.routingOrder) || null,
      status: r.status || "",
      signed_at: r.signedDateTime || null,
      delivered_at: r.deliveredDateTime || null,
      declined_reason: r.declinedReason || null,
    }))
    .sort((a, b) => (a.routing_order || 0) - (b.routing_order || 0));
}
