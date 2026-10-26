import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { addTabsByRole, consoleViewUrl, ds, resolveTemplateId, getRecipients, pageImage, resendEnvelope, senderViewUrl, voidEnvelope } from "@/lib/docusign";
import { KIND_TEMPLATES, PM_TAB_LABELS, leaseMoveValues, looksCorporate, pmContractTabs } from "@/lib/docusign-templates";
import { SIGNED_BUCKET, staffUser, syncRequest } from "@/lib/signatures-server";
import { fillLeaseSchedule, pmLeaseRows } from "@/lib/pm-lease-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const { id } = await params;
  const sb = getSupabaseAdmin();
  if (!(await staffUser(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { data: row } = await sb.from("signature_requests").select("*").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    switch (body.action) {
      case "file": {
        const path = body.which === "certificate" ? row.certificate_file_path : row.signed_file_path;
        if (!path) return NextResponse.json({ error: "That file isn't saved yet." }, { status: 404 });
        const { data, error } = await sb.storage.from(SIGNED_BUCKET).createSignedUrl(path, 600);
        if (error) throw new Error(error.message);
        return NextResponse.json({ url: data.signedUrl });
      }
      case "open": {
        if (!row.envelope_id) return NextResponse.json({ error: "This request never reached DocuSign." }, { status: 400 });
        const returnUrl = `${new URL(request.url).origin}/admin/signatures/${id}`;
        const url = row.status === "draft" ? await senderViewUrl(row.envelope_id, returnUrl) : await consoleViewUrl(row.envelope_id, returnUrl);
        return NextResponse.json({ url });
      }
      case "remind": {
        if (!["sent", "delivered"].includes(row.status)) return NextResponse.json({ error: "Only envelopes out for signature can be resent." }, { status: 400 });
        await resendEnvelope(row.envelope_id);
        return NextResponse.json({ ok: true });
      }
      case "void": {
        const reason = String(body.reason || "").trim();
        if (!reason) return NextResponse.json({ error: "Add a reason." }, { status: 400 });
        if (row.envelope_id && ["draft", "sent", "delivered"].includes(row.status)) {
          if (row.status === "draft") {
            // Drafts can't be voided in DocuSign: move the draft to DocuSign's Deleted folder and mark ours as voided.
            await ds("/folders/recyclebin", { method: "PUT", body: { envelopeIds: [row.envelope_id] } }).catch(() => {});
            await sb.from("signature_requests").update({ status: "voided", void_reason: reason, status_changed_at: new Date().toISOString() }).eq("id", id);
          } else {
            await voidEnvelope(row.envelope_id, reason);
            await sb.from("signature_requests").update({ void_reason: reason }).eq("id", id);
            await syncRequest(sb, { ...row, void_reason: reason }, { eventStatus: "voided" });
          }
        } else if (!row.envelope_id) {
          await sb.from("signature_requests").update({ status: "voided", void_reason: reason, status_changed_at: new Date().toISOString() }).eq("id", id);
        } else {
          return NextResponse.json({ error: "This envelope can't be voided now." }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
      }
      case "refresh": {
        const fresh = await syncRequest(sb, row);
        return NextResponse.json({ ok: true, status: fresh.status });
      }
      case "pm-fields": {
        // Adds the fields the saved template lacks (initials, page-10 boxes, owner phones) to a draft contract.
        if (row.kind !== "pm_contract" || row.status !== "draft" || !row.envelope_id)
          return NextResponse.json({ error: "Only a draft management contract can be updated." }, { status: 400 });
        const env = await getRecipients(row.envelope_id);
        const signers = (env.signers || []).filter((s) => /^Landlord/.test(s.roleName) && s.email);
        signers.sort((a, b) => (a.roleName.includes("Authorized") ? -1 : b.roleName.includes("Authorized") ? 1 : a.roleName.localeCompare(b.roleName)));
        const { data: owner } = row.owner_id ? await sb.from("owners").select("name, email, phone").eq("id", row.owner_id).maybeSingle() : { data: null };
        const owners = signers.map((s, i) => ({
          name: s.name,
          email: s.email,
          phone: i === 0 || String(s.email).toLowerCase() === String(owner?.email || "").toLowerCase() ? owner?.phone || "" : "",
        }));
        const corporation = body.corporation === undefined ? looksCorporate(owners[0]?.name || owner?.name) : Boolean(body.corporation);
        const { data: addons } = row.property_id
          ? await sb.from("property_addons").select("addon_key").eq("property_id", row.property_id)
          : { data: [] };
        const added = await addTabsByRole(
          row.envelope_id,
          pmContractTabs(owners, { corporation, addons: (addons || []).map((a) => a.addon_key), contract: row.terms?.contract || null }),
          { replace: PM_TAB_LABELS }
        );
        if (row.terms?.contract?.fill_leases !== false) await fillLeaseSchedule(row.envelope_id, await pmLeaseRows(sb, row.property_id));
        return NextResponse.json({ ok: true, added });
      }
      case "move": {
        // Point a draft lease at another unit/property: property and landlord fields, the landlord signer,
        // and our record. Tenants, rent and dates stay as they are.
        if (row.kind !== "lease" || row.status !== "draft" || !row.envelope_id)
          return NextResponse.json({ error: "Only a draft lease can be moved to another unit." }, { status: 400 });
        const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
        const { data: unit } = await sb
          .from("units")
          .select("id, label, property:properties(id, address, city, postal_code, owner_id, owner_name)")
          .eq("id", body.unit_id || "")
          .maybeSingle();
        if (!unit?.property) return NextResponse.json({ error: "Choose the unit." }, { status: 400 });
        const p = unit.property;
        const { data: owner } = p.owner_id ? await sb.from("owners").select("id, name, email").eq("id", p.owner_id).maybeSingle() : { data: null };
        const landlordName = str(body.landlord_name) || owner?.name || p.owner_name || "";
        const signerName = str(body.signer_name) || owner?.name || "";
        const signerEmail = (str(body.signer_email) || owner?.email || "").toLowerCase();
        if (!landlordName) return NextResponse.json({ error: "Add the landlord's legal name." }, { status: 400 });
        if (!signerName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail))
          return NextResponse.json({ error: "The landlord signs the lease, so add their name and email." }, { status: 400 });

        const values = leaseMoveValues({
          unitLabel: unit.label,
          address: p.address,
          city: p.city,
          postalCode: p.postal_code,
          landlordName,
          landlord2Name: body.landlord2_name,
          signerName,
        });
        const env = await getRecipients(row.envelope_id, true);
        const landlordBefore = (env.signers || []).find((r) => r.roleName === "Landlord");
        let updated = 0;
        for (const r of env.signers || []) {
          const put = {};
          for (const [kind, list] of Object.entries(r.tabs || {})) {
            if (!Array.isArray(list)) continue;
            const hits = list.filter((t) => t?.tabId && Object.hasOwn(values, t.tabLabel)).map((t) => ({ tabId: t.tabId, value: values[t.tabLabel] }));
            // Staff sometimes add the landlord's own email to the consent page: swap the old landlord's for the new one.
            const oldEmail = str(landlordBefore?.email).toLowerCase();
            for (const t of list) {
              if (t?.tabLabel !== "Consent Landlord Email" || !oldEmail) continue;
              const v = String(t.value || "");
              if (v.toLowerCase().includes(oldEmail)) hits.push({ tabId: t.tabId, value: v.replace(new RegExp(oldEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), signerEmail) });
            }
            if (hits.length) put[kind] = hits;
          }
          if (Object.keys(put).length) {
            await ds(`/envelopes/${row.envelope_id}/recipients/${r.recipientId}/tabs`, { method: "PUT", body: put });
            updated += Object.values(put).flat().length;
          }
        }
        const landlord = (env.signers || []).find((r) => r.roleName === "Landlord");
        if (landlord) {
          await ds(`/envelopes/${row.envelope_id}/recipients`, {
            method: "PUT",
            body: { signers: [{ recipientId: landlord.recipientId, name: signerName, email: signerEmail }] },
          });
        }
        const place = [p.address, unit.label].filter(Boolean).join(", ");
        const subject = `Please sign: Lease: ${place}`.slice(0, 100);
        await ds(`/envelopes/${row.envelope_id}`, { method: "PUT", body: { emailSubject: subject } }).catch(() => {});
        const recipients = (Array.isArray(row.recipients) ? row.recipients : []).map((r) =>
          r.role === "Landlord" ? { ...r, name: signerName, email: signerEmail } : r
        );
        await sb
          .from("signature_requests")
          .update({
            unit_id: unit.id,
            property_id: p.id,
            owner_id: p.owner_id || null,
            title: `Lease: ${place}`,
            email_subject: subject,
            terms: { ...(row.terms || {}), unit_id: unit.id },
            recipients,
          })
          .eq("id", id);
        return NextResponse.json({ ok: true, updated, place });
      }
      case "relayout": {
        // Copy the template's current field positions onto a draft made before the template was adjusted.
        if (row.status !== "draft" || !row.envelope_id) return NextResponse.json({ error: "Only drafts can be updated." }, { status: 400 });
        const key = (KIND_TEMPLATES[row.kind] || [])[0];
        const tid = key ? await resolveTemplateId(key) : null;
        if (!tid) return NextResponse.json({ error: "This document wasn't made from a template." }, { status: 400 });
        const [tpl, env] = await Promise.all([ds(`/templates/${tid}/recipients?include_tabs=true`), getRecipients(row.envelope_id, true)]);
        let changed = 0;
        for (const s of env.signers || []) {
          const ts = (tpl.signers || []).find((z) => z.roleName === s.roleName);
          if (!ts) continue;
          const body = {};
          for (const [g, list] of Object.entries(s.tabs || {})) {
            if (!Array.isArray(list) || /signHere|initialHere|radioGroup/.test(g)) continue;
            for (const t of list) {
              if (t.anchorString) continue;
              const m = (ts.tabs?.[g] || []).find((z) => z.tabLabel === t.tabLabel && z.pageNumber === t.pageNumber && z.documentId === t.documentId);
              if (!m) continue;
              const ch = {};
              for (const k of ["xPosition", "yPosition", "height"]) if (m[k] !== undefined && m[k] !== t[k]) ch[k] = m[k];
              if (Object.keys(ch).length) (body[g] ||= []).push({ tabId: t.tabId, ...ch });
            }
          }
          if (Object.keys(body).length) {
            await ds(`/envelopes/${row.envelope_id}/recipients/${s.recipientId}/tabs`, { method: "PUT", body });
            changed += Object.values(body).flat().length;
          }
        }
        return NextResponse.json({ ok: true, changed });
      }
      case "page-image": {
        if (!row.envelope_id) return NextResponse.json({ error: "No envelope." }, { status: 400 });
        const page = Math.max(1, Math.min(40, Number(body.page) || 1));
        const png = await pageImage(row.envelope_id, page, "1", [72, 110, 150].includes(Number(body.dpi)) ? Number(body.dpi) : 72);
        return NextResponse.json({ page, png: png.toString("base64") });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message, consentRequired: err.consentRequired }, { status: 502 });
  }
}
