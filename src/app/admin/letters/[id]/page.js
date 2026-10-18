import StaffGate from "@/components/admin/StaffGate";
import LetterEditor from "@/components/admin/LetterEditor";

export const metadata = { title: "Landlord Letter" };

export default async function LetterPage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <LetterEditor id={id} />
    </StaffGate>
  );
}
