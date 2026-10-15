import StaffGate from "@/components/admin/StaffGate";
import RentReceipt from "@/components/admin/RentReceipt";
import { receiptParams } from "@/lib/receipt";

export const metadata = { title: "Rent receipt" };

export default async function ReceiptPage({ searchParams }) {
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const params = receiptParams(flat);
  return (
    <StaffGate>
      {params ? (
        <RentReceipt params={params} />
      ) : (
        <div className="empty">
          <h2>No receipt to show</h2>
          <p>Open a receipt from a payment or a tenancy&apos;s rent ledger.</p>
        </div>
      )}
    </StaffGate>
  );
}
