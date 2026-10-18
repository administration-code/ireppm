import { dollars } from "@/lib/accounting";
import { cents } from "@/lib/rent";

export default function ThreeWayCard({ summary }) {
  const l = summary.liability || {};
  const bank = summary.statement_closing ?? summary.closing_calculated;
  const diff = summary.three_way_difference;
  const ok = cents(diff) === 0;

  return (
    <section className="boxed stack" aria-labelledby="acct-3way-title">
      <div>
        <h2 id="acct-3way-title" className="sec-title">
          Three-Way Check
        </h2>
        <p className="acct-3way-line">
          Bank balance <strong className="num">{dollars(bank)}</strong> vs what IRep holds for others{" "}
          <strong className="num">{dollars(l.total)}</strong>
        </p>
      </div>

      <dl className="acct-ledger">
        <div>
          <dt>Owed to landlords</dt>
          <dd className="num">{dollars(l.owners)}</dd>
        </div>
        <div>
          <dt>Money received but not yet allocated</dt>
          <dd className="num">{dollars(l.unallocated)}</dd>
        </div>
        <div>
          <dt>IRep fees earned but not yet taken</dt>
          <dd className="num">{dollars(l.irep_fees_not_taken)}</dd>
        </div>
        <div className="acct-ledger-total">
          <dt>What IRep holds for others</dt>
          <dd className="num">{dollars(l.total)}</dd>
        </div>
      </dl>

      {ok ? (
        <p className="acct-diff ok">Difference: $0.00. The bank and the books agree.</p>
      ) : (
        <div className="stack-sm">
          <p className="acct-diff warn">Difference: {dollars(diff)}</p>
          <p className="small">Explain any difference in the notes, e.g. bank fees charged to the trust account.</p>
        </div>
      )}
    </section>
  );
}
