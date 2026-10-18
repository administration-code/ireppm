import StaffGate from "@/components/admin/StaffGate";
import PayoutsBoard from "@/components/admin/PayoutsBoard";
import { isPeriod } from "@/lib/payouts";

export const metadata = { title: "Landlord Payouts" };

export default async function PayoutsPage({ searchParams }) {
  const { month } = await searchParams;
  return (
    <StaffGate>
      <PayoutsBoard initialMonth={isPeriod(month) ? month : null} />
    </StaffGate>
  );
}
