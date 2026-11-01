import StaffGate from "@/components/admin/StaffGate";
import ContractorPay from "@/components/admin/ContractorPay";

export const metadata = { title: "Contractor Pay" };

export default async function ContractorPayPage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <ContractorPay id={id} />
    </StaffGate>
  );
}
