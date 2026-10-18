import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { WINDOWS, isExactTime, emailRenter, loadShowingByToken, sendTenantNotice, windowStart } from "@/lib/showings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Chuck (or staff) answers a showing request from the private link.
// POST { token, action: "approve" | "decline" | "reschedule", date?, time?, note?, notifyTenants? }
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const admin = getSupabaseAdmin();
  const s = await loadShowingByToken(admin, body?.token);
  if (!s) return NextResponse.json({ error: "This link isn't valid any more." }, { status: 404 });
  if (!["requested", "rescheduled", "confirmed"].includes(s.status)) {
    return NextResponse.json({ error: `This showing is already ${s.status}.` }, { status: 400 });
  }
  const note = String(body?.note || "").trim().slice(0, 500) || null;
  const earliest = s.vacant ? Date.now() : Date.now() + 24 * 3600 * 1000;
  const now = new Date().toISOString();

  if (body.action === "approve") {
    if (windowStart(s.preferred_date, s.preferred_time).getTime() < earliest) {
      return NextResponse.json(
        { error: "That time is less than 24 hours away and the unit is occupied, so the tenants can't get proper notice. Suggest a new time instead." },
        { status: 400 }
      );
    }
    const { error } = await admin
      .from("showing_requests")
      .update({ status: "confirmed", confirmed_at: now, decided_at: now, staff_note: note })
      .eq("id", s.id);
    if (error) return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    const updated = { ...s, status: "confirmed", staff_note: note };
    await emailRenter(updated, "confirmed");
    const notice = body.notifyTenants === false ? { sent: 0 } : await sendTenantNotice(admin, updated);
    return NextResponse.json({ status: "confirmed", tenantsNotified: notice.sent });
  }

  if (body.action === "decline") {
    const { error } = await admin
      .from("showing_requests")
      .update({ status: "declined", decided_at: now, staff_note: note })
      .eq("id", s.id);
    if (error) return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    await emailRenter({ ...s, staff_note: note }, "declined");
    return NextResponse.json({ status: "declined" });
  }

  if (body.action === "reschedule") {
    const date = String(body.date || "");
    const time = String(body.time || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(WINDOWS.includes(time) || isExactTime(time))) {
      return NextResponse.json({ error: "Pick a day and a time window." }, { status: 400 });
    }
    if (windowStart(date, time).getTime() < earliest) {
      return NextResponse.json(
        { error: s.vacant ? "Pick a time that hasn't started yet." : "Pick a time at least 24 hours away, so the tenants get notice." },
        { status: 400 }
      );
    }
    const { error } = await admin
      .from("showing_requests")
      .update({ status: "rescheduled", proposed_date: date, proposed_time: time, decided_at: now, staff_note: note })
      .eq("id", s.id);
    if (error) return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    await emailRenter({ ...s, proposed_date: date, proposed_time: time, staff_note: note }, "rescheduled");
    return NextResponse.json({ status: "rescheduled" });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
