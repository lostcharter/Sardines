export default function TicketEvidencePanel({ result }) {
  const critical = (result.issues || []).filter((issue) => issue.severity === 'critical')
  const reviews = (result.issues || []).filter((issue) => issue.severity !== 'critical')
  const unplaced = result.rows.filter((row) => row.flightIndex === null)
  return <>
    {critical.length > 0 && <section className="quality-check-critical" role="alert" aria-label="Critical ticket conflicts">
      <h3>Critical ticket conflicts — verify with the ticket provider</h3>
      <p>These assignments cannot all be correct. Both owners and their source evidence are retained. A layout change cannot resolve a ticket conflict.</p>
      {critical.map((issue, index) => <Evidence key={index} issue={issue} />)}
    </section>}
    {(reviews.length > 0 || unplaced.length > 0) && <details className="quality-check-evidence">
      <summary>Source interpretation needs review ({reviews.length + unplaced.length})</summary>
      <p>Unreadable or ambiguous information has not been treated as missing passengers or unassigned seats.</p>
      {reviews.map((issue, index) => <Evidence key={index} issue={issue} />)}
      {unplaced.map((row, index) => <p key={`unplaced-${index}`}><strong>{row.traveler.displayName}</strong> — {row.message}</p>)}
    </details>}
  </>
}

function Evidence({ issue }) {
  return <details className="quality-check-source">
    <summary>{issue.message}</summary>
    {(issue.sources || []).map((source, index) => <div key={index}>
      <small>{source.document} · page {source.page} · position {Math.round(source.x)}, {Math.round(source.y)}</small>
      <pre>{source.text}</pre>
    </div>)}
  </details>
}
