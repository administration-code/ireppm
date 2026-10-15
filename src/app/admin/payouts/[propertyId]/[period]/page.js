import { notFound } from "next/navigation";
import StaffGate from "@/components/admin/StaffGate";
import OwnerStatement from "@/components/admin/OwnerStatement";
import { isPeriod } from "@/lib/payouts";

export const metadata = { title: "Owner statement" };

export default async function OwnerStatementPage({ params }) {
  const { propertyId, period } = await params;
  if (!isPeriod(period)) notFound();
  return (
    <StaffGate>
      <OwnerStatement propertyId={propertyId} period={period} />
    </StaffGate>
  );
}
