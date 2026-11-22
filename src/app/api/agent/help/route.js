import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerFromRequest } from "@/lib/server-auth";
import { FAST_MODEL, callModel, redact } from "@/lib/ai";
import { HELPER_PROMPT } from "@/lib/chuck-help";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agent Portal helper: "How do I…?" in plain words. Short answers from a small, cheap model (counts toward the AI cap).
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const question = redact(String(body.question || "").trim()).slice(0, 500);
  if (question.length < 3) return NextResponse.json({ error: "Type your question." }, { status: 400 });
  try {
    const out = await callModel(sb, {
      feature: "agent_helper",
      model: FAST_MODEL,
      system: HELPER_PROMPT,
      messages: [{ role: "user", content: question }],
      maxTokens: 300,
      userId: partner.userId,
    });
    const answer = (out.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
    return NextResponse.json({ answer: answer || "Ask Rosie: email administration@ireppm.ca or call the office at 519-590-7200." });
  } catch {
    return NextResponse.json({ answer: "The helper isn't available right now. Pick one of the buttons above, or ask Rosie: email administration@ireppm.ca or call the office at 519-590-7200." });
  }
}
