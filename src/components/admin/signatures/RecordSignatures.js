import Link from "next/link";
import DocumentsList from "@/components/admin/signatures/DocumentsList";

const SENDS = {
  tenancy: [
    ["lease", "Send lease"],
    ["N1", "N1 rent increase"],
    ["N4", "N4 non-payment"],
    ["N5", "N5 interference"],
    ["upload", "Upload a document"],
  ],
  property: [
    ["pm_contract", "Send management contract"],
    ["upload", "Upload a document"],
  ],
};

// Documents sent for a tenancy or property, with links to send new ones.
export default function RecordSignatures({ type, id }) {
  const column = type === "tenancy" ? "tenancy_id" : "property_id";
  return (
    <section className="boxed stack" aria-labelledby={`sig-${type}-${id}`}>
      <h2 id={`sig-${type}-${id}`} className="sub-title">
        Documents for Signature
      </h2>
      <div className="req-actions">
        {SENDS[type].map(([kind, label]) => (
          <Link key={kind} className="btn ghost sm" href={`/admin/signatures/new?kind=${kind}&${type}=${id}`}>
            {label}
          </Link>
        ))}
      </div>
      <DocumentsList column={column} value={id} title="Documents for Signature" bare />
    </section>
  );
}
