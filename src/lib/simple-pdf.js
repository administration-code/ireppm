import "server-only";

// A small PDF writer for invoices: US Letter pages, the built-in Helvetica and Times fonts,
// text, lines and filled boxes. No images or embedded fonts. Text is encoded as WinAnsi.

const PAGE_W = 612;
const PAGE_H = 792;

// Advance widths (per 1000 em) for characters 32–126.
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833,
  556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELV_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889,
  611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

const FONTS = { regular: "Helvetica", bold: "Helvetica-Bold", serif: "Times-Bold" };

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

function charWidth(byte, font) {
  const table = font === "bold" ? HELV_BOLD : HELV;
  if (byte >= 32 && byte <= 126) return table[byte - 32];
  if (byte === 0x96) return 556;
  if (byte === 0x97) return 1000;
  if (byte === 0x91 || byte === 0x92) return font === "bold" ? 278 : 222;
  if (byte === 0x93 || byte === 0x94) return font === "bold" ? 500 : 333;
  if (byte === 0xb7 || byte === 0x95) return 350;
  return 556;
}

export function textWidth(str, size, font = "regular") {
  const s = toWin(str);
  let w = 0;
  for (let i = 0; i < s.length; i++) w += charWidth(s.charCodeAt(i), font);
  // Times-Bold is used for titles only; Helvetica widths are close enough for placement.
  return (w * size) / 1000;
}

// Splits text into lines no wider than maxWidth. Blank lines in the input are kept.
export function wrap(str, size, maxWidth, font = "regular") {
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
        // A single word wider than the column is cut.
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
    // y is measured from the top of the page (baseline of the text).
    text(str, x, y, { size = 10, font = "regular", color = "#161616", align = "left" } = {}) {
      let left = x;
      if (align === "right") left = x - textWidth(str, size, font);
      else if (align === "center") left = x - textWidth(str, size, font) / 2;
      ops.push(`BT /${font === "bold" ? "F2" : font === "serif" ? "F3" : "F1"} ${n(size)} Tf ${rgb(color)} rg ${n(left)} ${n(PAGE_H - y)} Td (${esc(str)}) Tj ET`);
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
    // Returns the PDF as a Buffer.
    toBuffer() {
      const objects = [];
      const add = (body) => {
        objects.push(body);
        return objects.length;
      };
      const catalog = add(null);
      const pagesObj = add(null);
      const f1 = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS.regular} /Encoding /WinAnsiEncoding >>`);
      const f2 = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS.bold} /Encoding /WinAnsiEncoding >>`);
      const f3 = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS.serif} /Encoding /WinAnsiEncoding >>`);
      const kids = [];
      for (const p of pages) {
        const stream = p.join("\n");
        const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
        kids.push(
          add(
            `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >> >> /Contents ${content} 0 R >>`
          )
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
