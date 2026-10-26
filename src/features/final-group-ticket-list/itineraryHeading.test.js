import assert from 'node:assert/strict'
import test from 'node:test'

import {
  itineraryRouting,
  normalizeItineraryArrivalLine,
  primaryAirlineName,
} from './itineraryHeading.js'

test('builds an open-jaw heading from actual itinerary segments', () => {
  const flights = [
    { flight: 'United 4517', departureAirport: 'STL', arrivalAirport: 'ORD' },
    { flight: 'United 944', departureAirport: 'ORD', arrivalAirport: 'FRA' },
    { flight: 'United 018', departureAirport: 'MXP', arrivalAirport: 'EWR' },
    { flight: 'United 2489', departureAirport: 'EWR', arrivalAirport: 'STL' },
  ]

  assert.equal(itineraryRouting(flights), 'STL-FRA/MXP-STL')
  assert.equal(primaryAirlineName(flights), 'United')
})

test('recognizes itinerary arrivals decorated with mileage details', () => {
  assert.equal(
    normalizeItineraryArrivalLine('Stops: 0 ARRIVING (FRA) Frankfurt, Germany'),
    'ARRIVING (FRA) Frankfurt, Germany'
  )
})
