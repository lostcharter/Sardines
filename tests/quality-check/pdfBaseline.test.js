import assert from 'node:assert/strict'
import test from 'node:test'
import { assignments, flights, heading, passengers, parsePdfBytes, syntheticPdf } from './pdfBaselineHelpers.js'

// Fictional identities and ticket numbers authored for these tests, not sanitized real data.
const expected = [
  { name: 'CORAL/CORA MAY', ticket: '001-1234567892', record: 0, flights: ['SEA → JFK', 'JFK → SEA'], seats: ['12C', '14E'] },
  { name: 'REEF/ADA IRIS', ticket: '001-1234567890', record: 0, flights: ['SEA → JFK', 'JFK → SEA'], seats: ['12A', '14C'] },
  { name: 'SHOAL/BEN LEE', ticket: '001-1234567891', record: 0, flights: ['SEA → JFK', 'JFK → SEA'], seats: ['12B', '14D'] },
  { name: 'TIDE/DAN RAY', ticket: '001-1234567893', record: 0, flights: ['SEA → JFK', 'JFK → SEA'], seats: ['12D', '14F'] },
]

const workingLayouts = {
  'two-column original': [[heading, ...flights, ...passengers]],
  'shifted columns within their current halves': [[heading, ...flights, ...passengers.map(([text, x, y]) => [text, x + 18, y - 12])]],
  'reversed PDF drawing order': [[...[heading, ...flights, ...passengers].reverse()]],
  'passenger section above itinerary': [[heading, ...passengers, ...flights.map(([text, x, y]) => [text, x, y - 300])]],
  'page break before passenger section': [[heading, ...flights], passengers],
}

for (const [name, pages] of Object.entries(workingLayouts)) {
  test(`PDF baseline preserves exact passenger/ticket/flight/seat ownership: ${name}`, async () => {
    const { data } = await parsePdfBytes(await syntheticPdf(pages))
    assert.equal(data.records.length, 1)
    assert.equal(data.flights.length, 2)
    assert.deepEqual(assignments(data), expected)
  })
}

// Former parser defects are now complete-ownership correctness regressions.
test('preserves all owners when full-width name and ticket columns span the page', async () => {
  const fullWidth = passengers.filter((_, index) => index % 2 === 0).flatMap(([text], index) => {
    const split = text.lastIndexOf(' ')
    return [[text.slice(0, split), 25, 550 - index * 40], [text.slice(split + 1), 480, 550 - index * 40], [`Seats: ${expected.find((person) => text.startsWith(person.name)).seats.join(', ')}`, 25, 535 - index * 40]]
  })
  const { data } = await parsePdfBytes(await syntheticPdf([[heading, ...flights, ...fullWidth]]))
  assert.deepEqual(assignments(data), expected)
})

test('reassembles wrapped names without borrowing another passenger ticket', async () => {
  const wrapped = [
    ['REEF/ADA', 25, 550], ['IRIS 001-1234567890', 25, 540], ['Seats: 12A, 14C', 25, 525],
    ...passengers.slice(2),
  ]
  const { data } = await parsePdfBytes(await syntheticPdf([[heading, ...flights, ...wrapped]]))
  assert.deepEqual(assignments(data), expected)
})

test('attaches later-page return flights to earlier passengers', async () => {
  const { data } = await parsePdfBytes(await syntheticPdf([
    [heading, ...flights.slice(0, 2), ...passengers],
    flights.slice(2),
  ]))
  assert.equal(data.flights.length, 2)
  assert.deepEqual(assignments(data), expected)
})

test('recognizes labeled FMG record headings', async () => {
  const { data } = await parsePdfBytes(await syntheticPdf([
    [['Record: ABC123 / Passengers: 4', 25, 750], ...flights, ...passengers],
  ]))
  assert.equal(data.records.length, 1)
  assert.equal(data.travelers.length, 4)
  assert.deepEqual(assignments(data), expected)
})

test('discovers compact passenger columns that both lie left of the page midpoint', async () => {
  const compact = passengers.map(([text, x, y]) => [text, x < 300 ? 20 : 200, y])
  const { data } = await parsePdfBytes(await syntheticPdf([[heading, ...flights, ...compact]], { fontSize: 6 }))
  assert.deepEqual(assignments(data), expected)
})

test('a later full-width booking cannot overwrite the last passenger in an earlier column', async () => {
  const { data } = await parsePdfBytes(await syntheticPdf([[
    ['ABC123 ZZ · 1 Passengers', 25, 750], ...flights,
    ['REEF/ADA IRIS 001-1234567890', 25, 550], ['Seats: 12A, 14C', 25, 535],
    ['DEF456 ZZ · 1 Passengers', 25, 450],
    ...flights.map(([text, x, y]) => [text, x, y - 330]),
    ['TIDE/DAN RAY', 25, 250], ['001-1234567893', 480, 250], ['Seats: 12D, 14F', 25, 235],
  ]]))
  assert.deepEqual(data.travelers.map((person) => [person.ticketName, person.seats]), [
    ['REEF/ADA IRIS', ['12A', '14C']], ['TIDE/DAN RAY', ['12D', '14F']],
  ])
})

test('wrapped seat-list continuations remain attached to the named passenger', async () => {
  const wrapped = [passengers[0], ['Seats: 12A,', 25, 535], ['14C', 25, 525], ...passengers.slice(2)]
  const { data } = await parsePdfBytes(await syntheticPdf([[heading, ...flights, ...wrapped]]))
  assert.deepEqual(assignments(data), expected)
})
