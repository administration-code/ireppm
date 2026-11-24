import AgentVisits from "@/components/agent/AgentVisits";

export const metadata = { title: "Lawn and Snow", robots: { index: false, follow: false } };

export default function AgentVisitsPage() {
  return (
    <section className="block">
      <div className="wrap">
        <AgentVisits />
      </div>
    </section>
  );
}
