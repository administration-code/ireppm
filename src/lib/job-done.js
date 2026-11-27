import "server-only";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { SITE } from "@/lib/site";
import { money } from "@/lib/format";
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
  await sb.from("maintenance_requests").update({ vendor_outcome: "fixed" }).eq("id", id).then(() => null, () => null);

  const place = [job.unit?.property?.address, job.unit?.label].filter(Boolean).join(", ");
  await jobDoneAlert(partner, { id, title: job.title, where: place, doneOn, notes, price: noCharge ? 0 : price, photos: after.length });
  return { ok: true };
}

// After a visit: the job needs the landlord's OK first. His estimate (before HST) and the scope of
// work go on the request, which waits for staff to send it to the landlord ("Awaiting owner").
export async function submitEstimate(sb, partner, input) {
  const id = String(input?.id || "");
  const scope = String(input?.scope || "").trim().slice(0, 2000);
  const price = Math.round(Number(input?.price) * 100) / 100;
  if (scope.length < 10) return { error: "Describe the work that's needed." };
  if (!(price > 0 && price < 100000)) return { error: "Enter your estimate before HST." };
  const { data: job } = await sb
    .from("maintenance_requests")
    .select("id, title, status, partner_id, photos, staff_notes, vendor_done_at, unit:units(label, property:properties(address))")
    .eq("id", id)
    .maybeSingle();
  if (!job || job.partner_id !== partner.id) return { error: "That job wasn't found." };
  if (["completed", "cancelled"].includes(job.status)) return { error: "That job is already closed." };
  if (job.vendor_done_at) return { error: "You already marked that job done." };
  const own = `${partner.userId}/`;
  const before = (Array.isArray(input?.photos) ? input.photos : [])
    .filter((p) => typeof p?.path === "string" && p.path.startsWith(own))
    .slice(0, 12)
    .map((p) => ({ path: p.path, name: String(p.name || "").slice(0, 120), stage: "before" }));
  const { data: pt } = await sb.from("partners").select("charges_hst").eq("id", partner.id).maybeSingle();
  const now = new Date().toISOString();
  const { error } = await sb
    .from("maintenance_requests")
    .update({
      vendor_outcome: "estimate",
      vendor_estimate: price,
      vendor_estimate_notes: scope,
      vendor_estimate_at: now,
      estimated_cost: price,
      estimate_plus_hst: pt?.charges_hst !== false,
      owner_approval: "pending",
      status: "awaiting_owner",
      photos: [...(job.photos || []), ...before],
      staff_notes: [job.staff_notes, `${now.slice(0, 10)}: ${partner.name || "Chuck"}'s estimate ${money(price)} + HST: ${scope}`].filter(Boolean).join("\n"),
    })
    .eq("id", id);
  if (error) return { error: /vendor_/.test(error.message || "") ? "This isn't switched on yet. Tell Rosie." : "That didn't save. Try again, or tell Rosie." };
  const place = [job.unit?.property?.address, job.unit?.label].filter(Boolean).join(", ");
  await staffAlert({
    subject: `Estimate ready: ${job.title} (${place})`,
    heading: "Estimate Ready for the Landlord",
    intro: `${partner.name || "Chuck"} visited and says this job needs the landlord's OK first. Check the estimate, then tap Send Estimate to Landlord on the request.`,
    rows: [["Job", job.title], ["Where", place], ["Work needed", scope], ["Estimate", `${money(price)}${pt?.charges_hst !== false ? " + HST" : ""}`], ["Photos", String(before.length)]],
    link: { href: `${SITE.url}/admin/maintenance/${id}`, label: "Open the request" },
  });
  return { ok: true };
}

// After a visit: nothing needs repairing. Staff close it (no invoice).
export async function markNonIssue(sb, partner, input) {
  const id = String(input?.id || "");
  const notes = String(input?.notes || "").trim().slice(0, 2000);
  if (notes.length < 5) return { error: "Say what you found." };
  const { data: job } = await sb
    .from("maintenance_requests")
    .select("id, title, status, partner_id, photos, vendor_done_at, unit:units(label, property:properties(address))")
    .eq("id", id)
    .maybeSingle();
  if (!job || job.partner_id !== partner.id) return { error: "That job wasn't found." };
  if (["completed", "cancelled"].includes(job.status)) return { error: "That job is already closed." };
  if (job.vendor_done_at) return { error: "You already marked that job." };
  const own = `${partner.userId}/`;
  const pics = (Array.isArray(input?.photos) ? input.photos : [])
    .filter((p) => typeof p?.path === "string" && p.path.startsWith(own))
    .slice(0, 12)
    .map((p) => ({ path: p.path, name: String(p.name || "").slice(0, 120), stage: "after" }));
  const today = torontoToday();
  const { error } = await sb
    .from("maintenance_requests")
    .update({
      vendor_outcome: "non_issue",
      vendor_done_at: new Date().toISOString(),
      vendor_done_on: today,
      vendor_notes: `Not an issue: ${notes}`,
      vendor_price: 0,
      vendor_hst: false,
      photos: [...(job.photos || []), ...pics],
    })
    .eq("id", id);
  if (error) return { error: /vendor_outcome/.test(error.message || "") ? "This isn't switched on yet. Tell Rosie." : "That didn't save. Try again, or tell Rosie." };
  const place = [job.unit?.property?.address, job.unit?.label].filter(Boolean).join(", ");
  await staffAlert({
    subject: `Not an issue: ${job.title} (${place})`,
    heading: "Checked: Not an Issue",
    intro: `${partner.name || "Chuck"} visited and found nothing that needs repairing. Review it on Jobs Done and close it (no invoice).`,
    rows: [["Job", job.title], ["Where", place], ["What he found", notes], ["Photos", String(pics.length)]],
    link: { href: `${SITE.url}/admin/maintenance/done`, label: "Open Jobs Done" },
  });
  return { ok: true };
}

// Jobs waiting on the landlord after his estimate: { [job id]: { at, approval } }.
export async function partnerEstimates(sb, partnerId) {
  const { data, error } = await sb
    .from("maintenance_requests")
    .select("id, vendor_estimate_at, vendor_estimate, owner_approval, estimate_sent_at")
    .eq("partner_id", partnerId)
    .not("vendor_estimate_at", "is", null)
    .is("vendor_done_at", null)
    .not("status", "in", "(completed,cancelled)");
  if (error) return {};
  return Object.fromEntries((data || []).map((r) => [r.id, { at: r.vendor_estimate_at, price: r.vendor_estimate, approval: r.owner_approval, sent: r.estimate_sent_at }]));
}

async function staffAlert({ subject, heading, intro, rows, link }) {
  const to = (process.env.STAFF_ALERT_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!mailConfigured() || !to.length) return;
  await mailer()
    .emails.send({
      from: "IRep Property Management <alerts@ireppm.ca>",
      to,
      replyTo: SITE.email,
      subject: subject.slice(0, 150),
      html: renderEmail({ heading, intro, rows, link }),
      text: renderText({ heading, rows, link }),
    })
    .catch(() => null);
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
