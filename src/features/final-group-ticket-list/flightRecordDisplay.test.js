import assert from 'node:assert/strict'
import test from 'node:test'

import { flightRecordDisplayLabel, flightRecordItineraryPath } from './flightRecordDisplay.js'

test('preserves cabin wording from the contract record title', () => {
  assert.equal(
    flightRecordDisplayLabel({
      recordNumber: 1,
      routing: 'STL-PRG/BUD-STL',
      sourceHeader: 'Record 1: 14 Passengers / STL-PRG / BUD-STL American Economy',
    }),
    'R1 · STL-PRG / BUD-STL American Economy'
  )
})

test('preserves a passenger name from a named contract record', () => {
  assert.equal(
    flightRecordDisplayLabel({
      recordNumber: 2,
      routing: 'STL-PRG/BUD-STL',
      sourceHeader: 'Record 2: 1 Passenger / STL-PRG / BUD-STL American Taylor Smith',
    }),
    'R2 · STL-PRG / BUD-STL American Taylor Smith'
  )
})

test('titles a new itinerary record from its actual route and airline', () => {
  assert.equal(
    flightRecordDisplayLabel({
      recordNumber: 1,
      routing: 'STL-FRA/MXP-STL',
      airlineName: 'United',
      sourceFormat: 'itinerary-record',
      sourceHeader: 'NT9SWJ UA · 18 Passengers',
    }),
    'R1 · STL-FRA/MXP-STL United'
  )
})

test('shows outbound and return connection paths from contract flight segments', () => {
  assert.equal(
    flightRecordItineraryPath({
      flights: [
        { departureAirport: 'STL', arrivalAirport: 'ORD' },
        { departureAirport: 'ORD', arrivalAirport: 'FRA' },
        { departureAirport: 'MXP', arrivalAirport: 'EWR' },
        { departureAirport: 'EWR', arrivalAirport: 'STL' },
      ],
    }),
    'STL → ORD → FRA · MXP → EWR → STL'
  )
})
