import test from 'node:test'
import assert from 'node:assert/strict'
import { travelerRosterCounts } from './travelerCounts.js'

test('adds a Tour Director who is absent from the passport-backed roster', () => {
  const reconciliation = {
    matches: Array.from({ length: 91 }, (_, index) => ({ ppdt: { travelerNumber: String(index + 1) } })),
    unmatchedAevd: [],
    unmatchedPpdt: [],
  }
  assert.deepEqual(
    travelerRosterCounts(reconciliation, { present: true, travelerNumber: 'TD-1', firstName: 'Test', lastName: 'Director' }),
    { totalTravelers: 92, tourDirectors: 1 }
  )
})

test('does not count a linked Tour Director twice', () => {
  const reconciliation = {
    matches: [{ operational: true, ppdt: { travelerNumber: '66' } }, { ppdt: { travelerNumber: '67' } }],
    unmatchedAevd: [],
    unmatchedPpdt: [],
  }
  assert.deepEqual(
    travelerRosterCounts(reconciliation, { present: true, travelerNumber: '66' }),
    { totalTravelers: 2, tourDirectors: 1 }
  )
})

test('does not count an unsaved manually added person', () => {
  const reconciliation = {
    matches: [
      { ppdt: { travelerNumber: '1' } },
      { operational: true, passengerOverride: { _isDraft: true } },
    ],
    unmatchedAevd: [],
    unmatchedPpdt: [],
  }
  assert.deepEqual(
    travelerRosterCounts(reconciliation, { present: false }),
    { totalTravelers: 1, tourDirectors: 0 }
  )
})
