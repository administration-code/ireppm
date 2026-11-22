import { NextResponse } from "next/server";
import { pushConfigured, vapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

// The public key phones need to turn notifications on.
export async function GET() {
  return NextResponse.json({ configured: pushConfigured(), key: pushConfigured() ? vapidPublicKey() : null });
}
