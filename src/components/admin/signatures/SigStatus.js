import { SIG_STATUS, statusTone } from "@/lib/signatures";

export default function SigStatus({ status }) {
  return <span className={`pill sig-${statusTone(status)}`}>{SIG_STATUS[status] || status}</span>;
}
