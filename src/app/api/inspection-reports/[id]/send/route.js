import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { sendReportToOwner } from "@/lib/inspection-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Staff: email the landlord the report (with any estimates) to approve or decline line by line.
export async function POST(request, { params }) {
  const { id } = await params;
  if (!UUID.test(String(id))) return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  const sb = getSupabaseAdmin();
  const staff = await staffFromRequest(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  let body = {};
  try {
    body = await request.json();
  } catch {}
  const out = await sendReportToOwner(sb, id, { message: body?.message, sentBy: staff?.email || "Staff" });
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.error === "Report not found." ? 404 : 400 });
  return NextResponse.json(out);
}
