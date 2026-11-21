import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { createRequests } from "@/lib/email-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Staff: approve an email in "Review email intake" (log it on the chosen tenancy) or dismiss it.
//   POST { action: "approve", tenancy_id, issues: [{ title, summary, category, urgency }] } | { action: "dismiss" }
export async function POST(request, { params }) {
  const sb = getSupabaseAdmin();
  const staff = await staffFromRequest(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { data: email } = await sb.from("inbound_emails").select("*").eq("id", id).maybeSingle();
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (body.action === "dismiss") {
    await sb.from("inbound_emails").update({ intake_status: "dismissed" }).eq("id", id);
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "approve") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const { data: tenancy } = await sb.from("tenancies").select("id, unit_id").eq("id", body.tenancy_id || "").maybeSingle();
  if (!tenancy) return NextResponse.json({ error: "Choose the tenancy." }, { status: 400 });
  const issues = (Array.isArray(body.issues) ? body.issues : []).filter((i) => String(i?.title || "").trim());
  if (!issues.length) return NextResponse.json({ error: "Add at least one issue." }, { status: 400 });
  try {
    const ids = await createRequests(sb, email, { id: tenancy.id, unit: { id: tenancy.unit_id } }, issues);
    await sb
      .from("inbound_emails")
      .update({ intake_status: "approved", tenancy_id: tenancy.id, unit_id: tenancy.unit_id, maintenance_request_ids: ids, category: "maintenance" })
      .eq("id", id);
    return NextResponse.json({ ok: true, ids });
  } catch (err) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
