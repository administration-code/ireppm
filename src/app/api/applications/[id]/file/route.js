import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { bearer, userClient } from "@/lib/application-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A one-minute link to one file on an application, for staff, the applicant, or the landlord
// it was sent to. GET ?doc=<type> (an attached document) or ?doc=credit (the screening report).
// Returns { url } so the page can open it; the buckets themselves stay private.
export async function GET(request, { params }) {
  const token = bearer(request);
  if (!token) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await params;
  const doc = new URL(request.url).searchParams.get("doc") || "";

  const { data: role } = await userClient(token).rpc("application_role", { p_application_id: id });
  if (!role) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const admin = getSupabaseAdmin();
  const { data: app } = await admin.from("applications").select("documents, credit_report_path").eq("id", id).maybeSingle();
  if (!app) return NextResponse.json({ error: "Not found." }, { status: 404 });

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

  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "That file is no longer available (it may have been deleted under our retention policy)." }, { status: 404 });
  }
  return NextResponse.json({ url: data.signedUrl });
}
