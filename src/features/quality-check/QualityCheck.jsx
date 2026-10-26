import SeatLayoutEditor from './SeatLayoutEditor'
import SeatMap from './SeatMap'
import TicketEvidencePanel from './TicketEvidencePanel'
import QualityCheckFindings from './QualityCheckFindings'
import { useEffect, useMemo, useRef, useState } from 'react'
import { parseManifestWorkbook } from './manifestWorkbookParser'
import { compareSeatAssignments, seatComparisonSummary } from './seatComparison'
import { parseTicketPdfs } from './ticketPdfParser'
import { downloadQualityCheckWorkbook, qualityCheckWorkbookModel } from './qualityCheckWorkbook'
import './qualityCheck.css'

const labels = { 'no-request': 'No seat requested', verify: 'Review request', 'request-satisfied': 'Request satisfied', 'request-unmet': 'Request not satisfied', unassigned: 'Seat not assigned', unmatched: 'Unable to match', 'unable-to-verify': 'Cannot verify from seat', conflict: 'CRITICAL seat conflict', unresolved: 'Assignment not interpreted' }

export default function QualityCheck() {
  const [manifestFile, setManifestFile] = useState(null)
  const [ticketFiles, setTicketFiles] = useState([])
  const [result, setResult] = useState(null)
  const [activeFlight, setActiveFlight] = useState(0)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [findingView, setFindingView] = useState(null)
  const [rowTarget, setRowTarget] = useState(null)
  const findingsRef = useRef(null)
  const targetRowRef = useRef(null)
  const unmetButtonRef = useRef(null)
  const conflictButtonRef = useRef(null)
  const workbookModel = useMemo(() => result ? qualityCheckWorkbookModel(result) : null, [result])
  const activeMap = workbookModel?.maps[activeFlight]
  const rows = activeMap?.rows || []
  const allRows = workbookModel?.maps.flatMap((map) => map.rows) || []
  const conflicts = allRows.filter((row) => row.status === 'conflict')
  const findings = findingView ? allRows.filter((row) => row.status === findingView.type) : []
  const activeMisses = result?.rows.filter((row) => row.flightIndex === activeFlight && row.status === 'request-unmet').map((row) => ({ traveler: row.traveler.displayName, seat: row.seat, reason: row.message })) ?? []

  useEffect(() => {
    if (!findingView) return
    findingsRef.current?.focus({ preventScroll: true })
    findingsRef.current?.scrollIntoView({ block: 'start' })
  }, [findingView])

  useEffect(() => {
    if (!rowTarget) return
    targetRowRef.current?.focus({ preventScroll: true })
    targetRowRef.current?.scrollIntoView({ block: 'center' })
  }, [rowTarget])

  function showFindings(type) {
    setRowTarget(null)
    setFindingView({ type })
  }

  function closeFindings() {
    const button = findingView.type === 'conflict' ? conflictButtonRef : unmetButtonRef
    setFindingView(null)
    button.current?.focus()
  }

  async function runCheck() {
    setRunning(true); setResult(null); setError(''); setFindingView(null); setRowTarget(null)
    try {
      const [manifest, tickets] = await Promise.all([parseManifestWorkbook(manifestFile), parseTicketPdfs(ticketFiles)])
      const comparison = compareSeatAssignments({ manifestTravelers: manifest, ticketData: tickets })
      const statuses = seatComparisonSummary(comparison)
      const unmatchedSubmitted = new Set(comparison.rows.filter((row) => row.status === 'unmatched').map((row) => row.traveler)).size
      setResult({ ...comparison, manifestTravelers: manifest, ticketData: tickets, layoutSections: {}, flights: tickets.flights, summary: { submitted: manifest.length, ticketed: tickets.travelers.length, flights: tickets.flights.length, requestsUnmet: statuses['request-unmet'] ?? 0, conflicts: statuses.conflict ?? 0, unresolved: statuses.unresolved ?? 0, unassigned: statuses.unassigned ?? 0, unmatched: unmatchedSubmitted + comparison.unmatchedTickets.length } }); setActiveFlight(0)
    } catch (caught) {
      setResult(null); setError(caught instanceof Error ? caught.message : 'Quality Check could not read those files.')
    } finally { setRunning(false) }
  }

  return <section className="quality-check" aria-labelledby="quality-check-title">
    <div className="quality-check-heading"><p className="eyebrow">Quality Check</p><h2 id="quality-check-title">Inspect the packed tin.</h2><p>Compare the names you sent with the tickets that came back. Make sure every fish landed in the right seat.</p></div>
    <div className="quality-check-inputs">
      <label><span>1 · Submitted name list</span><small>Passenger workbook · .xlsx</small><input type="file" accept=".xlsx" disabled={running} onChange={(event) => { setManifestFile(event.target.files?.[0] ?? null); setResult(null); setError('') }} /><strong className={`${manifestFile ? '' : 'file-picker '}quality-check-file-choice ${manifestFile ? 'is-selected' : ''}`}>{manifestFile ? `✓ ${manifestFile.name}` : 'Choose passenger workbook'}</strong></label>
      <label><span>2 · Returned ticket documents</span><small>Ticket PDFs · one or more</small><input type="file" accept="application/pdf,.pdf" multiple disabled={running} onChange={(event) => { setTicketFiles([...(event.target.files || [])]); setResult(null); setError('') }} /><strong className={`${ticketFiles.length ? '' : 'file-picker '}quality-check-file-choice ${ticketFiles.length ? 'is-selected' : ''}`}>{ticketFiles.length ? `✓ ${ticketFiles.map((file) => file.name).join(', ')}` : 'Choose returned ticket PDFs'}</strong></label>
      <button type="button" disabled={!manifestFile || !ticketFiles.length || running} onClick={runCheck}>{running ? 'Checking…' : 'Inspect the Tin'}</button>
    </div>
    {error && <p className="quality-check-error" role="alert">{error}</p>}
    {result && <div className="quality-check-results">
      <div className="quality-check-summary" aria-label="Quality Check totals">
        <span><strong>{result.summary.submitted}</strong> submitted</span><span><strong>{result.summary.ticketed}</strong> ticketed</span><span><strong>{result.summary.flights}</strong> flights</span>
        <button type="button" ref={unmetButtonRef} className={result.summary.requestsUnmet ? 'is-problem' : ''} disabled={!result.summary.requestsUnmet} aria-controls="quality-check-findings" aria-expanded={findingView?.type === 'request-unmet'} onClick={() => showFindings('request-unmet')}><strong>{result.summary.requestsUnmet}</strong> unmet requests</button>
        <button type="button" ref={conflictButtonRef} className={conflicts.length ? 'is-problem' : ''} disabled={!conflicts.length} aria-controls="quality-check-findings" aria-expanded={findingView?.type === 'conflict'} onClick={() => showFindings('conflict')}><strong>{conflicts.length}</strong> seat conflicts</button>
        <span className={result.summary.unassigned ? 'is-problem' : ''}><strong>{result.summary.unassigned}</strong> unassigned</span><span className={result.summary.unmatched ? 'is-problem' : ''}><strong>{result.summary.unmatched}</strong> unmatched</span>
      </div>
      {findingView && <QualityCheckFindings type={findingView.type} findings={findings} panelRef={findingsRef} onSelect={(row) => { setActiveFlight(row.flightIndex); setRowTarget({ row }) }} onClose={closeFindings} />}
      <TicketEvidencePanel result={result} />
      <div className="quality-check-flight-tabs" role="tablist" aria-label="Actual flights">{result.flights.map((flight, index) => <button key={`${flight.flightNumber}-${index}`} type="button" role="tab" aria-selected={activeFlight === index} className={activeFlight === index ? 'active' : ''} onClick={() => setActiveFlight(index)}><strong>{flight.departureAirport} → {flight.arrivalAirport}</strong><span>{flight.airline} {flight.flightNumber} · {flight.departureDate || 'Date unconfirmed'}</span></button>)}</div>
      {activeMap && <SeatLayoutEditor map={activeMap} onApply={(sections) => {
        setFindingView(null); setRowTarget(null)
        setResult((current) => {
          const layoutSections = { ...current.layoutSections, [activeFlight]: sections }
          const comparison = compareSeatAssignments({ manifestTravelers: current.manifestTravelers, ticketData: current.ticketData, layoutSections })
          const statuses = seatComparisonSummary(comparison)
          return { ...current, ...comparison, layoutSections, summary: { ...current.summary, requestsUnmet: statuses['request-unmet'] ?? 0 } }
        })
      }} />}
      {activeMap && <SeatMap map={activeMap} />}
      {activeMap?.outsideDiagram.length > 0 && <section className="quality-check-evidence"><h3>Ticketed seats that do not fit the layout</h3><p>These assignments are retained. Review the section row ranges and seat letters.</p><ul>{activeMap.outsideDiagram.map((row, index) => <li key={index}><strong>{row.seat} · {row.traveler.displayName}</strong> — {row.message}</li>)}</ul></section>}
      {activeMisses.length > 0 && <section className="quality-check-missed"><h3>Requests that missed the mark</h3><ul>{activeMisses.map((item) => <li key={`${item.traveler}-${item.seat}`}><strong>{item.traveler} · {item.seat}</strong><span>{item.reason}</span></li>)}</ul></section>}
      <div className="quality-check-table-wrap"><table className="quality-check-table"><thead><tr><th>Traveler</th><th>Submitted request</th><th>Assigned seat</th><th>Quality Check</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.traveler.id}-${row.flightIndex}-${index}`} ref={rowTarget?.row === row ? targetRowRef : null} tabIndex={-1} className={`status-${row.status}${rowTarget?.row === row ? ' is-target' : ''}`}><td><strong>{row.traveler.displayName}</strong>{row.ticket?.ticketNumber && <small>Ticket ending {row.ticket.ticketNumber.slice(-4)}</small>}</td><td>{row.traveler.requests || '—'}</td><td><strong>{row.seat || (row.status === 'unresolved' ? 'Not interpreted' : '—')}</strong></td><td>{labels[row.status] ?? row.status}<small>{row.message}</small>{row.sources?.length > 0 && <small>{[...new Set(row.sources.map((source) => `${source.document} · p. ${source.page}`))].join('; ')}</small>}</td></tr>)}</tbody></table></div>
      {result.unmatchedTickets.length > 0 && <section className="quality-check-unmatched"><h3>Returned tickets not found on the submitted manifest</h3><ul>{result.unmatchedTickets.map((traveler) => <li key={traveler.ticketNumber}>{traveler.displayName || traveler.ticketName}</li>)}</ul></section>}
      <div className="quality-check-export"><button type="button" onClick={() => downloadQualityCheckWorkbook(result)}>Export the Inspected Tin</button><span>Downloads flight maps, Review, Legend, and source Evidence. Critical conflicts remain flagged.</span></div>
      <p className="quality-check-note">Sardines can count the fish and read their seat labels. Judging every window, aisle, and neighbor request still requires a trustworthy map of the tin.</p>
    </div>}
  </section>
}
