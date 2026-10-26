import assert from 'node:assert/strict'
import test from 'node:test'

import { selectedTourDirectorRecordNumbers, withTourDirectorRecordNumbers } from './tourDirectorFlightRecords.js'

test('supports multiple Tour Director records and legacy single selections', () => {
  assert.deepEqual(selectedTourDirectorRecordNumbers({ flightRecordNumber: '5' }), [5])
  const contact = withTourDirectorRecordNumbers({}, [5, 6, 5])
  assert.deepEqual(contact.flightRecordNumbers, ['5', '6'])
  assert.deepEqual(selectedTourDirectorRecordNumbers(contact), [5, 6])
})
