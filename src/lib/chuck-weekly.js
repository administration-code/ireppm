import "server-only";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { cashSummary } from "@/lib/cash";
import { serveBoard } from "@/lib/serve-notice";
import { vacancyBoard } from "@/lib/vacancies";
import { chuckPartnerId, pushTo } from "@/lib/push";
import { money } from "@/lib/format";
import { currentSeason, inspectionsDue, managedOf, needsInspection, seasonLabel } from "@/lib/inspection-due";
import { partnerProperties } from "@/lib/server-auth";
import { lawnSnowBoard } from "@/lib/lawn-snow";

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
  const dueNow = dueList.filter(needsInspection);
  if (dueNow.length) {
    const unscheduled = dueNow.filter((x) => !x.visit).length;
    lines.push([
      "Inspections to do",
      `${dueNow.length} by ${dueNow[0].due}${unscheduled ? ` · ${unscheduled} not scheduled yet` : ""} (${dueNow.slice(0, 3).map((x) => x.address).join(", ")}${dueNow.length > 3 ? ", …" : ""})`,
    ]);
  }
  const ls = await lawnSnowBoard(sb, await partnerProperties(sb, partnerId)).catch(() => ({ included: [], alaCarte: [] }));
  const cuts = ls.included.filter((r) => r.lawnDue && r.lawnDue.days <= 7);
  if (cuts.length)
    lines.push(["Lawns to cut this week", `${cuts.length}${cuts.some((r) => r.lawnDue.overdue) ? ` (${cuts.filter((r) => r.lawnDue.overdue).length} overdue)` : ""}: ${cuts.slice(0, 4).map((r) => r.address).join(", ")}`]);
  const asks = ls.alaCarte.flatMap((r) => (r.requests || []).map((q) => `${q.kind} at ${r.address}`));
  if (asks.length) lines.push(["Landlord lawn and snow requests", `${asks.length}: ${asks.slice(0, 3).join(", ")}`]);
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

// Daily: a phone notification when an inspection season opens, and a week before it closes
// if any are still not done.
export async function inspectionDueToday(sb) {
  const partnerId = await chuckPartnerId(sb);
  if (!partnerId) return { skipped: "no partner" };
  const t = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const { inNow } = currentSeason(t);
  if (!inNow) return { skipped: "between seasons" };
  const weekLeft = new Date(`${inNow.end}T12:00:00Z`);
  weekLeft.setUTCDate(weekLeft.getUTCDate() - 7);
  const isOpen = t === inNow.start;
  const isWeek = t === weekLeft.toISOString().slice(0, 10);
  if (!isOpen && !isWeek) return { skipped: "no reminder today" };
  const list = (await inspectionsDue(sb, await managedOf(sb, await partnerProperties(sb, partnerId)))).filter(needsInspection);
  if (!list.length) return { due: 0 };
  const end = new Date(`${inNow.end}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  await pushTo(sb, { partnerId }, {
    title: isOpen ? `${seasonLabel(inNow)} inspections start today` : `One week left: ${list.length} inspection${list.length === 1 ? "" : "s"} to do`,
    body: `${list.length} to do by ${end}. Pick a day and time for each; the tenants get their notice automatically.`,
    url: "/agent/inspection",
    tag: "inspection-season",
  }).catch(() => null);
  return { due: list.length };
}
