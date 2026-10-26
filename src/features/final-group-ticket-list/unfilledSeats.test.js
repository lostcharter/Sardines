import assert from 'node:assert/strict'
import test from 'node:test'

import { buildUnfilledSeatMarkers } from './unfilledSeats.js'

test('creates review-only markers for contracted seats without travelers', () => {
  const assignments = Array.from({ length: 27 }, (_, index) => ({ match: { index }, recordNumber: 1, assignmentType: 'company-air' }))
  const markers = buildUnfilledSeatMarkers({
    flightRecords: [{ recordNumber: 1, passengerCount: 29 }],
    effectiveAssignments: { companyAssignments: assignments },
    tourFlight: { enabled: false },
  })
  assert.deepEqual(markers, [
    { recordLabel: 'Record 1', seat: 1, total: 2 },
    { recordLabel: 'Record 1', seat: 2, total: 2 },
  ])
})

test('does not count Own Air travelers unless they are explicitly on the record', () => {
  const markers = buildUnfilledSeatMarkers({
    flightRecords: [{ recordNumber: 1, passengerCount: 2 }],
    effectiveAssignments: { companyAssignments: [{ match: {}, recordNumber: null, assignmentType: 'own-air' }] },
    tourFlight: { enabled: false },
  })
  assert.equal(markers.length, 2)
})
