import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { consoleViewUrl, resendEnvelope, senderViewUrl, voidEnvelope } from "@/lib/docusign";
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
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message, consentRequired: err.consentRequired }, { status: 502 });
  }
}
