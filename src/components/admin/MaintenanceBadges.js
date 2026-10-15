import { STATUS, URGENCY } from "@/lib/maintenance";

export function MaintenancePills({ request }) {
  return (
    <span className="pill-row">
      <span className={`pill mu-${request.urgency}`}>{URGENCY[request.urgency] || request.urgency}</span>
      <span className={`pill ms-${request.status}`}>{STATUS[request.status] || request.status}</span>
      {request.owner_approval === "pending" ? <span className="pill owner-pending">Owner approval pending</span> : null}
    </span>
  );
}
