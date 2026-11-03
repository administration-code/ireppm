import OwnerGate from "@/components/owner/OwnerGate";
import WorkOrderInvoice from "@/components/WorkOrderInvoice";

export const metadata = {
  title: "Work Order Invoice",
  robots: { index: false, follow: false },
};

export default async function OwnerWorkOrderPage({ params }) {
  const { id } = await params;
  return (
    <section className="block">
      <div className="wrap">
        <OwnerGate next={`/owner/work-orders/${id}`}>
          <WorkOrderInvoice id={id} backHref="/owner" backLabel="Back to your portal" />
        </OwnerGate>
      </div>
    </section>
  );
}
