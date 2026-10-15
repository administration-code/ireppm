export const PHOTO_BUCKET = "maintenance-photos";
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_MB = 50;
export const PHOTO_ACCEPT = "image/*,video/*";
export const SIGNED_PHOTO_SECONDS = 300;

export const CATEGORIES = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  heating_cooling: "Heating and cooling",
  appliance: "Appliance",
  pests: "Pests",
  doors_locks_windows: "Doors, locks and windows",
  roof_structure: "Roof and structure",
  lawn_snow: "Lawn and snow",
  other: "Other",
};

export const URGENCY = {
  emergency: "Emergency",
  urgent: "Urgent",
  routine: "Routine",
};

export const URGENCY_HELP = {
  emergency: "Emergency: no heat, flooding, no power or a sewer backup",
  urgent: "Urgent: needs attention within a day or two",
  routine: "Routine: can wait for a regular booking",
};

export const STATUS = {
  new: "New",
  triaged: "Triaged",
  awaiting_owner: "Awaiting owner",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const CLOSED_STATUSES = ["completed", "cancelled"];

export const SOURCES = {
  tenant_portal: "Tenant portal",
  phone: "Phone",
  text: "Text",
  email: "Email",
  inspection: "Inspection",
  staff: "Staff",
};

export const STAFF_LOG_SOURCES = ["phone", "text", "email", "inspection", "staff"];

export const OWNER_APPROVAL = {
  not_needed: "Not needed",
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
};

export const CHARGE_TO = {
  owner: "Owner",
  tenant: "Tenant",
  irep: "IRep",
};

const URGENCY_RANK = { emergency: 0, urgent: 1, routine: 2 };

export function sortRequests(list) {
  return [...list].sort(
    (a, b) =>
      Number(a.urgency !== "emergency") - Number(b.urgency !== "emergency") ||
      String(b.created_at).localeCompare(String(a.created_at))
  );
}

export function urgencyRank(u) {
  return URGENCY_RANK[u] ?? 3;
}

const TORONTO = "America/Toronto";

export function prettyDateTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TORONTO,
  });
}

export function prettyDay(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: TORONTO });
}

export function tenantStatus(r) {
  if (r.status === "new") return "Received";
  if (r.status === "triaged") return "Being reviewed";
  if (r.status === "awaiting_owner") return "Waiting for approval";
  if (r.status === "scheduled") return r.scheduled_for ? `Booked for ${prettyDateTime(r.scheduled_for)}` : "Booked";
  return STATUS[r.status] || r.status;
}

// <input type="datetime-local"> works in the browser's local time zone.
export function toLocalInput(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const isVideo = (name) => /\.(mp4|mov|m4v|webm|3gp|avi|mkv)$/i.test(name || "");

export function needsEntryNotice(r) {
  return Boolean(r.scheduled_for) && r.urgency !== "emergency" && !r.permission_to_enter;
}

export function unitPlace(unit) {
  const p = unit?.property;
  if (!p) return unit?.label || "Unknown unit";
  return unit.label ? `${p.address}, ${unit.label}` : p.address;
}

export function safeFileName(name) {
  return String(name || "file").replace(/[^\w.\-]+/g, "_").slice(-80);
}

export function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
