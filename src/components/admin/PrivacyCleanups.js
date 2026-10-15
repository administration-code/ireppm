import { prettyDateTime } from "@/lib/admin-requests";

export default function PrivacyCleanups({ deletions, failed }) {
  return (
    <section className="stack privacy-cleanups" style={{ gap: 8 }} aria-labelledby="privacy-cleanups-title">
      <h2 id="privacy-cleanups-title" className="eyebrow">
        Privacy clean-ups
      </h2>
      <p className="small">
        Unsuccessful applicants&apos; documents are deleted automatically, as promised in our privacy policy.
      </p>
      {failed ? (
        <p className="small err">The clean-up history couldn&apos;t load. Refresh the page to try again.</p>
      ) : deletions.length ? (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="num">
                  Files deleted
                </th>
              </tr>
            </thead>
            <tbody>
              {deletions.map((d) => (
                <tr key={d.id}>
                  <td>{prettyDateTime(d.deleted_at)}</td>
                  <td className="num">{d.files_deleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small">No documents have been deleted yet.</p>
      )}
    </section>
  );
}
