import Link from "next/link";
import { SITE } from "@/lib/site";

const tel = (p) => `tel:${String(p).replace(/[^\d+]/g, "")}`;

// How to reach IRep, how fast we answer, and how rent payments work.
// audience: "public" (everything), "tenant", "owner" or "partner".
export default function ContactGuide({ audience = "public", headingLevel = 2 }) {
  const H = `h${headingLevel}`;
  const S = `h${headingLevel + 1}`;
  const tenants = audience === "public" || audience === "tenant";
  const owners = audience === "public" || audience === "owner";
  const chuck = SITE.emergency;

  return (
    <div className="contact-guide stack">
      <div className="cg-grid">
        <section className="cg-card stack" aria-labelledby={`cg-times-${audience}`}>
          <H id={`cg-times-${audience}`} className="sec-title">
            When You&apos;ll Hear From Us
          </H>
          <ul className="cg-times">
            <li>
              <span>Administrative requests and general questions</span>
              <b>Within 48 business hours</b>
            </li>
            <li>
              <span>Non-urgent maintenance</span>
              <b>Within 5 business days</b>
            </li>
            <li>
              <span>Urgent maintenance</span>
              <b>Call {chuck.name} now</b>
            </li>
          </ul>
          <p className="small">Business hours: {SITE.hours}.</p>
        </section>

        <section className="cg-card cg-urgent stack" aria-labelledby={`cg-urgent-${audience}`}>
          <H id={`cg-urgent-${audience}`} className="sec-title">
            Urgent or Emergency?
          </H>
          <p>
            <b>Urgent maintenance</b> (no heat, an active water leak, no water or power, a sewage backup, a lockout): call{" "}
            {chuck.name}, our maintenance lead, at <a href={tel(chuck.phone)}>{chuck.phone}</a>
            {audience === "tenant" ? ", and log it in your portal" : ""}.
          </p>
          <p>
            <b>Emergencies</b> (fire, a gas smell, or anyone&apos;s life in danger): <b>call 911 first</b>, then let us
            know.
          </p>
        </section>
      </div>

      {tenants ? (
        <section className="cg-card stack" aria-labelledby={`cg-rent-${audience}`}>
          <S id={`cg-rent-${audience}`} className="sec-title">
            Paying Rent
          </S>
          <ul className="cg-list">
            <li>
              <b>PayProp (preferred):</b> pay with the Bill Payment Reference ID in your PayProp welcome letter. Pay before
              the 7th of the month and you&apos;re entered in our monthly $100 gift card draw.
            </li>
            <li>
              <b>e-Transfer:</b> send it to <b>{SITE.paymentEmail}</b>. It&apos;s deposited automatically, so no security
              question is needed and you don&apos;t need to email us to confirm.
            </li>
            <li>
              <b>Receipts:</b> view and download them any time in your{" "}
              {audience === "tenant" ? "portal" : <Link href="/account">Tenant Portal</Link>}.
            </li>
          </ul>
          <p className="cg-note small">
            <b>{SITE.paymentEmail} only receives e-Transfers. Messages sent there aren&apos;t read.</b> For anything else,
            email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
          </p>
        </section>
      ) : null}

      {owners ? (
        <section className="cg-card stack" aria-labelledby={`cg-owner-${audience}`}>
          <S id={`cg-owner-${audience}`} className="sec-title">
            {audience === "owner" ? "Repair Approvals" : "For Landlords: Repair Approvals"}
          </S>
          <p>
            For any repair over <b>${SITE.approvalThreshold}</b>, we&apos;ll send you the details and quote to approve. Please
            reply <b>within 48 hours</b> so the repair isn&apos;t delayed. If we don&apos;t hear back in 48 hours, we may go
            ahead with repairs needed to keep the unit safe, livable and compliant with the Residential Tenancies Act.
          </p>
        </section>
      ) : null}

      <section className="cg-card stack" aria-labelledby={`cg-help-${audience}`}>
        <S id={`cg-help-${audience}`} className="sec-title">
          Help Us Respond Faster
        </S>
        <p>
          Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a> for questions, maintenance, complaints or anything else,
          and include:
        </p>
        <ul className="cg-list">
          <li>Your property address and unit</li>
          <li>A short description of the request</li>
          <li>Photos, if it&apos;s a maintenance issue</li>
        </ul>
        {audience === "partner" ? null : (
          <p className="small">
            You can also log maintenance requests, see statements and receipts, and upload documents any time in your{" "}
            {audience === "public" ? (
              <>
                <Link href="/account">Tenant Portal</Link> or <Link href="/owner">Landlord Portal</Link>
              </>
            ) : (
              "portal"
            )}
            .
          </p>
        )}
        <p className="small">
          For your security, please don&apos;t email banking or ID documents unless we&apos;ve asked you to. Upload them
          through your portal instead.
        </p>
      </section>

      <p className="small cg-sign">
        {SITE.name} · <a href={`mailto:${SITE.email}`}>{SITE.email}</a> · <a href={tel(SITE.phone)}>{SITE.phone}</a>
      </p>
    </div>
  );
}

// Collapsible version for the portals.
export function ContactGuideCard({ audience, open = false }) {
  return (
    <details className="boxed contact-card" open={open}>
      <summary>
        <span className="sec-title">Contact Us and Response Times</span>
        <span className="small"> · urgent maintenance: {SITE.emergency.name}, {SITE.emergency.phone}</span>
      </summary>
      <div style={{ marginTop: 16 }}>
        <ContactGuide audience={audience} headingLevel={3} />
      </div>
    </details>
  );
}
