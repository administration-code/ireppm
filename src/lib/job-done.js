import "server-only";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { SITE } from "@/lib/site";
const DEFAULT_HST_PERCENT = 13; // Ontario HST, as in admin-properties

// "Job done" from the Agent Portal (0086): the partner reports the date, what they did, their price before HST
// and after photos. Staff review it and complete the job (which puts the charge on the landlord's statement).

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const torontoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

// What the landlord is charged for a partner's price: HST added unless IRep pays for it.
export const billedFor = (price, chargeTo, hst = true) =>
  Number(price) > 0 ? (chargeTo === "irep" || !hst ? Number(price) : Math.round(Number(price) * (100 + DEFAULT_HST_PERCENT)) / 100) : 0;

export async function partnerDoneJobs(sb, partnerId) {
  const { data } = await sb.from("maintenance_requests").select("id, vendor_done_at").eq("partner_id", partnerId).not("vendor_done_at", "is", null).neq("status", "completed");
  return (data || []).map((r) => r.id);
}

export async function markJobDone(sb, partner, input) {
  const id = String(input?.id || "");
  const doneOn = String(input?.done_on || "");
  const notes = String(input?.notes || "").trim().slice(0, 2000);
  const noCharge = Boolean(input?.no_charge);
  const price = noCharge ? 0 : Number(input?.price);
  if (!ISO.test(doneOn) || doneOn > torontoToday()) return { error: "Choose the date you finished it." };
  if (notes.length < 5) return { error: "Say what you did." };
  if (!noCharge && !(price > 0 && price < 100000)) return { error: "Enter your price before HST, or tick No charge." };
  const { data: job } = await sb
    .from("maintenance_requests")
    .select("id, title, status, partner_id, photos, vendor_done_at, unit:units(label, property:properties(address))")
    .eq("id", id)
    .maybeSingle();
  if (!job || job.partner_id !== partner.id) return { error: "That job wasn't found." };
  if (["completed", "cancelled"].includes(job.status)) return { error: "That job is already closed." };
  if (job.vendor_done_at) return { error: "You already marked that job done. IRep is reviewing it." };
  const own = `${partner.userId}/`;
  const after = (Array.isArray(input?.photos) ? input.photos : [])
    .filter((p) => typeof p?.path === "string" && p.path.startsWith(own))
    .slice(0, 12)
    .map((p) => ({ path: p.path, name: String(p.name || "").slice(0, 120), stage: "after" }));
  const { data: pt } = await sb.from("partners").select("charges_hst").eq("id", partner.id).maybeSingle();
  const { error } = await sb
    .from("maintenance_requests")
    .update({
      vendor_done_at: new Date().toISOString(),
      vendor_done_on: doneOn,
      vendor_notes: notes,
      vendor_price: noCharge ? 0 : price,
      vendor_hst: noCharge ? false : pt?.charges_hst !== false,
      photos: [...(job.photos || []), ...after],
    })
    .eq("id", id);
  if (error) return { error: "That didn't save. Try again, or tell Rosie." };

  const place = [job.unit?.property?.address, job.unit?.label].filter(Boolean).join(", ");
  await jobDoneAlert(partner, { id, title: job.title, where: place, doneOn, notes, price: noCharge ? 0 : price, photos: after.length });
  return { ok: true };
}

// Tells staff a partner finished a job, with a link to Jobs Done.
export async function jobDoneAlert(partner, j) {
  const to = (process.env.STAFF_ALERT_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!mailConfigured() || !to.length) return;
  const rows = [
    ["Job", j.title],
    ["Where", j.where],
    ["Done", j.doneOn],
    ["What he did", j.notes],
    ["Price before HST", Number(j.price) > 0 ? `$${Number(j.price).toFixed(2)}` : "No charge"],
    ["Photos", String(j.photos || 0)],
  ];
  const link = { href: "https://ireppm.ca/admin/maintenance/done", label: "Review and complete" };
  await mailer()
    .emails.send({
      from: "IRep Property Management <alerts@ireppm.ca>",
      to,
      replyTo: SITE.email,
      subject: `Job done: ${j.title} (${j.where})`.slice(0, 150),
      html: renderEmail({ heading: "Job Done", intro: `${partner.name || "A partner"} marked a job done in the Agent Portal.`, rows, link }),
      text: renderText({ heading: "Job Done", rows, link }),
    })
    .catch((err) => console.error("[job-done] alert failed:", err?.message || err));
}

// Approved inspection work (billed on a separate invoice): the landlord's email and a ready-made
// booking email for each of the vendor's open jobs. Returns { [jobId]: { name, email, subject, body } }.
export async function landlordBookings(sb, partnerId, partnerName = "") {
  const { data: jobs } = await sb
    .from("maintenance_requests")
    .select("id, title, estimated_cost, unit:units(label, property:properties(address, owner:owners(name, email)))")
    .eq("partner_id", partnerId)
    .eq("charge_to", "owner_invoice")
    .not("status", "in", "(completed,cancelled)");
  const out = {};
  const byPlace = {};
  for (const j of jobs || []) {
    const owner = j.unit?.property?.owner;
    if (!owner?.email) continue;
    const address = j.unit?.property?.address || "your property";
    (byPlace[address] ||= { owner, jobs: [] }).jobs.push(j);
  }
  const money = (n) => `$${Number(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  for (const [address, { owner, jobs: list }] of Object.entries(byPlace)) {
    const first = String(owner.name || "").split(" ")[0] || "there";
    const lines = list.map((j) => {
      const where = j.unit?.label && j.unit.label !== "Whole property" ? ` (${j.unit.label})` : "";
      return `- ${j.title}${where}${j.estimated_cost != null ? `: ${money(j.estimated_cost)} + HST` : ""}`;
    });
    const body = [
      `Hi ${first},`,
      "",
      `Thank you for approving the work at ${address}:`,
      ...lines,
      "",
      "I'd like to book a time to get it done. Would any of these work for you?",
      "- ",
      "- ",
      "",
      "The amounts above are estimates; I'll let you know before anything changes.",
      "",
      "Thank you,",
      partnerName || "Chuck",
      "IRep Property Management",
    ].join("\n");
    for (const j of list) out[j.id] = { name: owner.name || "", email: owner.email, subject: `Booking the approved work at ${address}`, body };
  }
  return out;
}
