import AgentHelp from "@/components/agent/AgentHelp";

export const metadata = { title: "Help", robots: { index: false, follow: false } };

export default function AgentHelpPage() {
  return (
    <section className="block">
      <div className="wrap">
        <AgentHelp />
      </div>
    </section>
  );
}
