import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffUser } from "@/lib/signatures-server";
import { drawList, emailWinner, monthStart, pickWinner } from "@/lib/payprop-draw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validMonth = (m) => (/^\d{4}-\d{2}$/.test(String(m || "")) ? `${m}-01` : null);

export async function GET(request) {
  const admin = getSupabaseAdmin();
  if (!(await staffUser(admin, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const month = validMonth(new URL(request.url).searchParams.get("month")) || monthStart(new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }));
  try {
    return NextResponse.json(await drawList(admin, month));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST { month, action: "draw" | "email" | "gift_sent" | "reset" }
export async function POST(request) {
  const admin = getSupabaseAdmin();
  const staff = await staffUser(admin, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { month, action } = await request.json().catch(() => ({}));
  const period = validMonth(month);
  if (!period) return NextResponse.json({ error: "Pick a month." }, { status: 400 });
  try {
    if (action === "draw") return NextResponse.json(await pickWinner(admin, period, staff.id));
    if (action === "email") return NextResponse.json(await emailWinner(admin, period));
    if (action === "gift_sent") {
      await admin.from("payprop_draws").update({ gift_card_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("period", period);
      return NextResponse.json({ ok: true });
    }
    if (action === "reset") {
      // Only before the winner has been told.
      const { data } = await admin.from("payprop_draws").select("winner_emailed_at").eq("period", period).maybeSingle();
      if (data?.winner_emailed_at) return NextResponse.json({ error: "The winner has already been emailed." }, { status: 400 });
      await admin.from("payprop_draws").delete().eq("period", period);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
