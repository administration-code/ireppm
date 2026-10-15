import StaffGate from "@/components/admin/StaffGate";
import LettersBoard from "@/components/admin/LettersBoard";
import { isPeriod } from "@/lib/payouts";

export const metadata = { title: "Landlord letters" };

export default async function LettersPage({ searchParams }) {
  const { month } = await searchParams;
  return (
    <StaffGate>
      <LettersBoard initialMonth={isPeriod(month) ? month : null} />
    </StaffGate>
  );
}
