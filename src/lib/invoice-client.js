"use client";

import { getBrowserClient } from "@/lib/supabase";

export async function authToken() {
  const { data } = await getBrowserClient().auth.getSession();
  return data?.session?.access_token || "";
}

// Opens the invoice PDF in a new tab (staff, or the landlord it bills). Returns an error message or null.
export async function openInvoicePdf(id) {
  const win = window.open("", "_blank");
  const res = await fetch(`/api/invoices/${encodeURIComponent(id)}/pdf`, { headers: { Authorization: `Bearer ${await authToken()}` } }).catch(() => null);
  if (!res?.ok) {
    if (win) win.close();
    const json = res ? await res.json().catch(() => ({})) : {};
    return json.error || "We couldn't open the PDF.";
  }
  const url = URL.createObjectURL(await res.blob());
  if (win) win.location.href = url;
  else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return null;
}
