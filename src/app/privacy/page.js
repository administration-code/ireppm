import { SITE } from "@/lib/site";

export const metadata = {
  title: "Privacy Policy",
};

// DRAFT — have this reviewed before launch.
export default function PrivacyPage() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="prose">
          <span className="eyebrow">Privacy Policy</span>
          <h1>How We Handle Your Information</h1>
          <p className="small">Last updated October 2026</p>

          <p>
            {SITE.name} collects personal information to show rental properties, arrange showings, assess rental
            applications and manage tenancies. This policy explains what we collect and how we protect it, in line with
            Canada's Personal Information Protection and Electronic Documents Act (PIPEDA).
          </p>

          <h2>What We Collect</h2>
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

          <h2>How We Use It</h2>
          <ul>
            <li>To confirm showings and contact you about properties you're interested in.</li>
            <li>To assess applications, including verifying identity and income and running a credit check you've authorized.</li>
            <li>To prepare leases and manage tenancies once an application is approved.</li>
          </ul>

          <h2>Who We Share It With</h2>
          <p>We don't sell your information. We share it only with the landlord of the property you apply for and with the service providers we use to run the site and screen applications.</p>
          <p>
            Our service providers are Supabase (database and secure file storage, hosted in Canada), Vercel (website
            hosting), Google Workspace (email delivery), Cloudflare (blocking automated sign-ups) and FrontLobby, our tenant
            screening provider. Credit reports we obtain through FrontLobby come from Equifax Canada.
          </p>

          <h2>How We Protect It</h2>
          <p>
            Uploaded documents are kept in private storage. Only you and authorized {SITE.name} staff can open them.
            Information is transferred over encrypted connections, and staff accounts need a second sign-in step (a code
            from an authenticator app).
          </p>

          <h2>If an Application Is Declined</h2>
          <p>
            If a decision on your application is based in whole or in part on a credit report, we tell you so when we
            tell you the decision, and give you the name and address of the credit bureau (Equifax Canada) so you can get
            a free copy of your file and correct anything that&apos;s wrong. If it&apos;s based on information from
            someone else, such as a reference or previous landlord, you can ask us within 60 days what that information
            was and where it came from. These rights come from Ontario&apos;s Consumer Reporting Act.
          </p>

          <h2>Emails From Us</h2>
          <p>
            We email you about your showings, application, tenancy, repairs and payments. We only send promotional email
            (such as invitations to our portals) to people we already work with, and every one has an unsubscribe link.
            You can also turn promotional email off in your profile or by emailing us. We act on unsubscribe requests
            right away, and always within 10 business days.
          </p>

          <h2>If There&apos;s a Breach</h2>
          <p>
            If your personal information is lost, stolen or accessed without permission and there&apos;s a real risk of
            significant harm to you, we&apos;ll tell you as soon as we can, report it to the Office of the Privacy
            Commissioner of Canada, and tell you what we&apos;re doing about it and what you can do to protect yourself.
            We keep a record of every breach, however small, for at least 24 months.
          </p>

          <h2>How Long We Keep It</h2>
          <p>
            If your application isn't successful, we delete your application documents within 90 days. You can remove
            documents from your profile at any time. Records for approved tenants are kept for the length of the tenancy
            and as required by law afterward.
          </p>

          <h2>Your Choices</h2>
          <p>
            You can see, correct or delete the information in your profile, or ask us to close your account, by emailing{" "}
            <b>{SITE.email}</b>.
          </p>

          <h2>Privacy Officer</h2>
          <p>
            Our Privacy Officer is responsible for how {SITE.name} handles personal information. Contact them to see the
            information we hold about you, correct it, withdraw your consent, or make a complaint. We answer within 30
            days. If you&apos;re not satisfied with our answer, you can contact the{" "}
            <a href="https://www.priv.gc.ca/en/report-a-concern/" target="_blank" rel="noopener noreferrer">
              Office of the Privacy Commissioner of Canada
            </a>
            .
          </p>
          <ul>
            <li>
              Privacy Officer: <a href="mailto:administration@ireppm.ca">administration@ireppm.ca</a>
            </li>
          </ul>

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
