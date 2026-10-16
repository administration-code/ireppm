import "server-only";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/staff-alerts";
import { ds, getDocument, getEnvelope, getRecipients, summarizeRecipients } from "@/lib/docusign";

export const SIGNED_BUCKET = "signed-documents";
const ADMIN_URL = "https://ireppm.ca/admin";
const FROM = "IRep Property Management <alerts@ireppm.ca>";

export function longDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Toronto" });
}

export async function staffUser(sb, request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: profile } = await sb.from("profiles").select("role, full_name").eq("id", data.user.id).maybeSingle();
  if (!profile || !["staff", "admin"].includes(profile.role)) return null;
  return { ...data.user, full_name: profile.full_name || data.user.email };
}

export async function alertStaff(subject, lines, requestId) {
  const to = (process.env.STAFF_ALERT_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!process.env.RESEND_API_KEY || !to.length) return;
  const link = requestId ? `${ADMIN_URL}/signatures/${requestId}` : `${ADMIN_URL}/signatures`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#161616">
${lines.map((l) => `<p style="margin:0 0 10px">${escapeHtml(l)}</p>`).join("")}
<p style="margin:16px 0 0"><a href="${link}" style="color:#B41710">Open in the staff portal</a></p></div>`;
  try {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: FROM,
      to,
      subject,
      html,
      text: `${lines.join("\n\n")}\n\n${link}`,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[docusign] staff alert failed:", err?.message || err);
  }
}

const STATUS_FROM_DS = {
  created: "draft",
  sent: "sent",
  delivered: "delivered",
  signed: "delivered",
  completed: "completed",
  declined: "declined",
  voided: "voided",
};

export const EVENT_STATUS = {
  "envelope-sent": "sent",
  "envelope-delivered": "delivered",
  "envelope-completed": "completed",
  "envelope-declined": "declined",
  "envelope-voided": "voided",
};

// Tick boxes named "Consent ..." that a signer actually selected.
function tickedConsent(signer) {
  return (signer?.tabs?.checkboxTabs || []).some((t) => /^consent/i.test(t.tabLabel || "") && String(t.selected) === "true");
}

async function readConsent(envelopeId, kind) {
  const data = await getRecipients(envelopeId, true);
  const signers = data.signers || [];
  const tenants = kind === "lease" ? signers.filter((s) => /^tenant/i.test(s.roleName || "")) : signers.filter((s) => s.roleName === "Tenant");
  return tenants.some(tickedConsent);
}

async function saveFiles(sb, row) {
  const changes = {};
  const base = `${row.kind}/${row.id}`;
  if (!row.signed_file_path) {
    const pdf = await getDocument(row.envelope_id, "combined");
    const path = `${base}/signed.pdf`;
    const { error } = await sb.storage.from(SIGNED_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(`Couldn't save the signed PDF: ${error.message}`);
    changes.signed_file_path = path;
  }
  if (!row.certificate_file_path) {
    try {
      const pdf = await getDocument(row.envelope_id, "certificate");
      const path = `${base}/certificate.pdf`;
      const { error } = await sb.storage.from(SIGNED_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (!error) changes.certificate_file_path = path;
    } catch (err) {
      console.error("[docusign] certificate download failed:", err?.message || err);
    }
  }
  return changes;
}

// Lease envelopes no longer carry the consent forms; each tenant's consent is its own envelope
// linked by related_request_id. Work out the tenancy's consent from those.
async function leaseConsentText(sb, leaseRow, when) {
  const { data: forms } = await sb
    .from("signature_requests")
    .select("status, terms")
    .eq("related_request_id", leaseRow.id)
    .eq("kind", "other");
  const done = (forms || []).filter((x) => x.status === "completed" && typeof x.terms?.consented === "boolean");
  if (done.some((x) => x.terms.consented)) return `Yes: consent signed in DocuSign (${when})`;
  if (forms?.length && done.length === forms.length) return `No: tenant declined email service (${when})`;
  return null; // not all signed yet; the consent form's own completion updates the tenancy later
}

async function onCompleted(sb, row) {
  const fileChanges = await saveFiles(sb, row);
  let consent = null;
  const isConsentForm = row.kind === "other" && row.terms?.type === "consent";
  const changes = { ...fileChanges };
  const when = longDate(row.completed_at);

  if (isConsentForm) {
    try {
      consent = await readConsent(row.envelope_id, row.kind);
    } catch (err) {
      console.error("[docusign] reading consent failed:", err?.message || err);
    }
    if (consent !== null) changes.terms = { ...row.terms, consented: consent };
  }

  if (row.kind === "lease" && !row.terms?.email_service_consent) {
    const text = await leaseConsentText(sb, row, when);
    if (text) {
      changes.terms = { ...row.terms, email_service_consent: text };
      consent = text.startsWith("Yes");
    }
  }

  if (Object.keys(changes).length) {
    const { error } = await sb.from("signature_requests").update(changes).eq("id", row.id);
    if (error) throw new Error(error.message);
  }

  let applied = null;
  if (["lease", "pm_contract"].includes(row.kind) && !row.applied_at) {
    const { data, error } = await sb.rpc("apply_signed_document", { p_request_id: row.id });
    if (error) throw new Error(`Couldn't update records: ${error.message}`);
    applied = data;
  }

  if (isConsentForm && consent !== null && !row.applied_at) {
    // The tenancy: set directly (stand-alone consent) or via the lease it was sent with.
    let tenancyId = row.tenancy_id;
    if (!tenancyId && row.related_request_id) {
      const { data: lease } = await sb.from("signature_requests").select("tenancy_id").eq("id", row.related_request_id).maybeSingle();
      tenancyId = lease?.tenancy_id || null;
    }
    if (tenancyId && consent) {
      await sb.from("tenancies").update({ email_service_consent: `Yes: consent signed in DocuSign (${when})` }).eq("id", tenancyId);
    }
    if (tenancyId || !row.related_request_id) {
      await sb.from("signature_requests").update({ applied_at: new Date().toISOString(), tenancy_id: tenancyId }).eq("id", row.id);
    }
  }

  return { applied, consent };
}

// When a lease that was reviewed as a draft is sent, send its consent forms too.
async function sendLeaseConsents(sb, leaseRow) {
  const { data: drafts } = await sb
    .from("signature_requests")
    .select("id, envelope_id")
    .eq("related_request_id", leaseRow.id)
    .eq("kind", "other")
    .eq("status", "draft");
  for (const d of drafts || []) {
    if (!d.envelope_id) continue;
    try {
      await ds(`/envelopes/${d.envelope_id}`, { method: "PUT", body: { status: "sent" } });
      const now = new Date().toISOString();
      await sb.from("signature_requests").update({ status: "sent", sent_at: now, status_changed_at: now }).eq("id", d.id);
    } catch (err) {
      await sb.from("signature_requests").update({ error: err.message }).eq("id", d.id);
    }
  }
}

// Bring a request in line with DocuSign. Safe to run any number of times.
export async function syncRequest(sb, row, { eventStatus } = {}) {
  if (!row?.envelope_id) return row;
  let status = eventStatus || row.status;
  let completedAt = null;
  let recipients = row.recipients;

  try {
    const env = await getEnvelope(row.envelope_id);
    status = STATUS_FROM_DS[env.status] || status;
    completedAt = env.completedDateTime || null;
    if (status === "voided" && env.voidedReason) row.void_reason = row.void_reason || env.voidedReason;
  } catch (err) {
    console.error("[docusign] envelope lookup failed:", err?.message || err);
  }
  try {
    recipients = summarizeRecipients(await getRecipients(row.envelope_id));
  } catch (err) {
    console.error("[docusign] recipients lookup failed:", err?.message || err);
  }

  const before = row.status;
  const changes = { recipients };
  if (status !== before) {
    changes.status = status;
    changes.status_changed_at = new Date().toISOString();
    changes.error = null;
  }
  if (status === "completed" && !row.completed_at) changes.completed_at = completedAt || new Date().toISOString();
  if (status === "voided" && row.void_reason) changes.void_reason = row.void_reason;
  if (["sent", "delivered"].includes(status) && !row.sent_at) changes.sent_at = new Date().toISOString();

  const { data: updated, error } = await sb.from("signature_requests").update(changes).eq("id", row.id).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  let current = updated || { ...row, ...changes };

  if (current.kind === "lease" && ["sent", "delivered", "completed"].includes(current.status) && before === "draft") {
    await sendLeaseConsents(sb, current);
  }

  if (current.status === "completed") {
    let result = null;
    try {
      result = await onCompleted(sb, current);
    } catch (err) {
      await sb.from("signature_requests").update({ error: err.message }).eq("id", row.id);
      if (before !== "completed") {
        await alertStaff(`Signed, but needs attention: ${current.title}`, [
          `${current.title} was signed in DocuSign, but we couldn't finish the follow-up.`,
          err.message,
        ], row.id);
      }
      throw err;
    }
    if (before !== "completed") await completedAlert(current, result);
  } else if (status !== before && (status === "declined" || status === "voided")) {
    const who = (recipients || []).find((r) => r.status === "declined");
    await alertStaff(`${status === "declined" ? "Declined" : "Voided"}: ${current.title}`, [
      `${current.title} was ${status} in DocuSign.`,
      who ? `${who.name} declined${who.declined_reason ? `: ${who.declined_reason}` : "."}` : current.void_reason || "",
    ].filter(Boolean), row.id);
  }

  const { data: fresh } = await sb.from("signature_requests").select("*").eq("id", row.id).maybeSingle();
  return fresh || current;
}

async function completedAlert(row, result) {
  const lines = [`${row.title} has been signed by everyone.`];
  if (row.kind === "lease") {
    lines.push("We created the tenancy as upcoming. Mark it as moved in on the unit page when the tenants get the keys.");
    if (result?.consent === false) lines.push("No tenant agreed to email service, so notices must be served on paper.");
  } else if (row.kind === "pm_contract") {
    lines.push("The property's agreement dates were updated.");
  } else if (["N1", "N4", "N5"].includes(row.kind)) {
    lines.push("It's ready to serve. Open it to record how and when it was served.");
  } else if (row.terms?.type === "consent") {
    lines.push(result?.consent ? "The tenant agreed to email service." : "The tenant did not agree to email service.");
  }
  await alertStaff(`Signed: ${row.title}`, lines, row.id);
}
