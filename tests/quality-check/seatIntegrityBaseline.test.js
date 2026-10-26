import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { inflateRawSync } from 'node:zlib'
import test from 'node:test'
import { compareSeatAssignments } from '../../src/features/quality-check/seatComparison.js'
import { buildQualityCheckWorkbook, combinedReviewSheet, qualityCheckWorkbookModel } from '../../src/features/quality-check/qualityCheckWorkbook.js'

// Read generated XLSX content rather than treating a model-only check as export validation.
async function worksheetText(result, sheet) {
  const bytes = Buffer.from(await (await buildQualityCheckWorkbook(result)).arrayBuffer())
  let end = bytes.length - 22
  while (bytes.readUInt32LE(end) !== 0x06054b50) end -= 1
  let offset = bytes.readUInt32LE(end + 16)
  for (let index = 0; index < bytes.readUInt16LE(end + 10); index += 1) {
    const nameLength = bytes.readUInt16LE(offset + 28)
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength)
    if (name === (typeof sheet === 'string' ? sheet : `xl/worksheets/sheet${sheet}.xml`)) {
      const local = bytes.readUInt32LE(offset + 42)
      const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
      const content = bytes.subarray(start, start + bytes.readUInt32LE(offset + 20))
      return (bytes.readUInt16LE(offset + 10) === 8 ? inflateRawSync(content) : content).toString()
    }
    offset += 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32)
  }
  throw new Error('Generated workbook is missing the requested worksheet.')
}

const flight = { airline: 'Sample Air', flightNumber: '101', departureAirport: 'SEA', arrivalAirport: 'JFK', label: 'SEA → JFK' }
const people = [
  { firstName: 'Ada', lastName: 'Reef', displayName: 'Ada Reef', ticketName: 'REEF/ADA', requests: '' },
  { firstName: 'Ben', lastName: 'Shoal', displayName: 'Ben Shoal', ticketName: 'SHOAL/BEN', requests: '' },
]

for (const ambiguous of [false, true]) {
  test(`exported Review retains ${ambiguous ? 'ambiguous' : 'missing'} companion status and explanation`, async () => {
    const alice = { firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith', ticketName: 'SMITH/ALICE', requests: 'Window seat; next to Bob Jones' }
    const companions = ambiguous ? ['Alan', 'Brian'].map((middle) => ({ firstName: 'Bob', middleName: middle, lastName: 'Jones', displayName: `Bob ${middle} Jones`, ticketName: `JONES/BOB ${middle}`, requests: '' })) : []
    const manifestTravelers = [alice, ...companions]
    const layoutSections = { 0: [{ firstRow: 1, lastRow: 30, pattern: '3-3', letters: 'ABC-DEF' }] }
    const comparison = compareSeatAssignments({
      manifestTravelers, layoutSections,
      ticketData: {
        schemaVersion: 2, flights: [flight],
        travelers: manifestTravelers.map((person, index) => ({ ticketName: person.ticketName, flightIndexes: [0], assignments: [{ flightIndex: 0, seat: `12${'ABC'[index]}` }] })),
      },
    })
    const result = { ...comparison, flights: [flight], layoutSections }
    const model = qualityCheckWorkbookModel(result)
    assert.equal(model.review[0].status, 'REVIEW — verify request')
    const exported = await worksheetText(result, 3)
    const aliceRow = exported.match(/<row\b[^>]*>.*?<\/row>/gs).find((row) => row.includes('Alice Smith'))
    assert.ok(aliceRow)
    assert.match(aliceRow, /REVIEW — verify request/)
    const notes = await worksheetText(result, 'xl/comments3.xml')
    assert.match(notes, /next to Bob Jones/)
    assert.match(notes, ambiguous ? /companion match is ambiguous/ : /companion could not be matched on this flight/)
    assert.match(notes, /✓ window seat/)
  })
}

function comparison(seats) {
  const data = compareSeatAssignments({
    manifestTravelers: people,
    ticketData: { flights: [flight], travelers: people.map((person, index) => ({ ticketName: person.ticketName, seats: [seats[index]], flightIndexes: [0] })) },
  })
  return { ...data, flights: [flight] }
}

test('baseline preserves both duplicate-seat owners in comparison and exported Review', async () => {
  const result = comparison(['28E', '28E'])
  assert.deepEqual(result.rows.map((row) => [row.traveler.displayName, row.seat, row.status]), [
    ['Ada Reef', '28E', 'conflict'], ['Ben Shoal', '28E', 'conflict'],
  ])
  const review = combinedReviewSheet(qualityCheckWorkbookModel(result))
  assert.equal(review.notes.length, 2)
  assert.ok(review.notes.every((note) => note.text.includes('2 travelers')))
  // Summary, flight map, then Review.
  const exported = await worksheetText(result, 3)
  assert.match(exported, /Ada Reef/)
  assert.match(exported, /Ben Shoal/)
  assert.equal((exported.match(/<t[^>]*>28E<\/t>/g) ?? []).length, 2)
})

test('duplicate-seat map retains and names both owners', async () => {
  const map = qualityCheckWorkbookModel(comparison(['28E', '28E'])).maps[0]
  assert.equal(map.rows.filter((row) => row.seat === '28E').length, 2)
  assert.deepEqual(map.bySeat.get('28E').owners.map((owner) => owner.traveler.displayName), ['Ada Reef', 'Ben Shoal'])
  assert.equal(map.bySeat.get('28E').status, 'conflict')
  assert.equal(map.bySeat.size, 1)
  const exported = await worksheetText(comparison(['28E', '28E']), 2)
  assert.match(exported, /Ada Reef \/ Ben Shoal/)
  assert.match(exported, /s="9"/)
})

for (const seat of ['50G', '55L']) {
  test(`${seat} remains visible in Review and the map overflow list`, async () => {
    const result = comparison(['12A', seat])
    const model = qualityCheckWorkbookModel(result)
    assert.equal(model.maps[0].bySeat.get(seat).traveler.displayName, 'Ben Shoal')
    assert.ok(!model.maps[0].layout.flat().includes(seat.at(-1)))
    assert.match((await worksheetText(result, 3)), new RegExp(`<t[^>]*>${seat}</t>`))
    assert.equal(model.maps[0].outsideDiagram[0].seat, seat)
    assert.match((await worksheetText(result, 2)), new RegExp(`<t[^>]*>${seat}(?:\\s|<)`))
  })
}

test('critical findings and their source evidence are included in the actual XLSX', async () => {
  const result = comparison(['28E', '28E'])
  result.issues[0].sources = [{ document: 'synthetic-ticket.pdf', page: 2, x: 25, y: 530, text: 'Seats: 28E' }]
  const summary = await worksheetText(result, 1)
  assert.match(summary, /CRITICAL ticket conflicts require review/)
  const evidence = await worksheetText(result, 5)
  assert.match(evidence, /synthetic-ticket.pdf/)
  assert.match(evidence, /Seats: 28E/)
  assert.match(evidence, /CRITICAL/)
})

test('an unplaced traveler and unreadable seat evidence remain in Review and Evidence', async () => {
  const result = { flights: [], unmatchedTickets: [], issues: [{ code: 'missing-itinerary', severity: 'review', message: 'Flight not established.', sources: [{ document: 'synthetic-ticket.pdf', page: 1, x: 25, y: 530, text: 'Seats: 12A, 14C' }] }],
    rows: [{ traveler: people[0], flight: { label: 'Unknown itinerary' }, flightIndex: null, seat: '', status: 'unresolved', message: 'Assignment not interpreted.', sources: [] }],
  }
  assert.match(await worksheetText(result, 2), /Ada Reef/)
  assert.match(await worksheetText(result, 2), /assignment not interpreted/)
  assert.match(await worksheetText(result, 4), /Seats: 12A, 14C/)
})
