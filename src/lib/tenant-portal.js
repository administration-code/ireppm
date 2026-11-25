import "server-only";
import { SITE } from "@/lib/site";
import { SIGNED_BUCKET } from "@/lib/signatures-server";
import { RECEIPT_EXCLUDED, loadReceipt } from "@/lib/receipt";
import { mailer } from "@/lib/mailer";

// Everything the tenant portal shows beyond the basics, for the signed-in tenant's own homes only.
// Every query is limited to tenancies the user is listed on (tenancy_tenants.profile_id).

const CURRENT = ["upcoming", "active", "notice"];
const FIX_WINDOW_DAYS = 21; // ask "Is it fixed?" for jobs finished in the last 3 weeks
const torontoNow = () => new Date();

export async function myTenancies(sb, userId) {
  const { data } = await sb
    .from("tenancy_tenants")
    .select(
      "id, tenancy:tenancies!inner(id, status, collects_rent, unit_id, unit:units(label, property_id, property:properties(id, address, management_package)))"
    )
    .eq("profile_id", userId);
  return (data || [])
    .map((r) => ({ myRowId: r.id, ...r.tenancy }))
    .filter((t) => t && (CURRENT.includes(t.status) || t.status === "ended" || t.status === "past"));
}

const homeOf = (t) => [t.unit?.label, t.unit?.property?.address].filter(Boolean).join(", ");

export async function portalData(sb, userId) {
  const all = await myTenancies(sb, userId);
  const current = all.filter((t) => CURRENT.includes(t.status));
  const ids = all.map((t) => t.id);
  if (!ids.length) return { homes: [] };
  const propIds = [...new Set(current.map((t) => t.unit?.property_id).filter(Boolean))];
  const since = new Date(Date.now() - FIX_WINDOW_DAYS * 86400000).toISOString();

  const [pay, bal, people, visits, jobs, leases, notices] = await Promise.all([
    sb
      .from("payments")
      .select("id, tenancy_id, received_on, amount, method, kind, period, status")
      .in("tenancy_id", ids)
      .not("status", "in", `(${RECEIPT_EXCLUDED.join(",")})`)
      .neq("method", "paid_to_owner")
      .order("received_on", { ascending: false })
      .limit(200),
    sb.from("tenancy_balances").select("tenancy_id, balance, last_paid_on").in("tenancy_id", ids),
    sb.from("tenancy_tenants").select("id, tenancy_id, profile_id, full_name, email, phone, is_primary, contact_time").in("tenancy_id", current.map((t) => t.id)),
    propIds.length
      ? sb
          .from("inspection_visits")
          .select("id, property_id, scheduled_at, status")
          .in("property_id", propIds)
          .eq("status", "scheduled")
          .gte("scheduled_at", new Date(Date.now() - 2 * 3600000).toISOString())
          .order("scheduled_at")
      : Promise.resolve({ data: [] }),
    sb
      .from("maintenance_requests")
      .select("id, tenancy_id, unit_id, title, status, scheduled_for, completed_at, vendor_done_at, tenant_confirmed")
      .in("tenancy_id", ids)
      .or(`status.eq.scheduled,and(status.eq.completed,completed_at.gte.${since})`),
    sb.from("signature_requests").select("id, tenancy_id, title, completed_at").eq("kind", "lease").eq("status", "completed").not("signed_file_path", "is", null).in("tenancy_id", ids),
    sb.from("notices").select("id, tenancy_id, form, title, served_on, signature_request_id").in("tenancy_id", ids).eq("status", "served").not("served_on", "is", null),
  ]);

  const byTen = new Map(all.map((t) => [t.id, t]));
  const balOf = new Map((bal.data || []).map((b) => [b.tenancy_id, b]));
  const now = torontoNow().getTime();

  const homes = current.map((t) => {
    const prop = t.unit?.property || {};
    const managed = prop.management_package !== "leasing_only";
    const b = balOf.get(t.id);
    const mine = (people.data || []).filter((p) => p.tenancy_id === t.id);
    return {
      tenancy_id: t.id,
      home: homeOf(t),
      managed,
      collects_rent: t.collects_rent !== false && managed,
      balance: t.collects_rent !== false && managed && b ? Math.round(Number(b.balance || 0) * 100) / 100 : null,
      last_paid_on: b?.last_paid_on || null,
      payments: t.collects_rent !== false && managed ? (pay.data || []).filter((p) => p.tenancy_id === t.id).slice(0, 60) : [],
      people: mine
        .sort((a, b2) => Number(b2.is_primary) - Number(a.is_primary))
        .map((p) => ({ id: p.id, name: p.full_name, me: p.profile_id === userId, email: p.email || null, phone: p.phone || null, contact_time: p.contact_time || null })),
      visits: [
        ...(visits.data || [])
          .filter((v) => v.property_id === t.unit?.property_id)
          .map((v) => ({ id: `i-${v.id}`, kind: "inspection", at: v.scheduled_at, title: "Property inspection (about 1 hour)" })),
        ...(jobs.data || [])
          .filter((j) => j.tenancy_id === t.id && j.status === "scheduled" && j.scheduled_for && new Date(j.scheduled_for).getTime() > now - 2 * 3600000)
          .map((j) => ({ id: `m-${j.id}`, kind: "repair", at: j.scheduled_for, title: j.title })),
      ].sort((a, b2) => String(a.at).localeCompare(String(b2.at))),
      toConfirm: managed
        ? (jobs.data || [])
            .filter((j) => j.tenancy_id === t.id && j.status === "completed" && !j.tenant_confirmed)
            .map((j) => ({ id: j.id, title: j.title, done_on: String(j.completed_at || j.vendor_done_at || "").slice(0, 10) }))
        : [],
    };
  });

  const documents = [
    ...(leases.data || []).map((l) => ({ id: `lease:${l.id}`, kind: "Lease", title: "Signed lease", date: String(l.completed_at || "").slice(0, 10), home: homeOf(byTen.get(l.tenancy_id) || {}) })),
    ...(notices.data || [])
      .filter((n) => n.signature_request_id)
      .map((n) => ({ id: `notice:${n.id}`, kind: n.form, title: n.title || `Notice (${n.form})`, date: n.served_on, home: homeOf(byTen.get(n.tenancy_id) || {}) })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return {
    homes,
    documents,
    contacts: {
      office: { phone: SITE.phone, email: SITE.email, hours: SITE.hours },
      emergency: SITE.emergency,
    },
  };
}

// A short-lived link to one of the tenant's own documents.
export async function documentUrl(sb, userId, docId) {
  const [kind, id] = String(docId || "").split(":");
  const ids = (await myTenancies(sb, userId)).map((t) => t.id);
  if (!ids.length || !id) return null;
  let path = null;
  if (kind === "lease") {
    const { data } = await sb.from("signature_requests").select("tenancy_id, signed_file_path, kind, status").eq("id", id).maybeSingle();
    if (data?.kind === "lease" && data.status === "completed" && ids.includes(data.tenancy_id)) path = data.signed_file_path;
  } else if (kind === "notice") {
    const { data: n } = await sb.from("notices").select("tenancy_id, status, signature_request_id").eq("id", id).maybeSingle();
    if (n?.status === "served" && ids.includes(n.tenancy_id) && n.signature_request_id) {
      const { data } = await sb.from("signature_requests").select("signed_file_path").eq("id", n.signature_request_id).maybeSingle();
      path = data?.signed_file_path || null;
    }
  }
  if (!path) return null;
  const { data } = await sb.storage.from(SIGNED_BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl || null;
}

// A receipt, only for the tenant's own tenancy.
export async function myReceipt(sb, userId, params) {
  const ids = (await myTenancies(sb, userId)).map((t) => t.id);
  const receipt = await loadReceipt(sb, params);
  if (!receipt || !ids.includes(receipt.tenancyId)) return null;
  return receipt;
}

// "Yes, Fixed" closes the loop; "Still a Problem" reopens the job for staff and tells the office.
export async function confirmFix(sb, userId, { id, answer, note }) {
  if (!["fixed", "not_fixed"].includes(answer)) return { error: "Choose Yes, Fixed or Still a Problem." };
  const ids = (await myTenancies(sb, userId)).map((t) => t.id);
  const { data: job } = await sb
    .from("maintenance_requests")
    .select("id, tenancy_id, title, status, staff_notes, unit:units(label, property:properties(address))")
    .eq("id", id)
    .maybeSingle();
  if (!job || !ids.includes(job.tenancy_id) || job.status !== "completed") return { error: "That request can't be updated." };
  const text = String(note || "").trim().slice(0, 1000);
  const now = new Date().toISOString();
  const changes = { tenant_confirmed: answer, tenant_confirmed_at: now, tenant_confirm_note: text || null };
  if (answer === "not_fixed") {
    changes.status = "triaged";
    changes.tenant_update = "Thanks for letting us know. We've reopened this request and will be in touch.";
    changes.staff_notes = [job.staff_notes, `${now.slice(0, 10)}: tenant says it's still a problem${text ? `: "${text}"` : "."}`].filter(Boolean).join("\n");
  }
  const { error } = await sb.from("maintenance_requests").update(changes).eq("id", id);
  if (error) return { error: /tenant_confirmed/.test(error.message) ? "This isn't switched on yet. Please try again later." : "That didn't save. Please try again." };
  if (answer === "not_fixed") {
    const place = [job.unit?.label, job.unit?.property?.address].filter(Boolean).join(", ");
    await mailer()
      .emails.send({
        from: `${SITE.name} <${SITE.email}>`,
        to: [SITE.email],
        subject: `Still a problem: ${job.title} · ${place}`,
        text: `The tenant says this job isn't fixed. It's been reopened in the portal.\n\n${job.title}\n${place}\n${text ? `\nTenant's note: ${text}\n` : ""}\n${SITE.url}/admin/maintenance/${job.id}`,
      })
      .catch(() => null);
  }
  return { ok: true };
}

const cleanPhone = (v) => String(v || "").replace(/[^\d+()\-\s.x]/g, "").trim().slice(0, 30);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A tenant updates their own phone and best time to call, and can add an email or phone for a
// co-tenant who has none on file (never changes someone else's existing details).
export async function updateDetails(sb, userId, { people }) {
  const tenancies = await myTenancies(sb, userId);
  const ids = tenancies.filter((t) => CURRENT.includes(t.status)).map((t) => t.id);
  const rows = Array.isArray(people) ? people.slice(0, 12) : [];
  const { data: onFile } = ids.length
    ? await sb.from("tenancy_tenants").select("id, tenancy_id, profile_id, full_name, email, phone").in("tenancy_id", ids)
    : { data: [] };
  const byId = new Map((onFile || []).map((p) => [p.id, p]));
  const changed = [];
  for (const r of rows) {
    const cur = byId.get(r.id);
    if (!cur) continue;
    const me = cur.profile_id === userId;
    const upd = {};
    const phone = cleanPhone(r.phone);
    if (me) {
      if (phone !== (cur.phone || "")) upd.phone = phone || null;
      upd.contact_time = String(r.contact_time || "").trim().slice(0, 80) || null;
    } else {
      if (!cur.phone && phone) upd.phone = phone;
      const email = String(r.email || "").trim().toLowerCase();
      if (!cur.email && email) {
        if (!EMAIL.test(email)) return { error: `Check the email for ${cur.full_name}.` };
        upd.email = email;
      }
    }
    if (!Object.keys(upd).length) continue;
    upd.details_updated_at = new Date().toISOString();
    let { error } = await sb.from("tenancy_tenants").update(upd).eq("id", cur.id);
    if (error && /contact_time|details_updated_at/.test(error.message)) {
      delete upd.contact_time;
      delete upd.details_updated_at;
      ({ error } = Object.keys(upd).length ? await sb.from("tenancy_tenants").update(upd).eq("id", cur.id) : { error: null });
    }
    if (error) return { error: "That didn't save. Please try again." };
    changed.push(`${cur.full_name}: ${Object.entries(upd).filter(([k]) => k !== "details_updated_at").map(([k, v]) => `${k.replace("_", " ")} → ${v || "(removed)"}`).join(", ")}`);
  }
  if (changed.length) {
    await mailer()
      .emails.send({
        from: `${SITE.name} <${SITE.email}>`,
        to: [SITE.email],
        subject: "Tenant updated contact details in the portal",
        text: `A tenant updated contact details:\n\n${changed.join("\n")}\n\nNothing to do unless something looks wrong.`,
      })
      .catch(() => null);
  }
  return { ok: true, changed: changed.length };
}
