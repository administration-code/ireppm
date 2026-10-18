import OwnerGate from "@/components/owner/OwnerGate";
import OwnerYearEnd from "@/components/owner/OwnerYearEnd";

export const metadata = {
  title: "Rental Income Summary",
  robots: { index: false, follow: false },
};

export default async function OwnerYearEndPage({ searchParams }) {
  const { year } = await searchParams;
  const y = /^\d{4}$/.test(String(year || "")) ? Number(year) : undefined;
  return (
    <section className="block">
      <div className="wrap">
        <OwnerGate>
          <OwnerYearEnd year={y} />
        </OwnerGate>
      </div>
    </section>
  );
}
