import "server-only";
import { SMART_MODEL, RULES, callModel, redact } from "@/lib/ai";

// Ask IRep / Draft with AI: Sonnet with a few tools. Read tools return compact JSON (only the fields
// needed); write tools only create drafts, tasks or notes for staff to review, and every tool call is logged.

const TOOLS = [
  {
    name: "find_tenancies",
    description: "Find current or past tenancies by tenant name, address or unit. Returns up to 8 compact rows.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "get_tenancy",
    description: "One tenancy: tenants, address, dates, rent, last month's rent held, balance, months owing, recent payments, notices, open maintenance, landlord.",
    input_schema: { type: "object", properties: { tenancy_id: { type: "string" } }, required: ["tenancy_id"] },
  },
  {
    name: "find_landlords",
    description: "Find landlords (owners) by name or property address.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "today_list",
    description: "Today's start-of-day list: arrears, documents awaiting signature, onboarding, maintenance, move-ins/outs, deadlines, payments to match, tasks.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "draft_email",
    description: "Save an email DRAFT for staff to review and send (from administration@ireppm.ca, copy to administration@). Never sends.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
        body: { type: "string" },
        tenancy_id: { type: "string" },
        owner_id: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "create_task",
    description: "Add a task to the staff Tasks list (optionally waiting on someone).",
    input_schema: {
      type: "object",
      properties: { title: { type: "string" }, detail: { type: "string" }, tenancy_id: { type: "string" }, waiting_on: { type: "string" } },
      required: ["title"],
    },
  },
  {
    name: "add_note",
    description: "Add a short dated note to a tenancy's notes.",
    input_schema: { type: "object", properties: { tenancy_id: { type: "string" }, note: { type: "string" } }, required: ["tenancy_id", "note"] },
  },
  {
    name: "draft_n4_details",
    description: "Work out N4 details for a tenancy (amount owing by month, earliest termination date) and add a task with a link to start the N4. Does not create or send the N4.",
    input_schema: { type: "object", properties: { tenancy_id: { type: "string" }, mailed: { type: "boolean" } }, required: ["tenancy_id"] },
  },
];

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const names = (t) => (t?.tenancy_tenants || []).map((p) => p.full_name).filter(Boolean).join(", ");

async function runTool(sb, name, input, userId) {
  if (name === "find_tenancies") {
    const q = String(input.query || "").trim().toLowerCase();
    const { data } = await sb
      .from("tenancies")
      .select("id, status, rent, collects_rent, unit:units(label, management_type, property:properties(address)), tenancy_tenants(full_name)")
      .order("start_date", { ascending: false })
      .limit(400);
    const words = q.split(/\s+/).filter(Boolean);
    const hits = (data || []).filter((t) => {
      const hay = `${names(t)} ${t.unit?.property?.address || ""} ${t.unit?.label || ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    return hits.slice(0, 8).map((t) => ({
      id: t.id,
      tenants: names(t),
      address: t.unit?.property?.address,
      unit: t.unit?.label,
      status: t.status,
      rent: Number(t.rent),
      leasing_only: t.unit?.management_type === "leasing_only",
      maintenance_only: t.collects_rent === false,
    }));
  }
  if (name === "get_tenancy") {
    if (!UUID.test(String(input.tenancy_id))) return { error: "Unknown tenancy id. Use find_tenancies first." };
    const id = input.tenancy_id;
    const [{ data: t }, { data: bal }, { data: months }, { data: pays }, { data: notices }, { data: maint }] = await Promise.all([
      sb
        .from("tenancies")
        .select(
          "id, status, start_date, end_date, move_out_date, rent, rent_due_day, last_month_deposit, collects_rent, tenancy_tenants(full_name, email, is_primary), unit:units(id, label, management_type, property:properties(id, address, city, owner:owners(id, name, email)))"
        )
        .eq("id", id)
        .maybeSingle(),
      sb.from("tenancy_balances").select("balance").eq("tenancy_id", id).maybeSingle(),
      sb.from("rent_collection").select("period, due, paid, outstanding").eq("tenancy_id", id).gt("outstanding", 0.004).order("period"),
      sb.from("payments").select("received_on, amount, method, period, kind").eq("tenancy_id", id).eq("status", "matched").order("received_on", { ascending: false }).limit(5),
      sb.from("notices").select("form, served_on, effective_date, status").eq("tenancy_id", id).order("served_on", { ascending: false }).limit(5),
      sb.from("maintenance_requests").select("title, status, created_at").eq("tenancy_id", id).not("status", "in", "(completed,cancelled)").limit(5),
    ]);
    if (!t) return { error: "Tenancy not found." };
    return {
      id: t.id,
      tenants: (t.tenancy_tenants || []).map((p) => ({ name: p.full_name, email: p.email, primary: p.is_primary })),
      address: t.unit?.property?.address,
      city: t.unit?.property?.city,
      unit: t.unit?.label,
      status: t.status,
      start: t.start_date,
      end: t.end_date,
      moving_out: t.move_out_date,
      rent: Number(t.rent),
      due_day: t.rent_due_day,
      lmr_held: t.last_month_deposit,
      balance: Number(bal?.balance || 0),
      months_owing: (months || []).map((m) => ({ month: m.period, due: Number(m.due), paid: Number(m.paid), owing: Number(m.outstanding) })),
      recent_payments: pays || [],
      notices: notices || [],
      open_maintenance: (maint || []).map((m) => `${m.title} (${m.status})`),
      landlord: t.unit?.property?.owner ? { id: t.unit.property.owner.id, name: t.unit.property.owner.name, email: t.unit.property.owner.email } : null,
      leasing_only: t.unit?.management_type === "leasing_only",
      maintenance_only: t.collects_rent === false,
    };
  }
  if (name === "find_landlords") {
    const q = String(input.query || "").trim().toLowerCase();
    const { data } = await sb.from("owners").select("id, name, email, properties(address, management_package)").limit(300);
    return (data || [])
      .filter((o) => `${o.name} ${(o.properties || []).map((p) => p.address).join(" ")}`.toLowerCase().includes(q))
      .slice(0, 8)
      .map((o) => ({ id: o.id, name: o.name, email: o.email, properties: (o.properties || []).map((p) => `${p.address} (${p.management_package || "managed"})`) }));
  }
  if (name === "today_list") {
    const { buildToday } = await import("@/lib/today");
    return { text: (await buildToday(sb)).text };
  }

  // Write tools: drafts and tasks only.
  if (name === "draft_email") {
    const to = (input.to || []).map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    const { data, error } = await sb
      .from("email_drafts")
      .insert({
        to_emails: to,
        subject: String(input.subject || "").slice(0, 200),
        body: redact(String(input.body || "")).slice(0, 8000),
        tenancy_id: UUID.test(String(input.tenancy_id || "")) ? input.tenancy_id : null,
        owner_id: UUID.test(String(input.owner_id || "")) ? input.owner_id : null,
        source: "ai",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    return { draft_id: data.id, link: `/admin/emails/${data.id}`, note: "Saved as a draft. Staff review and send it." };
  }
  if (name === "create_task") {
    const waiting = String(input.waiting_on || "").trim();
    const { data, error } = await sb
      .from("staff_tasks")
      .insert({
        kind: "ai",
        title: String(input.title || "").slice(0, 200),
        detail: input.detail ? redact(String(input.detail)).slice(0, 2000) : null,
        tenancy_id: UUID.test(String(input.tenancy_id || "")) ? input.tenancy_id : null,
        status: waiting ? "waiting" : "open",
        waiting_on: waiting || null,
        waiting_since: waiting ? today() : null,
        source: "ai",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    return { task_id: data.id, link: "/admin/tasks" };
  }
  if (name === "add_note") {
    if (!UUID.test(String(input.tenancy_id))) return { error: "Unknown tenancy id." };
    const { data: t } = await sb.from("tenancies").select("notes").eq("id", input.tenancy_id).maybeSingle();
    if (!t) return { error: "Tenancy not found." };
    const note = `[${today()}, assistant] ${redact(String(input.note || "")).slice(0, 500)}`;
    const { error } = await sb.from("tenancies").update({ notes: [t.notes, note].filter(Boolean).join("\n") }).eq("id", input.tenancy_id);
    return error ? { error: error.message } : { ok: true };
  }
  if (name === "draft_n4_details") {
    const info = await runTool(sb, "get_tenancy", { tenancy_id: input.tenancy_id }, userId);
    if (info.error) return info;
    if (info.maintenance_only || info.leasing_only) return { error: "IRep doesn't collect rent for this tenancy, so there's no N4 to prepare." };
    const owing = info.months_owing.reduce((s, m) => s + m.owing, 0);
    if (owing <= 0) return { error: "Nothing is owing on this tenancy." };
    const serve = today();
    const termination = addDays(serve, 14 + (input.mailed ? 5 : 0));
    const detail = [
      `Amount owing: $${owing.toFixed(2)} (${info.months_owing.map((m) => `${m.month.slice(0, 7)} $${m.owing.toFixed(2)}`).join(", ")}).`,
      `If served today${input.mailed ? " by mail" : ""}, the termination date can be no earlier than ${termination}.`,
      "The Certificate of Service for Chuck is drafted with the N4.",
    ].join(" ");
    const { data } = await sb
      .from("staff_tasks")
      .insert({
        kind: "ai",
        title: `Prepare N4: ${info.tenants.map((p) => p.name).join(", ")}, ${info.address}`,
        detail,
        tenancy_id: info.id,
        link: `/admin/signatures/new?kind=N4&tenancy=${info.id}`,
        source: "ai",
        created_by: userId,
      })
      .select("id")
      .single();
    return { amount_owing: owing, months: info.months_owing, earliest_termination: termination, task_id: data?.id, link: `/admin/signatures/new?kind=N4&tenancy=${info.id}` };
  }
  return { error: `Unknown tool ${name}` };
}

const WRITE_TOOLS = new Set(["draft_email", "create_task", "add_note", "draft_n4_details"]);

// Runs a staff question with tools (at most 6 rounds). Returns the answer and what was created.
export async function askIRep(sb, { question, tenancyId, userId }) {
  const conversation = `ask:${Date.now()}`;
  const context = tenancyId && UUID.test(tenancyId) ? `\n\n(The staff member is looking at tenancy ${tenancyId}.)` : "";
  const messages = [{ role: "user", content: `${redact(question)}${context}` }];
  const created = [];
  let cost = 0;
  for (let round = 0; round < 6; round++) {
    const msg = await callModel(sb, { feature: "ask_irep", model: SMART_MODEL, system: RULES, messages, tools: TOOLS, maxTokens: 1200, userId });
    messages.push({ role: "assistant", content: msg.content });
    const uses = (msg.content || []).filter((c) => c.type === "tool_use");
    if (!uses.length || msg.stop_reason !== "tool_use") {
      const { data: rows } = await sb.from("ai_usage").select("cost_usd").eq("user_id", userId).eq("feature", "ask_irep").order("at", { ascending: false }).limit(round + 1);
      cost = (rows || []).reduce((s, r) => s + Number(r.cost_usd), 0);
      return {
        answer: (msg.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim(),
        created,
        cost,
      };
    }
    const results = [];
    for (const u of uses) {
      let out;
      try {
        out = await runTool(sb, u.name, u.input || {}, userId);
      } catch (err) {
        out = { error: String(err?.message || err) };
      }
      await sb.from("ai_actions").insert({ user_id: userId, tool: u.name, input: u.input || {}, result: out, conversation });
      if (WRITE_TOOLS.has(u.name) && out?.link) created.push({ tool: u.name, link: out.link });
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out).slice(0, 12000) });
    }
    messages.push({ role: "user", content: results });
  }
  return { answer: "I couldn't finish that in a few steps. Try a narrower question.", created, cost };
}
