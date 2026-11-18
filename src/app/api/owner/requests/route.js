import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { userFromRequest } from "@/lib/server-auth";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { REQUEST_KINDS, kindLabel, needsMonth } from "@/lib/owner-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_OPEN = 10;

async function whoIs(sb, request) {
  const who = await userFromRequest(sb, request);
  if (!who) return null;
  const { data } = await sb.from("owners").select("id, name, email").eq("profile_id", who.user.id);
  return data?.length ? { userId: who.user.id, owners: data } : null;
}

const monthName = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { month: "long", year: "numeric" }) : "");

// GET: the landlord's own requests, newest first.
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const me = await whoIs(sb, request);
  if (!me) return NextResponse.json({ error: "Sign in to your owner portal." }, { status: 401 });
  const { data, error } = await sb
    .from("owner_requests")
    .select("id, kind, period, message, status, staff_reply, created_at, done_at, property:properties(address)")
    .in("owner_id", me.owners.map((o) => o.id))
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "We couldn't load your requests." }, { status: 500 });
  return NextResponse.json({ requests: data || [] });
}

// POST { kind, property_id?, period?: "YYYY-MM", message? }
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const me = await whoIs(sb, request);
  if (!me) return NextResponse.json({ error: "Sign in to your owner portal." }, { status: 401 });
  const body = await request.json().catch(() => ({}));

  const kind = REQUEST_KINDS.some((k) => k.value === body?.kind) ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "Choose what you'd like." }, { status: 400 });
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : "";
  if (kind === "other" && !message) return NextResponse.json({ error: "Tell us what you need." }, { status: 400 });
  let period = null;
  if (needsMonth(kind)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(body?.period || ""))) return NextResponse.json({ error: "Choose the month." }, { status: 400 });
    period = `${body.period}-01`;
  }

  const ownerIds = me.owners.map((o) => o.id);
  let ownerId = ownerIds[0];
  let property = null;
  if (body?.property_id) {
    if (!UUID.test(body.property_id)) return NextResponse.json({ error: "Choose one of your properties." }, { status: 400 });
    const { data } = await sb.from("properties").select("id, address, owner_id").eq("id", body.property_id).maybeSingle();
    if (!data || !ownerIds.includes(data.owner_id)) return NextResponse.json({ error: "Choose one of your properties." }, { status: 400 });
    property = data;
    ownerId = data.owner_id;
  }

  const { count } = await sb.from("owner_requests").select("id", { count: "exact", head: true }).in("owner_id", ownerIds).eq("status", "open");
  if ((count || 0) >= MAX_OPEN)
    return NextResponse.json({ error: "You have several requests open already. We'll answer those first." }, { status: 429 });

  const { data: saved, error } = await sb
    .from("owner_requests")
    .insert({ owner_id: ownerId, property_id: property?.id || null, kind, period, message: message || null, created_by: me.userId })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });

  const to = (process.env.STAFF_ALERT_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (to.length && mailConfigured()) {
    const owner = me.owners.find((o) => o.id === ownerId);
    const heading = "Landlord Information Request";
    const rows = [
      ["Landlord", owner?.name || ""],
      ["Request", kindLabel(kind)],
      ...(period ? [["Month", monthName(period)]] : []),
      ["Property", property?.address || "All properties"],
      ...(message ? [["Message", message]] : []),
    ];
    const link = { href: "https://ireppm.ca/admin/owner-requests", label: "Open owner requests" };
    await mailer()
      .emails.send({
        from: "IRep Property Management <alerts@ireppm.ca>",
        to,
        ...(owner?.email ? { replyTo: owner.email } : {}),
        subject: `Landlord request: ${kindLabel(kind)} (${owner?.name || "landlord"})`,
        html: renderEmail({ heading, intro: `${owner?.name || "A landlord"} asked for information from the owner portal.`, rows, link }),
        text: renderText({ heading, rows, link }),
      })
      .catch(() => {});
  }
  return NextResponse.json({ id: saved.id });
}
