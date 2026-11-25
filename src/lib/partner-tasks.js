import "server-only";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { pushTo } from "@/lib/push";
import { SITE } from "@/lib/site";

// Tasks staff hand to Chuck (or another partner who signs in to the agent portal).
// He sees them in his portal with the tenants' names and numbers, marks them done with a note,
// and the office is told. Needs migration 0099 (staff_tasks.partner_id).

const FROM = "IRep Property Management <alerts@ireppm.ca>";
const first = (n) => String(n || "").split(" ")[0] || "there";

export async function assignToPartner(sb, taskId, partnerId, staffId) {
  const { data: partner } = await sb.from("partners").select("id, name, email, active").eq("id", partnerId).maybeSingle();
  if (!partner?.active) return { error: "That partner isn't active." };
  const { data: task, error } = await sb
    .from("staff_tasks")
    .update({ partner_id: partner.id, assigned_to: null, assigned_by: staffId, assigned_at: new Date().toISOString(), partner_done_at: null, partner_note: null })
    .eq("id", taskId)
    .select("id, title, detail, due_date")
    .single();
  if (error) return { error: /partner_id/.test(error.message) ? "Run migration 0099 first." : error.message };
  await pushTo(sb, { partnerId: partner.id }, { title: "New task from the office", body: task.title, url: "/agent/tasks", tag: `task-${task.id}` });
  if (partner.email && mailConfigured()) {
    const link = { href: `${SITE.url}/agent/tasks`, label: "Open My Tasks" };
    const rows = [["Task", task.title], ...(task.detail ? [["Details", task.detail]] : []), ...(task.due_date ? [["By", task.due_date]] : [])];
    await mailer()
      .emails.send({
        from: FROM,
        to: [partner.email],
        replyTo: SITE.email,
        subject: `New task: ${task.title}`.slice(0, 150),
        html: renderEmail({ heading: "New Task", intro: `Hi ${first(partner.name)}, the office added a task for you. Tap Done in your portal when it's finished.`, rows, link }),
        text: renderText({ heading: "New Task", rows, link }),
      })
      .catch((err) => console.error("[partner-tasks] email failed:", err?.message || err));
  }
  return { ok: true };
}

// A partner's open tasks, with the place and the tenants to talk to.
export async function partnerTasks(sb, partnerId) {
  const { data, error } = await sb
    .from("staff_tasks")
    .select("id, title, detail, due_date, created_at, tenancy_id, unit_id, property_id")
    .eq("partner_id", partnerId)
    .in("status", ["open", "waiting"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at");
  if (error) return [];
  const rows = data || [];
  const tenancyIds = [...new Set(rows.map((r) => r.tenancy_id).filter(Boolean))];
  const unitIds = [...new Set(rows.map((r) => r.unit_id).filter(Boolean))];
  const propIds = [...new Set(rows.map((r) => r.property_id).filter(Boolean))];
  const [{ data: people }, { data: tens }, { data: units }, { data: props }] = await Promise.all([
    tenancyIds.length ? sb.from("tenancy_tenants").select("tenancy_id, full_name, phone, is_primary").in("tenancy_id", tenancyIds) : { data: [] },
    tenancyIds.length ? sb.from("tenancies").select("id, unit_id").in("id", tenancyIds) : { data: [] },
    sb.from("units").select("id, label, property_id").in("id", [...unitIds, "00000000-0000-0000-0000-000000000000"]),
    sb.from("properties").select("id, address").in("id", [...propIds, "00000000-0000-0000-0000-000000000000"]),
  ]);
  const unitOf = new Map((units || []).map((u) => [u.id, u]));
  const tenUnit = new Map((tens || []).map((t) => [t.id, t.unit_id]));
  const missingUnits = [...new Set((tens || []).map((t) => t.unit_id).filter((id) => id && !unitOf.has(id)))];
  if (missingUnits.length) {
    const { data: more } = await sb.from("units").select("id, label, property_id").in("id", missingUnits);
    (more || []).forEach((u) => unitOf.set(u.id, u));
  }
  const propOf = new Map((props || []).map((p) => [p.id, p.address]));
  const missingProps = [...new Set([...unitOf.values()].map((u) => u.property_id).filter((id) => id && !propOf.has(id)))];
  if (missingProps.length) {
    const { data: more } = await sb.from("properties").select("id, address").in("id", missingProps);
    (more || []).forEach((p) => propOf.set(p.id, p.address));
  }
  return rows.map((r) => {
    const unit = unitOf.get(r.unit_id || tenUnit.get(r.tenancy_id));
    const address = propOf.get(r.property_id || unit?.property_id) || "";
    return {
      id: r.id,
      title: r.title,
      detail: r.detail,
      due_date: r.due_date,
      place: [address, unit?.label].filter(Boolean).join(", "),
      people: (people || [])
        .filter((p) => p.tenancy_id === r.tenancy_id)
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        .map((p) => ({ name: p.full_name, phone: p.phone || null })),
    };
  });
}

export async function partnerTaskDone(sb, partner, taskId, note) {
  const text = String(note || "").trim().slice(0, 1000);
  const now = new Date().toISOString();
  const { data: task, error } = await sb
    .from("staff_tasks")
    .update({ status: "done", done_at: now, partner_done_at: now, partner_note: text || null })
    .eq("id", taskId)
    .eq("partner_id", partner.id)
    .in("status", ["open", "waiting"])
    .select("id, title, assigned_by")
    .maybeSingle();
  if (error || !task) return { error: "That task can't be updated." };
  if (mailConfigured()) {
    const rows = [["Task", task.title], ["Done by", partner.name], ...(text ? [["Note", text]] : [])];
    const link = { href: `${SITE.url}/admin/tasks`, label: "Open Tasks" };
    let to = [SITE.email];
    if (task.assigned_by) {
      const { data: p } = await sb.from("profiles").select("email").eq("id", task.assigned_by).maybeSingle();
      if (p?.email) to = [p.email];
    }
    await mailer()
      .emails.send({
        from: FROM,
        to,
        subject: `${first(partner.name)} finished: ${task.title}`.slice(0, 150),
        html: renderEmail({ heading: "Task Done", intro: `${partner.name} marked this task done in the agent portal.`, rows, link }),
        text: renderText({ heading: "Task Done", rows, link }),
      })
      .catch(() => null);
  }
  return { ok: true };
}
