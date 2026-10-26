import { flightsFromPositionedLines, physicalFlightKey, tripStartFromLines } from './ticketFlightParser.js'
import { passengersFromLines, positionedLines, recordFromText } from './ticketPdfLayout.js'
import { normalizedTicketName, normalizedTicketNumber } from './ticketMatching.js'

const issueMessages = {
  'ambiguous-ticket': 'More than one ticket number was found in this passenger cell. Ownership needs review.',
  'missing-ticket': 'The passenger name was read, but its ticket number could not be established.',
  'ambiguous-seats': 'Multiple different seat lists were found for this passenger. No list was selected.',
  'unreadable-seat': 'A seat value could not be interpreted. Its original evidence has been preserved.',
}

export function ticketDataFromDocuments(documents) {
  const records = []
  const flights = []
  const travelers = []
  const issues = []
  const flightByIdentity = new Map()
  const ticketByIdentity = new Map()

  for (const [documentIndex, document] of documents.entries()) {
    const name = document.name || `Ticket document ${documentIndex + 1}`
    const lines = document.pages.flatMap((page, index) => positionedLines(page, index, name))
    if (!lines.length) issues.push({ code: 'unreadable-document', severity: 'review', message: `${name}: no readable PDF text was found. This is not evidence of an empty passenger list.`, sources: [] })
    const countBefore = travelers.length
    const tripStart = tripStartFromLines(lines)
    const blocks = []
    let block = { header: null, lines: [] }
    blocks.push(block)
    for (const line of lines) {
      const header = recordFromText(line.text)
      if (header) { block = { header, lines: [], source: line.source }; blocks.push(block) }
      else block.lines.push(line)
    }
    const recordByKey = new Map()
    for (const section of blocks) {
      const parsed = passengersFromLines(section.lines)
      const flightEvidence = flightsFromPositionedLines(section.lines, tripStart)
      const segments = flightEvidence.flights
      issues.push(...flightEvidence.issues)
      if (!section.header && !parsed.travelers.length && !segments.length && !parsed.unclaimed.length && !parsed.orphanSeats.length) continue
      const key = section.header?.key || `Unidentified itinerary ${records.length + 1}`
      let record = recordByKey.get(key)
      if (!record) {
        record = { ...(section.header || { key, carrier: '', passengerCount: null }), recordIndex: records.length,
          pageIndex: (section.source?.page ?? section.lines[0]?.page ?? 1) - 1, y: section.source?.y ?? 0,
          flightIndexes: [], travelers: [], sources: section.source ? [section.source] : [] }
        records.push(record)
        recordByKey.set(key, record)
      } else if (section.source) record.sources.push(section.source)
      section.record = record
      section.flightIndexes = []
      for (const segment of segments) {
        const identity = physicalFlightKey(segment)
        let flightIndex = identity ? flightByIdentity.get(identity) : undefined
        if (flightIndex === undefined) {
          flightIndex = flights.length
          flights.push({ ...segment, recordKey: record.key, recordIndex: record.recordIndex, recordIndexes: [record.recordIndex], identityUncertain: !identity })
          if (identity) flightByIdentity.set(identity, flightIndex)
        } else {
          if (flights[flightIndex].departureTime && segment.departureTime && flights[flightIndex].departureTime !== segment.departureTime) issues.push({ code: 'conflicting-flight-time', severity: 'review', flightIndex,
            message: `Different departure times were reported for ${segment.label} ${segment.flightNumber} on ${segment.departureDate}.`, sources: [...flights[flightIndex].sources, ...segment.sources] })
          flights[flightIndex].sources.push(...segment.sources)
          if (!flights[flightIndex].recordIndexes.includes(record.recordIndex)) flights[flightIndex].recordIndexes.push(record.recordIndex)
        }
        // Preserve itinerary order; the same physical flight may be shared by records.
        if (!section.flightIndexes.includes(flightIndex)) section.flightIndexes.push(flightIndex)
        if (!record.flightIndexes.includes(flightIndex)) record.flightIndexes.push(flightIndex)
      }
      section.parsed = parsed
      for (const source of [...parsed.unclaimed, ...parsed.orphanSeats]) {
        issues.push({ code: 'unassociated-evidence', severity: 'review', message: 'Ticket or seat evidence could not be associated with a passenger. It has not been discarded.', sources: [source] })
      }
    }

    // Finish all itineraries before assigning passengers: return flights may be
    // on a later page, after the passenger section.
    for (const section of blocks.filter((section) => section.record)) {
      const record = section.record
      const indexes = section.flightIndexes.length ? section.flightIndexes : record.flightIndexes
      for (const person of section.parsed.travelers) {
        const problems = [...person.problems]
        if (!indexes.length) problems.push('missing-itinerary')
        if (!person.seatEvidence.length) problems.push('missing-seat-evidence')
        if (person.seatEvidence.length && person.seats.length !== indexes.length) problems.push('seat-count-mismatch')
        const ambiguous = problems.some((problem) => ['ambiguous-ticket', 'ambiguous-seats', 'unreadable-seat', 'missing-itinerary', 'missing-seat-evidence', 'seat-count-mismatch'].includes(problem))
        const candidate = { ...person, problems, recordKey: record.key, recordIndex: record.recordIndex,
          recordIndexes: [record.recordIndex], flightIndexes: [...indexes], associationStatus: ambiguous ? 'unresolved' : 'associated',
          unresolvedEvidence: ambiguous ? [{ seats: person.seats, rawSeats: person.rawSeats, sources: person.sources }] : [],
          assignments: ambiguous ? [] : indexes.map((flightIndex, index) => ({ flightIndex, seat: person.seats[index] ?? '', rawSeat: person.rawSeats[index] ?? '', sources: [...person.seatSources] })) }
        // A repeated document is evidence for the same ticket, not a new passenger.
        // Different names/ticket numbers are never collapsed by extraction order.
        const identity = person.ticketNumber ? `${normalizedTicketNumber(person.ticketNumber)}:${normalizedTicketName(person.ticketName)}` : ''
        const existing = identity ? ticketByIdentity.get(identity) : undefined
        let traveler = candidate
        if (existing) {
          traveler = existing
          traveler.sources.push(...candidate.sources)
          traveler.recordIndexes = [...new Set([...traveler.recordIndexes, record.recordIndex])]
          traveler.flightIndexes = [...new Set([...traveler.flightIndexes, ...indexes])]
          for (const assignment of candidate.assignments) {
            const previous = traveler.assignments.find((item) => item.flightIndex === assignment.flightIndex && item.seat === assignment.seat)
            if (previous) previous.sources.push(...assignment.sources)
            else traveler.assignments.push(assignment)
          }
          traveler.problems = [...new Set([...traveler.problems, ...problems])]
          traveler.unresolvedEvidence.push(...candidate.unresolvedEvidence)
          traveler.associationStatus = traveler.unresolvedEvidence.length ? (traveler.assignments.length ? 'partially-unresolved' : 'unresolved') : 'associated'
          // Keep legacy seat arrays aligned only if ownership per flight is unique.
          traveler.seats = traveler.flightIndexes.map((index) => traveler.assignments.find((item) => item.flightIndex === index)?.seat ?? '')
        } else {
          travelers.push(traveler)
          if (identity) ticketByIdentity.set(identity, traveler)
        }
        if (!record.travelers.includes(traveler)) record.travelers.push(traveler)
        for (const code of problems) issues.push({ code, severity: 'review', ticketName: person.ticketName,
          message: issueMessages[code] || (code === 'missing-itinerary' ? 'No flight itinerary could be established for this passenger.' : code === 'missing-seat-evidence' ? 'No seat field could be interpreted for this passenger. This is not confirmation of an unassigned seat.' : 'The number of seat values differs from the itinerary. Seat-to-flight ownership needs review.'), sources: person.sources })
      }
    }
    if (lines.length && travelers.length === countBefore && !blocks.some((section) => section.parsed?.travelers.length)) {
      issues.push({ code: 'uninterpreted-document', severity: 'review', message: `${name}: no passenger identities could be established. Review the original document.`, sources: [] })
    }
  }

  for (const record of records) {
    if (record.passengerCount !== null && record.passengerCount !== record.travelers.length) {
      issues.push({ code: 'passenger-count-mismatch', severity: 'review', message: `Booking ${record.key} states ${record.passengerCount} passengers; ${record.travelers.length} were read.`, sources: record.sources })
    }
  }
  for (const [index, flight] of flights.entries()) {
    if (flight.identityUncertain) issues.push({ code: 'uncertain-flight-identity', severity: 'review', flightIndex: index,
      message: `The date or carrier for ${flight.label} ${flight.flightNumber} is incomplete. It has not been merged with other records.`, sources: flight.sources })
  }
  const seatOwners = new Map()
  const namesByTicket = new Map()
  for (const traveler of travelers.filter((person) => person.ticketNumber)) {
    const number = normalizedTicketNumber(traveler.ticketNumber)
    namesByTicket.set(number, [...(namesByTicket.get(number) || []), traveler])
  }
  for (const owners of namesByTicket.values()) {
    if (new Set(owners.map((owner) => owner.ticketName)).size > 1) issues.push({ code: 'conflicting-ticket-names', severity: 'critical', ticketNames: owners.map((owner) => owner.ticketName),
      message: 'The same ticket number appears under different passenger names. The records have not been merged.', sources: owners.flatMap((owner) => owner.sources) })
  }
  for (const traveler of travelers) {
    for (const assignment of traveler.assignments) {
      if (!assignment.seat) continue
      const key = `${assignment.flightIndex}:${assignment.seat}`
      const owners = seatOwners.get(key) || []
      owners.push({ traveler, assignment })
      seatOwners.set(key, owners)
    }
    const byFlight = new Map()
    traveler.assignments.forEach((assignment) => byFlight.set(assignment.flightIndex, [...(byFlight.get(assignment.flightIndex) || []), assignment]))
    for (const [flightIndex, assignments] of byFlight) {
      if (new Set(assignments.map((item) => item.seat)).size > 1) issues.push({ code: 'conflicting-passenger-seats', severity: 'critical', flightIndex, ticketName: traveler.ticketName,
        message: `${traveler.ticketName} has conflicting seats on ${flights[flightIndex].label}; all assignments are retained.`, sources: assignments.flatMap((item) => item.sources) })
    }
  }
  for (const owners of seatOwners.values()) {
    if (new Set(owners.map((owner) => owner.traveler)).size < 2) continue
    const { flightIndex, seat } = owners[0].assignment
    issues.push({ code: 'duplicate-seat', severity: 'critical', flightIndex, seat,
      message: `CRITICAL: ${seat} is assigned to ${owners.length} passengers on ${flights[flightIndex].label} ${flights[flightIndex].flightNumber}: ${owners.map((owner) => owner.traveler.ticketName).join('; ')}. Verify with the ticket provider.`,
      sources: owners.flatMap((owner) => owner.traveler.sources) })
  }
  return { schemaVersion: 2, flights, travelers, records, issues }
}
