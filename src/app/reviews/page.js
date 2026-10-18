import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { approvedReviews, reviewStats } from "@/lib/reviews";
import ReviewForm from "@/components/ReviewForm";

export const revalidate = 600;
export const metadata = {
  title: "Reviews",
  description: "What tenants and landlords say about renting and managing with IRep Property Management in Windsor.",
};

function Stars({ n }) {
  return (
    <span className="stars" aria-label={`${n} out of 5 stars`}>
      {"★".repeat(n)}
      <span className="off">{"★".repeat(5 - n)}</span>
    </span>
  );
}

async function load() {
  try {
    return await approvedReviews(getSupabaseAdmin());
  } catch {
    return [];
  }
}

const TABS = [["", "All"], ["tenant", "Tenants"], ["landlord", "Landlords"]];

export default async function ReviewsPage({ searchParams }) {
  const sp = await searchParams;
  const who = ["tenant", "landlord"].includes(sp?.who) ? sp.who : "";
  const all = await load();
  const stats = reviewStats(all);
  const shown = who ? all.filter((r) => r.reviewer_type === who) : all;
  const fmt = (iso) => new Date(iso).toLocaleDateString("en-CA", { month: "long", year: "numeric" });

  return (
    <section className="block">
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Reviews</span>
          <h1>What tenants and landlords say</h1>
          <p className="lead">Reviews from people who rent from us and landlords we manage for. We post every genuine review, good or bad, once we&apos;ve checked it&apos;s from a real person.</p>
        </div>

        {all.length ? (
          <>
            <div className="review-summary">
              {[["all", "Overall"], ["tenant", "From tenants"], ["landlord", "From landlords"]].map(([k, l]) =>
                stats[k].count ? (
                  <div key={k}>
                    <span className="small">{l}</span>
                    <b>{stats[k].avg.toFixed(1)}</b>
                    <Stars n={Math.round(stats[k].avg)} /> <span className="small">{stats[k].count} review{stats[k].count === 1 ? "" : "s"}</span>
                  </div>
                ) : null
              )}
            </div>
            <nav className="review-tabs" aria-label="Filter reviews">
              {TABS.map(([k, l]) => (
                <Link key={k || "all"} href={k ? `/reviews?who=${k}` : "/reviews"} aria-current={who === k ? "page" : undefined} scroll={false}>
                  {l}
                </Link>
              ))}
            </nav>
            {shown.length ? (
              <ul className="review-list">
                {shown.map((r) => (
                  <li key={r.id}>
                    <Stars n={r.rating} />
                    {r.title ? <b>{r.title}</b> : null}
                    <p style={{ margin: 0, whiteSpace: "pre-line" }}>{r.body}</p>
                    <span className="who">
                      {r.display_name} · {r.reviewer_type === "tenant" ? "Tenant" : "Landlord"}
                      {r.verified ? " · Verified" : ""} · {fmt(r.approved_at || r.created_at)}
                    </span>
                    {r.staff_reply ? <p className="reply" style={{ margin: 0 }}><b>IRep replied:</b> {r.staff_reply}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pmuted">No reviews here yet.</p>
            )}
          </>
        ) : (
          <p className="pmuted">We&apos;re just starting to collect reviews. Be one of the first.</p>
        )}

        <div className="review-write" id="write">
          <div>
            <h2>Write a review</h2>
            <p className="pmuted">Rent from us or have us manage your property? Tell others what it&apos;s like. We read every review, and we&apos;ll reply if something needs fixing.</p>
            <p className="pmuted small">Reviews are checked before they go up. We don&apos;t edit what you write; we only hold back reviews with personal information about someone else, abuse, or spam.</p>
          </div>
          <div className="boxed">
            <ReviewForm initialType={who} />
          </div>
        </div>
      </div>
    </section>
  );
}
