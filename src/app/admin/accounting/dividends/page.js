import StaffGate from "@/components/admin/StaffGate";
import DividendsBoard from "@/components/admin/accounting/DividendsBoard";

export const metadata = { title: "Dividends & T5" };

export default async function DividendsPage({ searchParams }) {
  const { year } = await searchParams;
  const y = /^\d{4}$/.test(String(year || "")) ? Number(year) : undefined;
  return (
    <StaffGate>
      <DividendsBoard year={y} />
    </StaffGate>
  );
}
