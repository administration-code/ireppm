import PropertySearch from "@/components/PropertySearch";
import { getListings } from "@/lib/listings";

export const metadata = {
  title: "Rentals in Windsor-Essex",
  description: "Apartments, houses and rooms for rent in Windsor and Essex County, managed by IRep Property Management.",
};

export default async function PropertiesPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const one = (v) => (Array.isArray(v) ? v[0] : v) || "";
  const { listings, sample, error } = await getListings();

  return (
    <section className="block">
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Available now</span>
          <h1>Rentals in Windsor-Essex</h1>
        </div>
        {error ? (
          <div className="warnbox" style={{ marginBottom: 24 }}>
            We couldn't load listings just now. Refresh the page in a minute.
          </div>
        ) : null}
        <PropertySearch
          listings={listings}
          sample={sample}
          initial={{ q: one(sp.q), type: one(sp.type), beds: one(sp.beds), max: one(sp.max) }}
        />
      </div>
    </section>
  );
}
