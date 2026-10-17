import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createEnvelope, resolveTemplates } from "@/lib/docusign";
import { staffUser } from "@/lib/signatures-server";
import { KIND_TEMPLATES, buildN11 } from "@/lib/docusign-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Staff approve a tenant's early move-out request: send the N11 to every tenant, then IRep.
// POST { request_id }  with  Authorization: Bearer <staff token>
// (Declining is the decline_n11_request database function.)
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const staff = await staffUser(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { data: req } = await sb.from("n11_requests").select("*").eq("id", body?.request_id).maybeSingle();
  if (!req) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  if (req.status !== "requested") return NextResponse.json({ error: "This request has already been reviewed." }, { status: 400 });

  const { data: prep, error: prepError } = await sb.rpc("n9_prepare", { p_tenancy_id: req.tenancy_id });
  if (prepError) return NextResponse.json({ error: prepError.message }, { status: 400 });
  if (!(prep?.tenants || []).some((t) => t.email)) {
    return NextResponse.json({ error: "No tenant on this tenancy has an email. Add one first." }, { status: 400 });
  }

  let ids;
  try {
    ids = await resolveTemplates(KIND_TEMPLATES.N11);
  } catch (err) {
    return NextResponse.json({ error: err.message, consentRequired: err.consentRequired }, { status: 502 });
  }
  if (!ids.N11) return NextResponse.json({ error: "DocuSign template not found: N11." }, { status: 400 });

  const built = buildN11(prep, req, ids);
  const place = [prep.property_address, prep.unit_label].filter(Boolean).join(", ");
  const title = `N11: ${place}`;
  const emailSubject = `Please sign: Agreement to end your tenancy (${place})`.slice(0, 100);

  const { data: row, error: insertError } = await sb
    .from("signature_requests")
    .insert({
      kind: "N11",
      title,
      template_id: ids.N11,
      status: "draft",
      tenancy_id: req.tenancy_id,
      unit_id: prep.unit_id || null,
      property_id: prep.property_id || null,
      owner_id: prep.owner_id || null,
      recipients: built.recipients,
      prefill: built.prefill,
      terms: built.terms,
      email_subject: emailSubject,
      sent_by: staff.id,
    })
    .select("id")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  try {
    const env = await createEnvelope({ ...built.definition, emailSubject, status: "sent" });
    const now = new Date().toISOString();
    await sb
      .from("signature_requests")
      .update({ envelope_id: env.envelopeId, status: "sent", sent_at: now, status_changed_at: now, error: null })
      .eq("id", row.id);
    await sb
      .from("n11_requests")
      .update({ status: "approved", decided_by: staff.id, decided_at: now, signature_request_id: row.id })
      .eq("id", req.id);
    return NextResponse.json({ id: row.id, status: "sent" });
  } catch (err) {
    await sb
      .from("signature_requests")
      .update({ status: "error", error: err.message, status_changed_at: new Date().toISOString() })
      .eq("id", row.id);
    return NextResponse.json({ id: row.id, error: err.message, consentRequired: err.consentRequired }, { status: 502 });
  }
}
