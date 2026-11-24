import { Suspense } from "react";
import VacancySign from "@/components/agent/VacancySign";

export const metadata = { title: "For Rent Sign", robots: { index: false, follow: false } };

export default function VacancySignPage() {
  return (
    <Suspense fallback={<p className="small">Loading…</p>}>
      <VacancySign />
    </Suspense>
  );
}
