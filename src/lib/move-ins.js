// Upcoming tenancies become active on their start date (Toronto time). The unit then shows as
// occupied (database trigger). A unit that still has an active tenancy is skipped and reported.
export async function activateMoveIns(sb) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const { data, error } = await sb.from("tenancies").select("id, unit_id, start_date").eq("status", "upcoming").lte("start_date", today);
  if (error) throw new Error(error.message);
  const activated = [];
  const skipped = [];
  for (const t of data || []) {
    const { data: busy } = await sb.from("tenancies").select("id").eq("unit_id", t.unit_id).in("status", ["active", "notice"]).neq("id", t.id).limit(1);
    if (busy?.length) {
      skipped.push(t.id);
      continue;
    }
    const { error: upErr } = await sb.from("tenancies").update({ status: "active" }).eq("id", t.id).eq("status", "upcoming");
    if (upErr) skipped.push(t.id);
    else activated.push(t.id);
  }
  return { activated: activated.length, skipped: skipped.length };
}
