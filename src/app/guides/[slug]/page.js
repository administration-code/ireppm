import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, guideBySlug } from "@/lib/guides";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const g = guideBySlug(slug);
  return g ? { title: g.title, description: g.summary } : {};
}

function Block({ b }) {
  const [type, a, c] = b;
  if (type === "h") return <h2>{a}</h2>;
  if (type === "p") return <p>{a}</p>;
  if (type === "note") return <p className="guide-note">{a}</p>;
  if (type === "list")
    return (
      <ul>
        {a.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    );
  if (type === "table")
    return (
      <div className="table-wrap">
        <table className="guide-table">
          <thead>
            <tr>
              {a.map((h) => (
                <th key={h} scope="col">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return null;
}

export default async function GuidePage({ params }) {
  const { slug } = await params;
  const g = guideBySlug(slug);
  if (!g) notFound();
  return (
    <section className="block">
      <div className="wrap guide">
        <Link className="back" href="/guides">← All guides</Link>
        <span className="eyebrow">Landlord guide · Updated {g.updated}</span>
        <h1>{g.title}</h1>
        <p className="lead">{g.summary}</p>
        <div className="guide-body">
          {g.body.map((b, i) => (
            <Block key={i} b={b} />
          ))}
        </div>
        {g.links?.length ? (
          <p className="pmuted">
            More:{" "}
            {g.links.map(([label, href], i) => (
              <span key={href}>
                {i ? " · " : ""}
                <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
              </span>
            ))}
          </p>
        ) : null}
        <div className="boxed guide-cta">
          <b>Want us to handle this for you?</b>
          <span className="pmuted">IRep looks after notices, rent increases and the Board paperwork for the landlords we manage for.</span>
          <div className="row">
            <Link className="btn primary" href="/landlords">Why landlords choose IRep</Link>
            <Link className="btn ghost" href="/landlords#estimate">Free rent estimate</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
