import StaffGate from "@/components/admin/StaffGate";
import NewSignature from "@/components/admin/signatures/NewSignature";

export const metadata = { title: "Send for signature" };

export default async function NewSignaturePage({ searchParams }) {
  const sp = await searchParams;
  const pick = (k) => (typeof sp[k] === "string" ? sp[k] : "");
  return (
    <StaffGate>
      <NewSignature
        kind={pick("kind")}
        params={{ tenancy: pick("tenancy"), unit: pick("unit"), property: pick("property"), application: pick("application") }}
      />
    </StaffGate>
  );
}
