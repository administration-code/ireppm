import Link from "next/link";
import ContactLine from "@/components/admin/ContactLine";
import { OWNER_TYPES, PACKAGE_LABEL, feeWithHst, prettyDate } from "@/lib/admin-properties";
import RenewalBadge from "./RenewalBadge";

export default function PropertySummary({ property }) {
  const owner = property.owner;
  return (
    <div className="summary-grid">
      <section className="boxed stack" aria-labelledby="sum-owner">
        <h2 id="sum-owner" className="sec-title">
          Owner
        </h2>
        {owner ? (
          <>
            <p>
              <Link href={`/admin/owners/${owner.id}`}>
                <b>{owner.name}</b>
              </Link>
              {OWNER_TYPES[owner.entity_type] ? <span className="small"> · {OWNER_TYPES[owner.entity_type]}</span> : null}
            </p>
            {owner.phone || owner.email ? (
              <ContactLine phone={owner.phone} email={owner.email} />
            ) : (
              <p className="small">No phone or email on file.</p>
            )}
          </>
        ) : (
          <p className="small">No owner set. Choose one in the form below.</p>
        )}
      </section>

      <section className="boxed stack" aria-labelledby="sum-contract">
        <h2 id="sum-contract" className="sec-title">
          Agreement
        </h2>
        <dl className="req-facts">
          <div>
            <dt>Package</dt>
            <dd>{PACKAGE_LABEL[property.management_package] || "Not set"}</dd>
          </div>
          <div>
            <dt>Monthly fee</dt>
            <dd className="num">
              {feeWithHst(property.monthly_fee)}
              {property.custom_fee ? <span className="small"> (custom)</span> : null}
            </dd>
          </div>
          <div>
            <dt>Units</dt>
            <dd className="num">{property.unit_count ?? 1}</dd>
          </div>
          <div>
            <dt>Start</dt>
            <dd>{property.agreement_start ? prettyDate(property.agreement_start) : "Not set"}</dd>
          </div>
          <div>
            <dt>Renewal</dt>
            <dd>
              <RenewalBadge date={property.agreement_renewal} />
            </dd>
          </div>
          <div>
            <dt>Renewal notice sent</dt>
            <dd>{property.renewal_notice_sent_on ? prettyDate(property.renewal_notice_sent_on) : "Not yet"}</dd>
          </div>
          <div>
            <dt>Lot size</dt>
            <dd className="num">
              {property.lot_size_sqft ? `${Number(property.lot_size_sqft).toLocaleString("en-CA")} sq. ft.` : "Not set"}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
