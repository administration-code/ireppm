import Link from "next/link";
import StaffGate from "@/components/admin/StaffGate";

export const metadata = { title: "Staff workflow" };

// Who does what, and when. Each step links to the page where it's done.
// [text, href?, linkLabel?]
const SECTIONS = [
  {
    id: "daily",
    title: "Every day",
    steps: [
      ["Check the dashboard for anything new or overdue.", "/admin", "Dashboard"],
      ["Answer showing requests within 24 hours. Chuck gets an email for each one and a daily reminder until he decides.", "/admin/requests?tab=showings", "Showings"],
      ["Review new applications, run the preliminary screening, and send the summary to the landlord to approve.", "/admin/requests?tab=applications", "Applications"],
      ["Triage new maintenance requests. Emergencies right away; anything over $250 that isn't an emergency needs the landlord's OK first.", "/admin/maintenance", "Maintenance"],
      ["Match incoming payments (PayProp and Interac emails) to tenancies.", "/admin/rent", "Rent"],
      ["Reply to new landlord inquiries and free rent estimate requests the same day.", "/admin/requests?tab=inquiries", "Inquiries"],
      ["Approve new reviews. Publish genuine ones, good or bad, and reply to any that raise a problem.", "/admin/reviews", "Reviews"],
    ],
  },
  {
    id: "rent",
    title: "Rent cycle, every month",
    steps: [
      ["1st: rent is due. Tenants paying through PayProp use their bill payment reference ID.", "/admin/rent", "Rent board"],
      ["2nd to 7th: remind anyone who hasn't paid. The 7th is the last day of the grace period.", "/admin/rent", "Rent board"],
      ["7th: record every payment received up to and including the 7th.", "/admin/rent", "Rent board"],
      ["8th: staff get the paid-by-the-7th list by email. Check it, draw the $100 gift card winner from the PayProp entries, email the winner and send the card.", "/admin/rent/draw", "Paid by 7th & draw"],
      ["8th: prepare an N4 for anyone who hasn't paid in full and send it to the landlord to sign. Report missed rent through FrontLobby.", "/admin/signatures", "Signatures"],
      ["Once signed: Chuck delivers the N4, usually within 3 days. The termination date is at least 7 days after the day it's delivered. Chase landlords who haven't signed after 2 days.", "/admin/notices", "Notices"],
      ["By the 7th: send landlord payouts for every tenancy that has paid.", "/admin/payouts", "Payouts"],
      ["After the N4 date passes: tell the landlord what's still owed and send the rent ledger. Filing an L1 is the landlord's decision and theirs to do; offer a paralegal referral if they ask. We don't file Board applications or attend hearings.", null],
    ],
  },
  {
    id: "monthly",
    title: "Month end",
    steps: [
      ["Import the bank statements for both accounts.", "/admin/accounting/import", "Bank imports"],
      ["Reconcile every bank line until both accounts balance.", "/admin/accounting", "Reconciliation"],
      ["Send monthly landlord statements and letters.", "/admin/letters", "Landlord letters"],
      ["Review tenant insurance that's expiring or waiting for review.", "/admin/insurance", "Tenant insurance"],
      ["Check for tenancies eligible for a rent increase in about 4 months, and ask the landlord to approve the new rent.", "/admin/notices", "Notices"],
    ],
  },
  {
    id: "leasing",
    title: "Leasing: vacancy to move-in",
    steps: [
      ["Notice to vacate received (N9 or agreement to end): confirm the date and open a turnover.", "/admin/turnovers", "Turnovers"],
      ["Book the move-out inspection and give 24 hours' written notice for showings.", "/admin/inspections", "Inspections"],
      ["Photograph the unit and publish the listing.", "/admin/listings", "Listings"],
      ["Run showings and collect applications.", "/admin/requests?tab=applications", "Applications"],
      ["Landlord approves the applicant in their owner portal.", "/admin/requests?tab=applications", "Applications"],
      ["Send the Ontario Standard Lease for signature.", "/admin/signatures", "Signatures"],
      ["Set the tenant up in PayProp, generate the welcome letter, and upload it to the tenancy so it goes out with the welcome email.", "/admin/payprop-letters", "PayProp letters"],
      ["Collect first and last month's rent and proof of tenant insurance before keys.", "/admin/rent", "Rent"],
      ["Move-in inspection with photos, then hand over keys.", "/admin/inspections", "Inspections"],
      ["Invite the tenant to their portal.", "/admin/invites", "Portal invitations"],
      ["About a month after move-in, ask the tenant (and the landlord, after their first payout) for a review at ireppm.ca/reviews.", "/admin/reviews", "Reviews"],
    ],
  },
  {
    id: "moveout",
    title: "Move-out",
    steps: [
      ["Move-out inspection against the move-in report and photos.", "/admin/inspections", "Inspections"],
      ["Apply last month's rent, settle any utilities, and note any damage with photos.", "/admin/rent", "Rent"],
      ["Book cleaning and repairs, then close the turnover.", "/admin/turnovers", "Turnovers"],
    ],
  },
  {
    id: "notices",
    title: "Notices",
    steps: [
      ["IRep prepares and serves N forms only. Anything at the Landlord and Tenant Board (applications, paperwork, hearings) is the landlord's.", null],
      ["N1 rent increase: landlord approves the amount, then serve at least 90 days ahead. The 2027 guideline is 1.9%.", "/admin/notices", "Notices"],
      ["N4 unpaid rent: sent to the landlord to sign on or around the 8th, delivered by Chuck within about 3 days of signing, termination date 7 days after delivery.", "/admin/notices", "Notices"],
      ["N5 damage or interference: document it and get the landlord's approval before serving.", "/admin/notices", "Notices"],
      ["N12 and N13: prepare for the landlord to sign, then serve. N12 with at least 120 days' notice owes no compensation.", "/admin/signatures", "Signatures"],
      ["Entry: at least 24 hours' written notice, between 8 a.m. and 8 p.m.", null],
    ],
  },
  {
    id: "yearly",
    title: "Year end",
    steps: [
      ["Close the books and check every account balances.", "/admin/accounting/year", "Year end"],
      ["Send each landlord their T776-ready year-end summary.", "/admin/accounting/landlords", "Landlord year-end"],
      ["Dividends and T5 slips.", "/admin/accounting/dividends", "Dividends & T5"],
      ["Review add-on prices and rates for the new year.", "/admin/rates", "Add-ons & rates"],
    ],
  },
];

export default function WorkflowPage() {
  return (
    <StaffGate>
      <div className="stack">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="admin-title">Staff workflow</h1>
          <p className="small">What happens when, and where to do it. Jump to:{" "}
            {SECTIONS.map((s, i) => (
              <span key={s.id}>
                {i ? " · " : ""}
                <a href={`#${s.id}`}>{s.title}</a>
              </span>
            ))}
          </p>
        </div>
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="boxed stack" aria-labelledby={`${s.id}-h`} style={{ gap: 10 }}>
            <h2 id={`${s.id}-h`} className="sub-title">{s.title}</h2>
            <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
              {s.steps.map(([text, href, label], i) => (
                <li key={i}>
                  {text}
                  {href ? (
                    <>
                      {" "}
                      <Link href={href} className="small">{label} →</Link>
                    </>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </StaffGate>
  );
}
