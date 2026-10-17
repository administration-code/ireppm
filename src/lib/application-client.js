import { getBrowserClient } from "@/lib/supabase";
import { DOC_TYPES, INCOME_TYPES } from "@/lib/documents";

// Browser helpers for the landlord application review routes (/api/applications/[id]/...).

export const SCREENING_BUCKET = "screening-reports";
export const SCREENING_ACCEPT = ".pdf,.jpg,.jpeg,.png";

// Staff view of owner_review_status.
export const REVIEW_STATUS = {
  not_sent: "Not sent to landlord",
  pending: "Waiting for landlord",
  approved: "Landlord approved",
  declined: "Landlord declined",
  info_requested: "Landlord asked a question",
};

// The landlord's own view of the same status.
export const OWNER_STATUS = {
  pending: "Waiting for your decision",
  approved: "You approved",
  declined: "You declined",
  info_requested: "Question sent to applicant",
};

const DOC_NAME = Object.fromEntries(DOC_TYPES.map((d) => [d.key, d.name]));

export function docLabel(type, incomeType) {
  if (type === "income") return INCOME_TYPES[incomeType]?.doc || DOC_NAME.income;
  return DOC_NAME[type] || type || "Document";
}

async function accessToken() {
  const { data } = await getBrowserClient().auth.getSession();
  return data?.session?.access_token || "";
}

// Calls one application route as the signed-in person. Always resolves; failures come back as { error }.
export async function appApi(id, action, { method = "POST", body } = {}) {
  const token = await accessToken();
  if (!token) return { error: "Please sign in again." };
  try {
    const res = await fetch(`/api/applications/${encodeURIComponent(id)}/${action}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || "Something went wrong. Try again." };
    return data;
  } catch {
    return { error: "We couldn't reach the server. Check your connection and try again." };
  }
}

// Opens one file on an application (doc type, or "credit") in a new tab. Returns an error message or "".
export async function openAppFile(id, doc) {
  // Open the tab during the click so popup blockers allow it; the signed link only lasts 60 seconds.
  const tab = window.open("about:blank", "_blank");
  const data = await appApi(id, `file?doc=${encodeURIComponent(doc)}`, { method: "GET" });
  if (data.error || !data.url) {
    tab?.close();
    return data.error || "Couldn't open this file. Try again.";
  }
  if (!tab) return "Your browser blocked the new tab. Allow pop-ups for this site and try again.";
  tab.opener = null;
  tab.location.href = data.url;
  return "";
}

export function monthText(value) {
  if (!value) return "";
  const d = new Date(`${value}-15T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-CA", { month: "short", year: "numeric" });
}
