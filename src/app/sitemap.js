import { getListings } from "@/lib/listings";
import { SITE } from "@/lib/site";
import { GUIDES } from "@/lib/guides";

export const revalidate = 3600;

export default async function sitemap() {
  const pages = ["", "/properties", "/landlords", "/pricing", "/guides", "/app", "/resources", "/about", "/contact", "/privacy", ...GUIDES.map((g) => `/guides/${g.slug}`)].map((p) => ({
    url: `${SITE.url}${p}`,
    changeFrequency: p === "/properties" ? "daily" : "monthly",
  }));
  const { listings, sample } = await getListings();
  const rentals = sample
    ? []
    : listings.map((l) => ({ url: `${SITE.url}/properties/${l.slug}`, changeFrequency: "weekly" }));
  return [...pages, ...rentals];
}
