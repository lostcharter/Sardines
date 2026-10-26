import assert from 'node:assert/strict'
import test from 'node:test'
import { ticketDataFromDocuments } from './ticketDocumentParser.js'
import { compareSeatAssignments } from './seatComparison.js'
import { calendarDate, physicalFlightKey } from './ticketFlightParser.js'

const item = (str, x, y) => ({ str, width: str.length * 4, height: 10, transform: [1, 0, 0, 1, x, y] })
function document(name, { record = 'ABC123', passenger = 'REEF/ADA IRIS', ticket = '001-1234567890', seats = '12A', date = 'Dec 06, 2026', airline = 'Sample Air', extra = [] } = {}) {
  return { name, pages: [{ width: 600, items: [
    item(`${record} ZZ · 1 Passengers`, 25, 750),
    item(`${airline} 101 DEPARTING (SEA) ${date}`, 25, 710), item('ARRIVING (JFK)', 25, 690),
    item(`${passenger} ${ticket}`, 25, 550), item(`Seats: ${seats}`, 25, 530), ...extra,
  ] }] }
}
const parse = (...documents) => ticketDataFromDocuments(documents)
const manifest = (name = 'REEF/ADA IRIS') => [{ id: 'one', ticketName: name, displayName: name, requests: '', record: 'Record 99' }]

test('merges a dated physical flight across PNRs, retaining business and economy seat ownership', () => {
  const data = parse(document('one.pdf', { seats: '2C' }), document('two.pdf', { record: 'DEF456', passenger: 'SHOAL/BEN LEE', ticket: '001-1234567891', seats: '39L' }))
  assert.equal(data.flights.length, 1)
  assert.equal(data.travelers.length, 2)
  assert.deepEqual(data.travelers.map((person) => person.assignments.map((assignment) => [assignment.flightIndex, assignment.seat])), [[[0, '2C']], [[0, '39L']]])
  assert.deepEqual(data.flights[0].recordIndexes, [0, 1])
  assert.equal(physicalFlightKey(data.flights[0]), '2026-12-06:SAMPLEAIR:101:SEA:JFK')
})

test('same seat on different departure dates is not a duplicate', () => {
  const data = parse(document('one.pdf'), document('two.pdf', { passenger: 'SHOAL/BEN LEE', ticket: '001-1234567891', date: 'Dec 07, 2026' }))
  assert.equal(data.flights.length, 2)
  assert.ok(!data.issues.some((issue) => issue.severity === 'critical'))
})

test('same route on a different carrier is not merged', () => {
  const data = parse(document('one.pdf'), document('two.pdf', { airline: 'Other Air' }))
  assert.equal(data.flights.length, 2)
})

test('missing dates retain separate flight evidence with an explicit uncertainty', () => {
  const data = parse(document('one.pdf', { date: '' }), document('two.pdf', { date: '', passenger: 'SHOAL/BEN LEE', ticket: '001-1234567891' }))
  assert.equal(data.flights.length, 2)
  assert.equal(data.issues.filter((issue) => issue.code === 'uncertain-flight-identity').length, 2)
})

test('repeated documents do not duplicate passengers, seats, or physical flights', () => {
  const data = parse(document('one.pdf'), document('copy.pdf'))
  assert.equal(data.flights.length, 1)
  assert.equal(data.travelers.length, 1)
  assert.equal(data.travelers[0].assignments.length, 1)
  assert.deepEqual([...new Set(data.travelers[0].sources.map((source) => source.document))], ['one.pdf', 'copy.pdf'])
  assert.ok(data.travelers[0].sources.every((source) => source.page === 1 && Number.isFinite(source.x) && source.text))
  assert.ok(!data.issues.some((issue) => issue.code === 'duplicate-seat'))
})

test('hyphenation changes in ticket numbers and names do not duplicate the same ticket', () => {
  const data = parse(document('one.pdf', { passenger: 'REEF-SHOAL/ADA IRIS' }), document('copy.pdf', { passenger: 'REEFSHOAL/ADA IRIS', ticket: '0011234567890' }))
  assert.equal(data.travelers.length, 1)
  assert.equal(data.travelers[0].assignments.length, 1)
  assert.ok(!data.issues.some((issue) => issue.severity === 'critical'))
})

test('an unreadable duplicate source cannot erase a separately established seat', () => {
  for (const docs of [
    [document('good.pdf'), document('unclear.pdf', { seats: '12A, 14C' })],
    [document('unclear.pdf', { seats: '12A, 14C' }), document('good.pdf')],
  ]) {
    const data = parse(...docs)
    assert.equal(data.travelers[0].associationStatus, 'partially-unresolved')
    assert.equal(data.travelers[0].assignments[0].seat, '12A')
    assert.equal(data.travelers[0].unresolvedEvidence.length, 1)
    const result = compareSeatAssignments({ manifestTravelers: manifest(), ticketData: data })
    assert.equal(result.rows[0].seat, '12A')
    assert.equal(result.rows[0].status, 'verify')
  }
})

test('two different passenger names sharing one ticket number remain visible critical records', () => {
  const data = parse(document('one.pdf'), document('two.pdf', { passenger: 'SHOAL/BEN LEE', seats: '12B' }))
  assert.equal(data.travelers.length, 2)
  assert.ok(data.issues.some((issue) => issue.code === 'conflicting-ticket-names'))
  const result = compareSeatAssignments({ manifestTravelers: [...manifest(), ...manifest('SHOAL/BEN LEE')], ticketData: data })
  assert.deepEqual(result.rows.map((row) => [row.seat, row.status]), [['12A', 'conflict'], ['12B', 'conflict']])
})

test('conflicting seats for the same ticket remain separate critical evidence', () => {
  const data = parse(document('one.pdf'), document('changed.pdf', { seats: '12B' }))
  assert.deepEqual(data.travelers[0].assignments.map((assignment) => assignment.seat), ['12A', '12B'])
  assert.ok(data.issues.some((issue) => issue.code === 'conflicting-passenger-seats' && issue.severity === 'critical'))
  const result = compareSeatAssignments({ manifestTravelers: manifest(), ticketData: data })
  assert.deepEqual(result.rows.map((row) => [row.seat, row.status]), [['12A', 'conflict'], ['12B', 'conflict']])
})

test('duplicate seats are critical even when one owner does not match the manifest', () => {
  const data = parse(document('one.pdf'), document('two.pdf', { record: 'DEF456', passenger: 'SHOAL/BEN LEE', ticket: '001-1234567891' }))
  const conflict = data.issues.find((issue) => issue.code === 'duplicate-seat')
  assert.equal(conflict.severity, 'critical')
  assert.equal(conflict.seat, '12A')
  assert.match(conflict.message, /REEF\/ADA IRIS.*SHOAL\/BEN LEE/)
  const result = compareSeatAssignments({ manifestTravelers: manifest(), ticketData: data })
  assert.equal(result.rows[0].status, 'conflict')
  assert.equal(result.unmatchedTickets.length, 1)
})

test('seat-count mismatches retain raw values without guessing segment ownership', () => {
  const data = parse(document('one.pdf', { seats: '12A, 14C' }))
  assert.equal(data.travelers[0].associationStatus, 'unresolved')
  assert.deepEqual(data.travelers[0].seats, ['12A', '14C'])
  assert.deepEqual(data.travelers[0].assignments, [])
  const result = compareSeatAssignments({ manifestTravelers: manifest(), ticketData: data })
  assert.equal(result.rows[0].status, 'unresolved')
  assert.ok(data.issues.some((issue) => issue.code === 'seat-count-mismatch' && issue.sources.length))
})

test('multiple candidate ticket numbers in a passenger cell are not silently selected', () => {
  const data = parse(document('one.pdf', { extra: [item('001-1234567891', 400, 550)] }))
  assert.equal(data.travelers[0].ticketNumber, '')
  assert.equal(data.travelers[0].ticketCandidates.length, 2)
  assert.equal(data.travelers[0].associationStatus, 'unresolved')
})

test('unrecognized seat tokens survive as raw evidence and require review', () => {
  const data = parse(document('one.pdf', { seats: 'seat illegible' }))
  assert.deepEqual(data.travelers[0].rawSeats, ['seat illegible'])
  assert.equal(data.travelers[0].associationStatus, 'unresolved')
})

test('explicit unassigned placeholder retains its position in a multi-flight seat list', () => {
  const doc = document('one.pdf', { seats: 'N/A, 14C', extra: [item('Sample Air 102 DEPARTING (JFK) Dec 15, 2026', 25, 670), item('ARRIVING (SEA)', 25, 650)] })
  const data = parse(doc)
  assert.deepEqual(data.travelers[0].assignments.map((assignment) => [assignment.flightIndex, assignment.seat]), [[0, ''], [1, '14C']])
  assert.equal(data.travelers[0].associationStatus, 'associated')
})

test('a missing seat field is not interpreted as confirmation of no assigned seat', () => {
  const doc = document('one.pdf')
  doc.pages[0].items = doc.pages[0].items.filter((atom) => !atom.str.startsWith('Seats:'))
  const data = parse(doc)
  assert.equal(compareSeatAssignments({ manifestTravelers: manifest(), ticketData: data }).rows[0].status, 'unresolved')
  assert.ok(data.issues.some((issue) => issue.code === 'missing-seat-evidence'))
})

test('orphan ticket and seat evidence is retained when the passenger name cannot be read', () => {
  const doc = document('one.pdf', { passenger: '[illegible passenger]' })
  const data = parse(doc)
  assert.equal(data.travelers.length, 0)
  assert.ok(data.issues.some((issue) => issue.code === 'unassociated-evidence' && issue.sources.some((source) => source.text.includes('001-1234567890'))))
  assert.ok(data.issues.some((issue) => issue.code === 'uninterpreted-document'))
})

test('a known seat list in one column cannot hide orphan seat evidence in another', () => {
  const doc = document('one.pdf', { extra: [
    item('Seats:', 325, 530), item('14C', 360, 530),
    item('SHOAL/BEN LEE 001-1234567891', 325, 500), item('Seats: 15C', 325, 480),
  ] })
  const data = parse(doc)
  assert.ok(data.issues.some((issue) => issue.code === 'unassociated-evidence' && issue.sources.some((source) => source.text.includes('14C'))))
  assert.equal(data.travelers[0].assignments[0].seat, '12A')
})

test('unmatched manifest travelers do not acquire every flight in the ticket document', () => {
  const data = parse(document('one.pdf'))
  const result = compareSeatAssignments({ manifestTravelers: manifest('UNMATCHED/TEST PERSON'), ticketData: data })
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].flightIndex, null)
  assert.equal(result.rows[0].status, 'unmatched')
})

test('matching ignores unrelated manifest record display order', () => {
  const data = parse(document('one.pdf'))
  const result = compareSeatAssignments({ manifestTravelers: manifest(), ticketData: data })
  assert.equal(result.rows[0].seat, '12A')
})

test('an incompatible full middle name prevents an otherwise unique first/last fallback', () => {
  const data = parse(document('one.pdf'))
  assert.equal(compareSeatAssignments({ manifestTravelers: manifest('REEF/ADA JANE'), ticketData: data }).rows[0].status, 'unmatched')
})

test('seat position is a review item while actual cabin geometry is unknown', () => {
  const data = parse(document('one.pdf'))
  const result = compareSeatAssignments({ manifestTravelers: [{ ...manifest()[0], requests: 'Window seat' }], ticketData: data })
  assert.equal(result.rows[0].status, 'verify')
  assert.match(result.rows[0].message, /depends on actual seat layout/)
})

test('incomplete flight evidence is retained and not presented as a complete itinerary', () => {
  const doc = document('one.pdf')
  doc.pages[0].items = doc.pages[0].items.filter((atom) => !atom.str.startsWith('ARRIVING'))
  const data = parse(doc)
  assert.ok(data.issues.some((issue) => issue.code === 'incomplete-flight' && issue.sources.length))
  assert.equal(data.travelers[0].associationStatus, 'unresolved')
})

test('image-only or empty PDF text does not imply an empty passenger list', () => {
  const data = parse({ name: 'scanned.pdf', pages: [{ width: 600, items: [] }] })
  assert.ok(data.issues.some((issue) => issue.code === 'unreadable-document'))
})

test('calendar dates use explicit trip context across a year boundary and reject invalid dates', () => {
  assert.equal(calendarDate('Fri Jan 02 at 10:00 AM', '2026-12-28'), '2027-01-02')
  assert.equal(calendarDate('Fri Jan 02 at 10:00 AM'), '')
  assert.equal(calendarDate('Feb 31, 2026'), '')
  assert.equal(calendarDate('2026-12-06'), '2026-12-06')
  assert.equal(calendarDate('06 December 2026'), '2026-12-06')
})

test('uppercase departure date headings and prose containing "to" are not flight labels', () => {
  const doc = document('one.pdf', { extra: [item('DEPARTURE DEC 06, 2026', 25, 780), item('Connecting your group to the world.', 25, 50)] })
  assert.ok(!parse(doc).issues.some((issue) => issue.code === 'incomplete-flight'))
})

test('codeshare identities require an explicit operating flight number', () => {
  assert.equal(physicalFlightKey({ airline: 'Marketing Air', operatingCarrier: 'Sample Air', flightNumber: '100', departureDate: '2026-12-06', departureAirport: 'SEA', arrivalAirport: 'JFK' }), '')
})

test('flight-number parsing preserves every digit and accepts an explicit carrier-code prefix', () => {
  for (const [prefix, number] of [['Delta', '1400'], ['United UA', '944'], ['United (UA)', '944'], ['Sample Air', '101']]) {
    const doc = document('one.pdf')
    doc.pages[0].items[1] = item(`${prefix} ${number} DEPARTING (SEA) Dec 06, 2026`, 25, 710)
    assert.equal(parse(doc).flights[0].flightNumber, number)
  }
})
