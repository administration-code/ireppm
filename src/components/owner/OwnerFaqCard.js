import { SITE } from "@/lib/site";

// Landlord portal: common questions. Add new entries to FAQ below.
const FAQ = [
  {
    q: "Why do you ask to be added to my insurance?",
    a: (
      <>
        <p>
          We ask that IRep Property Management be added as an <strong>additional insured</strong> on your landlord insurance policy. Some
          insurers call it “additional interest.” Because we manage the property on your behalf, any liability claim (such as a tenant or
          visitor injury) will often name both you and us. Adding us means these claims are handled under your property&apos;s policy rather
          than separately. It also means your insurer will let us know if your coverage lapses or is cancelled, so we can alert you right away.
          This is standard for managed rentals and usually costs nothing to add.
        </p>
        <p>
          Your broker can add it with our name and address: <strong>IRep Property Management Inc., {SITE.address}</strong>.
        </p>
        <h4 className="faq-sub">Why It Matters</h4>
        <ul>
          <li>
            <strong>Lawsuits usually name everyone involved.</strong> If a tenant or visitor is hurt at the property, for example slipping on
            ice or falling on a broken step, the claim often names both the owner and the property manager. As an additional insured, IRep is
            covered by your liability policy for claims about the property itself. Without it, IRep has to defend itself separately, and that
            can lead to disputes and higher costs that end up affecting you too.
          </li>
          <li>
            <strong>We act for you.</strong> We arrange repairs, screen tenants, serve notices and deal with the premises on your behalf.
            Claims about the property&apos;s condition belong under the property&apos;s own policy, and your insurer is in the best position
            to handle them.
          </li>
          <li>
            <strong>We find out if coverage changes.</strong> Once IRep is on the policy, the insurer will usually tell us if it&apos;s
            cancelled, lapses or isn&apos;t renewed. That gives us a chance to warn you before the property is left uninsured. An uninsured
            rental is a big risk, and it can also break mortgage terms.
          </li>
          <li>
            <strong>It&apos;s standard and usually free.</strong> It&apos;s normal practice for managed rentals, and most insurers add it at
            little or no extra cost.
          </li>
        </ul>
        <h4 className="faq-sub">What It Doesn&apos;t Do</h4>
        <p>
          It doesn&apos;t give IRep any claim to your insurance payouts for damage to the building, and it doesn&apos;t change your own
          coverage. It only extends the liability protection to us for claims about the property.
        </p>
        <p className="small">The exact wording and cost depend on your insurer, so please confirm the details with your broker.</p>
      </>
    ),
  },
];

export default function OwnerFaqCard() {
  return (
    <section className="boxed stack" aria-labelledby="sec-own-faq">
      <h2 id="sec-own-faq" className="sec-title">
        Common Questions
      </h2>
      <div className="faq-list">
        {FAQ.map((f) => (
          <details key={f.q} className="faq-item">
            <summary>{f.q}</summary>
            <div className="faq-body">{f.a}</div>
          </details>
        ))}
      </div>
      <p className="small" style={{ margin: 0 }}>
        Something else? Call {SITE.phone}, email {SITE.email}, or use Request Information above.
      </p>
    </section>
  );
}
