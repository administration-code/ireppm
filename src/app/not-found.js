import Link from "next/link";

export default function NotFound() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="empty">
          <h2>That Page Isn't Here</h2>
          <p>The rental may have been leased, or the link may be out of date.</p>
          <Link className="btn primary" href="/properties">
            See Available Rentals
          </Link>
        </div>
      </div>
    </section>
  );
}
