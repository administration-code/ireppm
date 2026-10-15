import StaffGate from "@/components/admin/StaffGate";
import OwnerEditor from "@/components/admin/OwnerEditor";

export const metadata = { title: "Owner" };

export default async function OwnerPage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <OwnerEditor id={id} />
    </StaffGate>
  );
}
