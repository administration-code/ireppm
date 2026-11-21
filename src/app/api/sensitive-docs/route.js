import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { logView, SENSITIVE_BUCKET, staffName } from "@/lib/sensitive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const TYPES = /^(image\/(jpeg|png|webp|heic)|application\/pdf)$/;
const KINDS = ["photo_id", "proof_of_income", "bank_statement", "other"];
const VIA = ["text", "whatsapp", "email", "in_person", "other"];
// Never keep ID or licence numbers, even in a label.
const noNumbers = (s) => String(s || "").replace(/[A-Z0-9][A-Z0-9 -]{4,}\d/gi, "").replace(/\s+/g, " ").trim().slice(0, 120);

// Staff: ID and sensitive documents on an applicant's or tenant's file.
//   POST { action: "prepare", application_id|tenancy_id, file_name, type, size } → { upload_url, path }
//   POST { action: "save", application_id|tenancy_id, path, file_name, type, size, kind, label, received_via }
//   POST { action: "original_deleted", id }   staff deleted the copy in the email or chat
//   POST { action: "delete", id }
//   POST { action: "verify_id", application_id|tenancy_id }  → "ID verified by <you> on <today>"
//   GET  ?tenancy=<id> → the list; GET ?view=<id> → a one-minute link (logged)
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const staff = await staffFromRequest(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const q = new URL(request.url).searchParams;
  if (q.get("view")) {
    const { data: d } = await sb.from("sensitive_documents").select("*").eq("id", q.get("view")).maybeSingle();
    if (!d) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const { data } = await sb.storage.from(SENSITIVE_BUCKET).createSignedUrl(d.file_path, 60);
    if (!data?.signedUrl) return NextResponse.json({ error: "That file is no longer available." }, { status: 404 });
    await logView(sb, { applicationId: d.application_id, tenancyId: d.tenancy_id, sensitiveId: d.id, docType: d.kind, viewerId: staff.id, viewerRole: "staff", request });
    return NextResponse.json({ url: data.signedUrl });
  }
  const col = q.get("tenancy") ? "tenancy_id" : "application_id";
  const id = q.get("tenancy") || q.get("application");
  if (!UUID.test(String(id || ""))) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const [{ data: docs }, { data: rec }, { data: views }] = await Promise.all([
    sb.from("sensitive_documents").select("id, kind, label, received_via, file_name, uploaded_by_name, uploaded_at, original_deleted_at").eq(col, id).order("uploaded_at"),
    sb.from(col === "tenancy_id" ? "tenancies" : "applications").select("id_verified_by_name, id_verified_on").eq("id", id).maybeSingle(),
    sb.from("sensitive_doc_views").select("viewed_at, viewer_role, viewer_name, doc_type").eq(col, id).order("viewed_at", { ascending: false }).limit(20),
  ]);
  return NextResponse.json({ docs: docs || [], verified: rec?.id_verified_on ? { by: rec.id_verified_by_name, on: rec.id_verified_on } : null, views: views || [] });
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  const staff = await staffFromRequest(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const target = UUID.test(String(b.application_id || "")) ? { application_id: b.application_id } : UUID.test(String(b.tenancy_id || "")) ? { tenancy_id: b.tenancy_id } : null;

  if (b.action === "prepare" || b.action === "save") {
    if (!target) return NextResponse.json({ error: "Choose the applicant or tenancy." }, { status: 400 });
    if (!TYPES.test(String(b.type || ""))) return NextResponse.json({ error: "Use a PDF, JPG, PNG, HEIC or WEBP file." }, { status: 400 });
    if (!(Number(b.size) > 0 && Number(b.size) <= 10 * 1024 * 1024)) return NextResponse.json({ error: "Files can be up to 10 MB." }, { status: 400 });
    const folder = `sensitive/${target.application_id ? `app-${target.application_id}` : `tenancy-${target.tenancy_id}`}/`;
    if (b.action === "prepare") {
      const ext = String(b.file_name || "").split(".").pop().toLowerCase().replace(/[^a-z]/g, "").slice(0, 5) || "bin";
      const path = `${folder}${crypto.randomUUID()}.${ext}`; // no names or numbers in the path
      const { data, error } = await sb.storage.from(SENSITIVE_BUCKET).createSignedUploadUrl(path);
      if (error || !data?.signedUrl) return NextResponse.json({ error: "Couldn't prepare the upload." }, { status: 500 });
      return NextResponse.json({ upload_url: data.signedUrl, token: data.token, path });
    }
    if (!String(b.path || "").startsWith(folder)) return NextResponse.json({ error: "Bad path." }, { status: 400 });
    const label = noNumbers(b.label) || "Sensitive document";
    const { data, error } = await sb
      .from("sensitive_documents")
      .insert({
        ...target,
        kind: KINDS.includes(b.kind) ? b.kind : "other",
        label,
        received_via: VIA.includes(b.received_via) ? b.received_via : "other",
        file_path: b.path,
        file_name: `${label}.${String(b.path).split(".").pop()}`,
        mime_type: b.type,
        size_bytes: Number(b.size) || null,
        uploaded_by: staff.id,
        uploaded_by_name: await staffName(sb, staff.id),
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id, reminder: "Now delete the original from the email/chat." });
  }

  if (b.action === "original_deleted" || b.action === "delete") {
    const { data: d } = await sb.from("sensitive_documents").select("id, file_path").eq("id", b.id || "").maybeSingle();
    if (!d) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (b.action === "original_deleted") {
      await sb.from("sensitive_documents").update({ original_deleted_at: new Date().toISOString() }).eq("id", d.id);
      return NextResponse.json({ ok: true });
    }
    await sb.storage.from(SENSITIVE_BUCKET).remove([d.file_path]);
    await sb.from("sensitive_documents").delete().eq("id", d.id);
    await sb.from("document_deletions").insert({ files_deleted: 1, reason: "Sensitive document deleted by staff" });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "verify_id") {
    if (!target) return NextResponse.json({ error: "Choose the applicant or tenancy." }, { status: 400 });
    const name = await staffName(sb, staff.id);
    const on = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    const table = target.application_id ? "applications" : "tenancies";
    const { error } = await sb
      .from(table)
      .update({ id_verified_by: staff.id, id_verified_by_name: name, id_verified_on: on })
      .eq("id", target.application_id || target.tenancy_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, verified: { by: name, on } });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
