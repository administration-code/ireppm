import "server-only";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { cashSummary } from "@/lib/cash";
import { serveBoard } from "@/lib/serve-notice";
import { vacancyBoard } from "@/lib/vacancies";
import { chuckPartnerId, pushTo } from "@/lib/push";
import { money } from "@/lib/format";
import { inspectionsDue, managedOf } from "@/lib/inspection-due";
import { partnerProperties } from "@/lib/server-auth";

// Monday morning: one phone notification and one email to Chuck listing what's on his plate this week.
export async function chuckWeekly(sb, { force = false } = {}) {
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "long" });
  if (day !== "Monday" && !force) return { skipped: "not Monday" };
  const partnerId = await chuckPartnerId(sb);
  if (!partnerId) return { skipped: "no partner" };
  const { data: partner } = await sb.from("partners").select("id, name, email").eq("id", partnerId).maybeSingle();

  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const [jobsRes, cash, serve, vac, draftsRes] = await Promise.all([
    sb.from("maintenance_requests").select("id, title, status, urgency, charge_to").eq("partner_id", partnerId).not("status", "in", "(completed,cancelled)"),
    cashSummary(sb, partnerId).catch(() => ({ held: [] })),
    serveBoard(sb).catch(() => ({ toServe: [], toSign: [] })),
    vacancyBoard(sb, partnerId).catch(() => ({ vacancies: [] })),
    sb.from("inspection_reports").select("id").eq("partner_id", partnerId).eq("status", "draft"),
  ]);
  const jobs = jobsRes.data || [];
  const oldCash = (cash.held || []).filter((c) => c.collected_on <= threeDaysAgo);
  const lines = [];
  if (jobs.length) {
    const urgent = jobs.filter((j) => j.urgency !== "routine").length;
    const booking = jobs.filter((j) => j.charge_to === "owner_invoice").length;
    lines.push([
      "Open jobs",
      `${jobs.length}${urgent ? ` (${urgent} urgent)` : ""}${booking ? ` · ${booking} approved by a landlord, waiting for you to book` : ""}`,
    ]);
  }
  const notices = (serve.toServe || []).length;
  const certs = (serve.toSign || []).length;
  if (notices) lines.push(["Notices to serve", String(notices)]);
  if (certs) lines.push(["Certificates to sign", String(certs)]);
  if (oldCash.length) lines.push(["Cash to deposit", `${money(oldCash.reduce((s, c) => s + Number(c.amount), 0))} held more than 3 days`]);
  const vacancies = (vac.vacancies || []).length;
  if (vacancies) lines.push(["Vacancies", `${vacancies} listed. Log showings with "I Showed It".`]);
  const dueList = await inspectionsDue(sb, await managedOf(sb, await partnerProperties(sb, partnerId))).catch(() => []);
  const dueNow = dueList.filter((x) => x.state !== "ok");
  if (dueNow.length)
    lines.push([
      "Inspections due",
      `${dueNow.length} (${dueNow.slice(0, 4).map((x) => x.address).join(", ")}${dueNow.length > 4 ? ", …" : ""})`,
    ]);
  const drafts = (draftsRes.data || []).length;
  if (drafts) lines.push(["Inspections to finish", String(drafts)]);

  const first = String(partner?.name || "Chuck").split(" ")[0];
  const summary = lines.length ? lines.map(([k, v]) => `${k}: ${v}`).join(" · ") : "Nothing waiting. Have a good week!";
  await pushTo(sb, { partnerId }, { title: `Your week, ${first}`, body: summary.slice(0, 180), url: "/agent", tag: "weekly" }).catch(() => null);

  let emailed = false;
  if (partner?.email && mailConfigured() && lines.length) {
    const heading = "Your Week at IRep";
    const link = { href: "https://ireppm.ca/agent", label: "Open My Portal" };
    const intro = `Good morning ${first}. Here's what's waiting for you this week. Everything is in your portal.`;
    const { error } = await mailer().emails.send({
      from: "IRep Property Management <alerts@ireppm.ca>",
      to: [partner.email],
      cc: ["administration@ireppm.ca"],
      subject: `Your week: ${lines.map(([k, v]) => `${v.split(" ")[0]} ${k.toLowerCase()}`).slice(0, 3).join(", ")}`,
      html: renderEmail({ heading, intro, rows: lines, link }),
      text: renderText({ heading, rows: lines, link }),
    });
    emailed = !error;
  }
  return { items: lines.length, emailed };
}

// Daily: a phone notification on the day a property's next inspection comes due.
export async function inspectionDueToday(sb) {
  const partnerId = await chuckPartnerId(sb);
  if (!partnerId) return { skipped: "no partner" };
  const list = await inspectionsDue(sb, await managedOf(sb, await partnerProperties(sb, partnerId)));
  const today = list.filter((x) => x.inDays === 0);
  if (!today.length) return { due: 0 };
  await pushTo(sb, { partnerId }, {
    title: today.length === 1 ? `Inspection due today: ${today[0].address}` : `${today.length} inspections due today`,
    body: today.length === 1 ? "Six months since the last one. Tap to start it." : today.map((x) => x.address).join(", ").slice(0, 160),
    url: "/agent/inspection",
    tag: "inspection-due",
  }).catch(() => null);
  return { due: today.length };
}
