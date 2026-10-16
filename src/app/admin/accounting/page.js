import StaffGate from "@/components/admin/StaffGate";
import ReconciliationBoard from "@/components/admin/accounting/ReconciliationBoard";

export const metadata = { title: "Reconciliation" };

export default async function AccountingPage({ searchParams }) {
  const { month, account } = await searchParams;
  return (
    <StaffGate>
      <ReconciliationBoard
        initialMonth={typeof month === "string" ? month : undefined}
        initialAccount={typeof account === "string" ? account : undefined}
      />
    </StaffGate>
  );
}
