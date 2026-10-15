import { prettyDate, renewalBadge } from "@/lib/admin-properties";

export default function RenewalBadge({ date }) {
  const b = renewalBadge(date);
  if (b.kind === "none") return <span className="small">Not set</span>;
  if (b.kind === "later") return <span>{b.text}</span>;
  return (
    <span className={`pill renew-${b.kind}`} title={prettyDate(date)}>
      {b.text}
    </span>
  );
}
