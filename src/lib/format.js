export function money(n) {
  return "$" + Number(n || 0).toLocaleString("en-CA");
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
