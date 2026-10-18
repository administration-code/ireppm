import OwnerGate from "@/components/owner/OwnerGate";
import Link from "next/link";
import OwnerHome from "@/components/owner/OwnerHome";

export const metadata = {
  title: "Owner Portal",
  robots: { index: false, follow: false },
};

export default function OwnerPage() {
  return (
    <section className="block">
      <div className="wrap">
        <OwnerGate>
          <OwnerHome />
          <p className="pmuted small" style={{ marginTop: 32 }}>
            How are we doing? <Link href="/reviews?who=landlord#write">Leave a review</Link>.
          </p>
        </OwnerGate>
      </div>
    </section>
  );
}
