import "server-only";

// PayProp welcome letters, one or more per tenancy (one per tenant or sub-unit). Each letter is for
// everyone on the tenancy (for_all) or for the tenants listed in tenant_ids. Before migration 0098
// there's only the single letter on the tenancy row; it's treated as one letter for everyone.

export const LETTER_BUCKET = "tenancy-documents";

const legacyLetter = (t) =>
  t?.payprop_letter_path
    ? [{ id: `legacy:${t.id}`, tenancy_id: t.id, path: t.payprop_letter_path, file_name: t.payprop_letter_name, label: null, for_all: true, tenant_ids: [], sent_at: t.payprop_letter_sent_at || null, sent_to: [], legacy: true }]
    : [];

export async function listLetters(sb, tenancyId) {
  const { data, error } = await sb.from("payprop_letters").select("*").eq("tenancy_id", tenancyId).order("created_at");
  if (!error) return data || [];
  const { data: t } = await sb.from("tenancies").select("id, payprop_letter_path, payprop_letter_name, payprop_letter_sent_at").eq("id", tenancyId).maybeSingle();
  return legacyLetter(t);
}

export async function getLetter(sb, letterId) {
  if (String(letterId).startsWith("legacy:")) {
    const id = String(letterId).slice(7);
    const { data: t } = await sb.from("tenancies").select("id, payprop_letter_path, payprop_letter_name, payprop_letter_sent_at").eq("id", id).maybeSingle();
    return legacyLetter(t)[0] || null;
  }
  const { data } = await sb.from("payprop_letters").select("*").eq("id", letterId).maybeSingle();
  return data || null;
}

// The tenants a letter is for (all of them for a whole-tenancy letter).
export const letterTenants = (letter, people) => (letter.for_all ? people : people.filter((p) => (letter.tenant_ids || []).includes(p.id)));

// Letters the signed-in tenant can open: whole-tenancy letters, and ones listing them.
export async function lettersForUser(sb, userId) {
  const { data: mine } = await sb.from("tenancy_tenants").select("id, tenancy_id").eq("profile_id", userId);
  const rows = mine || [];
  if (!rows.length) return [];
  const out = [];
  for (const tenancyId of [...new Set(rows.map((r) => r.tenancy_id))]) {
    const myIds = rows.filter((r) => r.tenancy_id === tenancyId).map((r) => r.id);
    for (const l of await listLetters(sb, tenancyId)) {
      if (l.for_all || (l.tenant_ids || []).some((id) => myIds.includes(id))) out.push(l);
    }
  }
  return out;
}

// Keeps the tenancy's single-letter fields pointing at the newest letter (older screens use them).
export async function syncLegacy(sb, tenancyId) {
  const { data, error } = await sb.from("payprop_letters").select("path, file_name, sent_at").eq("tenancy_id", tenancyId).order("created_at", { ascending: false }).limit(1);
  if (error) return;
  const l = data?.[0];
  await sb
    .from("tenancies")
    .update({ payprop_letter_path: l?.path || null, payprop_letter_name: l?.file_name || null, payprop_letter_sent_at: l?.sent_at || null })
    .eq("id", tenancyId);
}

export async function signedLetterUrl(sb, letter, seconds = 60) {
  const { data, error } = await sb.storage.from(LETTER_BUCKET).createSignedUrl(letter.path, seconds);
  return error ? null : data?.signedUrl || null;
}

export async function letterAttachment(sb, letter) {
  const { data: file, error } = await sb.storage.from(LETTER_BUCKET).download(letter.path);
  if (error || !file) throw new Error("We couldn't read the uploaded letter.");
  return { filename: letter.file_name || "PayProp welcome letter.pdf", content: Buffer.from(await file.arrayBuffer()).toString("base64") };
}

export async function markLetterSent(sb, letter, to) {
  const now = new Date().toISOString();
  if (!letter.legacy) await sb.from("payprop_letters").update({ sent_at: now, sent_to: to }).eq("id", letter.id);
  await sb.from("tenancies").update({ payprop_letter_sent_at: now }).eq("id", letter.tenancy_id);
}
