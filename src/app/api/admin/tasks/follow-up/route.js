import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { assignToPartner } from "@/lib/partner-tasks";
import { chuckPartnerId } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Staff: "Ask Chuck to Follow Up" on a document still waiting for signatures. Makes a task for Chuck
// to talk to the people who haven't signed, linked to the document and tenancy.
//   POST { signature_request_id, note? }
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const staff = await staffFromRequest(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { signature_request_id: id, note } = await request.json().catch(() => ({}));
  const { data: sig } = await sb.from("signature_requests").select("id, title, status, recipients, tenancy_id, unit_id, property_id").eq("id", id).maybeSingle();
  if (!sig || !["sent", "delivered"].includes(sig.status)) return NextResponse.json({ error: "That document isn't waiting for signatures." }, { status: 400 });
  const { waitingFor } = await import("@/lib/signatures");
  const w = waitingFor(sig);
  if (!w.now.length) return NextResponse.json({ error: "Nobody is waiting to sign." }, { status: 400 });
  const partnerId = await chuckPartnerId(sb);
  if (!partnerId) return NextResponse.json({ error: "Chuck's partner record wasn't found." }, { status: 400 });
  const names = w.now.map((p) => p.name).join(" and ");
  const detail = [
    `${sig.title}: still waiting for ${w.now.map((p) => `${p.name} (${p.opened ? "has opened it" : "hasn't opened it yet"})`).join(", ")}.`,
    "Please remind them to sign. The DocuSign email came from IRep Property Management; if they can't find it, they can call the office and we'll resend it.",
    String(note || "").trim(),
  ]
    .filter(Boolean)
    .join("\n");
  const { data: task, error } = await sb
    .from("staff_tasks")
    .insert({
      title: `Talk to ${names} about signing`.slice(0, 200),
      detail,
      status: "open",
      kind: "follow_up",
      tenancy_id: sig.tenancy_id,
      unit_id: sig.unit_id,
      property_id: sig.property_id,
      signature_request_id: sig.id,
      link: `/admin/signatures/${sig.id}`,
      source: "staff",
      created_by: staff.id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const r = await assignToPartner(sb, task.id, partnerId, staff.id);
  return NextResponse.json(r.error ? r : { ok: true, id: task.id }, { status: r.error ? 400 : 200 });
}
