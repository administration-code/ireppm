import { SITE } from "@/lib/site";

export const metadata = {
  title: "Privacy policy",
};

// DRAFT — have this reviewed before launch.
export default function PrivacyPage() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="prose">
          <span className="eyebrow">Privacy policy</span>
          <h1>How we handle your information</h1>
          <p className="small">Last updated October 2026</p>

          <p>
            {SITE.name} collects personal information to show rental properties, arrange showings, assess rental
            applications and manage tenancies. This policy explains what we collect and how we protect it, in line with
            Canada's Personal Information Protection and Electronic Documents Act (PIPEDA).
          </p>

          <h2>What we collect</h2>
          <ul>
            <li>Your email address and phone number when you create an account or book a showing.</li>
            <li>
              Documents you upload to apply for a rental: photo ID, proof of income (a job letter, acceptance letter or
              statement of support), and optionally paystubs, a bank statement or a credit report.
            </li>
            <li>Your authorization to obtain a credit report, and the result we receive from our screening provider.</li>
            <li>Details landlords send us through the inquiry form.</li>
          </ul>

          <h2>Signing in with Google</h2>
          <p>
            If you choose Continue with Google, Google shares your name, email address and profile picture with us. We
            use only your name and email address to create your account. We never post to your Google account or read
            anything else in it. You can remove our access at any time at{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
              myaccount.google.com/permissions
            </a>
            .
          </p>

          <h2>How we use it</h2>
          <ul>
            <li>To confirm showings and contact you about properties you're interested in.</li>
            <li>To assess applications, including verifying identity and income and running a credit check you've authorized.</li>
            <li>To prepare leases and manage tenancies once an application is approved.</li>
          </ul>

          <h2>Who we share it with</h2>
          <p>We don't sell your information. We share it only with the landlord of the property you apply for and with the service providers we use to run the site and screen applications.</p>
          <p>
            Our service providers are Supabase (database and secure file storage, hosted in Canada), Vercel (website
            hosting) and our tenant screening provider.
          </p>

          <h2>How we protect it</h2>
          <p>
            Uploaded documents are kept in private storage. Only you and authorized {SITE.name} staff can open them.
            Information is transferred over encrypted connections.
          </p>

          <h2>How long we keep it</h2>
          <p>
            If your application isn't successful, we delete your application documents within 90 days. You can remove
            documents from your profile at any time. Records for approved tenants are kept for the length of the tenancy
            and as required by law afterward.
          </p>

          <h2>Your choices</h2>
          <p>
            You can see, correct or delete the information in your profile, or ask us to close your account, by emailing{" "}
            <b>{SITE.email}</b>.
          </p>

          <h2>Contact</h2>
          <p>Questions about this policy or your information? Get in touch with {SITE.name}.</p>
          <ul>
            {SITE.email && (
              <li>
                Email: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              </li>
            )}
            {SITE.phone && (
              <li>
                Phone: <a href={`tel:${SITE.phone.replace(/[^\d+]/g, "")}`}>{SITE.phone}</a>
              </li>
            )}
            {SITE.address && <li>Office: {SITE.address}</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}
