import { getBrowserClient } from "@/lib/supabase";

export const EXPENSE_BUCKET = "landlord-expenses";
export const EXPENSE_FILE_TYPES = "application/pdf,image/jpeg,image/png,image/heic,image/webp";
const MAX = 10 * 1024 * 1024;

// Staff: store the bill for an expense and record it on the row. Replaces any earlier file.
export async function uploadExpenseInvoice(expense, file) {
  if (!file) return null;
  if (file.size > MAX) return "That file is over 10 MB.";
  const sb = getBrowserClient();
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-100) || "invoice";
  const path = `${expense.id}/${Date.now()}-${safe}`;
  const up = await sb.storage.from(EXPENSE_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (up.error) return `The file didn't upload: ${up.error.message}`;
  const { error } = await sb.from("landlord_expenses").update({ invoice_path: path, invoice_name: file.name }).eq("id", expense.id);
  if (error) {
    await sb.storage.from(EXPENSE_BUCKET).remove([path]);
    return `The file didn't save: ${error.message}`;
  }
  if (expense.invoice_path) await sb.storage.from(EXPENSE_BUCKET).remove([expense.invoice_path]);
  return null;
}

// Staff or the landlord: open the bill in a new tab (a 60-second link).
export async function openExpenseInvoice(id) {
  const win = window.open("", "_blank");
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch(`/api/expenses/file?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${data?.session?.access_token || ""}` },
  }).catch(() => null);
  const json = res ? await res.json().catch(() => ({})) : {};
  if (res?.ok && json.url) {
    if (win) win.location.href = json.url;
    else window.location.href = json.url;
    return null;
  }
  if (win) win.close();
  return json.error || "We couldn't open that file.";
}
