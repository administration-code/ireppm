import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isConfigured } from "@/lib/docusign";
import { staffUser } from "@/lib/signatures-server";
import { syncOutstanding } from "@/lib/signatures-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST: bring every open signature request up to date with DocuSign and add envelopes made there directly.
export async function POST(request) {
  const sb = getSupabaseAdmin();
  if (!(await staffUser(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  if (!isConfigured()) return NextResponse.json({ error: "DocuSign isn't set up yet." }, { status: 400 });
  try {
    return NextResponse.json(await syncOutstanding(sb));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
