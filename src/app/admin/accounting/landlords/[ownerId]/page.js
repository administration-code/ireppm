import Link from "next/link";
import StaffGate from "@/components/admin/StaffGate";
import AccountingTabs from "@/components/admin/accounting/AccountingTabs";
import StaffLandlordReport from "@/components/admin/accounting/StaffLandlordReport";

export const metadata = { title: "Landlord year-end report" };

export default async function LandlordReportPage({ params, searchParams }) {
  const { ownerId } = await params;
  const { year } = await searchParams;
  const y = /^\d{4}$/.test(String(year || "")) ? Number(year) : undefined;
  return (
    <StaffGate>
      <div className="stack">
        <AccountingTabs title="Landlord year-end report">
          <Link href={`/admin/accounting/landlords${y ? `?year=${y}` : ""}`} className="btn ghost">
            All landlords
          </Link>
        </AccountingTabs>
        <StaffLandlordReport ownerId={ownerId} year={y} />
      </div>
    </StaffGate>
  );
}
