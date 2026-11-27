import "server-only";

// N4s whose arrears have been paid (the tenancy's balance is $0 or in credit).
//  - A served N4 is marked "resolved" (it drops off the N4 to-do lists), with a note.
//  - An N4 not served yet drops off Chuck's Notices to Serve (see serveBoard).
//  - Its Certificate of Service, if still out for signature (or a draft), is listed so staff can void it.

const SINCE_DAYS = 120;
const PAID = 0.5; // balance at or below this counts as paid

export async function paidN4s(sb) {
  const since = new Date(Date.now() - SINCE_DAYS * 86400000).toISOString();
  const { data: forms } = await sb
    .from("signature_requests")
    .select("id, title, tenancy_id, notice_id, completed_at")
    .eq("kind", "N4")
    .eq("status", "completed")
    .gte("completed_at", since);
  const tenIds = [...new Set((forms || []).map((f) => f.tenancy_id).filter(Boolean))];
  if (!tenIds.length) return [];
  const [{ data: bals }, { data: certs }, { data: notices }] = await Promise.all([
    sb.from("tenancy_balances").select("tenancy_id, balance").in("tenancy_id", tenIds),
    sb
      .from("signature_requests")
      .select("id, title, status, related_request_id")
      .eq("kind", "certificate_of_service")
      .in("status", ["draft", "sent", "delivered"])
      .in("related_request_id", (forms || []).map((f) => f.id)),
    sb.from("notices").select("id, status, signature_request_id, notes").in("signature_request_id", (forms || []).map((f) => f.id)),
  ]);
  const paid = new Map((bals || []).filter((b) => Number(b.balance) <= PAID).map((b) => [b.tenancy_id, Number(b.balance)]));
  return (forms || [])
    .filter((f) => paid.has(f.tenancy_id))
    .map((f) => ({
      ...f,
      balance: paid.get(f.tenancy_id),
      notice: (notices || []).find((n) => n.signature_request_id === f.id) || null,
      certs: (certs || []).filter((c) => c.related_request_id === f.id),
    }));
}

// Daily (and after a payment is matched): mark served N4s with paid arrears as resolved.
export async function resolvePaidN4s(sb) {
  const list = await paidN4s(sb);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  let resolved = 0;
  for (const f of list) {
    if (f.notice?.status !== "served") continue;
    const note = `Arrears paid in full (balance $${Math.max(0, f.balance).toFixed(2)} on ${today}): cleared automatically.`;
    const { error } = await sb
      .from("notices")
      .update({ status: "resolved", notes: [f.notice.notes, note].filter(Boolean).join(" ") })
      .eq("id", f.notice.id)
      .eq("status", "served");
    if (!error) resolved += 1;
  }
  return { checked: list.length, resolved, certsToVoid: list.reduce((n, f) => n + f.certs.length, 0) };
}

// For the Today page: paid N4s whose Certificate of Service is still open (void it).
export async function paidN4Lines(sb) {
  const list = await paidN4s(sb);
  return list
    .filter((f) => f.certs.length)
    .map((f) => `${f.title.replace(/^N4:\s*/, "")}: arrears paid. Void the Certificate of Service (${f.certs.map((c) => (c.status === "draft" ? "draft" : "out for signature")).join(", ")})`);
}

// One N4 or its certificate: is the N4 paid? (for the signature page banner)
export async function paidStateFor(sb, row) {
  const n4Id = row.kind === "N4" ? row.id : row.kind === "certificate_of_service" ? row.related_request_id : null;
  if (!n4Id) return null;
  const { data: n4 } = await sb.from("signature_requests").select("id, kind, tenancy_id").eq("id", n4Id).maybeSingle();
  if (n4?.kind !== "N4" || !n4.tenancy_id) return null;
  const { data: b } = await sb.from("tenancy_balances").select("balance").eq("tenancy_id", n4.tenancy_id).maybeSingle();
  if (!b || Number(b.balance) > PAID) return null;
  const { data: certs } = await sb
    .from("signature_requests")
    .select("id, title, status")
    .eq("kind", "certificate_of_service")
    .eq("related_request_id", n4.id)
    .in("status", ["draft", "sent", "delivered"]);
  return { paid: true, balance: Number(b.balance), certs: certs || [] };
}
