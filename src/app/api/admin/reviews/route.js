import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffUser } from "@/lib/signatures-server";
import { reviewerPlaces } from "@/lib/reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const admin = getSupabaseAdmin();
  if (!(await staffUser(admin, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { data, error } = await admin.from("reviews").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const places = await reviewerPlaces(admin, (data || []).map((r) => r.profile_id));
  return NextResponse.json({ reviews: (data || []).map((r) => ({ ...r, places: places[r.profile_id] || [] })) });
}

export async function POST(request) {
  const admin = getSupabaseAdmin();
  const staff = await staffUser(admin, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { id, action, reply } = await request.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) return NextResponse.json({ error: "Missing review." }, { status: 400 });
  const now = new Date().toISOString();
  let res;
  if (action === "approve") res = await admin.from("reviews").update({ status: "approved", approved_at: now, reviewed_by: staff.id }).eq("id", id);
  else if (action === "hide") res = await admin.from("reviews").update({ status: "hidden", reviewed_by: staff.id }).eq("id", id);
  else if (action === "pending") res = await admin.from("reviews").update({ status: "pending", approved_at: null }).eq("id", id);
  else if (action === "reply") res = await admin.from("reviews").update({ staff_reply: String(reply || "").trim().slice(0, 1000) || null }).eq("id", id);
  else if (action === "delete") res = await admin.from("reviews").delete().eq("id", id);
  else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  revalidatePath("/reviews");
  revalidatePath("/landlords");
  return NextResponse.json({ ok: true });
}
