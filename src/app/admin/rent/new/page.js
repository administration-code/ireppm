import StaffGate from "@/components/admin/StaffGate";
import RecordPayment from "@/components/admin/RecordPayment";

export const metadata = { title: "Record a payment" };

export default async function RecordPaymentPage({ searchParams }) {
  const { tenancy } = await searchParams;
  return (
    <StaffGate>
      <RecordPayment tenancyId={typeof tenancy === "string" ? tenancy : ""} />
    </StaffGate>
  );
}
