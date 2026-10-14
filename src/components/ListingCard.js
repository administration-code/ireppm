import Link from "next/link";
import { PhotoPlaceholder } from "./Brand";
import { availableText, listingTitle, money } from "@/lib/format";

export default function ListingCard({ listing: l, sample }) {
  const photo = l.photos && l.photos[0];
  return (
    <Link className="card" href={`/properties/${l.slug}`}>
      <div className="photo">
        {photo ? <img src={photo} alt="" loading="lazy" /> : <PhotoPlaceholder />}
        <span className="tag">{sample ? `Sample · ${l.property_type}` : l.property_type}</span>
      </div>
      <div className="body">
        <span className="price num">
          {money(l.rent)} <small>/ month</small>
        </span>
        <span className="addr">{listingTitle(l)}</span>
        <span className="meta">
          {l.neighbourhood ? `${l.neighbourhood}, ` : ""}
          {l.city}
        </span>
        <span className="meta num">
          <span>{l.beds} bed</span>
          <span>{l.baths} bath</span>
          <span>Available {availableText(l.available_on)}</span>
        </span>
      </div>
    </Link>
  );
}
