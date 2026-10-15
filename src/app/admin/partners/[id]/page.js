import StaffGate from "@/components/admin/StaffGate";
import PartnerEditor from "@/components/admin/PartnerEditor";

export const metadata = { title: "Partner" };

export default async function PartnerPage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <PartnerEditor id={id} />
    </StaffGate>
  );
}
