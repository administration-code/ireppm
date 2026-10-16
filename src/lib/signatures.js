import { getBrowserClient } from "@/lib/supabase";

export const SIG_STATUS = {
  draft: "Draft",
  sent: "Sent",
  delivered: "Opened",
  completed: "Completed",
  declined: "Declined",
  voided: "Voided",
  error: "Error",
};

export const SIG_KIND = {
  lease: "Lease",
  pm_contract: "Management contract",
  N1: "N1",
  N4: "N4",
  N5: "N5",
  certificate_of_service: "Certificate of Service",
  other: "Consent form",
};

export const AWAITING = ["draft", "sent", "delivered"];

export const SIG_FILTERS = [
  { key: "awaiting", label: "Awaiting signature", statuses: AWAITING },
  { key: "completed", label: "Completed", statuses: ["completed"] },
  { key: "closed", label: "Declined/Voided", statuses: ["declined", "voided"] },
  { key: "errors", label: "Errors", statuses: ["error"] },
];

export const SIG_LIST_SELECT =
  "id, kind, title, status, recipients, sent_at, completed_at, created_at, tenancy_id, property_id, application_id, unit_id, notice_id";

export function statusTone(status) {
  if (status === "completed") return "ok";
  if (status === "declined" || status === "voided" || status === "error") return "bad";
  return "wait";
}

// Who still has to act: names of signers who haven't completed.
export function outTo(row) {
  const list = Array.isArray(row.recipients) ? row.recipients : [];
  const pending = list.filter((r) => r.status !== "completed" && r.type !== "cc");
  const names = (pending.length ? pending : list).map((r) => r.name).filter(Boolean);
  return [...new Set(names)].join(", ");
}

async function token() {
  const { data } = await getBrowserClient().auth.getSession();
  return data?.session?.access_token || "";
}

export async function docusignApi(path, { method = "POST", body } = {}) {
  const res = await fetch(`/api/docusign${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || "Something went wrong. Try again.");
    err.id = json.id;
    err.consentRequired = json.consentRequired;
    throw err;
  }
  return json;
}

// Opens a blank tab synchronously (so pop-up blockers allow it), then points it at the URL once we have it.
export async function openInTab(getUrl) {
  const tab = window.open("", "_blank");
  try {
    const url = await getUrl();
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (err) {
    tab?.close();
    throw err;
  }
}

export const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "";

export const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

export function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  return Math.round((new Date(`${toIso}T12:00:00`) - new Date(`${fromIso}T12:00:00`)) / 86400000);
}
