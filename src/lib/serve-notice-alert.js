import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { DEFAULT_DELIVERER } from "@/lib/lease-defaults";
import { SITE } from "@/lib/site";
import { SIGNED_BUCKET } from "@/lib/signatures-server";

const FORMS = { N4: "N4 (non-payment of rent)", N5: "N5 (interfering with others / damage)", N1: "N1 (rent increase)" };
const longDay = (iso) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
const dollars = (v) => (v === "" || v == null ? "" : `$${Number(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

// Once the landlord has signed an N4, N5 or N1, emails the person who serves notices (Chuck)
// with the details and the signed PDF attached. Returns { sent, to }. Never throws.
export async function notifyNoticeReady(requestId) {
  try {
    if (!mailConfigured()) return { sent: false };
    const sb = getSupabaseAdmin();
    const { data: row } = await sb
      .from("signature_requests")
      .select("id, kind, title, terms, prefill, signed_file_path, tenancy_id, unit_id, property_id")
      .eq("id", requestId)
      .maybeSingle();
    if (!row || !FORMS[row.kind]) return { sent: false };

    let tenants = "";
    let place = "";
    if (row.tenancy_id) {
      const { data: t } = await sb
        .from("tenancies")
        .select("tenancy_tenants(full_name, is_primary, phone), unit:units(label, property:properties(address, city))")
        .eq("id", row.tenancy_id)
        .maybeSingle();
      const people = (t?.tenancy_tenants || []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
      tenants = people.map((p) => `${p.full_name}${p.phone ? ` (${p.phone})` : ""}`).join(", ");
      const u = t?.unit;
      place = [u?.property?.address, u?.label && !/^whole/i.test(u.label) ? u.label : "", u?.property?.city].filter(Boolean).join(", ");
    }
    const f = row.prefill || {};
    const termination = row.terms?.effective_date || f.termination_date || f.increase_date || "";
    const rows = [
      ["Form", FORMS[row.kind]],
      ["Tenants", tenants || f.tenant_names || ""],
      ["Address", place || f.unit_address || ""],
      ...(row.kind === "N4" && (f.amount_owing || row.terms?.amount) ? [["Amount owing", dollars(f.amount_owing || Number(row.terms.amount) / 100)]] : []),
      ...(termination ? [[row.kind === "N1" ? "Increase date" : "Termination date", longDay(termination)]] : []),
    ].filter(([, v]) => v);

    const attachments = [];
    if (row.signed_file_path) {
      const { data: blob } = await sb.storage.from(SIGNED_BUCKET).download(row.signed_file_path);
      if (blob) attachments.push({ filename: `${row.kind} ${place || "notice"}.pdf`.replace(/[^\w\- .]+/g, ""), content: Buffer.from(await blob.arrayBuffer()) });
    }

    const heading = `${row.kind} Ready to Serve`;
    const intro = `The landlord has signed the ${row.kind}. Please deliver it to the tenants within 2 days. Then open Notices to Serve in your Agent Portal, tap I Delivered It and say how. Your Certificate of Service will come to you filled in, ready to sign.`;
    const extraHtml = attachments.length
      ? `<p style="margin:12px 0 0">The signed ${row.kind} is attached.</p>`
      : `<p style="margin:12px 0 0">The signed copy is in the staff portal under Signatures.</p>`;
    const link = { href: "https://ireppm.ca/agent/notices", label: "Open Notices to Serve" };
    const to = DEFAULT_DELIVERER.email;
    const { error } = await mailer().emails.send({
      from: "IRep Property Management <alerts@ireppm.ca>",
      to: [to],
      replyTo: SITE.email,
      subject: `Ready to serve: ${row.kind} for ${place || row.title}`,
      html: renderEmail({ heading, intro, rows, extraHtml, link }),
      text: renderText({ heading, rows, link }) + (attachments.length ? `\n\nThe signed ${row.kind} is attached.` : ""),
      attachments: attachments.length ? attachments : undefined,
    });
    if (error) throw new Error(error.message);
    return { sent: true, to };
  } catch (err) {
    console.error("[serve-notice-alert] failed:", err?.message || err);
    return { sent: false };
  }
}
