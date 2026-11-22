import AgentCash from "@/components/agent/AgentCash";

export const metadata = { title: "Cash", robots: { index: false, follow: false } };

export default function AgentCashPage() {
  return (
    <section className="block">
      <div className="wrap">
        <AgentCash />
      </div>
    </section>
  );
}
