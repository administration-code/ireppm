import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveToken, SENSITIVE_BUCKET, WATERMARK } from "@/lib/sensitive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") {
    const chunk = buf.slice(12, 16).toString();
    if (chunk === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  }
  return null;
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// The file behind a secure viewing link, only while the link is valid. Images are sent with the
// watermark drawn into the picture; PDFs are shown inline (the page covers them with the watermark).
export async function GET(request, { params }) {
  const { token } = await params;
  const sb = getSupabaseAdmin();
  const file = await resolveToken(sb, token);
  if (!file) return new NextResponse("This link has expired.", { status: 410 });
  const { data: blob, error } = await sb.storage.from(SENSITIVE_BUCKET).download(file.path);
  if (error || !blob) return new NextResponse("Not available.", { status: 404 });
  const buf = Buffer.from(await blob.arrayBuffer());
  const headers = { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" };
  if (/^image\/(jpeg|png|webp)$/.test(file.mime || "")) {
    const { w, h } = imageSize(buf) || { w: 1200, h: 900 };
    const size = Math.max(18, Math.round(Math.min(w, h) / 18));
    const marks = [];
    for (let y = size * 2; y < h + size * 4; y += size * 5)
      for (let x = -w; x < w * 1.5; x += size * 18) marks.push(`<text x="${x}" y="${y}">${esc(WATERMARK)}</text>`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<image width="${w}" height="${h}" xlink:href="data:${file.mime};base64,${buf.toString("base64")}"/>
<g transform="rotate(-24 ${w / 2} ${h / 2})" fill="#B41710" fill-opacity="0.32" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${size}">${marks.join("")}</g>
</svg>`;
    return new NextResponse(svg, { headers: { ...headers, "Content-Type": "image/svg+xml" } });
  }
  if (file.mime === "application/pdf") return new NextResponse(buf, { headers: { ...headers, "Content-Type": "application/pdf" } });
  return new NextResponse("This file type can't be shown here. Ask IRep to send it another way.", { status: 415 });
}
