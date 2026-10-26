import assert from 'node:assert/strict'
import test from 'node:test'
import { ticketDataFromPositionedPages, ticketFlightsFromLines, ticketTravelersFromColumnLines } from './ticketPdfParser.js'

test('maps itinerary flights in outbound and return order', () => {
  assert.deepEqual(ticketFlightsFromLines([
    'Royal Air Maroc 201 D E P A R T I N G (JFK) New York',
    'A R R I V I N G (CMN) Casablanca',
    'Royal Air Maroc 200 D E P A R T I N G (CMN) Casablanca',
    'A R R I V I N G (JFK) New York',
  ]).map((flight) => flight.label), ['JFK → CMN', 'CMN → JFK'])
})

test('keeps each returned seat in flight order for one traveler', () => {
  assert.deepEqual(ticketTravelersFromColumnLines([
    'SILVERBROOK/CORA MAY 000-0000000001',
    'Seats: 36D, 32K',
  ]), [{
    ticketName: 'SILVERBROOK/CORA MAY',
    ticketNumber: '000-0000000001',
    seats: ['36D', '32K'],
  }])
})

test('accepts FMG ticket numbers with no hyphen', () => {
  assert.equal(ticketTravelersFromColumnLines([
    'TRAVELER/TEST PERSON 0000000000001',
    'Seats: 41C, 21A, 41C',
  ])[0].ticketNumber, '0000000000001')
})

test('accepts ticket numbers with a trailing coupon suffix', () => {
  assert.equal(ticketTravelersFromColumnLines([
    'TRAVELER/TEST PERSON 001-1234567890-74',
    'Seats: 22D, 30A, 26J, 22A',
  ])[0].ticketNumber, '001-1234567890-74')
})

test('preserves record boundaries across pages in a multi-record ticket document', () => {
  const item = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] })
  const result = ticketDataFromPositionedPages([
    { width: 600, items: [
      item('ABC123 AS · 1 Passengers', 20, 700),
      item('Alaska Air 803 DEPARTING (LAX)', 20, 680), item('ARRIVING (HNL)', 20, 670),
      item('Alaska Air 1175 DEPARTING (OGG)', 20, 650), item('ARRIVING (HNL)', 20, 640),
      item('Alaska Air 804 DEPARTING (HNL)', 20, 620), item('ARRIVING (LAX)', 20, 610),
      item('ONE/PERSON 0000000000001', 20, 500), item('Seats: 41C, 21A, 41C', 20, 490),
      item('DEF456 · GHI789 AS · 1 Passengers', 20, 50),
    ] },
    { width: 600, items: [
      item('Alaska Air 1068 DEPARTING (HNL)', 20, 700), item('ARRIVING (KOA)', 20, 690),
      item('Alaska Air 1039 DEPARTING (KOA)', 20, 670), item('ARRIVING (OGG)', 20, 660),
      item('TWO/PERSON 0000000000002', 20, 500), item('Seats: 23E, 23E', 20, 490),
    ] },
  ])
  assert.deepEqual(result.records.map((record) => record.flightIndexes), [[0, 1, 2], [3, 4]])
  assert.equal(result.records[1].key, 'DEF456 · GHI789')
  assert.deepEqual(result.travelers.map((traveler) => [traveler.recordIndex, traveler.flightIndexes, traveler.seats]), [
    [0, [0, 1, 2], ['41C', '21A', '41C']],
    [1, [3, 4], ['23E', '23E']],
  ])
})
