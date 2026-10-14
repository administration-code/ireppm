import Link from "next/link";
import { notFound } from "next/navigation";
import ListingActions from "@/components/ListingActions";
import ListingGallery from "@/components/ListingGallery";
import { getListing } from "@/lib/listings";
import { availableText, listingTitle, money } from "@/lib/format";

export const revalidate = 60;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { listing } = await getListing(slug);
  if (!listing) return { title: "Rental not found" };
  return {
    title: `${listingTitle(listing)}, ${listing.city}`,
    description: `${listing.beds} bed, ${listing.baths} bath ${listing.property_type.toLowerCase()} for rent at ${money(listing.rent)}/month in ${listing.neighbourhood || listing.city}.`,
  };
}

export default async function ListingPage({ params }) {
  const { slug } = await params;
  const { listing: l, sample } = await getListing(slug);
  if (!l) notFound();

  const details = [
    ["Utilities", l.utilities],
    ["Parking", l.parking],
    ["Laundry", l.laundry],
    ["Available", availableText(l.available_on)],
  ].filter(([, v]) => v);

  return (
    <section className="block">
      <div className="wrap">
        <Link className="back" href="/properties">
          ← All rentals
        </Link>
        <div className="detail">
          <div className="main">
            <ListingGallery photos={l.photos} title={listingTitle(l)} tag={sample ? "Sample listing" : null} />
            <div style={{ display: "grid", gap: 8 }}>
              <span className="eyebrow">
                {l.neighbourhood ? `${l.neighbourhood}, ` : ""}
                {l.city}
              </span>
              <h1 style={{ fontSize: "clamp(2rem, 4.5vw, 3rem)" }}>{listingTitle(l)}</h1>
            </div>
            <dl className="facts num">
              <div>
                <dt>Bedrooms</dt>
                <dd>{l.beds}</dd>
              </div>
              <div>
                <dt>Bathrooms</dt>
                <dd>{l.baths}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{l.sqft ? `${l.sqft} sq ft` : "—"}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{l.property_type}</dd>
              </div>
            </dl>
            {l.description ? <p className="lead" style={{ color: "var(--fg)" }}>{l.description}</p> : null}
            {l.features && l.features.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                <h3>Highlights</h3>
                <ul className="feat">
                  {l.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {details.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                <h3>Details</h3>
                <div className="boxed">
                  <dl className="kv">
                    {details.map(([k, v]) => (
                      <div key={k} style={{ display: "contents" }}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            ) : null}
          </div>
          <aside className="side">
            <div className="price num">
              {money(l.rent)}
              <span className="small" style={{ fontFamily: "var(--body)" }}>
                {" "}
                / month
              </span>
            </div>
            <p className="small">First and last month's rent due at signing. Tenant insurance required.</p>
            <ListingActions listing={{ id: l.id, slug: l.slug }} sample={sample} />
          </aside>
        </div>
      </div>
    </section>
  );
}
