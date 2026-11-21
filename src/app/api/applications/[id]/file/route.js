import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { bearer, userClient } from "@/lib/application-review";
import { issueViewToken, logView, SENSITIVE_APPLICANT_TYPES, SENSITIVE_BUCKET } from "@/lib/sensitive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A one-minute link to one file on an application, for staff, the applicant, or the landlord
// it was sent to. GET ?doc=<type> (an attached document), ?doc=credit (the screening report) or
// ?doc=sensitive:<id> (an ID or sensitive file staff saved).
// Returns { url } so the page can open it; the buckets themselves stay private.
// Landlords never get a file link for photo ID or other sensitive documents: they get the secure
// viewing page instead (expires in 15 minutes, watermarked, no download). Every sensitive view is logged.
export async function GET(request, { params }) {
  const token = bearer(request);
  if (!token) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await params;
  const doc = new URL(request.url).searchParams.get("doc") || "";

  const client = userClient(token);
  const { data: role } = await client.rpc("application_role", { p_application_id: id });
  if (!role) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { data: who } = await client.auth.getUser(token);
  const viewerId = who?.user?.id || null;

  const admin = getSupabaseAdmin();
  const { data: app } = await admin.from("applications").select("documents, credit_report_path").eq("id", id).maybeSingle();
  if (!app) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const sensitiveId = doc.startsWith("sensitive:") ? doc.slice(10) : null;
  if (sensitiveId) {
    if (role === "applicant") return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    const { data: d } = await admin.from("sensitive_documents").select("id, file_path, kind").eq("id", sensitiveId).eq("application_id", id).maybeSingle();
    if (!d) return NextResponse.json({ error: "That file is no longer available (it may have been deleted under our retention policy)." }, { status: 404 });
    if (role === "owner") {
      const t = await issueViewToken(admin, { sensitiveId: d.id, viewerId, viewerRole: "owner" });
      return NextResponse.json({ url: `/secure-view/${t}` });
    }
    const { data } = await admin.storage.from(SENSITIVE_BUCKET).createSignedUrl(d.file_path, 60);
    if (!data?.signedUrl) return NextResponse.json({ error: "That file is no longer available." }, { status: 404 });
    await logView(admin, { applicationId: id, sensitiveId: d.id, docType: d.kind, viewerId, viewerRole: role, request });
    return NextResponse.json({ url: data.signedUrl });
  }

  let bucket;
  let path;
  if (doc === "credit") {
    bucket = "screening-reports";
    path = app.credit_report_path;
  } else {
    bucket = "applicant-docs";
    path = (app.documents || []).find((d) => d.type === doc)?.path;
  }
  if (!path) return NextResponse.json({ error: "That file isn't on this application." }, { status: 404 });

  if (SENSITIVE_APPLICANT_TYPES.has(doc) && role === "owner") {
    const t = await issueViewToken(admin, { applicationId: id, docType: doc, viewerId, viewerRole: "owner" });
    return NextResponse.json({ url: `/secure-view/${t}` });
  }

  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "That file is no longer available (it may have been deleted under our retention policy)." }, { status: 404 });
  }
  if (SENSITIVE_APPLICANT_TYPES.has(doc) && role === "staff") await logView(admin, { applicationId: id, docType: doc, viewerId, viewerRole: "staff", request });
  return NextResponse.json({ url: data.signedUrl });
}
