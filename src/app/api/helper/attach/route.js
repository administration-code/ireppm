import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lets the staff helper (Claude) attach files itself, instead of Rosie uploading them by hand.
// Header: Authorization: Bearer <HELPER_API_TOKEN>.
//   POST { target: "maintenance_photo", target_id, name, type, size, note? }
//   POST { target: "expense_bill", target_id, name, type, size, note? }
//     → { upload_url, path }. PUT the file bytes to upload_url, then:
//   POST { confirm: true, target, target_id, path, name, size? } → adds the file to the record.
// Every attach is logged in helper_uploads. Files: images, video or PDF, up to 50 MB.
const TARGETS = {
  maintenance_photo: { bucket: "maintenance-photos", table: "maintenance_requests", types: /^(image|video)\// },
  expense_bill: { bucket: "landlord-expenses", table: "landlord_expenses", types: /^(image\/|application\/pdf$)/ },
};
function tokenOk(request) {
  const expected = process.env.HELPER_API_TOKEN;
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request) {
  if (!tokenOk(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const t = TARGETS[body.target];
  if (!t || !UUID.test(String(body.target_id || ""))) return NextResponse.json({ error: "Unknown target" }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data: rec } = await sb.from(t.table).select("*").eq("id", body.target_id).maybeSingle();
  if (!rec) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  const name = String(body.name || "file").replace(/[^\w.\-]+/g, "_").slice(-80);

  if (!body.confirm) {
    if (!t.types.test(String(body.type || ""))) return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    if (!(Number(body.size) > 0 && Number(body.size) <= 50 * 1024 * 1024)) return NextResponse.json({ error: "File too large" }, { status: 400 });
    const folder = body.target === "maintenance_photo" ? `helper/${rec.id}` : rec.id;
    const path = `${folder}/${Date.now()}-${name}`;
    const { data, error } = await sb.storage.from(t.bucket).createSignedUploadUrl(path);
    if (error || !data?.signedUrl) return NextResponse.json({ error: "Could not prepare the upload" }, { status: 500 });
    return NextResponse.json({ upload_url: data.signedUrl, path });
  }

  const path = String(body.path || "");
  const expectedPrefix = body.target === "maintenance_photo" ? `helper/${rec.id}/` : `${rec.id}/`;
  if (!path.startsWith(expectedPrefix)) return NextResponse.json({ error: "Bad path" }, { status: 400 });
  const dir = path.slice(0, path.lastIndexOf("/"));
  const { data: listed } = await sb.storage.from(t.bucket).list(dir, { search: path.slice(dir.length + 1) });
  if (!listed?.length) return NextResponse.json({ error: "The file hasn't been uploaded yet" }, { status: 409 });
  const update =
    body.target === "maintenance_photo"
      ? { photos: [...(rec.photos || []), { name: body.name || name, path }] }
      : { invoice_path: path, invoice_name: body.name || name };
  const { error } = await sb.from(t.table).update(update).eq("id", rec.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await sb.from("helper_uploads").insert({
    target: body.target,
    target_id: rec.id,
    file_name: body.name || name,
    path,
    bytes: Number(body.size) || null,
    note: body.note ? String(body.note).slice(0, 300) : null,
  });
  return NextResponse.json({ ok: true });
}
