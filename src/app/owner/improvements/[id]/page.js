import OwnerGate from "@/components/owner/OwnerGate";
import OwnerImprovements from "@/components/owner/OwnerImprovements";

export const metadata = { title: "Recommended Improvements", robots: { index: false, follow: false } };

export default async function OwnerImprovementsPage({ params }) {
  const { id } = await params;
  return (
    <section className="block">
      <div className="wrap">
        <OwnerGate next={`/owner/improvements/${id}`}>
          <OwnerImprovements id={id} />
        </OwnerGate>
      </div>
    </section>
  );
}
