import StaffGate from "@/components/admin/StaffGate";
import YearPrint from "@/components/admin/accounting/YearPrint";

export const metadata = { title: "Year-end summary" };

export default async function YearPrintPage({ searchParams }) {
  const { year } = await searchParams;
  const y = /^\d{4}$/.test(String(year || "")) ? Number(year) : new Date().getFullYear();
  return (
    <StaffGate>
      <YearPrint year={y} />
    </StaffGate>
  );
}
