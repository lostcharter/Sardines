export default function QualityCheckFindings({ type, findings, panelRef, onSelect, onClose }) {
  const title = type === 'conflict' ? 'Seat conflicts' : 'Unmet seating requests'
  return <section id="quality-check-findings" className="quality-check-findings" ref={panelRef} tabIndex={-1} aria-labelledby="quality-check-findings-title">
    <div className="quality-check-findings-heading">
      <h3 id="quality-check-findings-title">{title} ({findings.length})</h3>
      <button type="button" onClick={onClose}>Close findings</button>
    </div>
    <p>Select a finding to open its flight and passenger row.</p>
    <ul>{findings.map((row, index) => <li key={index}>
      <button type="button" onClick={() => onSelect(row)}>
        <strong>{row.traveler.displayName} · {row.seat || 'Seat not interpreted'}</strong>
        <span>{row.flight.departureAirport} → {row.flight.arrivalAirport} · {row.flight.airline} {row.flight.flightNumber} · {row.flight.departureDate || 'Date unconfirmed'}</span>
        <span>{row.message}</span>
      </button>
    </li>)}</ul>
  </section>
}
