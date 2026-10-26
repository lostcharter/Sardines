import assert from 'node:assert/strict'
import test from 'node:test'

import { applyManualFlightSelections } from './manualFlightAssignments.js'

test('puts one manually added Tour Director on every selected record', () => {
  const match = { manualId: 'td-1', manualRole: 'tour-director' }
  const records = [
    { recordNumber: 1, routing: 'AAA-BBB' },
    { recordNumber: 2, routing: 'BBB-AAA' },
  ]
  const result = applyManualFlightSelections(
    [{ match, recordNumber: null, record: null }],
    { 'manual:td-1': { recordNumbers: ['1', '2'], airType: 'Company Air' } },
    records
  )

  assert.deepEqual(result.map((item) => item.recordNumber), [1, 2])
  assert.ok(result.every((item) => item.assignmentType === 'tour-director'))
})

test('supports multiple manually added people independently', () => {
  const first = { match: { manualId: 'one' } }
  const second = { match: { manualId: 'two' } }
  const records = [{ recordNumber: 1 }, { recordNumber: 2 }]
  const result = applyManualFlightSelections(
    [first, second],
    {
      'manual:one': { recordNumbers: ['1'] },
      'manual:two': { recordNumbers: ['2'] },
    },
    records
  )
  assert.deepEqual(result.map((item) => item.recordNumber), [1, 2])
})

test('Own Air removes a traveler even when an earlier record selection remains', () => {
  const match = { ppdt: { travelerNumber: '123' } }
  const result = applyManualFlightSelections(
    [{ match, recordNumber: 1, record: { recordNumber: 1 } }],
    {
      'traveler:123': {
        airType: 'Own Air',
        recordNumbers: ['1'],
      },
    },
    [{ recordNumber: 1 }]
  )

  assert.equal(result[0].recordNumber, null)
  assert.equal(result[0].record, null)
  assert.equal(result[0].assignmentType, 'own-air')
})
