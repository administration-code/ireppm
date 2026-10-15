import OwnerGate from "@/components/owner/OwnerGate";
import OwnerHome from "@/components/owner/OwnerHome";

export const metadata = {
  title: "Owner portal",
  robots: { index: false, follow: false },
};

export default function OwnerPage() {
  return (
    <section className="block">
      <div className="wrap">
        <OwnerGate>
          <OwnerHome />
        </OwnerGate>
      </div>
    </section>
  );
}
