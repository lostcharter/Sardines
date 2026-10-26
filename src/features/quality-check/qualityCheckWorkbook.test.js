import assert from 'node:assert/strict'
import test from 'node:test'
import { buildQualityCheckWorkbook, combinedReviewSheet, compactSeatMapRows, qualityCheckWorkbookModel } from './qualityCheckWorkbook.js'

test('creates one seat map per actual flight and preserves a traveler’s seat order', () => {
  const cora = { firstName: 'Cora', middleName: 'May', lastName: 'Silverbrook', displayName: 'Cora May Silverbrook', requests: 'Window' }
  const flights = [{ departureAirport: 'JFK', arrivalAirport: 'CMN', airline: 'Royal Air Maroc', flightNumber: '201' }, { departureAirport: 'CMN', arrivalAirport: 'JFK', airline: 'Royal Air Maroc', flightNumber: '200' }]
  const result = { flights, unmatchedTickets: [], rows: flights.map((flight, flightIndex) => ({ traveler: cora, flight, flightIndex, seat: ['36D', '32K'][flightIndex], status: 'verify', message: 'Review request.' })) }
  const model = qualityCheckWorkbookModel(result)
  assert.equal(model.maps.length, 2)
  assert.equal(model.maps[0].bySeat.get('36D').traveler, cora)
  assert.equal(model.maps[1].bySeat.get('32K').traveler, cora)
  assert.deepEqual(model.review[0].seats, ['36D', '32K'])
  assert.equal(model.missedRequests.length, 0)
})

test('writes missed requests into the workbook summary model', () => {
  const traveler = { firstName: 'Ada', middleName: 'Iris', lastName: 'Reef', displayName: 'Ada Iris Reef', requests: 'Aisle seat' }
  const flight = { departureAirport: 'JFK', arrivalAirport: 'CMN' }
  const model = qualityCheckWorkbookModel({ flights: [flight], unmatchedTickets: [], rows: [{ traveler, flight, flightIndex: 0, seat: '29F', status: 'request-unmet', message: '✕ aisle seat' }] })
  assert.deepEqual(model.missedRequests, [{ traveler: 'Ada Iris Reef', flight: 'JFK → CMN', seat: '29F', request: 'Aisle seat', reason: '✕ aisle seat' }])
})

test('builds a real XLSX zip package from comparison results', async () => {
  const traveler = { firstName: 'Tuna', middleName: '', lastName: 'Fish', displayName: 'Tuna Fish', requests: '' }
  const flight = { departureAirport: 'SEA', arrivalAirport: 'SFO', airline: 'Sample Air', flightNumber: '12' }
  const result = { flights: [flight], unmatchedTickets: [], rows: [{ traveler, flight, flightIndex: 0, seat: '12F', status: 'no-request', message: 'No seat request was submitted.' }] }
  const bytes = new Uint8Array(await (await buildQualityCheckWorkbook(result)).arrayBuffer())
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04])
  assert.ok(bytes.length > 1000)
})

test('uses one review row per traveler with flight issues stored as Excel notes', () => {
  const traveler = { firstName: 'Tuna', middleName: '', lastName: 'Fish', displayName: 'Tuna Fish', requests: 'Window seat' }
  const flights = [{ departureAirport: 'SEA', arrivalAirport: 'SFO' }, { departureAirport: 'SFO', arrivalAirport: 'SEA' }]
  const model = qualityCheckWorkbookModel({ flights, unmatchedTickets: [], rows: [
    { traveler, flight: flights[0], flightIndex: 0, seat: '12F', status: 'request-satisfied', message: '✓ window seat' },
    { traveler, flight: flights[1], flightIndex: 1, seat: '14C', status: 'request-unmet', message: '✕ window seat' },
  ] })
  const sheet = combinedReviewSheet(model)
  assert.match(sheet.xml, /SEA → SFO/)
  assert.match(sheet.xml, /SFO → SEA/)
  assert.equal((sheet.xml.match(/<row /g) ?? []).length, 2)
  assert.deepEqual(sheet.notes, [{ ref: 'D2', text: 'Tuna Fish\nSFO → SEA\n✕ window seat' }])
})

test('models an illustrative cabin when a flight has no assigned seats', () => {
  const traveler = { firstName: 'Tuna', middleName: '', lastName: 'Fish', displayName: 'Tuna Fish', requests: '' }
  const flight = { departureAirport: 'BUD', arrivalAirport: 'LHR', airline: 'Sample Air', flightNumber: '13' }
  const model = qualityCheckWorkbookModel({ flights: [flight], unmatchedTickets: [], rows: [{ traveler, flight, flightIndex: 0, seat: '', status: 'unassigned', message: 'No advance seat was returned for this flight.' }] })
  assert.equal(model.maps[0].hasAssignedSeats, false)
  assert.deepEqual(model.maps[0].layout, [['A', 'B', 'C'], ['D', 'E', 'F']])
})

test('collapses long empty stretches while preserving context rows', () => {
  assert.deepEqual(compactSeatMapRows(2, 26, [2, 9, 21, 22, 26]), [
    { type: 'row', rowNumber: 2 }, { type: 'row', rowNumber: 3 },
    { type: 'gap', firstRow: 4, lastRow: 7 }, { type: 'row', rowNumber: 8 },
    { type: 'row', rowNumber: 9 }, { type: 'row', rowNumber: 10 },
    { type: 'gap', firstRow: 11, lastRow: 19 }, { type: 'row', rowNumber: 20 },
    { type: 'row', rowNumber: 21 }, { type: 'row', rowNumber: 22 },
    { type: 'row', rowNumber: 23 }, { type: 'row', rowNumber: 24 },
    { type: 'row', rowNumber: 25 }, { type: 'row', rowNumber: 26 },
  ])
})

test('puts returned-only assigned seats on their flight map', () => {
  const flight = { departureAirport: 'STL', arrivalAirport: 'PHL', airline: 'Sample Air', flightNumber: '17' }
  const unmatchedTicket = { ticketName: 'COVE/KIT', ticketNumber: '001-1234567890', seats: ['2A'], flightIndexes: [0] }
  const model = qualityCheckWorkbookModel({ flights: [flight], rows: [], unmatchedTickets: [unmatchedTicket] })
  assert.equal(model.maps[0].bySeat.get('2A').returnedOnly, true)
  assert.equal(model.maps[0].bySeat.get('2A').traveler.displayName, 'KIT COVE')
})

test('puts a zero-padded returned-only seat on its numeric row', () => {
  const flight = { departureAirport: 'STL', arrivalAirport: 'PHL', airline: 'Sample Air', flightNumber: '17' }
  const unmatchedTicket = { ticketName: 'COVE/KIT', ticketNumber: '001-1234567890', seats: ['02A'], flightIndexes: [0] }
  const map = qualityCheckWorkbookModel({ flights: [flight], rows: [], unmatchedTickets: [unmatchedTicket] }).maps[0]
  assert.equal(map.bySeat.get('2A').traveler.displayName, 'KIT COVE')
})

test('marks generated seat-map geometry as inferred', () => {
  const traveler = { firstName: 'Tuna', middleName: '', lastName: 'Fish', displayName: 'Tuna Fish', requests: '' }
  const flight = { departureAirport: 'SEA', arrivalAirport: 'SFO', airline: 'Sample Air', flightNumber: '12' }
  const result = { flights: [flight], unmatchedTickets: [], rows: [{ traveler, flight, flightIndex: 0, seat: '12F', status: 'no-request', message: '' }] }
  const map = qualityCheckWorkbookModel(result).maps[0]
  assert.equal(map.hasAssignedSeats, true)
  assert.equal(map.geometryIsInferred, true)
})
