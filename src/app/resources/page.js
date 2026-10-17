import Link from "next/link";
import { SITE } from "@/lib/site";
import { PAYMENT_INFO } from "@/lib/payment-info";

export const metadata = {
  title: "Resources for tenants and landlords",
  description: "Ontario rental rules, Landlord and Tenant Board forms, paying rent with PayProp, and how to raise a concern with IRep Property Management.",
};

const A = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

export default function ResourcesPage() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="prose">
          <span className="eyebrow">Resources</span>
          <h1>Helpful information for tenants and landlords</h1>
          <p>
            Renting in Ontario is governed by the <i>Residential Tenancies Act</i> and handled by the Landlord and Tenant Board (LTB).
            These links go to the official sources. If you&apos;re not sure what applies to you, ask us, or get independent legal advice.
          </p>

          <h2 id="tenants">For tenants</h2>
          <h3>Your rights and responsibilities</h3>
          <ul>
            <li>
              <A href="https://www.ontario.ca/page/renting-ontario-your-rights">Renting in Ontario: your rights</A> (Government of Ontario)
            </li>
            <li>
              <A href="https://www.ontario.ca/page/guide-ontarios-standard-lease">Guide to Ontario&apos;s standard lease</A>
            </li>
            <li>
              <A href="https://tribunalsontario.ca/ltb/">Landlord and Tenant Board</A>: brochures, how hearings work, and{" "}
              <A href="https://tribunalsontario.ca/ltb/forms/">LTB forms</A>
            </li>
            <li>
              <A href="https://www.ontario.ca/page/residential-rent-increase-guideline">Rent increase guideline</A>: how much rent can go up each year
            </li>
          </ul>

          <h3>Paying rent</h3>
          <p>
            <b>{PAYMENT_INFO.preferred} is our preferred way to pay.</b> {PAYMENT_INFO.preferredSteps.join(" ")} Learn about{" "}
            <A href="https://payprop.com/ca">PayProp</A>.
          </p>
          <p>{PAYMENT_INFO.fallbackNote}</p>

          <h3>Tenant insurance</h3>
          <p>
            Our leases require tenant insurance. It protects your belongings and covers you if you accidentally damage the home or someone is
            hurt there; the landlord&apos;s insurance doesn&apos;t cover you. Upload proof in your <Link href="/account">account</Link> within a
            week of moving in.
          </p>

          <h3>Repairs and emergencies</h3>
          <ul>
            <li>
              Report repairs from your <Link href="/account">account</Link>, with photos. We&apos;ll arrange the work and tell you when someone
              is coming. We give 24 hours&apos; written notice before entering, except in an emergency.
            </li>
            <li>
              Emergencies (flooding, no heat in winter, a gas smell, fire, a break-in): call us right away at{" "}
              <a href={`tel:${SITE.phone}`}>{SITE.phone}</a>. If anyone is in danger, call 911 first.
            </li>
          </ul>

          <h3>Moving out</h3>
          <ul>
            <li>
              To end your tenancy you must give at least 60 days&apos; written notice (form N9), ending on the last day of a rental period. You can
              start it from your <Link href="/account">account</Link>.
            </li>
            <li>
              Need to leave sooner? Ask in your account for an agreement to end the tenancy early (form N11). The landlord has to agree.
            </li>
            <li>When a fixed-term lease ends and you don&apos;t give notice, your tenancy continues month to month on the same terms.</li>
          </ul>

          <h2 id="landlords">For landlords</h2>
          <ul>
            <li>
              <A href="https://www.ontario.ca/page/renting-ontario-your-rights">Renting in Ontario: rights and responsibilities</A>
            </li>
            <li>
              <A href="https://www.ontario.ca/page/residential-rent-increase-guideline">Rent increase guideline</A> (units first occupied
              after November 15, 2018 are exempt)
            </li>
            <li>
              <A href="https://tribunalsontario.ca/ltb/">Landlord and Tenant Board</A> and{" "}
              <A href="https://tribunalsontario.ca/ltb/forms/">notices and applications</A>
            </li>
            <li>
              <A href="https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4036.html">CRA guide T4036: Rental Income</A>{" "}
              (your year-end summary in the owner portal is laid out to match form T776)
            </li>
          </ul>

          <h2 id="concerns">Questions, concerns and complaints</h2>
          <ol>
            <li>
              Start with us: email <a href={`mailto:${SITE.email}`}>{SITE.email}</a> or call <a href={`tel:${SITE.phone}`}>{SITE.phone}</a>.
              Tell us what happened and what you&apos;d like done. We aim to reply within two business days.
            </li>
            <li>If it isn&apos;t resolved, ask for it to go to the owners of IRep Property Management, who will review it personally.</li>
            <li>
              For disputes about your tenancy (repairs, rent, ending a tenancy), you can apply to the{" "}
              <A href="https://tribunalsontario.ca/ltb/">Landlord and Tenant Board</A>.
            </li>
            <li>
              For property standards (heat, pests, unsafe conditions), you can also contact the{" "}
              <A href="https://www.citywindsor.ca/residents/311">City of Windsor through 311</A>.
            </li>
          </ol>

          <p className="small">This page is general information, not legal advice.</p>
        </div>
      </div>
    </section>
  );
}
