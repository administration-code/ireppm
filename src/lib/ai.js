import "server-only";
import { createHash } from "node:crypto";

// IRep's small AI layer. Server-side only: the API key (ANTHROPIC_API_KEY) never reaches a browser.
//   Haiku: classifying administration@ emails and the two-line Today summary (cheap, automatic).
//   Sonnet: only when a staff member clicks Ask IRep / Draft with AI.
// Every call is logged with its tokens and estimated cost, and refused once the monthly cap is reached.
// The assistant's write tools only make drafts and tasks; nothing is sent, signed, paid or deleted.

export const FAST_MODEL = process.env.AI_MODEL_FAST || "claude-haiku-5-5";
export const SMART_MODEL = process.env.AI_MODEL_SMART || "claude-sonnet-5-5";
export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

// The standing rules, sent as a cached system prompt.
export const RULES = `You are the assistant for IRep Property Management (Windsor, Ontario), helping staff in the portal (ireppm.ca/admin).
Rules you always follow:
- You only prepare drafts and tasks for staff to review. Never send, sign, pay, transfer or delete anything. Never send or move money.
- Rent payments apply to the oldest arrears first.
- Never record, repeat or ask for ID numbers, driver's licence numbers, SINs or bank details.
- Emails go from administration@ireppm.ca with a copy to administration@ireppm.ca.
- Landlords and owners are contacted by email. Don't invite calls unless the landlord asked for one.
- Don't give landlords overly specific details (for example exact marketing dates).
- Leasing-only properties: never say or imply that IRep manages the property or collects the rent.
- Management-fee renewals use the $175 base unless staff say otherwise.
- Tenants pay rent by e-Transfer to payment@ireppm.ca (not the old ireppm@ireprealty.com address).
- N4: monthly tenancies need a termination date at least 14 days after service (7 days for daily or weekly tenancies); add 5 days if the notice is mailed. Whenever an N4, N5 or other notice Chuck serves is prepared, a Certificate of Service is drafted too: date served and method of service left blank for Chuck, no method pre-selected, "Signed As Representative" ticked, his phone 519-999-9742.
- Use Canadian English. Be brief: short sentences, plain words.
- Use the tools to look things up; don't guess amounts, dates or names. If something isn't in the data, say so.`;

const redactors = [
  [/\b\d{3}[- ]?\d{3}[- ]?\d{3}\b/g, "[number removed]"], // SIN-shaped
  [/\b(?:\d[ -]?){13,19}\b/g, "[number removed]"], // card / account numbers
  [/\b\d{5}[- ]?\d{3}[- ]?\d{4,12}\b/g, "[number removed]"], // transit-institution-account
  [/\b[A-Z]\d{4}[- ]?\d{5}[- ]?\d{5}\b/gi, "[number removed]"], // Ontario driver's licence
  [/\b\d{7,}\b/g, "[number removed]"], // any long number
];
// Strips ID, licence and bank-style numbers before anything is sent to the model.
export function redact(text) {
  let s = String(text ?? "");
  for (const [re, sub] of redactors) s = s.replace(re, sub);
  return s;
}

async function settings(sb) {
  const { data } = await sb.from("ai_settings").select("*").maybeSingle();
  return data || { enabled: true, monthly_cap_usd: 20, haiku_in: 1, haiku_out: 5, sonnet_in: 3, sonnet_out: 15 };
}

export async function monthSpend(sb) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await sb.from("ai_usage").select("cost_usd").gte("at", start.toISOString());
  return (data || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
}

function cost(model, u, s) {
  const smart = model === SMART_MODEL || /sonnet/i.test(model);
  const inp = Number(smart ? s.sonnet_in : s.haiku_in);
  const out = Number(smart ? s.sonnet_out : s.haiku_out);
  const input = (u.input_tokens || 0) * inp + (u.cache_read_input_tokens || 0) * inp * 0.1 + (u.cache_creation_input_tokens || 0) * inp * 1.25;
  return (input + (u.output_tokens || 0) * out) / 1e6;
}

// One call to the Messages API, with the cap check and the usage log.
export async function callModel(sb, { feature, model, system, messages, tools, maxTokens = 600, userId = null }) {
  if (!aiConfigured()) throw new Error("The AI assistant isn't set up yet (ANTHROPIC_API_KEY).");
  const s = await settings(sb);
  if (!s.enabled) throw new Error("The AI assistant is turned off in AI settings.");
  const spent = await monthSpend(sb);
  if (spent >= Number(s.monthly_cap_usd)) throw new Error(`This month's AI spending cap ($${Number(s.monthly_cap_usd).toFixed(2)}) has been reached.`);
  const body = {
    model,
    max_tokens: maxTokens,
    // The rules (and tools) are cached, so repeat calls only pay full price for the new part.
    system: [{ type: "text", text: system || RULES, cache_control: { type: "ephemeral" } }],
    messages,
    ...(tools?.length ? { tools: tools.map((t, i) => (i === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t)) } : {}),
  };
  let res;
  let json = {};
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    json = await res.json().catch(() => ({}));
  } catch (err) {
    await sb.from("ai_usage").insert({ feature, model, user_id: userId, ok: false, error: String(err?.message || err).slice(0, 300) });
    throw new Error("The AI service couldn't be reached. Try again in a minute.");
  }
  const u = json.usage || {};
  await sb.from("ai_usage").insert({
    feature,
    model,
    user_id: userId,
    input_tokens: u.input_tokens || 0,
    output_tokens: u.output_tokens || 0,
    cache_read_tokens: u.cache_read_input_tokens || 0,
    cache_write_tokens: u.cache_creation_input_tokens || 0,
    cost_usd: cost(model, u, s),
    ok: res.ok,
    error: res.ok ? null : String(json?.error?.message || res.status).slice(0, 300),
  });
  if (!res.ok) throw new Error(`The AI service returned an error: ${json?.error?.message || res.status}`);
  return json;
}

const textOf = (msg) => (msg?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();

// Two plain lines at the top of the Today page. Cached for the day (same list, same summary).
export async function todaySummary(sb, todayText) {
  if (!aiConfigured()) return null;
  const key = `today:${createHash("sha1").update(todayText).digest("hex")}`;
  const { data: hit } = await sb.from("ai_cache").select("value").eq("key", key).maybeSingle();
  if (hit) return hit.value;
  const msg = await callModel(sb, {
    feature: "today_summary",
    model: FAST_MODEL,
    maxTokens: 120,
    messages: [{ role: "user", content: `Summarize this start-of-day list in exactly two short lines: what needs action first, and what's waiting on others.\n\n${redact(todayText)}` }],
  });
  const out = textOf(msg).split("\n").filter(Boolean).slice(0, 2).join("\n");
  if (out) await sb.from("ai_cache").upsert({ key, value: out });
  return out || null;
}

const CATEGORIES = ["rent", "tenant_issue", "landlord", "maintenance", "payprop", "other"];
// Category and a one-line summary for an email that arrived at administration@.
export async function classifyEmail(sb, { from, subject, snippet }) {
  const msg = await callModel(sb, {
    feature: "classify_email",
    model: FAST_MODEL,
    maxTokens: 80,
    messages: [
      {
        role: "user",
        content: `Classify this email to a property manager as one of: ${CATEGORIES.join(", ")}. Reply as JSON {"category":"...","summary":"one short line"}.\nFrom: ${redact(from)}\nSubject: ${redact(subject)}\n\n${redact(String(snippet || "").slice(0, 1200))}`,
      },
    ],
  });
  try {
    const j = JSON.parse(textOf(msg).replace(/^```(json)?|```$/g, "").trim());
    return { category: CATEGORIES.includes(j.category) ? j.category : "other", summary: String(j.summary || "").slice(0, 200) };
  } catch {
    return { category: "other", summary: "" };
  }
}

const MAINT_CATS = ["plumbing", "electrical", "heating_cooling", "appliance", "pests", "doors_locks_windows", "roof_structure", "lawn_snow", "other"];
// Reads a tenant's email: is it a maintenance request, and what are the separate issues in it?
export async function splitMaintenanceEmail(sb, { subject, body }) {
  const msg = await callModel(sb, {
    feature: "maintenance_intake",
    model: FAST_MODEL,
    maxTokens: 600,
    messages: [
      {
        role: "user",
        content: `A tenant emailed their property manager. Decide if it reports maintenance problems, and list each distinct problem separately.
Reply as JSON only: {"is_maintenance":true|false,"about_rent":true|false,"confidence":0-1,"issues":[{"title":"short, under 60 characters","summary":"1-2 sentences in plain words","category":"${MAINT_CATS.join("|")}","urgency":"emergency|urgent|routine"}]}
Urgency: emergency = flooding, no heat in cold weather, gas smell, fire or safety risk, no water. urgent = active leak, heat not working properly, broken tap or toilet, or the tenant says urgent. Otherwise routine.

Subject: ${redact(subject)}

${redact(String(body || "").slice(0, 4000))}`,
      },
    ],
  });
  try {
    const j = JSON.parse(textOf(msg).replace(/^```(json)?|```$/g, "").trim());
    return {
      is_maintenance: Boolean(j.is_maintenance),
      about_rent: Boolean(j.about_rent),
      confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)),
      issues: (Array.isArray(j.issues) ? j.issues : []).slice(0, 6).map((i) => ({
        title: String(i.title || "").slice(0, 80) || "Maintenance request",
        summary: String(i.summary || "").slice(0, 600),
        category: MAINT_CATS.includes(i.category) ? i.category : "other",
        urgency: ["emergency", "urgent", "routine"].includes(i.urgency) ? i.urgency : "routine",
      })),
    };
  } catch {
    return null;
  }
}
