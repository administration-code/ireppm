import StaffGate from "@/components/admin/StaffGate";
import CommissionsBoard from "@/components/admin/accounting/CommissionsBoard";

export const metadata = { title: "Commissions & Loans" };

export default async function CommissionsPage({ searchParams }) {
  const { year } = await searchParams;
  const y = /^\d{4}$/.test(String(year || "")) ? Number(year) : undefined;
  return (
    <StaffGate>
      <CommissionsBoard year={y} />
    </StaffGate>
  );
}
