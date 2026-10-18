import StaffGate from "@/components/admin/StaffGate";
import YearBoard from "@/components/admin/accounting/YearBoard";

export const metadata = { title: "Year End" };

export default async function YearEndPage({ searchParams }) {
  const { year } = await searchParams;
  const y = /^\d{4}$/.test(String(year || "")) ? Number(year) : undefined;
  return (
    <StaffGate>
      <YearBoard initialYear={y} />
    </StaffGate>
  );
}
