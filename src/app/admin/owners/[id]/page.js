import Communications from "@/components/admin/comms/Communications";
import StaffGate from "@/components/admin/StaffGate";
import OwnerEditor from "@/components/admin/OwnerEditor";

export const metadata = { title: "Owner" };

export default async function OwnerPage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <div className="stack" style={{ gap: 32 }}>
      <OwnerEditor id={id} />
      <Communications ownerId={id} />
      </div>
    </StaffGate>
  );
}
