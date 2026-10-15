import "server-only";
import { DOC_TYPES } from "@/lib/documents";
import { CATEGORIES as MAINTENANCE_CATEGORIES, URGENCY as MAINTENANCE_URGENCY } from "@/lib/maintenance";

const ADMIN_URL = "https://ireppm.ca/admin";
const INBOX_URL = `${ADMIN_URL}/requests`;

const BRAND = {
  red: "#B41710",
  ink: "#161616",
  ivory: "#F7F4EE",
  charcoal: "#1B1B1B",
};

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function listingLabel(listing) {
  if (!listing) return "Unknown listing";
  return listing.unit ? `${listing.address}, ${listing.unit}` : listing.address;
}

function prettyDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Toronto",
  });
}

function docTypeName(key) {
  return DOC_TYPES.find((d) => d.key === key)?.name || key || "Document";
}

function renderEmail({ heading, intro, rows, extraHtml = "", link = { href: INBOX_URL, label: "Open the requests inbox" } }) {
  const rowHtml = rows
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 16px 8px 0;color:#6b6b6b;font-size:14px;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
          <td style="padding:8px 0;color:${BRAND.ink};font-size:15px;vertical-align:top;white-space:pre-line;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en-CA">
  <body style="margin:0;padding:0;background:${BRAND.ivory};font-family:'Libre Franklin',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.ivory};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-top:4px solid ${BRAND.red};">
            <tr>
              <td style="padding:28px 32px 8px;">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;color:${BRAND.red};font-weight:600;">IREP PROPERTY MANAGEMENT</p>
                <h1 style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;color:${BRAND.ink};">${escapeHtml(heading)}</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:${BRAND.charcoal};">${escapeHtml(intro)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e6e1d8;">${rowHtml}</table>
                ${extraHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;">
                <a href="${escapeHtml(link.href)}" style="display:inline-block;background:${BRAND.red};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;">${escapeHtml(link.label)}</a>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#8a8579;">Automatic alert from ireppm.ca</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderText({ heading, rows, extra = "", link = { href: INBOX_URL, label: "Open the requests inbox" } }) {
  const lines = rows
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(([label, value]) => `${label}: ${value}`);
  return [heading, "", ...lines, extra, "", `${link.label}: ${link.href}`].filter((l) => l !== null).join("\n");
}

export function maintenanceEmail(record, unit) {
  const property = unit?.property;
  const address = property?.address || "Unknown address";
  const unitLabel = unit?.label || "";
  const place = [address, unitLabel].filter(Boolean).join(" ");
  const emergency = record.urgency === "emergency";
  const rows = [
    ["Property", [address, unitLabel].filter(Boolean).join(", ")],
    ["Title", record.title],
    ["Category", MAINTENANCE_CATEGORIES[record.category] || record.category],
    ["Urgency", MAINTENANCE_URGENCY[record.urgency] || record.urgency],
    ["Description", record.description],
    ["Permission to enter", record.permission_to_enter ? "Yes, may enter if not home" : "No, arrange a time first"],
    ["Access notes", record.access_notes],
  ];
  const link = { href: `${ADMIN_URL}/maintenance/${encodeURIComponent(record.id)}`, label: "Open the request" };
  const heading = emergency ? "Emergency maintenance request" : "New maintenance request";
  return {
    subject: `${emergency ? "EMERGENCY: " : ""}New maintenance request: ${place}`,
    html: renderEmail({ heading, intro: "A maintenance request has come in.", rows, link }),
    text: renderText({ heading, rows, link }),
  };
}

export function showingEmail(record, listing, renter) {
  const place = listingLabel(listing);
  const rows = [
    ["Name", renter?.full_name || "Not provided"],
    ["Phone", renter?.phone || "Not provided"],
    ["Email", renter?.email || "Not provided"],
    ["Listing", place],
    ["Preferred day", prettyDate(record.preferred_date)],
    ["Time window", record.preferred_time],
    ["Notes", record.notes],
  ];
  const heading = "New showing request";
  return {
    subject: `New showing request – ${place}`,
    html: renderEmail({ heading, intro: "A renter has asked to see a property.", rows }),
    text: renderText({ heading, rows }),
  };
}

export function applicationEmail(record, listing) {
  const place = listingLabel(listing);
  // Names only — renter files stay in the private bucket and are never attached or linked.
  const docs = Array.isArray(record.documents) ? record.documents : [];
  const docLines = docs.map((d) => (d?.name ? `${docTypeName(d.type)} — ${d.name}` : docTypeName(d?.type)));

  const rows = [
    ["Name", record.applicant_name],
    ["Phone", record.applicant_phone || "Not provided"],
    ["Email", record.applicant_email || "Not provided"],
    ["Listing", place],
    ["Income type", record.income_type],
  ];

  const docsHtml = `
    <p style="margin:20px 0 8px;font-size:14px;color:#6b6b6b;">Documents attached to the application (${docLines.length})</p>
    ${
      docLines.length
        ? `<ul style="margin:0;padding-left:20px;color:${BRAND.ink};font-size:15px;line-height:1.6;">${docLines
            .map((l) => `<li>${escapeHtml(l)}</li>`)
            .join("")}</ul>`
        : `<p style="margin:0;font-size:15px;color:${BRAND.ink};">None listed.</p>`
    }
    <p style="margin:12px 0 0;font-size:13px;color:#6b6b6b;">Sign in to the staff inbox to view the files.</p>`;

  const docsText = `\nDocuments (${docLines.length}):\n${docLines.map((l) => `- ${l}`).join("\n") || "- None listed"}`;
  const heading = "New application";
  return {
    subject: `New application – ${place}`,
    html: renderEmail({ heading, intro: "A renter has applied for a property.", rows, extraHtml: docsHtml }),
    text: renderText({ heading, rows, extra: docsText }),
  };
}

export function landlordEmail(record) {
  const rows = [
    ["Name", record.name],
    ["Phone", record.phone || "Not provided"],
    ["Email", record.email],
    ["Property", record.property_address],
    ["Interested in", record.interest],
    ["Message", record.message],
  ];
  const heading = "New landlord inquiry";
  return {
    subject: `New landlord inquiry – ${record.name || "Unknown"}`,
    html: renderEmail({ heading, intro: "A property owner has asked about our services.", rows }),
    text: renderText({ heading, rows }),
  };
}
