import StaffGate from "@/components/admin/StaffGate";
import LandlordsBoard from "@/components/admin/accounting/LandlordsBoard";

export const metadata = { title: "Landlord Year-End" };

export default async function LandlordYearEndPage({ searchParams }) {
  const { year } = await searchParams;
  const y = /^\d{4}$/.test(String(year || "")) ? Number(year) : undefined;
  return (
    <StaffGate>
      <LandlordsBoard year={y} />
    </StaffGate>
  );
}
