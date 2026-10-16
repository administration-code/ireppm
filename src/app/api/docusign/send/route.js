import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createEnvelope, resolveTemplates, senderViewUrl } from "@/lib/docusign";
import { staffUser } from "@/lib/signatures-server";
import {
  KIND_TEMPLATES,
  buildCertificate,
  buildConsent,
  buildLease,
  buildNForm,
  buildPmContract,
} from "@/lib/docusign-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());

function validate(kind, f) {
  if (kind === "lease") {
    const tenants = f.tenants || [];
    if (!f.unit_id) return "Choose the unit.";
    if (!tenants.length) return "Add at least one tenant.";
    if (tenants.some((t) => !str(t.full_name) || !EMAIL.test(str(t.email)))) return "Every tenant needs a name and an email.";
    if (!f.start_date) return "Add the start date.";
    if (f.term !== "monthly" && !f.end_date) return "Add the end date, or choose month-to-month.";
    if (!(Number(f.base_rent) > 0)) return "Add the rent.";
    if (str(f.guarantor_name) && !EMAIL.test(str(f.guarantor_email))) return "The guarantor needs an email.";
  }
  if (kind === "consent" && (!str(f.tenant_name) || !EMAIL.test(str(f.tenant_email)))) return "The tenant needs a name and an email.";
  if (kind === "pm_contract") {
    const owners = (f.owners || []).filter((o) => str(o.name) || str(o.email));
    if (!owners.length) return "Add at least one owner signer.";
    if (owners.some((o) => !str(o.name) || !EMAIL.test(str(o.email)))) return "Every owner signer needs a name and an email.";
  }
  if (kind === "N1" && (!f.increase_date || !(Number(f.new_rent) > 0))) return "Add the increase date and the new rent.";
  if (kind === "N4" && (!f.termination_date || !(Number(f.amount_owing) > 0))) return "Add the termination date and the amount owing.";
  if (kind === "N5") {
    if (!f.termination_date) return "Add the termination date.";
    if (!(f.reasons || []).length) return "Choose at least one reason.";
  }
  if (["N1", "N4", "N5"].includes(kind) && f.signing_as === "landlord" && !EMAIL.test(str(f.signer?.email))) {
    return "The landlord signer needs an email.";
  }
  if (kind === "certificate_of_service") {
    if (!f.related_request_id) return "Missing the notice this certificate is for.";
    if (!str(f.deliverer_name) || !EMAIL.test(str(f.deliverer_email))) return "Add the name and email of the person who delivered it.";
    if (!f.date_served) return "Add the date served.";
  }
  return null;
}

function titleFor(kind, f) {
  const place = str(f.place);
  if (kind === "lease") return `Lease: ${place}`;
  if (kind === "consent") return `Consent to Service by Email: ${str(f.tenant_name)}`;
  if (kind === "pm_contract") return `Management contract: ${place}`;
  if (kind === "certificate_of_service") return `Certificate of Service (${f.notice_form}): ${place}`;
  return `${kind}: ${place}`;
}

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
  const kind = body?.kind;
  const mode = body?.mode === "send" ? "send" : "review";
  const f = body?.form || {};
  if (!KIND_TEMPLATES[kind]) return NextResponse.json({ error: "Unknown document type." }, { status: 400 });

  const problem = validate(kind, f);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  let ids;
  try {
    ids = await resolveTemplates(KIND_TEMPLATES[kind]);
  } catch (err) {
    return NextResponse.json({ error: err.message, consentRequired: err.consentRequired }, { status: 502 });
  }
  const missing = KIND_TEMPLATES[kind].filter((k) => !ids[k]);
  if (missing.length) {
    return NextResponse.json({ error: `DocuSign template not found: ${missing.join(", ")}.` }, { status: 400 });
  }

  let owner = null;
  if (f.owner_id) {
    const { data } = await sb.from("owners").select("id, name, email, phone").eq("id", f.owner_id).maybeSingle();
    owner = data;
  }

  let built;
  if (kind === "lease") built = buildLease(f, ids, owner);
  else if (kind === "consent") built = buildConsent(f, ids, owner);
  else if (kind === "pm_contract") built = buildPmContract(f, ids);
  else if (kind === "certificate_of_service") built = buildCertificate(f, ids);
  else built = buildNForm(kind, f, ids, owner);

  const title = titleFor(kind, f);
  const emailSubject = (str(f.email_subject) || `Please sign: ${title}`).slice(0, 100);
  const templateId = KIND_TEMPLATES[kind].map((k) => ids[k]).join(",");

  const { data: row, error: insertError } = await sb
    .from("signature_requests")
    .insert({
      kind: kind === "consent" ? "other" : kind,
      title,
      template_id: templateId,
      status: "draft",
      application_id: f.application_id || null,
      tenancy_id: f.tenancy_id || null,
      unit_id: f.unit_id || null,
      property_id: f.property_id || null,
      owner_id: f.owner_id || null,
      related_request_id: f.related_request_id || null,
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
    const env = await createEnvelope({
      ...built.definition,
      emailSubject,
      status: mode === "send" ? "sent" : "created",
    });
    const now = new Date().toISOString();
    await sb
      .from("signature_requests")
      .update({
        envelope_id: env.envelopeId,
        status: mode === "send" ? "sent" : "draft",
        sent_at: mode === "send" ? now : null,
        status_changed_at: now,
        error: null,
      })
      .eq("id", row.id);

    // Lease: send each tenant's consent form alongside it. In review mode they wait as drafts
    // and go out automatically when the lease is sent (see syncRequest).
    if (kind === "lease" && built.consents?.length) {
      for (const c of built.consents) {
        const { data: crow } = await sb
          .from("signature_requests")
          .insert({
            kind: "other",
            title: c.title,
            template_id: ids.consent,
            status: "draft",
            related_request_id: row.id,
            application_id: f.application_id || null,
            unit_id: f.unit_id || null,
            property_id: f.property_id || null,
            owner_id: f.owner_id || null,
            recipients: c.recipients,
            prefill: c.prefill,
            terms: { ...c.terms, lease_request_id: row.id },
            email_subject: `Please sign: ${c.title}`.slice(0, 100),
            sent_by: staff.id,
          })
          .select("id")
          .single();
        try {
          const cenv = await createEnvelope({
            ...c.definition,
            emailSubject: `Please sign: ${c.title}`.slice(0, 100),
            status: mode === "send" ? "sent" : "created",
          });
          if (crow) {
            await sb
              .from("signature_requests")
              .update({ envelope_id: cenv.envelopeId, status: mode === "send" ? "sent" : "draft", sent_at: mode === "send" ? now : null, status_changed_at: now })
              .eq("id", crow.id);
          }
        } catch (cerr) {
          if (crow) {
            await sb.from("signature_requests").update({ status: "error", error: cerr.message, status_changed_at: now }).eq("id", crow.id);
          }
        }
      }
    }

    let url = null;
    if (mode === "review") {
      const origin = new URL(request.url).origin;
      url = await senderViewUrl(env.envelopeId, `${origin}/admin/signatures/${row.id}`);
    }
    return NextResponse.json({ id: row.id, url });
  } catch (err) {
    await sb
      .from("signature_requests")
      .update({ status: "error", error: err.message, status_changed_at: new Date().toISOString() })
      .eq("id", row.id);
    return NextResponse.json({ id: row.id, error: err.message, consentRequired: err.consentRequired }, { status: 502 });
  }
}
