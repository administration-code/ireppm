import Link from "next/link";

export default function NotFound() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="empty">
          <h2>That page isn't here</h2>
          <p>The rental may have been leased, or the link may be out of date.</p>
          <Link className="btn primary" href="/properties">
            See available rentals
          </Link>
        </div>
      </div>
    </section>
  );
}
