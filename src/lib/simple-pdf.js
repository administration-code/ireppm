import "server-only";
import { PDF_FONTS } from "@/lib/pdf-fonts";

// A small PDF writer for invoices: US Letter pages, IRep's brand fonts (embedded),
// text with letter-spacing, lines, boxes and filled paths. Text is encoded as WinAnsi.

const PAGE_W = 612;
const PAGE_H = 792;
const FONT_KEYS = Object.keys(PDF_FONTS); // body, bodySemi, display
const fontRef = (font) => `F${Math.max(0, FONT_KEYS.indexOf(font)) + 1}`;

// Unicode → WinAnsi byte for the few characters outside Latin-1 that invoices use.
const WIN = { "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "…": 0x85, "€": 0x80 };

function toWin(str) {
  let out = "";
  for (const ch of String(str ?? "")) {
    const c = ch.codePointAt(0);
    if (WIN[ch]) out += String.fromCharCode(WIN[ch]);
    else if (c === 10 || c === 13 || c === 9) out += " ";
    else if (c >= 32 && c <= 255 && !(c >= 127 && c < 160)) out += ch;
    else out += "?";
  }
  return out;
}

// Width in points; spacing is extra space after each character, in points (CSS letter-spacing).
export function textWidth(str, size, font = "body", spacing = 0) {
  const s = toWin(str);
  const widths = (PDF_FONTS[font] || PDF_FONTS.body).widths;
  let w = 0;
  for (let i = 0; i < s.length; i++) w += widths[s.charCodeAt(i) - 32] || 500;
  return (w * size) / 1000 + spacing * Math.max(0, s.length - 1);
}

// Splits text into lines no wider than maxWidth. Blank lines in the input are kept.
export function wrap(str, size, maxWidth, font = "body") {
  const out = [];
  for (const para of String(str ?? "").split(/\r?\n/)) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (textWidth(test, size, font) <= maxWidth) line = test;
      else {
        if (line) out.push(line);
        let w = word;
        while (textWidth(w, size, font) > maxWidth && w.length > 1) {
          let cut = w.length - 1;
          while (cut > 1 && textWidth(w.slice(0, cut), size, font) > maxWidth) cut--;
          out.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

const esc = (s) => toWin(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const rgb = (hex) => {
  const h = String(hex || "#000000").replace("#", "");
  return [0, 2, 4].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
};
const n = (v) => Number(v).toFixed(2);

export function createPdf({ title = "", author = "" } = {}) {
  const pages = [];
  let ops = null;

  const doc = {
    width: PAGE_W,
    height: PAGE_H,
    addPage() {
      ops = [];
      pages.push(ops);
      return doc;
    },
    // y is measured from the top of the page (the text baseline).
    text(str, x, y, { size = 10, font = "body", color = "#161616", align = "left", spacing = 0 } = {}) {
      const w = textWidth(str, size, font, spacing);
      const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
      ops.push(
        `BT /${fontRef(font)} ${n(size)} Tf ${n(spacing)} Tc ${rgb(color)} rg ${n(left)} ${n(PAGE_H - y)} Td (${esc(str)}) Tj ET`
      );
      return doc;
    },
    line(x1, y1, x2, y2, { color = "#e3ded4", width = 0.75 } = {}) {
      ops.push(`${rgb(color)} RG ${n(width)} w ${n(x1)} ${n(PAGE_H - y1)} m ${n(x2)} ${n(PAGE_H - y2)} l S`);
      return doc;
    },
    rect(x, y, w, h, { fill = "#F7F4EE" } = {}) {
      ops.push(`${rgb(fill)} rg ${n(x)} ${n(PAGE_H - y - h)} ${n(w)} ${n(h)} re f`);
      return doc;
    },
    // Fills a path given as [["M", x, y], ["L", x, y], ["C", x1, y1, x2, y2, x, y], ["Z"]] in page units from the top.
    path(cmds, { fill = "#161616", evenOdd = false } = {}) {
      const parts = cmds.map(([op, ...a]) => {
        if (op === "M") return `${n(a[0])} ${n(PAGE_H - a[1])} m`;
        if (op === "L") return `${n(a[0])} ${n(PAGE_H - a[1])} l`;
        if (op === "C") return `${n(a[0])} ${n(PAGE_H - a[1])} ${n(a[2])} ${n(PAGE_H - a[3])} ${n(a[4])} ${n(PAGE_H - a[5])} c`;
        return "h";
      });
      ops.push(`${rgb(fill)} rg ${parts.join(" ")} ${evenOdd ? "f*" : "f"}`);
      return doc;
    },
    // Returns the PDF as a Buffer.
    toBuffer() {
      const objects = [];
      const add = (body) => {
        objects.push(body);
        return objects.length;
      };
      const catalog = add(null);
      const pagesObj = add(null);
      const fontObjs = FONT_KEYS.map((key) => {
        const f = PDF_FONTS[key];
        const bytes = Buffer.from(f.data, "base64");
        const file = add(`<< /Length ${bytes.length} /Length1 ${bytes.length} >>\nstream\n${bytes.toString("latin1")}\nendstream`);
        const desc = add(
          `<< /Type /FontDescriptor /FontName /${f.name} /Flags 32 /FontBBox [${f.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${f.ascent} /Descent ${f.descent} /CapHeight ${f.capHeight} /StemV 80 /FontFile2 ${file} 0 R >>`
        );
        return add(
          `<< /Type /Font /Subtype /TrueType /BaseFont /${f.name} /FirstChar 32 /LastChar 255 /Widths [${f.widths.join(" ")}] /Encoding /WinAnsiEncoding /FontDescriptor ${desc} 0 R >>`
        );
      });
      const fontDict = fontObjs.map((o, i) => `/F${i + 1} ${o} 0 R`).join(" ");
      const kids = [];
      for (const p of pages) {
        const stream = p.join("\n");
        const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
        kids.push(
          add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << ${fontDict} >> >> /Contents ${content} 0 R >>`)
        );
      }
      objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
      objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
      const info = add(`<< /Title (${esc(title)}) /Author (${esc(author)}) /Producer (ireppm.ca) >>`);

      let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
      const offsets = [];
      objects.forEach((body, i) => {
        offsets.push(Buffer.byteLength(out, "latin1"));
        out += `${i + 1} 0 obj\n${body}\nendobj\n`;
      });
      const xref = Buffer.byteLength(out, "latin1");
      out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
      for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
      out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      return Buffer.from(out, "latin1");
    },
  };
  return doc;
}

// The IRep house mark (same shapes as components/Brand.js), drawn at (x, y) top-left, `size` points tall.
export function drawIRepMark(pdf, x, y, size, color = "#B41710") {
  // SVG viewBox: 2.31 10.31 115.38 144.38
  const s = size / 144.38;
  const X = (v) => x + (v - 2.31) * s;
  const Y = (v) => y + (v - 10.31) * s;
  const k = 0.5523;
  // Semicircle over the top from (cx-r, cy) to (cx+r, cy), or back the other way.
  const over = (cx, cy, r) => [
    ["C", X(cx - r), Y(cy - k * r), X(cx - k * r), Y(cy - r), X(cx), Y(cy - r)],
    ["C", X(cx + k * r), Y(cy - r), X(cx + r), Y(cy - k * r), X(cx + r), Y(cy)],
  ];
  const back = (cx, cy, r) => [
    ["C", X(cx + r), Y(cy - k * r), X(cx + k * r), Y(cy - r), X(cx), Y(cy - r)],
    ["C", X(cx - k * r), Y(cy - r), X(cx - r), Y(cy - k * r), X(cx - r), Y(cy)],
  ];
  const poly = (pts) => [["M", X(pts[0][0]), Y(pts[0][1])], ...pts.slice(1).map(([a, b]) => ["L", X(a), Y(b)]), ["Z"]];
  // Outline ring
  pdf.path(
    [["M", X(10), Y(148)], ["L", X(10), Y(62)], ...over(60, 62, 50), ["L", X(110), Y(148)], ["L", X(106), Y(148)], ["L", X(106), Y(62)], ...back(60, 62, 46), ["L", X(14), Y(148)], ["Z"]],
    { fill: color }
  );
  // Inner arch with the house and door cut out
  pdf.path(
    [
      ["M", X(18), Y(148)], ["L", X(18), Y(62)], ...over(60, 62, 42), ["L", X(102), Y(148)], ["Z"],
      ...poly([[60, 64], [71.7, 75], [69, 75], [69, 85.5], [51, 85.5], [51, 75], [48.3, 75]]),
      ...poly([[55.5, 90], [64.5, 90], [68.5, 124], [51.5, 124]]),
    ],
    { fill: color, evenOdd: true }
  );
  // The house, in IRep Red
  pdf.path(poly([[60, 64], [71.7, 75], [69, 75], [69, 85.5], [51, 85.5], [51, 75], [48.3, 75]]), { fill: "#B41710" });
  // Base
  pdf.path(poly([[4, 148], [116, 148], [116, 153], [4, 153]]), { fill: color });
}
