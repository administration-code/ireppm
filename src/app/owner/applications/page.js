import OwnerGate from "@/components/owner/OwnerGate";
import OwnerApplications from "@/components/owner/OwnerApplications";

export const metadata = {
  title: "Applicants to review",
  robots: { index: false, follow: false },
};

export default function OwnerApplicationsPage() {
  return (
    <section className="block">
      <div className="wrap">
        <OwnerGate next="/owner/applications">
          <OwnerApplications />
        </OwnerGate>
      </div>
    </section>
  );
}
