import { getBrowserClient } from "@/lib/supabase";
import { daysUntil, sortTenants } from "@/lib/admin-properties";

export const TURNOVER_STATUS = {
  notice: "Notice",
  make_ready: "Make-ready",
  ready: "Ready",
  listed: "Listed",
  leased: "Leased",
  cancelled: "Cancelled",
};

export const BOARD_COLUMNS = ["notice", "make_ready", "ready", "listed"];
export const CLOSED_TURNOVER = ["leased", "cancelled"];
export const OPEN_TURNOVER_FILTER = `(${CLOSED_TURNOVER.join(",")})`;

export const STAGES = [
  { key: "notice", label: "Notice" },
  { key: "move_out", label: "Move-out" },
  { key: "make_ready", label: "Make-ready" },
  { key: "leasing", label: "Leasing" },
];

const TENANTS = "tenancy_tenants(full_name, is_primary, created_at)";

export const TURNOVER_SELECT = `id, unit_id, ended_tenancy_id, new_tenancy_id, status, move_out_date, target_ready_date, ready_on, leased_on, notes, created_at, updated_at,
  unit:units(id, label, status, listing_id, property:properties(id, address, city), listing:listings(id, status)),
  ended_tenancy:tenancies!turnovers_ended_tenancy_id_fkey(id, status, start_date, move_out_date, end_date, ${TENANTS}),
  new_tenancy:tenancies!turnovers_new_tenancy_id_fkey(id, status, start_date, ${TENANTS})`;

export const TASK_SELECT =
  "id, turnover_id, stage, title, help, sort_order, done, done_at, not_needed, due_date, assigned_to, maintenance_request_id, notes, maintenance:maintenance_requests(id, title, status)";

export function primaryTenant(tenancy) {
  return sortTenants(tenancy?.tenancy_tenants || [])[0]?.full_name || "";
}

export function tenantNames(tenancy) {
  return sortTenants(tenancy?.tenancy_tenants || [])
    .map((t) => t.full_name)
    .join(", ");
}

export function relativeDays(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return "";
  if (d === 0) return "today";
  if (d > 0) return `in ${d} ${d === 1 ? "day" : "days"}`;
  return `${-d} ${d === -1 ? "day" : "days"} ago`;
}

// Days vacant counts from move-out; without a move-out date, from when the turnover opened.
export function daysVacant(t) {
  if (t.move_out_date) {
    const d = daysUntil(t.move_out_date);
    return d > 0 ? null : -d;
  }
  const opened = String(t.created_at || "").slice(0, 10);
  return opened ? Math.max(0, -daysUntil(opened)) : null;
}

export function checklistProgress(tasks) {
  const list = tasks || [];
  const finished = list.filter((t) => t.done || t.not_needed).length;
  return { finished, total: list.length };
}

export function sortTasks(tasks) {
  const order = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));
  return [...tasks].sort(
    (a, b) => order[a.stage] - order[b.stage] || a.sort_order - b.sort_order || String(a.title).localeCompare(String(b.title))
  );
}

export const unitAddress = (unit) =>
  unit ? [unit.property?.address, unit.label, unit.property?.city].filter(Boolean).join(", ") : "";

export async function setTurnoverStatus(id, status) {
  const { data, error } = await getBrowserClient().from("turnovers").update({ status }).eq("id", id).select("id, status, ready_on");
  if (error || !data?.length) throw new Error("That didn't save. Try again.");
  return data[0];
}

export async function startTurnover(unitId) {
  const sb = getBrowserClient();
  const { data, error } = await sb.from("turnovers").insert({ unit_id: unitId, status: "make_ready" }).select("id").single();
  if (error?.code === "23505") throw new Error("This unit already has an open turnover.");
  if (error) throw new Error("We couldn't start the turnover. Try again.");
  const added = await sb.rpc("add_turnover_checklist", { p_turnover_id: data.id, p_from_stage: "make_ready" });
  return { id: data.id, checklistFailed: Boolean(added.error) };
}
