import "server-only";
import { olderThanBusinessDays } from "@/lib/comms";
import { emailEligibility } from "@/lib/serve-notice";

// The start-of-day list: short plain lines, one page, for staff and the AI assistant.
const T = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const md = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "");
const $ = (v) => `$${Math.round(Number(v || 0)).toLocaleString("en-CA")}`;
const days = (from, to) => Math.max(0, Math.round((Date.parse(to) - Date.parse(String(from).slice(0, 10))) / 86400000));
const place = (u) => [u?.property?.address, u?.label && !/^whole/i.test(u.label) ? u.label : ""].filter(Boolean).join(" ");
const names = (t) =>
  (t?.tenancy_tenants || [])
    .slice()
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((p) => p.full_name)
    .filter(Boolean)
    .join(" & ");
const MAX = 8;
const cap = (lines, more) => (lines.length > MAX ? [...lines.slice(0, MAX), `…and ${lines.length - MAX} more (${more})`] : lines);

export async function buildToday(sb) {
  const today = T();
  const in14 = addDays(today, 14);
  const in7 = addDays(today, 7);
  const sections = [];

  // 1. Arrears and N4 status
  const { data: bal } = await sb
    .from("tenancy_balances")
    .select("tenancy_id, balance, tenancy:tenancies!inner(id, status, collects_rent, unit:units(label, property:properties(address)), tenancy_tenants(full_name, is_primary))")
    .gt("balance", 0.5)
    .in("tenancy.status", ["active", "notice"])
    .order("balance", { ascending: false });
  const owing = (bal || []).filter((b) => b.tenancy?.collects_rent !== false);
  const ids = owing.map((b) => b.tenancy_id);
  const [{ data: n4s }, { data: n4drafts }] = await Promise.all([
    ids.length ? sb.from("notices").select("tenancy_id, served_on, effective_date").eq("form", "N4").in("tenancy_id", ids).order("served_on", { ascending: false }) : { data: [] },
    ids.length ? sb.from("signature_requests").select("tenancy_id, status").eq("kind", "N4").in("tenancy_id", ids).in("status", ["draft", "sent", "delivered", "completed"]) : { data: [] },
  ]);
  const lastN4 = new Map();
  for (const n of n4s || []) if (!lastN4.has(n.tenancy_id)) lastN4.set(n.tenancy_id, n);
  const n4State = new Map((n4drafts || []).map((s) => [s.tenancy_id, s.status]));
  sections.push({
    title: `Arrears (${owing.length})`,
    lines: cap(
      owing.map((b) => {
        const n = lastN4.get(b.tenancy_id);
        const st = n ? `N4 served ${md(n.served_on)}, ends ${md(n.effective_date)}` : n4State.get(b.tenancy_id) ? `N4 ${n4State.get(b.tenancy_id)}` : "no N4";
        return `${names(b.tenancy)}, ${place(b.tenancy?.unit)}: ${$(b.balance)} (${st})`;
      }),
      "Rent page"
    ),
  });

  // 2. Documents awaiting signature
  const { data: sigs } = await sb.from("signature_requests").select("title, recipients, sent_at").in("status", ["sent", "delivered"]).order("sent_at");
  sections.push({
    title: `Awaiting signature (${(sigs || []).length})`,
    lines: cap(
      (sigs || []).map((s) => {
        const waiting = (s.recipients || []).filter((r) => !["completed", "signed"].includes(String(r.status || "").toLowerCase())).map((r) => r.name).filter(Boolean);
        return `${s.title}: ${waiting.join(", ") || "signers"}, ${days(s.sent_at || today, today)}d`;
      }),
      "Signatures"
    ),
  });

  // 3. Onboarding open
  const { data: onb } = await sb.from("lease_onboarding").select("details, needs_payprop, payprop_added, payprop_letter_sent, tenancy_id, kind").eq("status", "open");
  sections.push({
    title: `Onboarding open (${(onb || []).length})`,
    lines: cap(
      (onb || []).map((o) => {
        const d = o.details || {};
        const todo =
          o.kind === "amendment"
            ? "record amendment changes"
            : !o.tenancy_id
              ? "start the tenancy"
              : [o.needs_payprop && !o.payprop_added ? "add in PayProp" : "", o.needs_payprop && !o.payprop_letter_sent ? "send PayProp letter" : ""].filter(Boolean).join(", ") || "mark done";
        return `${[d.address, d.unit && !/^whole/i.test(d.unit) ? d.unit : ""].filter(Boolean).join(" ")}: ${todo}`;
      }),
      "Onboarding"
    ),
  });

  // 4. Maintenance: new, and open over 7 days or past the booked date
  const { data: maint } = await sb
    .from("maintenance_requests")
    .select("title, status, urgency, created_at, scheduled_for, unit:units(label, property:properties(address))")
    .not("status", "in", "(completed,cancelled)")
    .order("created_at");
  const weekAgo = addDays(today, -7);
  const mNew = (maint || []).filter((m) => m.status === "new");
  const mLate = (maint || []).filter(
    (m) => m.status !== "new" && (String(m.created_at).slice(0, 10) < weekAgo || (m.scheduled_for && String(m.scheduled_for).slice(0, 10) < today))
  );
  sections.push({
    title: `Maintenance (${mNew.length} new, ${mLate.length} overdue)`,
    lines: cap(
      [
        ...mNew.map((m) => `NEW${m.urgency === "emergency" ? " EMERGENCY" : ""}: ${m.title}, ${place(m.unit)}`),
        ...mLate.map((m) => `${m.status.replace(/_/g, " ")} ${days(m.created_at, today)}d: ${m.title}, ${place(m.unit)}`),
      ],
      "Maintenance"
    ),
  });

  // 5. Move-ins and move-outs in the next 14 days
  const [{ data: ins }, { data: outs }] = await Promise.all([
    sb.from("tenancies").select("start_date, unit:units(label, property:properties(address)), tenancy_tenants(full_name, is_primary)").eq("status", "upcoming").gte("start_date", today).lte("start_date", in14).order("start_date"),
    sb.from("tenancies").select("move_out_date, unit:units(label, property:properties(address)), tenancy_tenants(full_name, is_primary)").in("status", ["active", "notice"]).gte("move_out_date", today).lte("move_out_date", in14).order("move_out_date"),
  ]);
  sections.push({
    title: "Move-ins / move-outs (14 days)",
    lines: cap(
      [...(ins || []).map((t) => `IN ${md(t.start_date)}: ${names(t)}, ${place(t.unit)}`), ...(outs || []).map((t) => `OUT ${md(t.move_out_date)}: ${names(t)}, ${place(t.unit)}`)],
      "Properties"
    ),
  });

  // 6. Renewals and deadlines this week
  const [{ data: ends }, { data: n4ends }, { data: pm }, { data: invs }] = await Promise.all([
    sb.from("tenancies").select("end_date, renewal_choice, unit:units(label, property:properties(address)), tenancy_tenants(full_name, is_primary)").in("status", ["active"]).gte("end_date", today).lte("end_date", addDays(today, 90)).is("renewal_choice", null).order("end_date"),
    sb.from("notices").select("effective_date, form, tenancy:tenancies(unit:units(label, property:properties(address)), tenancy_tenants(full_name, is_primary))").gte("effective_date", today).lte("effective_date", in7).eq("status", "served"),
    sb.from("properties").select("address, agreement_renewal").eq("archived", false).gte("agreement_renewal", today).lte("agreement_renewal", addDays(today, 30)),
    sb.from("invoices").select("invoice_no, bill_to_name, due_date").eq("status", "sent").lte("due_date", in7),
  ]);
  sections.push({
    title: "Renewals & deadlines",
    lines: cap(
      [
        ...(n4ends || []).map((n) => `${n.form} ends ${md(n.effective_date)}: ${names(n.tenancy)}, ${place(n.tenancy?.unit)}`),
        ...(ends || []).map((t) => `Lease ends ${md(t.end_date)}, no renewal answer: ${names(t)}, ${place(t.unit)}`),
        ...(pm || []).map((p) => `PM contract renews ${md(p.agreement_renewal)}: ${p.address}`),
        ...(invs || []).map((i) => `Invoice INV-${String(i.invoice_no).padStart(5, "0")} due ${md(i.due_date)}: ${i.bill_to_name}`),
      ],
      "Dashboard"
    ),
  });

  // 7. Payments needing a match
  const [{ data: unmatched }, { data: pend }] = await Promise.all([
    sb.from("payments").select("amount, payer_name, received_on").eq("status", "unmatched").order("received_on"),
    sb.from("etransfer_pending").select("amount, payer_name").eq("status", "open"),
  ]);
  sections.push({
    title: `Payments to match (${(unmatched || []).length + (pend || []).length})`,
    lines: cap(
      [
        ...(unmatched || []).map((p) => `${$(p.amount)} from ${p.payer_name || "unknown"} (${md(p.received_on)})`),
        ...(pend || []).map((p) => `PENDING old address: ${$(p.amount)} from ${p.payer_name || "unknown"}`),
      ],
      "To Match"
    ),
  });

  // 8. Tasks: open, and waiting on others
  const { data: tasks } = await sb.from("staff_tasks").select("title, status, waiting_on, waiting_since, due_date").in("status", ["open", "waiting"]).order("created_at");
  const waiting = (tasks || []).filter((t) => t.status === "waiting");
  const open = (tasks || []).filter((t) => t.status === "open");
  sections.push({
    title: `Tasks (${open.length} open, ${waiting.length} waiting)`,
    lines: cap(
      [
        ...open.map((t) => `${t.title}${t.due_date ? ` (due ${md(t.due_date)})` : ""}`),
        ...waiting.map((t) => `WAITING on ${t.waiting_on} since ${md(t.waiting_since)} (${days(t.waiting_since || today, today)}d): ${t.title}`),
      ],
      "Tasks"
    ),
  });

  // 9. Tenant and landlord emails with no reply after 1 business day
  const { data: inbox } = await sb
    .from("inbound_emails")
    .select("subject, received_at, party_kind, party_name, from_email, category, unit:units(label, property:properties(address))")
    .eq("direction", "in")
    .eq("status", "new")
    .is("answered_at", null)
    .in("party_kind", ["tenant", "landlord"])
    .order("received_at")
    .limit(200);
  const unanswered = (inbox || []).filter((e) => olderThanBusinessDays(e.received_at, 1));
  sections.push({
    title: `Unanswered emails, over 1 business day (${unanswered.length})`,
    lines: cap(
      unanswered.map(
        (e) => `${e.party_kind === "landlord" ? "Landlord" : "Tenant"} ${e.party_name || e.from_email}${e.unit ? ` (${place(e.unit)})` : ""}, ${md(e.received_at)}: ${e.subject || "(no subject)"}`
      ),
      "Inbox"
    ),
  });

  // 9b. Cash Chuck logged but hasn't deposited after 3 days (table from 0084; skipped until it exists)
  const { data: held, error: heldErr } = await sb.from("cash_collections").select("amount, collected_on, tenancy:tenancies(tenancy_tenants(full_name, is_primary))").eq("status", "held").order("collected_on");
  const late = heldErr ? [] : (held || []).filter((c) => days(c.collected_on, today) > 3);
  if (late.length)
    sections.push({
      title: `Cash Chuck hasn't deposited, over 3 days (${late.length})`,
      lines: cap(late.map((c) => `$${Number(c.amount).toFixed(2)} from ${(c.tenancy?.tenancy_tenants || []).find((t) => t.is_primary)?.full_name || c.tenancy?.tenancy_tenants?.[0]?.full_name || "a tenant"}, got ${md(c.collected_on)}`), "Cash from Chuck"),
    });

  // 9c. Notices Chuck hasn't delivered within 2 days of the landlord signing, and certificates he hasn't signed
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
  const [{ data: unserved }, { data: unsignedCerts }] = await Promise.all([
    sb.from("signature_requests").select("id, kind, title, completed_at, tenancy_id").in("kind", ["N1", "N4", "N5"]).eq("status", "completed").is("notice_id", null).lt("completed_at", twoDaysAgo).gte("completed_at", new Date(Date.now() - 120 * 86400000).toISOString()).order("completed_at"),
    sb.from("signature_requests").select("title, sent_at, recipients").eq("kind", "certificate_of_service").in("status", ["sent", "delivered"]).lt("sent_at", twoDaysAgo).order("sent_at"),
  ]);
  const { data: certFor } = (unserved || []).length
    ? await sb.from("signature_requests").select("related_request_id").eq("kind", "certificate_of_service").in("status", ["sent", "delivered", "completed"]).in("related_request_id", unserved.map((r) => r.id))
    : { data: [] };
  const certDone = new Set((certFor || []).map((c) => c.related_request_id));
  const openNotices = (unserved || []).filter((r) => !certDone.has(r.id));
  const byEmail = await Promise.all(openNotices.map((r) => emailEligibility(sb, r.tenancy_id).then((e) => e.ok)));
  const serveLines = [
    ...openNotices.filter((r, i) => !byEmail[i]).map((r) => `Not delivered yet: ${r.title} (signed ${md(r.completed_at)})`),
    ...(unsignedCerts || []).map((r) => `${/chuck@/i.test(r.recipients?.[0]?.email || "") ? "Chuck" : r.recipients?.[0]?.name || "Staff"} hasn't signed: ${r.title} (sent ${md(r.sent_at)})`),
  ];
  const emailReady = openNotices.filter((r, i) => byEmail[i]);
  if (emailReady.length)
    sections.push({
      title: `Notices to serve by email (${emailReady.length})`,
      lines: cap(emailReady.map((r) => `${r.title}: open it and click Email It to the Tenants (signed ${md(r.completed_at)})`), "Signatures"),
    });
  if (serveLines.length) sections.push({ title: `Notices waiting on a signature or delivery (${serveLines.length})`, lines: cap(serveLines, "Signatures") });

  // 10. Sensitive documents saved but the original still in an email or chat
  const { data: originals } = await sb.from("sensitive_documents").select("label, received_via, uploaded_at").is("original_deleted_at", null).order("uploaded_at");
  if ((originals || []).length)
    sections.push({
      title: `Delete originals of sensitive documents (${originals.length})`,
      lines: cap(originals.map((d) => `${d.label}: delete it from the ${d.received_via === "whatsapp" ? "WhatsApp chat" : d.received_via === "text" ? "text messages" : d.received_via} (saved ${md(d.uploaded_at)})`), "the applicant or tenant file"),
    });

  const head = `IRep Today: ${new Date(`${today}T12:00:00`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`;
  const text = [head, ...sections.map((s) => [`\n${s.title}`, ...(s.lines.length ? s.lines.map((l) => `- ${l}`) : ["- none"])].join("\n"))].join("\n");
  return { date: today, head, sections, text };
}
