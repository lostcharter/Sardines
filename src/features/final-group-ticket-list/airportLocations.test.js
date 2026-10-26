import assert from 'node:assert/strict'
import test from 'node:test'

import {
  airportMatchesLocation,
  routeIsRoundTripForLocation,
} from './airportLocations.js'

test('NYC matches each New York metro airport', () => {
  for (const airport of [
    'EWR',
    'JFK',
    'LGA',
  ]) {
    assert.equal(
      airportMatchesLocation(
        airport,
        'NYC'
      ),
      true
    )
  }
})

test('airport codes continue to match themselves', () => {
  assert.equal(
    airportMatchesLocation(
      'ORD',
      'ORD'
    ),
    true
  )
  assert.equal(
    airportMatchesLocation(
      'JFK',
      'EWR'
    ),
    false
  )
})

test('NYC accepts round trips using different metro airports', () => {
  assert.equal(
    routeIsRoundTripForLocation(
      'JFK',
      'EWR',
      'NYC'
    ),
    true
  )
  assert.equal(
    routeIsRoundTripForLocation(
      'JFK',
      'BOS',
      'NYC'
    ),
    false
  )
})
