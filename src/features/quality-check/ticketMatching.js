const normalize = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export const normalizedTicketNumber = (value) => String(value ?? '').replace(/-\d{2}$/, '').replace(/\D/g, '')
export const normalizedTicketName = (value) => String(value ?? '').split('/').map(normalize).join('/')
function firstLast(value) {
  const [last = '', given = ''] = String(value ?? '').toUpperCase().split('/', 2)
  return `${normalize(last)}:${normalize(given.match(/[A-Z0-9]+/)?.[0])}`
}

function compatibleMiddleNames(left, right) {
  const middle = (value) => String(value ?? '').toUpperCase().split('/')[1]?.match(/[A-Z0-9]+/g)?.slice(1) || []
  const a = middle(left)
  const b = middle(right)
  return !a.length || !b.length || (a.length === b.length && a.every((part, index) => part === b[index] || (part.length === 1 || b[index].length === 1) && part[0] === b[index][0]))
}

export function ticketFlightIndexes(ticket, data) {
  if (ticket.flightIndexes?.length) return ticket.flightIndexes
  if (data.schemaVersion === 2) return []
  // Compatibility for earlier programmatic inputs which predate explicit indexes.
  return data.records?.[ticket.recordIndex]?.flightIndexes || data.flights.map((_, index) => index)
}

export function matchingTickets(traveler, data) {
  const exact = data.travelers.filter((ticket) => normalizedTicketName(ticket.ticketName) === normalizedTicketName(traveler.ticketName))
  const broad = data.travelers.filter((ticket) => firstLast(ticket.ticketName) === firstLast(traveler.ticketName) && compatibleMiddleNames(ticket.ticketName, traveler.ticketName))
  if (broad.length === 1) return broad
  // A unique traveler can have distinct outbound/return tickets. Overlapping
  // itineraries for similar names are ambiguous, regardless of PNR display order.
  const occupied = new Set()
  let disjoint = true
  for (const ticket of broad) {
    for (const index of ticketFlightIndexes(ticket, data)) {
      if (occupied.has(index)) disjoint = false
      occupied.add(index)
    }
  }
  if (broad.length && disjoint) return broad
  return exact.length === 1 ? exact : []
}

export function ticketAssignments(ticket, data) {
  if (ticket.assignments) return ticket.assignments
  return ticketFlightIndexes(ticket, data).map((flightIndex, index) => ({ flightIndex, seat: ticket.seats?.[index] ?? '', sources: ticket.sources || [] }))
}
