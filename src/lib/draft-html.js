import { SITE } from "@/lib/site";

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// The written document as HTML for DocuSign to turn into a PDF. Blank lines separate paragraphs;
// a line starting with "# " is a heading.
export function draftHtml(title, text, signers) {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) =>
      b.startsWith("# ")
        ? `<h2 style="font-size:15pt;margin:18px 0 6px;">${esc(b.slice(2))}</h2>`
        : `<p style="margin:0 0 10px;">${esc(b).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "long", day: "numeric", year: "numeric" });
  const sigs = signers
    .map(
      (s, i) => `<table style="width:100%;margin:28px 0 0;border-collapse:collapse;"><tr>
        <td style="width:60%;padding-right:24px;vertical-align:bottom;"><div style="height:40px;"><span style="color:#ffffff;font-size:1pt;">/sn${i + 1}/</span></div><div style="border-top:1px solid #000;padding-top:4px;">${esc(s.name)} (${esc(s.role)})</div></td>
        <td style="width:40%;vertical-align:bottom;"><div style="height:40px;"><span style="color:#ffffff;font-size:1pt;">/ds${i + 1}/</span></div><div style="border-top:1px solid #000;padding-top:4px;">Date</div></td>
      </tr></table>`
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.45;color:#161616;">
<table style="width:100%;border-bottom:2px solid #B41710;padding-bottom:8px;margin-bottom:18px;"><tr>
<td style="font-family:Georgia,serif;font-size:20pt;letter-spacing:2px;"><b>IREP</b><br><span style="font-family:Arial,sans-serif;font-size:7pt;letter-spacing:2px;">PROPERTY MANAGEMENT</span></td>
<td style="text-align:right;font-size:9pt;">${esc(SITE.name)}<br>${esc(SITE.address)}<br>${esc(SITE.phone)} · ${esc(SITE.email)}</td>
</tr></table>
<p style="margin:0 0 6px;font-size:10pt;color:#555;">${esc(today)}</p>
<h1 style="font-family:Georgia,serif;font-size:20pt;font-weight:normal;margin:0 0 16px;">${esc(title)}</h1>
${blocks}
<div style="margin-top:28px;">${sigs}</div>
</body></html>`;
}

