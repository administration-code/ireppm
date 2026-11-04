import AgentPay from "@/components/agent/AgentPay";

export const metadata = { title: "Your Pay", robots: { index: false, follow: false } };

export default function AgentPayPage() {
  return (
    <section className="block">
      <div className="wrap">
        <AgentPay />
      </div>
    </section>
  );
}
