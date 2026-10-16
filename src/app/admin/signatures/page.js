import StaffGate from "@/components/admin/StaffGate";
import SignaturesList from "@/components/admin/signatures/SignaturesList";

export const metadata = { title: "Signatures" };

export default function SignaturesPage() {
  return (
    <StaffGate>
      <SignaturesList />
    </StaffGate>
  );
}
