import "server-only";
import { randomInt } from "node:crypto";
import { sendMail, staffEmails, SITE_URL } from "@/lib/application-review";

// Monthly $100 gift card draw. Tenants were told: pay through PayProp *before the 7th* (so by the
// 6th) and you're entered; payments on or after the 7th aren't. The "paid by the 7th" list is the
// on-time list used for payouts (on or before the 7th).
export const DRAW_LAST_DAY = 6;
export const ON_TIME_LAST_DAY = 7;
export const DRAW_PRIZE = "$100 Visa or Mastercard gift card";

const addDays = (iso, n) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
export const monthStart = (iso) => `${String(iso).slice(0, 7)}-01`;
const monthName = (period) => new Date(`${period}T12:00:00`).toLocaleDateString("en-CA", { month: "long", year: "numeric" });

// Everyone due rent this month, whether they paid in full by the 7th, and whether they're in the draw.
export async function drawList(admin, periodIso) {
  const period = monthStart(periodIso);
  const onTimeBy = addDays(period, ON_TIME_LAST_DAY - 1);
  const drawBy = addDays(period, DRAW_LAST_DAY - 1);
  const [rc, pays, draw] = await Promise.all([
    admin.from("rent_collection").select("tenancy_id, due, paid, paid_by_7th").eq("period", period),
    admin
      .from("payments")
      .select("tenancy_id, amount, method, received_on")
      .gte("received_on", addDays(period, -10))
      .lte("received_on", onTimeBy)
      .eq("status", "matched")
      .not("tenancy_id", "is", null),
    admin.from("payprop_draws").select("*").eq("period", period).maybeSingle(),
  ]);
  if (rc.error) throw new Error(rc.error.message);
  const ids = [...new Set((rc.data || []).map((r) => r.tenancy_id))];
  const { data: tenancies } = ids.length
    ? await admin
        .from("tenancies")
        .select("id, unit:units(label, property:properties(address)), tenancy_tenants(full_name, email, is_primary)")
        .in("id", ids)
    : { data: [] };
  const byId = new Map((tenancies || []).map((t) => [t.id, t]));
  const rows = (rc.data || []).map((r) => {
    const t = byId.get(r.tenancy_id) || {};
    const people = (t.tenancy_tenants || []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    const mine = (pays.data || []).filter((p) => p.tenancy_id === r.tenancy_id);
    const paidOnTime = Number(r.paid_by_7th) >= Number(r.due) && Number(r.due) > 0;
    const payprop = mine.filter((p) => p.method === "payprop");
    const paypropBy = payprop.filter((p) => p.received_on <= drawBy);
    const lastPaid = mine.map((p) => p.received_on).sort().pop() || null;
    return {
      tenancy_id: r.tenancy_id,
      place: [t.unit?.property?.address, t.unit?.label].filter(Boolean).join(", "),
      tenant: people.map((p) => p.full_name).filter(Boolean).join(", ") || "Tenant",
      email: people.find((p) => p.email)?.email || null,
      due: Number(r.due),
      paid_by_7th: Number(r.paid_by_7th),
      paid_on_time: paidOnTime,
      last_paid_on: lastPaid,
      methods: [...new Set(mine.map((p) => p.method))],
      used_payprop: payprop.length > 0,
      entered: paidOnTime && paypropBy.length > 0,
    };
  });
  rows.sort((a, b) => Number(b.entered) - Number(a.entered) || Number(b.paid_on_time) - Number(a.paid_on_time) || a.place.localeCompare(b.place, "en-CA", { numeric: true }));
  return { period, onTimeBy, drawBy, rows, draw: draw.data || null };
}

export async function pickWinner(admin, periodIso, staffId) {
  const { period, rows, draw } = await drawList(admin, periodIso);
  if (draw?.winner_tenancy_id) throw new Error("This month's winner has already been drawn.");
  const entrants = rows.filter((r) => r.entered);
  if (!entrants.length) throw new Error("Nobody is entered this month yet.");
  const w = entrants[randomInt(entrants.length)];
  const { error } = await admin.from("payprop_draws").upsert({
    period,
    entries: entrants.length,
    winner_tenancy_id: w.tenancy_id,
    winner_name: w.tenant,
    winner_email: w.email,
    drawn_at: new Date().toISOString(),
    drawn_by: staffId || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return { winner: w, entries: entrants.length };
}

export async function emailWinner(admin, periodIso) {
  const period = monthStart(periodIso);
  const { data: d } = await admin.from("payprop_draws").select("*").eq("period", period).maybeSingle();
  if (!d?.winner_email) throw new Error("Draw a winner with an email on file first.");
  const r = await sendMail({
    to: d.winner_email,
    subject: `You won this month's ${DRAW_PRIZE}!`,
    lines: [
      `Hi ${String(d.winner_name || "").split(/[ ,]/)[0] || "there"},`,
      `Congratulations! You paid your ${monthName(period)} rent through PayProp before the 7th, and your name was drawn for this month's ${DRAW_PRIZE}.`,
      "We'll be in touch shortly to get it to you. Thanks for paying on time through PayProp. Keep it up and you're entered again every month.",
    ],
  });
  if (!r.sent) throw new Error("The email didn't send. Try again.");
  await admin.from("payprop_draws").update({ winner_emailed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("period", period);
  return { sent: true };
}

// Daily cron: on the 8th, email staff the short list for the month.
export async function drawDigest(admin, todayIso) {
  if (!todayIso.endsWith("-08")) return { skipped: true };
  const { period, rows } = await drawList(admin, todayIso);
  const onTime = rows.filter((r) => r.paid_on_time);
  const entered = rows.filter((r) => r.entered);
  const line = (r) => `• ${r.tenant} (${r.place})${r.entered ? " · PayProp, entered" : ""}`;
  await sendMail({
    to: staffEmails(),
    subject: `${monthName(period)}: ${onTime.length} paid by the 7th, ${entered.length} in the PayProp draw`,
    lines: [
      `Paid in full on or before the 7th: ${onTime.length} of ${rows.length} tenancies.`,
      onTime.length ? `Paid by the 7th:\n${onTime.map(line).join("\n")}` : "",
      `In the ${DRAW_PRIZE} draw (paid through PayProp before the 7th): ${entered.length}.`,
      "Next: check any PayProp payments still to import, then draw the winner on the draw page.",
    ],
    link: `${SITE_URL}/admin/rent/draw?month=${period.slice(0, 7)}`,
    linkLabel: "Open the draw",
  });
  return { sent: true, onTime: onTime.length, entered: entered.length };
}
