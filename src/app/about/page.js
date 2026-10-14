import InquiryForm from "@/components/InquiryForm";
import { SITE } from "@/lib/site";

export const metadata = {
  title: "About us",
  description: "IRep Property Management manages residential rentals across Windsor and Essex County.",
};

export default function AboutPage() {
  const contact = [
    ["Email", SITE.email],
    ["Phone", SITE.phone],
    ["Office", SITE.address],
    ["Hours", SITE.hours],
  ].filter(([, v]) => v);

  return (
    <section className="block">
      <div className="wrap about">
        <div className="copy">
          <span className="eyebrow">About us</span>
          <h1>Local management from the IRep Realty team.</h1>
          <hr className="rule" />
          <p>
            IRep Property Management looks after residential rentals across Windsor and Essex County. We handle the
            whole tenancy for landlords: finding and screening tenants, collecting rent, arranging repairs, and
            inspecting the property twice a year.
          </p>
          <p>
            We're part of IRep Realty Inc., Brokerage, so owners who want to buy, sell or grow a rental portfolio have a
            brokerage and a management team that already know the property.
          </p>
          <p>
            For renters, we keep things straightforward: every available unit is listed here, showings are booked
            online, and you upload your documents once instead of emailing them for every application.
          </p>
        </div>
        <div className="panel-box" style={{ padding: 28, gap: 18, alignContent: "start" }}>
          <h3>Talk to us</h3>
          <dl className="kv">
            {contact.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <InquiryForm />
        </div>
      </div>
    </section>
  );
}
