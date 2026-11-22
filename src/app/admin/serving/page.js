import StaffGate from "@/components/admin/StaffGate";
import EmailService from "@/components/admin/signatures/EmailService";

export const metadata = { title: "Email Service" };

export default function Page() {
  return (
    <StaffGate>
      <EmailService />
    </StaffGate>
  );
}
