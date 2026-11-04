import AgentInspection from "@/components/agent/AgentInspection";

export const metadata = { title: "Inspection Report", robots: { index: false, follow: false } };

export default function AgentInspectionPage() {
  return (
    <section className="block">
      <div className="wrap">
        <AgentInspection />
      </div>
    </section>
  );
}
