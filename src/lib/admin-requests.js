import { getBrowserClient } from "@/lib/supabase";

export const TABS = [
  { key: "showings", label: "Showings" },
  { key: "applications", label: "Applications" },
  { key: "inquiries", label: "Inquiries" },
];

export const SHOWING_STATUS = {
  requested: "Requested",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const APPLICATION_STATUS = {
  submitted: "Submitted",
  reviewing: "Reviewing",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export const INQUIRY_STATUS = {
  new: "New",
  contacted: "Contacted",
  won: "Won",
  lost: "Lost",
};

const TIME_ZONE = "America/Toronto";

export function prettyDay(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function prettyDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

const newestFirst = (a, b) => String(b.created_at).localeCompare(String(a.created_at));

export function sortShowings(list) {
  return [...list].sort((a, b) => {
    const aReq = a.status === "requested" ? 0 : 1;
    const bReq = b.status === "requested" ? 0 : 1;
    return aReq - bReq || newestFirst(a, b);
  });
}

export function sortNewest(list) {
  return [...list].sort(newestFirst);
}

export async function loadInbox() {
  const sb = getBrowserClient();
  const [showings, applications, inquiries, drafts] = await Promise.all([
    sb
      .from("showing_requests")
      .select(
        "id, preferred_date, preferred_time, notes, status, confirmed_at, created_at, listing:listings(address, unit, slug), renter:profiles(full_name, email, phone)"
      )
      .order("created_at", { ascending: false }),
    sb
      .from("applications")
      .select(
        "id, applicant_name, applicant_email, applicant_phone, income_type, documents, credit_consent, consent_at, status, staff_notes, created_at, listing:listings(address, unit, slug)"
      )
      .order("created_at", { ascending: false }),
    sb
      .from("landlord_inquiries")
      .select("id, name, email, phone, property_address, interest, message, status, created_at")
      .order("created_at", { ascending: false }),
    sb.from("listings").select("id", { count: "exact", head: true }).eq("status", "draft"),
  ]);

  const failed = [showings, applications, inquiries].some((r) => r.error);
  return {
    showings: sortShowings(showings.data || []),
    applications: sortNewest(applications.data || []),
    inquiries: sortNewest(inquiries.data || []),
    drafts: drafts.count || 0,
    error: failed ? "Some requests couldn't load. Refresh the page to try again." : "",
  };
}

// RLS turns a blocked update into "0 rows", so ask for the row back to know it saved.
export async function updateRow(table, id, changes) {
  const { data, error } = await getBrowserClient().from(table).update(changes).eq("id", id).select("id");
  if (error || !data?.length) throw new Error("save failed");
}
