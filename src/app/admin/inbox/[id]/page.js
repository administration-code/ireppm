import StaffGate from "@/components/admin/StaffGate";
import EmailThread from "@/components/admin/comms/EmailThread";

export const metadata = { title: "Email" };

export default async function Page({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <EmailThread id={id} />
    </StaffGate>
  );
}
