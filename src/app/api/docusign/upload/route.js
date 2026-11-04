import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ds, senderViewUrl, summarizeRecipients } from "@/lib/docusign";
import { SITE } from "@/lib/site";
import { SIGNED_BUCKET, staffUser } from "@/lib/signatures-server";
import { IREP_SIGNER } from "@/lib/lease-defaults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const MAX_MB = 25;

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// The written document as HTML for DocuSign to turn into a PDF. Blank lines separate paragraphs;
// a line starting with "# " is a heading.
function draftHtml(title, text, signers) {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) =>
      b.startsWith("# ")
        ? `<h2 style="font-size:15pt;margin:18px 0 6px;">${esc(b.slice(2))}</h2>`
        : `<p style="margin:0 0 10px;">${esc(b).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "long", day: "numeric", year: "numeric" });
  const sigs = signers
    .map(
      (s, i) => `<table style="width:100%;margin:28px 0 0;border-collapse:collapse;"><tr>
        <td style="width:60%;padding-right:24px;vertical-align:bottom;"><div style="height:40px;"><span style="color:#ffffff;font-size:1pt;">/sn${i + 1}/</span></div><div style="border-top:1px solid #000;padding-top:4px;">${esc(s.name)} (${esc(s.role)})</div></td>
        <td style="width:40%;vertical-align:bottom;"><div style="height:40px;"><span style="color:#ffffff;font-size:1pt;">/ds${i + 1}/</span></div><div style="border-top:1px solid #000;padding-top:4px;">Date</div></td>
      </tr></table>`
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.45;color:#161616;">
<table style="width:100%;border-bottom:2px solid #B41710;padding-bottom:8px;margin-bottom:18px;"><tr>
<td style="font-family:Georgia,serif;font-size:20pt;letter-spacing:2px;"><b>IREP</b><br><span style="font-family:Arial,sans-serif;font-size:7pt;letter-spacing:2px;">PROPERTY MANAGEMENT</span></td>
<td style="text-align:right;font-size:9pt;">${esc(SITE.name)}<br>${esc(SITE.address)}<br>${esc(SITE.phone)} · ${esc(SITE.email)}</td>
</tr></table>
<p style="margin:0 0 6px;font-size:10pt;color:#555;">${esc(today)}</p>
<h1 style="font-family:Georgia,serif;font-size:20pt;font-weight:normal;margin:0 0 16px;">${esc(title)}</h1>
${blocks}
<div style="margin-top:28px;">${sigs}</div>
</body></html>`;
}

// Upload-and-send: staff upload a PDF to storage (uploads/…), then this makes a DocuSign draft with
// their signers and opens it so they can place signature, initial and date fields before sending.
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const staff = await staffUser(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const b = await request.json().catch(() => ({}));

  const draftText = typeof b.draft_body === "string" ? b.draft_body.replace(/\r\n/g, "\n").trim().slice(0, 60000) : "";
  const paths = draftText ? [] : (Array.isArray(b.files) ? b.files : []).filter((f) => /^uploads\/[\w./-]+\.pdf$/i.test(str(f?.path)));
  if (!draftText && !paths.length) return NextResponse.json({ error: "Upload a PDF or write the document first." }, { status: 400 });
  const title = str(b.title);
  if (!title) return NextResponse.json({ error: "Give the document a title." }, { status: 400 });
  const signers = (Array.isArray(b.signers) ? b.signers : [])
    .map((s) => ({ name: str(s.name), email: str(s.email).toLowerCase(), role: str(s.role) || "Signer" }))
    .filter((s) => s.name || s.email);
  if (!signers.length) return NextResponse.json({ error: "Add at least one person to sign." }, { status: 400 });
  const bad = signers.find((s) => !s.name || !EMAIL.test(s.email));
  if (bad) return NextResponse.json({ error: `Every signer needs a name and a valid email (check ${bad.name || bad.email}).` }, { status: 400 });

  // A document written on the website: IRep letterhead, the text, and a signature block per signer
  // (hidden anchors place each signer's signature and date fields automatically).
  const documents = [];
  if (draftText) {
    documents.push({
      documentId: "1",
      name: title.slice(0, 100),
      fileExtension: "html",
      order: "1",
      documentBase64: Buffer.from(draftHtml(title, draftText, signers), "utf8").toString("base64"),
    });
  }

  // The PDFs, from storage.
  for (const [i, f] of paths.entries()) {
    const { data, error } = await sb.storage.from(SIGNED_BUCKET).download(f.path);
    if (error || !data) return NextResponse.json({ error: `Couldn't read ${f.name || "the file"}. Upload it again.` }, { status: 400 });
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.length > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `${f.name || "A file"} is over ${MAX_MB} MB.` }, { status: 400 });
    if (buf.subarray(0, 5).toString() !== "%PDF-") return NextResponse.json({ error: `${f.name || "A file"} isn't a PDF.` }, { status: 400 });
    documents.push({
      documentId: String(i + 1),
      name: str(f.name).replace(/\.pdf$/i, "").slice(0, 100) || `Document ${i + 1}`,
      fileExtension: "pdf",
      order: String(i + 1),
      documentBase64: buf.toString("base64"),
    });
  }

  const ordered = Boolean(b.signing_order);
  const recipients = {
    signers: signers.map((s, i) => ({
      recipientId: String(i + 1),
      routingOrder: ordered ? String(i + 1) : "1",
      roleName: s.role,
      name: s.name,
      email: s.email,
      ...(draftText
        ? {
            tabs: {
              signHereTabs: [{ anchorString: `/sn${i + 1}/`, anchorUnits: "pixels", anchorYOffset: "-6", anchorIgnoreIfNotPresent: "true" }],
              dateSignedTabs: [{ anchorString: `/ds${i + 1}/`, anchorUnits: "pixels", anchorYOffset: "-2", anchorIgnoreIfNotPresent: "true" }],
            },
          }
        : {}),
    })),
    ...(b.cc_irep === false
      ? {}
      : { carbonCopies: [{ recipientId: "90", routingOrder: String(ordered ? signers.length + 1 : 2), roleName: "Administration", name: IREP_SIGNER.name, email: IREP_SIGNER.email }] }),
  };
  const emailSubject = (str(b.email_subject) || `Please sign: ${title}`).slice(0, 100);

  const { data: row, error: insertError } = await sb
    .from("signature_requests")
    .insert({
      kind: "other",
      title,
      status: "draft",
      tenancy_id: b.tenancy_id || null,
      unit_id: b.unit_id || null,
      property_id: b.property_id || null,
      owner_id: b.owner_id || null,
      recipients: signers.map((s, i) => ({ role: s.role, name: s.name, email: s.email, routing_order: ordered ? i + 1 : 1, status: "created" })),
      terms: draftText ? { type: "draft", body: draftText } : { type: "upload", files: paths.map((f) => ({ path: f.path, name: str(f.name) })) },
      email_subject: emailSubject,
      sent_by: staff.id,
    })
    .select("id")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  try {
    const env = await ds("/envelopes", {
      method: "POST",
      body: { emailSubject, emailBlurb: str(b.email_message).slice(0, 10000) || undefined, status: "created", documents, recipients },
    });
    const now = new Date().toISOString();
    const summary = summarizeRecipients(await ds(`/envelopes/${env.envelopeId}/recipients`).catch(() => null));
    await sb
      .from("signature_requests")
      .update({ envelope_id: env.envelopeId, status_changed_at: now, error: null, ...(summary.length ? { recipients: summary } : {}) })
      .eq("id", row.id);
    const origin = new URL(request.url).origin;
    const url = await senderViewUrl(env.envelopeId, `${origin}/admin/signatures/${row.id}`);
    return NextResponse.json({ id: row.id, url });
  } catch (err) {
    await sb.from("signature_requests").update({ status: "error", error: err.message, status_changed_at: new Date().toISOString() }).eq("id", row.id);
    return NextResponse.json({ id: row.id, error: err.message, consentRequired: err.consentRequired }, { status: 502 });
  }
}
