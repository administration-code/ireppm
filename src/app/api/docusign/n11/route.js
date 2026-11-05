import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { addTabsByRole, createEnvelope, ds, removeEmptyRecipients, resolveTemplates, sendDraftEnvelope } from "@/lib/docusign";
import { draftHtml } from "@/lib/draft-html";
import { staffUser } from "@/lib/signatures-server";
import { KIND_TEMPLATES, buildN11 } from "@/lib/docusign-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Staff approve a tenant's early move-out request: send the N11 to every tenant, then the landlord.
// POST { request_id }  with  Authorization: Bearer <staff token>
// Staff can also start one themselves (no tenant request):
// POST { tenancy_id, termination_date, phone?, extra_terms?, send? }. It's saved as a DocuSign draft to
// check and send, unless send is true. extra_terms adds a page of written terms the same people sign.
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
  const staffStart = !body?.request_id && body?.tenancy_id;
  const extraTerms = staffStart && typeof body.extra_terms === "string" ? body.extra_terms.replace(/\r\n/g, "\n").trim().slice(0, 30000) : "";
  const sendNow = !staffStart || body.send === true;
  let req;
  if (staffStart) {
    const date = String(body.termination_date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Choose the termination date." }, { status: 400 });
    const { data: ten } = await sb.from("tenancies").select("id").eq("id", body.tenancy_id).maybeSingle();
    if (!ten) return NextResponse.json({ error: "Tenancy not found." }, { status: 404 });
    req = {
      id: null,
      tenancy_id: ten.id,
      termination_date: date,
      phone: String(body.phone || "").trim() || null,
    };
  } else {
    ({ data: req } = await sb.from("n11_requests").select("*").eq("id", body?.request_id).maybeSingle());
    if (!req) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    if (req.status !== "requested") return NextResponse.json({ error: "This request has already been reviewed." }, { status: 400 });
  }

  const { data: prep, error: prepError } = await sb.rpc("n9_prepare", { p_tenancy_id: req.tenancy_id });
  if (prepError) return NextResponse.json({ error: prepError.message }, { status: 400 });
  if (!(prep?.tenants || []).some((t) => t.email)) {
    return NextResponse.json({ error: "No tenant on this tenancy has an email. Add one first." }, { status: 400 });
  }

  const { data: owner } = prep.owner_id
    ? await sb.from("owners").select("id, name, email, phone").eq("id", prep.owner_id).maybeSingle()
    : { data: null };
  if (!owner?.email) {
    return NextResponse.json(
      { error: "The landlord signs the N11, so they need an email. Add it on the owner's page first." },
      { status: 400 }
    );
  }

  let ids;
  try {
    ids = await resolveTemplates(KIND_TEMPLATES.N11);
  } catch (err) {
    return NextResponse.json({ error: err.message, consentRequired: err.consentRequired }, { status: 502 });
  }
  if (!ids.N11) return NextResponse.json({ error: "DocuSign template not found: N11." }, { status: 400 });

  // A staff-started N11 gets its own request record, so signing it ends the tenancy the same way.
  if (staffStart) {
    const now = new Date().toISOString();
    const { data: made, error: reqError } = await sb
      .from("n11_requests")
      .insert({
        tenancy_id: req.tenancy_id,
        termination_date: req.termination_date,
        phone: req.phone,
        reason: "Started by IRep staff",
        status: "approved",
        decided_by: staff.id,
        decided_at: now,
      })
      .select("*")
      .single();
    if (reqError) return NextResponse.json({ error: reqError.message }, { status: 500 });
    req = made;
  }

  const built = buildN11(prep, req, ids, owner);
  if (extraTerms) built.terms.extra_terms = extraTerms;
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
  if (insertError) {
    if (staffStart) await sb.from("n11_requests").delete().eq("id", req.id);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    const asDraft = !sendNow || Boolean(extraTerms);
    const env = await createEnvelope({ ...built.definition, emailSubject, status: asDraft ? "created" : "sent" });
    if (asDraft) {
      await sb.from("signature_requests").update({ envelope_id: env.envelopeId }).eq("id", row.id);
      await removeEmptyRecipients(env.envelopeId);
      if (extraTerms) {
        // The written terms as a second document, with a signature and date line for every signer.
        const signers = built.recipients.map((r) => ({ name: r.name, role: r.role }));
        await ds(`/envelopes/${env.envelopeId}/documents`, {
          method: "PUT",
          body: {
            documents: [
              {
                documentId: "900",
                name: "Additional Terms",
                fileExtension: "html",
                order: "900",
                documentBase64: Buffer.from(draftHtml(`Additional Terms: ${place}`, extraTerms, signers), "utf8").toString("base64"),
              },
            ],
          },
        });
        await addTabsByRole(
          env.envelopeId,
          Object.fromEntries(
            built.recipients.map((r, i) => [
              r.role,
              {
                signHereTabs: [{ tabLabel: `Extra Terms Sign ${i + 1}`, anchorString: `/sn${i + 1}/`, anchorUnits: "pixels", anchorYOffset: "-6", anchorIgnoreIfNotPresent: "true" }],
                dateSignedTabs: [{ tabLabel: `Extra Terms Date ${i + 1}`, anchorString: `/ds${i + 1}/`, anchorUnits: "pixels", anchorYOffset: "-2", anchorIgnoreIfNotPresent: "true" }],
              },
            ])
          )
        );
      }
      if (sendNow) await sendDraftEnvelope(env.envelopeId);
    }
    const now = new Date().toISOString();
    await sb
      .from("signature_requests")
      .update({
        envelope_id: env.envelopeId,
        status: sendNow ? "sent" : "draft",
        sent_at: sendNow ? now : null,
        status_changed_at: now,
        error: null,
      })
      .eq("id", row.id);
    await sb
      .from("n11_requests")
      .update({ status: "approved", decided_by: staff.id, decided_at: now, signature_request_id: row.id })
      .eq("id", req.id);
    return NextResponse.json({ id: row.id, status: sendNow ? "sent" : "draft" });
  } catch (err) {
    await sb
      .from("signature_requests")
      .update({ status: "error", error: err.message, status_changed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (staffStart) await sb.from("n11_requests").delete().eq("id", req.id);
    return NextResponse.json({ id: row.id, error: err.message, consentRequired: err.consentRequired }, { status: 502 });
  }
}
