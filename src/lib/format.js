export function money(n) {
  const v = Math.round(Number(n || 0) * 100) / 100;
  const digits = Number.isInteger(v) ? 0 : 2;
  return "$" + v.toLocaleString("en-CA", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// "November 15, 2026" from a YYYY-MM-DD date (or the date part of a timestamp).
export function longDate(iso) {
  if (!iso) return "";
  return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function availableText(dateStr) {
  if (!dateStr) return "Now";
  const d = new Date(dateStr + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "Now";
  if (d <= new Date()) return "Now";
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export function listingTitle(l) {
  return l.unit ? `${l.address}, ${l.unit}` : l.address;
}
