export default function SeatMap({ map }) {
  const hasManualLayout = map.sections.some((section) => section.confirmed)
  function seatGroups(layout, rowNumber) {
    return <div className="quality-check-seat-line">{layout.map((group, groupIndex) => <div className="quality-check-seat-section" key={groupIndex}>
      {groupIndex > 0 && <span className="quality-check-aisle" aria-label="Aisle">{rowNumber === undefined ? 'AISLE' : ''}</span>}
      <div className="quality-check-seat-group">{group.map((letter) => {
        if (rowNumber === undefined) return <strong key={letter}>{letter}</strong>
        const seat = `${rowNumber}${letter}`
        const assignment = map.bySeat.get(seat)
        return <div key={letter} tabIndex={assignment ? 0 : undefined} title={assignment ? `${seat} · ${assignment.traveler.displayName} · ${assignment.message}` : `${seat} · No group assignment; availability unknown`} className={`quality-check-seat ${assignment ? `status-${assignment.status}` : 'empty'}`}>
          <span>{seat}</span>{assignment && <small>{assignment.traveler.lastName}</small>}
          {assignment?.status === 'conflict' && <b className="quality-check-seat-alert">CONFLICT</b>}
        </div>
      })}</div>
    </div>)}</div>
  }
  return <section className={`quality-check-seat-map ${map.hasAssignedSeats ? '' : 'is-unassigned'}`} aria-label={`Seat map for ${map.flight.departureAirport} to ${map.flight.arrivalAirport}`}>
    <div className="quality-check-cabin">
      <div className={`quality-check-map-inference${hasManualLayout ? ' is-manual' : ''}`}><strong>{hasManualLayout ? 'Manually applied layout' : 'Inferred layout · review needed'}</strong>{!hasManualLayout && <span>Confirm the row ranges, seat groups, and letters below.</span>}</div>
      {map.sections.map((section, index) => <section key={index} className={`quality-check-layout-section ${section.confirmed ? 'is-reviewed' : 'is-inferred'}`} aria-label={`${section.label || 'Section'} rows ${section.firstRow} to ${section.lastRow}`}>
        <header><div><strong>{section.label || `Section ${index + 1}`}</strong><span>Rows {section.firstRow}–{section.lastRow} · {section.pattern}</span></div><b>{section.confirmed ? 'Reviewed' : 'Inferred · review'}</b></header>
        <div className="quality-check-cabin-letters"><span />{seatGroups(section.layout)}</div>
        {section.displayRows.map((row) => row.type === 'gap'
          ? <div className="quality-check-row-gap" key={`gap-${row.firstRow}`}><span>Rows {row.firstRow}–{row.lastRow}</span><strong>No group assignments</strong></div>
          : <div className="quality-check-seat-row" key={row.rowNumber}><strong className="quality-check-row-number">{row.rowNumber}</strong>{seatGroups(section.layout, row.rowNumber)}</div>)}
      </section>)}
      {!map.hasAssignedSeats && <p className="quality-check-empty-map">Seats not yet assigned · illustrative rows only</p>}
    </div>
  </section>
}
