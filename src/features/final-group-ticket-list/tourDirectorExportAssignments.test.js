import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeTourDirectorExportAssignments } from './tourDirectorExportAssignments.js'

test('reuses the passport-backed Tour Director assignment without changing the passenger count', () => {
  const passengers = Array.from({ length: 7 }, (_, index) => ({
    match: { ppdt: { travelerNumber: String(index + 1) } },
    recordNumber: 1,
  }))
  const tourDirector = {
    match: {
      operational: true,
      ppdt: { travelerNumber: '8', passportNumber: 'X10000001' },
    },
    recordNumber: 1,
  }

  const result = mergeTourDirectorExportAssignments({
    assignments: [...passengers, tourDirector],
    contact: { present: true, travelerNumber: '8', flightRecordNumbers: ['1'] },
    flightRecords: [{ recordNumber: 1 }],
    fallbackMatch: null,
  })

  assert.equal(result.length, 8)
  assert.equal(result.filter((assignment) => assignment.assignmentType === 'tour-director').length, 1)
  assert.equal(result.at(-1).match.ppdt.passportNumber, 'X10000001')
})

test('preserves the existing traveler when the TD record selection cannot be resolved', () => {
  const assignment = {
    match: { ppdt: { travelerNumber: '8' } },
    recordNumber: 1,
  }

  const result = mergeTourDirectorExportAssignments({
    assignments: [assignment],
    contact: { present: true, travelerNumber: '8', flightRecordNumbers: ['99'] },
    flightRecords: [{ recordNumber: 1 }],
    fallbackMatch: null,
  })

  assert.deepEqual(result, [assignment])
})
