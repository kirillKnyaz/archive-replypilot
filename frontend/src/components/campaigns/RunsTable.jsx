export default function RunsTable({ runs }) {
  if (runs.length === 0) return <p className="text-muted">No runs yet.</p>;

  return (
    <div className="table-responsive">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Date</th>
            <th>Status</th>
            <th>Discovered</th>
            <th>Filtered</th>
            <th>Queued</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.runAt).toLocaleString()}</td>
              <td><RunStatusBadge status={r.status} /></td>
              <td>{r.leadsDiscovered}</td>
              <td>{r.leadsFiltered}</td>
              <td>{r.leadsQueued}</td>
              <td>{r.errorMessage && <small className="text-danger">{r.errorMessage}</small>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunStatusBadge({ status }) {
  const map = { RUNNING: 'bg-warning text-dark', COMPLETE: 'bg-success', ERROR: 'bg-danger' };
  return <span className={`badge ${map[status] || 'bg-secondary'}`}>{status}</span>;
}
