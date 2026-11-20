"use client";

import { ContactGuideCard } from "@/components/contact/ContactGuide";
import { useLiveRefresh } from "@/lib/useLiveRefresh";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { monthLabel, shortDate } from "@/lib/rent";
import { letterProperties, letterTotals } from "@/lib/letters";
import { SITE } from "@/lib/site";
import OwnerMonthly from "@/components/owner/OwnerMonthly";
import InsuranceReview from "@/components/InsuranceReview";
import { GettingStarted } from "@/components/tenant/TenantCards";
import OwnerImprovementsCard from "./OwnerImprovementsCard";
import OwnerArrearsCard from "./OwnerArrearsCard";
import OwnerRentMonthCard from "./OwnerRentMonthCard";
import OwnerRequestsCard from "./OwnerRequestsCard";
import OwnerExpensesCard from "./OwnerExpensesCard";
import OwnerFaqCard from "./OwnerFaqCard";
import OwnerInvoicesCard from "./OwnerInvoicesCard";
import EmailPrefs from "@/components/EmailPrefs";

async function loadPortal() {
  const sb = getBrowserClient();
  const [props, letters, apps] = await Promise.all([
    sb.from("my_owned_properties").select("id, address, city, postal_code, agreement_renewal, units, occupied").order("address"),
    sb
      .from("owner_letters")
      .select("id, period, sent_at, data")
      .eq("status", "sent")
      .order("period", { ascending: false }),
    sb.rpc("owner_applications"),
  ]);
  const { data: auth } = await sb.auth.getUser();
  const { data: prof } = auth?.user
    ? await sb.from("profiles").select("tour_dismissed_at").eq("id", auth.user.id).maybeSingle()
    : { data: null };
  if (props.error || letters.error) throw props.error || letters.error;
  const list = Array.isArray(apps.data) ? apps.data : [];
  return {
    properties: props.data || [],
    letters: letters.data || [],
    applicants: list.length,
    toReview: list.filter((a) => a.review_status === "pending").length,
    tourDismissed: prof?.tour_dismissed_at || null,
  };
}

export default function OwnerHome() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, properties: [], letters: [], error: "" });

  useLiveRefresh(() => loadPortal().then((d) => setState({ loading: false, ...d, error: "" })), 300000);

  useEffect(() => {
    let alive = true;
    loadPortal().then(
      (d) => alive && setState({ loading: false, ...d, error: "" }),
      () => alive && setState({ loading: false, properties: [], letters: [], error: "We couldn't load your portal. Refresh the page to try again." })
    );
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const { loading, properties, letters, error } = state;
  // my_owned_properties counts managed units only: a property with none is leasing only
  // (IRep found the tenant; rent goes to the landlord directly).
  const managed = properties.filter((p) => Number(p.units) > 0);
  const leasingOnly = properties.length > 0 && managed.length === 0;
  if (loading) return <p className="small">Loading your properties…</p>;
  if (error) return <div className="warnbox">{error}</div>;

  if (!properties.length) {
    return (
      <div className="empty">
        <h1>Owner Portal</h1>
        <p>
          This page is for landlords we manage properties for. Sign in with the email address we have on file for you, or contact us at{" "}
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Owner Portal</span>
        <h1 className="admin-title">Your Properties</h1>
        <p className="small">Signed in as {user?.email}.</p>
        <div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              window.dispatchEvent(new Event("owner-request-open"));
              document.getElementById("requests")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            Request Information
          </button>
        </div>
      </div>

      {leasingOnly ? (
        <p className="small" style={{ margin: 0 }}>
          IRep leases your property for you: we find and screen the tenants and prepare the lease. Rent is paid to you directly, so
          rent tracking and monthly statements aren&apos;t part of this portal. Your invoices and any requests are below.
        </p>
      ) : (
        <>
          <GettingStarted role="owner" dismissedAt={state.tourDismissed} />
          <OwnerRentMonthCard />
          <OwnerArrearsCard />
          <OwnerImprovementsCard />
        </>
      )}
      <OwnerExpensesCard />
      <OwnerInvoicesCard />
      <OwnerRequestsCard properties={properties} leasingOnly={leasingOnly} />

      <section className="boxed stack" aria-labelledby="sec-own-props">
        <h2 id="sec-own-props" className="sec-title">
          {leasingOnly ? "Properties We Lease for You" : "Properties We Manage for You"}
        </h2>
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Address</th>
                {leasingOnly ? null : (
                  <th scope="col" className="r">
                    Units occupied
                  </th>
                )}
                <th scope="col">{leasingOnly ? "Service" : "Agreement"}</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id}>
                  <td className="addr">
                    {p.address}
                    <span className="sub-line small">{[p.city, p.postal_code].filter(Boolean).join(" ")}</span>
                  </td>
                  {leasingOnly ? null : <td className="r num">{Number(p.units) > 0 ? `${p.occupied ?? 0} of ${p.units}` : "—"}</td>}
                  <td>
                    {Number(p.units) === 0
                      ? "Leasing only"
                      : !p.agreement_renewal
                      ? "—"
                      : p.agreement_renewal < new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" })
                        ? "Month to month"
                        : `First year ends ${shortDate(p.agreement_renewal)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {leasingOnly ? null : (
        <>
      <section className="boxed stack" aria-labelledby="sec-own-monthly">
        <h2 id="sec-own-monthly" className="sec-title">
          Monthly Rental Summary
        </h2>
        <OwnerMonthly />
      </section>

      <section className="boxed stack" aria-labelledby="sec-own-ins" id="insurance">
        <h2 id="sec-own-ins" className="sec-title">
          Tenant Insurance
        </h2>
        <p className="small">Your tenants upload proof of insurance within a week of moving in. You can approve it here, or leave it to IRep.</p>
        <InsuranceReview mode="owner" />
      </section>

      <section className="boxed stack" aria-labelledby="sec-own-letters">
        <h2 id="sec-own-letters" className="sec-title">
          Monthly Statement Letters
        </h2>
        {!letters.length ? (
          <p className="small">Your first monthly statement will appear here once we send it.</p>
        ) : (
          <ul className="letter-list">
            {letters.map((l) => {
              const t = letterTotals(l);
              return (
                <li key={l.id}>
                  <Link href={`/owner/letters/${l.id}`}>{monthLabel(l.period)} statement</Link>
                  <span className="small">
                    {letterProperties(l).length} {letterProperties(l).length === 1 ? "property" : "properties"} · Net to you {money(t.net)}
                    {l.sent_at
                      ? ` · Sent ${shortDate(new Date(l.sent_at).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }))}`
                      : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
        </>
      )}

      {state.applicants ? (
        <section className={`boxed stack${state.toReview ? " attention" : ""}`} aria-labelledby="sec-own-apps">
          <h2 id="sec-own-apps" className="sec-title">
            Applicants to Review ({state.toReview})
          </h2>
          <p className="small">
            {state.toReview
              ? "IRep won't accept an applicant for your property without your approval."
              : "You're all caught up. Past applicants are listed there too."}
          </p>
          <div>
            <Link href="/owner/applications" className={state.toReview ? "btn primary" : "btn ghost"}>
              {state.toReview ? "Review applicants" : "See applicants"}
            </Link>
          </div>
        </section>
      ) : null}

      {leasingOnly ? null : (
        <>
      <section className="boxed stack" aria-labelledby="sec-own-year">
        <h2 id="sec-own-year" className="sec-title">
          Year-End Summary
        </h2>
        <p className="small">Your rental income and expenses for the year, ready for your accountant and your T776.</p>
        <div>
          <Link href="/owner/year-end" className="btn ghost">
            Year-End Summary
          </Link>
        </div>
      </section>

      <OwnerFaqCard />
        </>
      )}
      <ContactGuideCard audience="owner" />

      <EmailPrefs />
    </div>
  );
}
