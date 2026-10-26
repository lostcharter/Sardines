const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
const ticketPattern = /\b\d{3}-?\d{8,12}(?:-\d{2})?\b/g
const namePattern = /^([\p{L}][\p{L} .’'-]*\/[\p{L}][\p{L} .’'-]*)$/u
const seatLabel = (text) => text.match(/\b(?:Seats?(?:\s+assignments?)?|Seat\(s\)|Assigned seats?)\s*(?::|#)\s*(.*)$/i)

export function positionedLines(page, pageIndex, document) {
  const lines = []
  page.items.forEach((item, index) => {
    const text = clean(item.str)
    if (!text) return
    const atom = { text, x: item.transform?.[4] ?? 0, y: item.transform?.[5] ?? 0,
      width: item.width ?? text.length * 5, height: item.height || 10, id: `${document}:${pageIndex}:${index}`, page: pageIndex + 1, document }
    let line = lines.find((candidate) => Math.abs(candidate.y - atom.y) < 2)
    if (!line) { line = { y: atom.y, items: [] }; lines.push(line) }
    line.items.push(atom)
  })
  return lines.sort((a, b) => b.y - a.y).map((line) => {
    line.items.sort((a, b) => a.x - b.x)
    return { ...line, page: pageIndex + 1, text: line.items.map((item) => item.text).join(' '), source: sourceFor(line.items) }
  })
}

export function sourceFor(items) {
  const first = items[0]
  const x = Math.min(...items.map((item) => item.x))
  const y = Math.min(...items.map((item) => item.y))
  return { document: first.document, page: first.page, x, y,
    width: Math.max(...items.map((item) => item.x + item.width)) - x,
    height: Math.max(...items.map((item) => item.y + item.height)) - y,
    text: items.map((item) => item.text).join(' ') }
}

export function recordFromText(text) {
  const labeled = text.match(/^(?:Record|PNR|Booking(?:\s+(?:reference|record))?)\s*:?\s*([A-Z0-9]{4,}(?:\s*[·•/,]\s*[A-Z0-9]{4,})*)\s*(?:\/|[·•])?\s*(?:Passengers?\s*:?\s*(\d+))?$/i)
  if (labeled) return { key: labeled[1].toUpperCase().replace(/\s*[·•/,]\s*/g, ' · '), carrier: '', passengerCount: labeled[2] ? Number(labeled[2]) : null }
  const standard = text.match(/^([A-Z0-9]{4,8}(?:\s*[·•]\s*[A-Z0-9]{4,8})*)\s+([A-Z][A-Z0-9]|[0-9][A-Z])(?:\s*[·•]\s*(\d+)\s+Passengers?)?$/i)
  return standard ? { key: standard[1].toUpperCase().replace(/\s*[·•]\s*/g, ' · '), carrier: standard[2].toUpperCase(), passengerCount: standard[3] ? Number(standard[3]) : null } : null
}

function nameFromAtom(atom) {
  return clean(atom.text.replace(ticketPattern, '').replace(/^(?:Passenger(?: name)?|Traveler(?: name)?|Name)\s*:\s*/i, '')).match(namePattern)?.[1] ?? ''
}

function readSeats(lines) {
  const lists = []
  const sources = []
  let collecting = false
  for (const line of lines) {
    const text = clean(line.text.replace(ticketPattern, ''))
    const label = seatLabel(text)
    if (label) { lists.push(label[1]); sources.push(line.source); collecting = true; continue }
    if (collecting && /^(?:\d{1,3}[A-Z]{1,2}|[-–—]|N\/?A|pending|not assigned)(?:\s*,?\s*(?:\d{1,3}[A-Z]{1,2}|[-–—]|N\/?A|pending|not assigned))*\s*,?$/i.test(text)) {
      lists[lists.length - 1] += ` ${text}`
      sources.push(line.source)
    } else if (text) collecting = false
  }
  return { lists, sources }
}

// Passenger names define local cells. Their neighboring names define columns;
// there is no fixed midpoint, and names/tickets need not share a text line.
export function passengersFromLines(lines) {
  const atoms = lines.flatMap((line) => line.items)
  const anchors = atoms.filter((atom) => nameFromAtom(atom)).map((atom) => ({ ...atom, name: nameFromAtom(atom) }))
  const usedTickets = new Set()
  const travelers = anchors.map((anchor) => {
    const peers = anchors.filter((other) => other.page === anchor.page)
    const right = Math.min(Infinity, ...peers.filter((other) => other.x > anchor.x + 30).map((other) => other.x))
    const next = anchors.filter((other) => Math.abs(other.x - anchor.x) < 25 &&
      (other.page > anchor.page || (other.page === anchor.page && other.y < anchor.y - 2)))
      .sort((a, b) => a.page - b.page || b.y - a.y)[0]
    const cell = atoms.filter((atom) => atom.x >= anchor.x - 3 && atom.x < right - 3 &&
      (atom.page > anchor.page || (atom.page === anchor.page && atom.y <= anchor.y + 2)) &&
      (!next || atom.page < next.page || (atom.page === next.page && atom.y > next.y + 2)))
      .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
    // Reconstitute lines only within this passenger cell; neighboring ticket
    // numbers and seat lists can never be borrowed from another name column.
    const cellLines = []
    for (const atom of cell) {
      let line = cellLines.find((line) => line.page === atom.page && Math.abs(line.y - atom.y) < 2)
      if (!line) { line = { page: atom.page, y: atom.y, items: [] }; cellLines.push(line) }
      line.items.push(atom)
    }
    const grouped = cellLines.map((line) => ({ ...line, text: line.items.sort((a, b) => a.x - b.x).map((atom) => atom.text).join(' '), source: sourceFor(line.items) }))
    let ticketName = anchor.name
    const nameAtoms = [anchor]
    for (const atom of cell) {
      if (atom.id === anchor.id || atom.page !== anchor.page || atom.y > anchor.y - 2) continue
      if (seatLabel(atom.text)) break
      const continuation = clean(atom.text.replace(ticketPattern, ''))
      if (anchor.y - atom.y < Math.max(26, anchor.height * 3) && Math.abs(atom.x - anchor.x) < 15 && /^[\p{L} .’'-]+$/u.test(continuation) && !/^(?:passenger|ticket|page|terminal)\b/i.test(continuation)) {
        ticketName += ` ${continuation}`
        nameAtoms.push(atom)
      }
    }
    const ticketAtoms = cell.filter((atom) => [...atom.text.matchAll(ticketPattern)].length)
    ticketAtoms.forEach((atom) => usedTickets.add(atom.id))
    const ticketNumbers = [...new Set(ticketAtoms.flatMap((atom) => [...atom.text.matchAll(ticketPattern)].map((match) => match[0])))]
    const evidence = readSeats(grouped)
    const seatLists = [...new Set(evidence.lists.map(clean))]
    const rawSeats = seatLists.length === 1 ? seatLists[0].split(/\s*,\s*/).map(clean).filter((seat, index, array) => seat || index < array.length - 1) : []
    const seats = rawSeats.map((seat) => /^\d{1,3}[A-Z]{1,2}$/i.test(seat) ? seat.toUpperCase().replace(/^0+(?=\d)/, '') : '')
    const problems = []
    if (ticketNumbers.length !== 1) problems.push(ticketNumbers.length ? 'ambiguous-ticket' : 'missing-ticket')
    if (seatLists.length > 1) problems.push('ambiguous-seats')
    if (rawSeats.some((seat) => seat && !/^(?:\d{1,3}[A-Z]{1,2}|[-–—]|N\/?A|pending|not assigned)$/i.test(seat))) problems.push('unreadable-seat')
    return { ticketName: clean(ticketName).toUpperCase(), ticketNumber: ticketNumbers.length === 1 ? ticketNumbers[0] : '', ticketCandidates: ticketNumbers,
      seats, rawSeats, seatEvidence: evidence.lists, problems,
      sources: [...nameAtoms.map((atom) => sourceFor([atom])), ...ticketAtoms.map((atom) => sourceFor([atom])), ...evidence.sources],
      seatSources: evidence.sources }
  })
  const unclaimed = atoms.filter((atom) => !usedTickets.has(atom.id) && [...atom.text.matchAll(ticketPattern)].length)
  // Preserve orphan seat lists as evidence even if no passenger name was readable.
  const covered = (atom, sources) => sources.some((source) => source.page === atom.page && Math.abs(source.y - atom.y) < 2 && atom.x >= source.x - 2 && atom.x < source.x + source.width + 2)
  const assignedSources = travelers.flatMap((traveler) => traveler.seatSources)
  const labels = atoms.filter((atom) => seatLabel(atom.text))
  const orphanSeats = labels.filter((atom) => !covered(atom, assignedSources)).map((atom) => {
    const row = lines.find((line) => line.page === atom.page && Math.abs(line.y - atom.y) < 2)
    const right = Math.min(Infinity, ...labels.filter((label) => label.page === atom.page && Math.abs(label.y - atom.y) < 2 && label.x > atom.x).map((label) => label.x))
    return sourceFor(row.items.filter((item) => item.x >= atom.x && item.x < right))
  })
  for (const atom of atoms) {
    if (/^\d{1,3}[A-Z]{1,2}(?:\s*,\s*\d{1,3}[A-Z]{1,2})*\s*,?$/i.test(atom.text) && !covered(atom, [...assignedSources, ...orphanSeats])) orphanSeats.push(sourceFor([atom]))
  }
  return { travelers, unclaimed: unclaimed.map((atom) => sourceFor([atom])), orphanSeats }
}
