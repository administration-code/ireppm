import OwnerGate from "@/components/owner/OwnerGate";
import OwnerLetterView from "@/components/owner/OwnerLetterView";

export const metadata = {
  title: "Monthly Statement",
  robots: { index: false, follow: false },
};

export default async function OwnerLetterPage({ params }) {
  const { id } = await params;
  return (
    <section className="block">
      <div className="wrap">
        <OwnerGate next={`/owner/letters/${id}`}>
          <OwnerLetterView id={id} />
        </OwnerGate>
      </div>
    </section>
  );
}
