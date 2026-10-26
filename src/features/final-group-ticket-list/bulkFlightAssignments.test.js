import assert from 'node:assert/strict'
import test from 'node:test'

import { assignTravelersToRecord, companyTravelerRoster, updateBulkSelection } from './bulkFlightAssignments.js'

test('assigns several travelers to one record without discarding earlier overrides', () => {
  const record = { recordNumber: 7, routing: 'STL-FRA/MXP-STL' }
  const result = assignTravelersToRecord(
    { existing: { recordNumber: 3 } },
    [
      { ppdt: { travelerNumber: '101' } },
      { ppdt: { travelerNumber: '102' } },
    ],
    record
  )

  assert.equal(result.existing.recordNumber, 3)
  assert.equal(result['101'].recordNumber, 7)
  assert.equal(result['102'].record, record)
})

test('builds the bulk roster from traveler matches rather than assignment wrappers', () => {
  const named = { ppdt: { travelerNumber: '101', displayName: 'Named Traveler' } }
  const roster = companyTravelerRoster([
    { assignmentType: 'ambiguous', match: named },
    { assignmentType: 'company-air', match: named },
    { assignmentType: 'own-air', match: { ppdt: { travelerNumber: '202' } } },
  ])

  assert.deepEqual(roster, [named])
})

test('supports click toggles plus Shift-click and Ctrl-Shift-click ranges', () => {
  const visibleKeys = ['a', 'b', 'c', 'd', 'e']
  let selection = updateBulkSelection({ currentKeys: [], visibleKeys, clickedKey: 'b', anchorKey: '' })
  assert.deepEqual(selection.selectedKeys, ['b'])

  selection = updateBulkSelection({ ...selection, currentKeys: selection.selectedKeys, visibleKeys, clickedKey: 'd' })
  assert.deepEqual(selection.selectedKeys, ['b', 'd'])

  selection = updateBulkSelection({ ...selection, currentKeys: selection.selectedKeys, visibleKeys, clickedKey: 'b', shiftKey: true })
  assert.deepEqual(selection.selectedKeys, ['b', 'd', 'c'])

  selection = updateBulkSelection({ currentKeys: ['a'], visibleKeys, clickedKey: 'd', anchorKey: 'b', shiftKey: true, ctrlKey: true })
  assert.deepEqual(selection.selectedKeys, ['a', 'b', 'c', 'd'])
})
