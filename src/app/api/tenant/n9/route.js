import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createEnvelope, resolveTemplates } from "@/lib/docusign";
import { alertStaff } from "@/lib/signatures-server";
import { KIND_TEMPLATES, buildN9 } from "@/lib/docusign-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A tenant gives notice (N9) from the tenant portal. Every tenant on the tenancy gets
// it from DocuSign to sign; when all have signed, the Connect webhook completes it and
// apply_signed_document moves the tenancy to 'notice' with the move-out date.
//
// POST { tenancy_id, termination_date: "YYYY-MM-DD", phone? }  with  Authorization: Bearer <user token>
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { data: auth, error: authError } = await sb.auth.getUser(token);
  if (authError || !auth?.user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const user = auth.user;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const tenancyId = body?.tenancy_id;
  const date = String(body?.termination_date || "");
  if (!tenancyId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Choose your move-out date." }, { status: 400 });
  }

  // Only a tenant on this tenancy (linked to their website account) can give notice.
  const { data: member } = await sb
    .from("tenancy_tenants")
    .select("id")
    .eq("tenancy_id", tenancyId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "This isn't your tenancy." }, { status: 403 });

  const { data: prep, error: prepError } = await sb.rpc("n9_prepare", { p_tenancy_id: tenancyId, p_termination: date });
  if (prepError) return NextResponse.json({ error: prepError.message }, { status: 400 });
  if (!prep?.ok) return NextResponse.json({ error: prep?.error || "Notice can't be given right now.", earliest: prep?.earliest }, { status: 400 });
  if (!(prep.tenants || []).some((t) => t.email)) {
    return NextResponse.json({ error: "We don't have an email for the tenants on this lease. Please contact IRep." }, { status: 400 });
  }

  let ids;
  try {
    ids = await resolveTemplates(KIND_TEMPLATES.N9);
  } catch (err) {
    return NextResponse.json({ error: "Online notice isn't available right now. Please contact IRep." }, { status: 502 });
  }
  if (!ids.N9) return NextResponse.json({ error: "Online notice isn't set up yet. Please contact IRep." }, { status: 502 });

  const built = buildN9(prep, date, ids, body?.phone);
  const place = [prep.property_address, prep.unit_label].filter(Boolean).join(", ");
  const title = `N9: ${place}`;
  const emailSubject = `Please sign: Notice to end your tenancy (${place})`.slice(0, 100);

  const { data: row, error: insertError } = await sb
    .from("signature_requests")
    .insert({
      kind: "N9",
      title,
      template_id: ids.N9,
      status: "draft",
      tenancy_id: tenancyId,
      unit_id: prep.unit_id || null,
      property_id: prep.property_id || null,
      owner_id: prep.owner_id || null,
      recipients: built.recipients,
      prefill: built.prefill,
      terms: { ...built.terms, given_by: user.email },
      email_subject: emailSubject,
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
    await alertStaff(`Tenant notice started: ${place}`, [
      `${user.email} started an N9 for ${place}, moving out on ${date}.`,
      "DocuSign has emailed it to every tenant on the lease to sign. We'll let you know when it's signed.",
    ], row.id);
    return NextResponse.json({ id: row.id, status: "sent", tenants: built.recipients.map((r) => r.name) });
  } catch (err) {
    await sb
      .from("signature_requests")
      .update({ status: "error", error: err.message, status_changed_at: new Date().toISOString() })
      .eq("id", row.id);
    await alertStaff(`Tenant notice failed: ${place}`, [`An N9 from ${user.email} couldn't be sent: ${err.message}`], row.id);
    return NextResponse.json({ error: "We couldn't send the notice for signing. IRep has been told and will contact you." }, { status: 502 });
  }
}
