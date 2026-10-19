import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { addTabsByRole, consoleViewUrl, getRecipients, pageImage, resendEnvelope, senderViewUrl, voidEnvelope } from "@/lib/docusign";
import { looksCorporate, pmContractTabs } from "@/lib/docusign-templates";
import { SIGNED_BUCKET, staffUser, syncRequest } from "@/lib/signatures-server";

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
            // Drafts can't be voided in DocuSign; mark ours as voided.
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
        const added = await addTabsByRole(row.envelope_id, pmContractTabs(owners, { corporation }));
        return NextResponse.json({ ok: true, added });
      }
      case "page-image": {
        if (!row.envelope_id) return NextResponse.json({ error: "No envelope." }, { status: 400 });
        const page = Math.max(1, Math.min(40, Number(body.page) || 1));
        const png = await pageImage(row.envelope_id, page);
        return NextResponse.json({ page, png: png.toString("base64") });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message, consentRequired: err.consentRequired }, { status: 502 });
  }
}
