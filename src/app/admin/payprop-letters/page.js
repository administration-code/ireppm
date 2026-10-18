import StaffGate from "@/components/admin/StaffGate";
import PaypropLetterBulk from "@/components/admin/PaypropLetterBulk";

export const metadata = { title: "PayProp letters" };

export default function PaypropLettersPage() {
  return (
    <StaffGate>
      <div className="stack">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="admin-title">PayProp welcome letters</h1>
          <p className="small">
            Upload many letters at once. For one new tenant, use the PayProp welcome letter box on their tenancy (unit page) instead, which can also email it to them.
          </p>
        </div>
        <PaypropLetterBulk />
      </div>
    </StaffGate>
  );
}
