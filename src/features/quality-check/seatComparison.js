import { matchingTickets, normalizedTicketName, normalizedTicketNumber, ticketAssignments, ticketFlightIndexes } from './ticketMatching.js'
import { layoutSectionsForSeats, sectionForSeat } from './layoutSections.js'

const clean = (value) => String(value ?? '').trim()
function requestKind(requests) {
  const text = clean(requests)
  if (!text) return 'none'
  if (/\b(?:seat|aisle|window|next to|near|across from|together)\b/i.test(text)) return 'seat'
  return 'non-seat'
}

function requestedSeatPosition(request, traveler) {
  const text = clean(request)
  const fullName = clean(traveler?.displayName)
  if (fullName) {
    const start = text.toUpperCase().indexOf(fullName.toUpperCase())
    if (start >= 0) {
      const ownClause = text.slice(start + fullName.length).split(/[.;|]/, 1)[0]
      const ownPosition = ownClause.match(/\b(aisle|window|middle)\b/i)?.[1]
      if (ownPosition) return ownPosition.toLowerCase()
    }
  }
  return text.match(/\b(aisle|window|middle)\b/i)?.[1]?.toLowerCase()
}

export function compareSeatAssignments({ manifestTravelers, ticketData, layoutSections = {} }) {
  const matchedTickets = new Set()
  const rows = []
  const issues = [...(ticketData.issues || [])]
  const seen = new Map()
  manifestTravelers.forEach((traveler) => {
    const tickets = matchingTickets(traveler, ticketData)
    if (!tickets.length) {
      rows.push({ traveler, ticket: null, flight: { label: 'Unknown itinerary' }, flightIndex: null, seat: '', status: 'unmatched', message: 'Traveler could not be uniquely matched to a returned ticket. No flight or seat has been inferred.', sources: [] })
      return
    }
    for (const ticket of tickets) {
      matchedTickets.add(ticket)
      const unresolved = ticket.associationStatus === 'unresolved'
      const assignments = unresolved
        ? ticketFlightIndexes(ticket, ticketData).map((flightIndex) => ({ flightIndex, seat: '', sources: ticket.sources }))
        : [...ticketAssignments(ticket, ticketData)]
      if (ticket.associationStatus === 'partially-unresolved') {
        for (const flightIndex of ticketFlightIndexes(ticket, ticketData)) {
          if (!assignments.some((assignment) => assignment.flightIndex === flightIndex)) assignments.push({ flightIndex, seat: '', sources: ticket.sources, unresolved: true })
        }
      }
      if (!assignments.length) assignments.push({ flightIndex: null, seat: '', sources: ticket.sources })
      for (const assignment of assignments) {
        const flightIndex = assignment.flightIndex
        const flight = ticketData.flights[flightIndex] || { label: 'Unknown itinerary' }
        const seat = normalizeSeatLabel(assignment.seat)
        const identity = `${normalizedTicketNumber(ticket.ticketNumber)}:${normalizedTicketName(ticket.ticketName)}`
        const key = identity + ':' + flightIndex + ':' + seat
        if (seen.has(key)) continue
        const kind = requestKind(traveler.requests)
        let status = 'no-request'
        let message = 'No seat request was submitted.'
        if (unresolved || assignment.unresolved || flightIndex === null) {
          status = 'unresolved'
          message = 'Passenger or seat-to-flight evidence needs review. The source values have been retained; an unreadable assignment is not an unassigned seat.'
        } else if (!seat) {
          status = 'unassigned'
          message = 'No advance seat was returned for this flight.'
        } else if (kind === 'seat') {
          status = 'verify'
          message = 'Seat assigned; request needs layout or companion review.'
        } else if (kind === 'non-seat') {
          status = 'unable-to-verify'
          message = 'This request cannot be verified from a seat assignment.'
        }
        const interpretationUncertain = ticket.associationStatus === 'partially-unresolved'
        if (interpretationUncertain && seat) { status = 'verify'; message = 'This established seat is retained, but additional source evidence needs review.' }
        const row = { traveler, ticket, flight, flightIndex, seat, status, message, interpretationUncertain, sources: assignment.sources || ticket.sources || [] }
        seen.set(key, row)
        rows.push(row)
      }
    }
  })

  const unmatchedTickets = ticketData.travelers.filter((traveler) => !matchedTickets.has(traveler))
  ticketData.flights.forEach((flight, flightIndex) => {
    const seatOwners = new Map()
    rows.filter((row) => row.flightIndex === flightIndex && row.seat).forEach((row) => {
      const owners = seatOwners.get(row.seat) ?? []
      owners.push(row)
      seatOwners.set(row.seat, owners)
    })
    seatOwners.forEach((owners) => {
      if (owners.length < 2) return
      if (!issues.some((issue) => issue.code === 'duplicate-seat' && issue.flightIndex === flightIndex && issue.seat === owners[0].seat)) issues.push({
        code: 'duplicate-seat', severity: 'critical', flightIndex, seat: owners[0].seat,
        message: `CRITICAL: ${owners[0].seat} is assigned to ${owners.length} travelers on ${flight.label}: ${owners.map((owner) => owner.traveler.displayName).join('; ')}. Verify with the ticket provider.`, sources: owners.flatMap((owner) => owner.sources || []),
      })
      owners.forEach((row) => {
        row.status = 'conflict'
        row.message = `CRITICAL: ${row.seat} is assigned to ${owners.length} travelers on ${flight.label}: ${owners.map((owner) => owner.traveler.displayName).join('; ')}. Verify with the ticket provider.`
      })
    })
  })

  // Parser conflicts include returned-only travelers and competing seats for one
  // passenger, so they must not depend on successful manifest matching.
  rows.forEach((row) => {
    const critical = issues.find((issue) => issue.severity === 'critical' && ((issue.flightIndex === row.flightIndex &&
      (issue.seat === row.seat || issue.ticketName === row.ticket?.ticketName)) || issue.ticketNames?.includes(row.ticket?.ticketName)))
    if (critical) { row.status = 'conflict'; row.message = critical.message }
  })

  ticketData.flights.forEach((flight, flightIndex) => {
    const flightRows = rows.filter((row) => row.flightIndex === flightIndex)
    const layout = inferSeatLayout(flightRows.map((row) => row.seat).filter(Boolean))
    const sections = layoutSectionsForSeats(flightRows.map((row) => row.seat).filter(Boolean), layoutSections[flightIndex] || [])
    const occupiedRows = flightRows.map((row) => Number.parseInt(row.seat, 10)).filter(Number.isFinite)
    const foremostRow = Math.min(...occupiedRows)
    flightRows.forEach((row) => {
      if (row.status !== 'verify' || row.interpretationUncertain) return
      const request = clean(row.traveler.requests)
      const checks = []
      const section = sectionForSeat(sections, row.seat)
      const rowLayout = section?.layout || layout
      const reviewed = section?.confirmed && rowLayout.flat().includes(row.seat.match(/[A-Z]+$/i)?.[0])
      const requestedPosition = requestedSeatPosition(request, row.traveler)
      if (requestedPosition) checks.push({ label: `${requestedPosition} seat`, passed: seatPosition(row.seat, rowLayout) === requestedPosition, uncertain: ticketData.schemaVersion === 2 && !reviewed })
      if (/\b(?:furthest|as far as possible)\s+forward\b/i.test(request)) checks.push({ label: 'furthest forward', passed: Number.parseInt(row.seat, 10) === foremostRow, uncertain: ticketData.schemaVersion === 2 })
      const companionText = request.match(/\bnext to\s+([^;,.|]+)/i)?.[1]
      // Shared comments can describe another person's request to sit next to
      // this traveler. That clause is not this traveler's companion requirement.
      const namesSelf = companionText && normalizedTicketName(companionText) === normalizedTicketName(row.traveler.displayName)
      if (companionText && !namesSelf) {
        const tokens = companionText.toUpperCase().match(/[A-Z]+/g) ?? []
        const candidates = tokens.length ? flightRows.filter((candidate) => candidate !== row && tokens.every((token) => candidate.traveler.displayName.toUpperCase().includes(token))) : []
        if (candidates.length === 1) {
          const companion = candidates[0]
          const companionSection = sectionForSeat(sections, companion.seat)
          const geometryKnown = reviewed && companionSection === section && rowLayout.flat().includes(companion.seat.match(/[A-Z]+$/i)?.[0])
          const acrossAisle = seatsAreAcrossAisle(row.seat, companion.seat, rowLayout)
          const sameRow = Number.parseInt(row.seat, 10) === Number.parseInt(companion.seat, 10)
          const adjacent = seatsAreAdjacent(row.seat, companion.seat, rowLayout)
          checks.push({
            label: acrossAisle ? `across the aisle from ${companion.traveler.displayName}` : `next to ${companion.traveler.displayName}`,
            passed: adjacent || acrossAisle,
            review: acrossAisle,
            uncertain: sameRow && (ticketData.schemaVersion === 2 ? !geometryKnown : !adjacent && !acrossAisle),
          })
        } else {
          checks.push({
            label: `next to ${companionText}`, passed: false, uncertain: true,
            uncertainty: candidates.length ? 'companion match is ambiguous' : 'companion could not be matched on this flight',
          })
        }
      }
      if (!checks.length) return
      const failed = checks.filter((check) => !check.passed)
      const partiallySatisfied = failed.length > 0 && failed.length < checks.length
      const layoutDependent = checks.some((check) => check.uncertain)
      row.status = failed.length === checks.length && !layoutDependent ? 'request-unmet' : partiallySatisfied || layoutDependent || checks.some((check) => check.review) ? 'verify' : 'request-satisfied'
      row.message = checks.map((check) => check.uncertain
        ? `△ ${check.label} — ${check.uncertainty || 'depends on actual seat layout'}`
        : `${check.review ? '△' : check.passed ? '✓' : '✕'} ${check.label}`).join(' · ')
    })
  })

  return { rows, unmatchedTickets, issues }
}

export function seatComparisonSummary(comparison) {
  return (comparison?.rows ?? []).reduce((summary, row) => {
    summary.total += 1
    summary[row.status] = (summary[row.status] ?? 0) + 1
    return summary
  }, { total: 0 })
}
import { inferSeatLayout, normalizeSeatLabel, seatPosition, seatsAreAcrossAisle, seatsAreAdjacent } from './seatLayout.js'
