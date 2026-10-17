import OwnerGate from "@/components/owner/OwnerGate";
import OwnerApplications from "@/components/owner/OwnerApplications";

export const metadata = {
  title: "Applicant to review",
  robots: { index: false, follow: false },
};

export default async function OwnerApplicationPage({ params }) {
  const { id } = await params;
  return (
    <section className="block">
      <div className="wrap">
        <OwnerGate next={`/owner/applications/${id}`}>
          <OwnerApplications focusId={id} />
        </OwnerGate>
      </div>
    </section>
  );
}
