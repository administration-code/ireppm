import { SITE } from "@/lib/site";

export default function robots() {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/account", "/admin", "/owner"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
