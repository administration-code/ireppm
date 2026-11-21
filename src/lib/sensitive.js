import "server-only";
import { randomBytes } from "node:crypto";

export const SENSITIVE_BUCKET = "applicant-docs";
// Applicant-uploaded document types that count as sensitive: landlords see them only on the secure page.
export const SENSITIVE_APPLICANT_TYPES = new Set(["photo_id", "bank_statement"]);
export const VIEW_MINUTES = 15;
export const WATERMARK = "For rental review only — IRep";

export async function staffName(sb, userId) {
  const { data } = await sb.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
  return data?.full_name || data?.email || "IRep staff";
}

export async function issueViewToken(sb, { applicationId = null, docType = null, sensitiveId = null, viewerId, viewerRole }) {
  const token = randomBytes(24).toString("base64url");
  const { error } = await sb.from("sensitive_view_tokens").insert({
    token,
    application_id: applicationId,
    doc_type: docType,
    sensitive_document_id: sensitiveId,
    viewer_id: viewerId,
    viewer_role: viewerRole,
    expires_at: new Date(Date.now() + VIEW_MINUTES * 60000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return token;
}

// The token's file (bucket path and type), or null if the link expired.
export async function resolveToken(sb, token) {
  if (!/^[\w-]{20,64}$/.test(String(token || ""))) return null;
  const { data: t } = await sb.from("sensitive_view_tokens").select("*").eq("token", token).maybeSingle();
  if (!t || new Date(t.expires_at) < new Date()) return null;
  if (t.sensitive_document_id) {
    const { data: d } = await sb.from("sensitive_documents").select("id, file_path, mime_type, label, application_id, tenancy_id").eq("id", t.sensitive_document_id).maybeSingle();
    return d ? { token: t, path: d.file_path, mime: d.mime_type, label: d.label, applicationId: d.application_id, tenancyId: d.tenancy_id, sensitiveId: d.id } : null;
  }
  const { data: app } = await sb.from("applications").select("id, documents").eq("id", t.application_id).maybeSingle();
  const doc = (app?.documents || []).find((x) => x.type === t.doc_type);
  if (!doc?.path) return null;
  const { data: meta } = await sb.from("applicant_documents").select("mime_type").eq("file_path", doc.path).maybeSingle();
  return { token: t, path: doc.path, mime: meta?.mime_type || guessMime(doc.path), label: doc.name || t.doc_type, applicationId: app.id, docType: t.doc_type };
}

export function guessMime(path) {
  const ext = String(path).split(".").pop().toLowerCase();
  return { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" }[ext] || "application/octet-stream";
}

export async function logView(sb, { applicationId = null, tenancyId = null, sensitiveId = null, docType = null, viewerId, viewerRole, request }) {
  const name = viewerId ? await staffName(sb, viewerId) : null;
  await sb.from("sensitive_doc_views").insert({
    application_id: applicationId,
    tenancy_id: tenancyId,
    sensitive_document_id: sensitiveId,
    doc_type: docType,
    viewer_id: viewerId,
    viewer_role: viewerRole,
    viewer_name: name,
    ip: request?.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() || null,
    user_agent: request?.headers?.get?.("user-agent")?.slice(0, 300) || null,
  });
}
