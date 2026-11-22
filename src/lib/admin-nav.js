import { getBrowserClient } from "@/lib/supabase";

export const COUNTS_EVENT = "staff-counts-refresh";

// Call after an action that changes a menu count (matching a payment, a status change, etc.).
export function refreshStaffCounts() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COUNTS_EVENT));
}

const head = { count: "exact", head: true };

export async function loadNavCounts() {
  const sb = getBrowserClient();
  if (!sb) return {};
  const { data: session } = await sb.auth.getSession();
  const uid = session?.session?.user?.id || null;
  const queries = {
    showings: sb.from("showing_requests").select("id", head).eq("status", "requested"),
    applications: sb.from("applications").select("id", head).in("status", ["submitted", "reviewing"]),
    landlordDecided: sb
      .from("applications")
      .select("id", head)
      .eq("status", "reviewing")
      .in("owner_review_status", ["approved", "declined"]),
    inquiries: sb.from("landlord_inquiries").select("id", head).eq("status", "new"),
    drafts: sb.from("listings").select("id", head).eq("status", "draft"),
    maintenanceNew: sb.from("maintenance_requests").select("id", head).eq("status", "new"),
    unmatchedPayments: sb.from("payments").select("id", head).eq("status", "unmatched"),
    openTurnovers: sb.from("turnovers").select("id", head).not("status", "in", "(leased,cancelled)"),
    awaitingSignatures: sb.from("signature_requests").select("id", head).in("status", ["draft", "sent", "delivered"]),
    earlyMoveOuts: sb.from("n11_requests").select("id", head).eq("status", "requested"),
    insuranceToReview: sb.from("tenant_insurance").select("id", head).eq("status", "submitted"),
    inspectionReportsToReview: sb.from("inspection_reports").select("id", head).eq("status", "submitted"),
    ownerRequestsOpen: sb.from("owner_requests").select("id", head).eq("status", "open"),
    inboxNew: sb.from("inbound_emails").select("id", head).eq("status", "new"),
    emailsUnmatched: sb.from("inbound_emails").select("id", head).eq("party_kind", "unmatched").not("party_email", "is", null),
    intakeReview: sb.from("inbound_emails").select("id", head).eq("intake_status", "review"),
    emailDrafts: sb.from("email_drafts").select("id", head).eq("status", "draft"),
    tasksOpen: uid
      ? sb.from("staff_tasks").select("id", head).eq("status", "open").or(`assigned_to.eq.${uid},assigned_to.is.null`)
      : sb.from("staff_tasks").select("id", head).eq("status", "open"),
    onboardingOpen: sb.from("lease_onboarding").select("id", head).eq("status", "open"),
    invoicesUnpaid: sb.from("invoices").select("id", head).eq("status", "sent"),
    expensesToPay: sb.from("landlord_expenses").select("id", head).eq("status", "to_pay"),
    unmatchedBankLines: sb.from("bank_transactions").select("id", head).eq("status", "unmatched"),
    jobsDone: sb.from("maintenance_requests").select("id", head).not("vendor_done_at", "is", null).neq("status", "completed"),
    cashHeld: sb.from("cash_collections").select("id", head).eq("status", "held"),
    emailServeOpen: sb.from("staff_tasks").select("id", head).in("status", ["open", "waiting"]).ilike("title", "Serve by email:%"),
  };
  const keys = Object.keys(queries);
  const results = await Promise.all(Object.values(queries));
  return Object.fromEntries(keys.map((k, i) => [k, results[i].count || 0]));
}
