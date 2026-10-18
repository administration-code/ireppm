import StaffGate from "@/components/admin/StaffGate";
import SignatureDetail from "@/components/admin/signatures/SignatureDetail";

export const metadata = { title: "Signature Request" };

export default async function SignaturePage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <SignatureDetail id={id} />
    </StaffGate>
  );
}
