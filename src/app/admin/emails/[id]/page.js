import StaffGate from "@/components/admin/StaffGate";
import DraftEditor from "@/components/admin/emails/DraftEditor";

export const metadata = { title: "Email" };

export default async function Page({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <DraftEditor id={id} />
    </StaffGate>
  );
}
