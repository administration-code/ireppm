import AgentVacancies from "@/components/agent/AgentVacancies";

export const metadata = { title: "Vacancies", robots: { index: false, follow: false } };

export default function AgentVacanciesPage() {
  return (
    <section className="block">
      <div className="wrap">
        <AgentVacancies />
      </div>
    </section>
  );
}
