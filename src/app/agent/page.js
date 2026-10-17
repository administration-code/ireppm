import AgentPortal from "@/components/agent/AgentPortal";

export const metadata = { title: "Agent portal", robots: { index: false, follow: false } };

export default function AgentPage() {
  return (
    <section className="block">
      <div className="wrap">
        <AgentPortal />
      </div>
    </section>
  );
}
