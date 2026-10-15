import StaffGate from "@/components/admin/StaffGate";
import TurnoverEditor from "@/components/admin/TurnoverEditor";

export const metadata = { title: "Turnover" };

export default async function TurnoverPage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <TurnoverEditor id={id} />
    </StaffGate>
  );
}
