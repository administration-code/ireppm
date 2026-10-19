import "server-only";
import { ds, getRecipients, summarizeRecipients } from "@/lib/docusign";
import { syncRequest } from "@/lib/signatures-server";

// Keeps the Signatures list in step with DocuSign:
//  1. every open request (draft, sent, opened) gets its latest status and signers;
//  2. any draft or out-for-signature envelope made directly in DocuSign is added to the list.
const OPEN = ["draft", "sent", "delivered"];
const FROM_DS = { created: "draft", sent: "sent", delivered: "delivered", signed: "delivered", completed: "completed", declined: "declined", voided: "voided" };
const LOOKBACK_DAYS = 150;

function kindOf(subject) {
  const s = String(subject || "");
  if (/management\s+contract/i.test(s)) return "pm_contract";
  if (/certificate of service/i.test(s)) return "certificate_of_service";
  const n = /\b(N1|N4|N5|N9|N11)\b/.exec(s);
  if (n) return n[1];
  if (/lease/i.test(s)) return "lease";
  return "other";
}
const cleanTitle = (subject) =>
  String(subject || "DocuSign envelope")
    .replace(/^(please sign|complete with docusign)\s*:\s*/i, "")
    .trim()
    .slice(0, 200);

export async function syncOutstanding(sb) {
  const result = { updated: 0, imported: 0, errors: [] };

  const { data: open } = await sb.from("signature_requests").select("*").in("status", OPEN).not("envelope_id", "is", null);
  for (const row of open || []) {
    try {
      const fresh = await syncRequest(sb, row);
      if (fresh?.status !== row.status) result.updated += 1;
    } catch (err) {
      result.errors.push(`${row.title}: ${err.message}`);
    }
  }

  const from = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString().slice(0, 10);
  const list = await ds(`/envelopes?from_date=${from}&status=created,sent,delivered&count=200&order_by=created&order=desc&include=folders`);
  // Skip anything sitting in DocuSign's Deleted folder (deleted drafts still report "created").
  const binned = new Set();
  try {
    const bin = await ds("/folders/recyclebin?count=500");
    for (const f of bin.folders || []) for (const item of f.folderItems || []) if (item.envelopeId) binned.add(item.envelopeId);
  } catch (err) {
    result.errors.push(`Deleted folder: ${err.message}`);
    return result; // don't risk listing deleted drafts
  }
  const envelopes = (list.envelopes || []).filter((e) => !binned.has(e.envelopeId));
  if (!envelopes.length) return result;

  const { data: known } = await sb
    .from("signature_requests")
    .select("envelope_id")
    .in("envelope_id", envelopes.map((e) => e.envelopeId));
  const have = new Set((known || []).map((r) => r.envelope_id));

  for (const env of envelopes) {
    if (have.has(env.envelopeId)) continue;
    let recipients = [];
    try {
      recipients = summarizeRecipients(await getRecipients(env.envelopeId));
    } catch {
      /* listed without signers */
    }
    const status = FROM_DS[env.status] || "draft";
    const { error } = await sb.from("signature_requests").insert({
      kind: kindOf(env.emailSubject),
      title: cleanTitle(env.emailSubject),
      envelope_id: env.envelopeId,
      status,
      recipients,
      email_subject: env.emailSubject || null,
      terms: { imported: true },
      sent_at: env.sentDateTime || null,
      status_changed_at: env.statusChangedDateTime || null,
      created_at: env.createdDateTime || undefined,
    });
    if (error) result.errors.push(`${env.emailSubject}: ${error.message}`);
    else result.imported += 1;
  }
  return result;
}
