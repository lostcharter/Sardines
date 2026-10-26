import assert from 'node:assert/strict'
import test from 'node:test'

import { detectReportType } from './reportTypeDetection.js'

test('identifies the two required reports and optional rooming report from headers', () => {
  assert.equal(detectReportType([['ResNo', 'Traveler Names', 'Date of Birth']]).type, 'domestic-air')
  assert.equal(detectReportType([['ResId', 'Traveler No', 'First Name', 'Last Name', 'Passport No']]).type, 'passport')
  assert.equal(detectReportType([['Room No', 'ResId', 'Traveler Names', 'Room Type']]).type, 'rooming-list')
})

test('does not guess an unknown report type', () => {
  assert.deepEqual(detectReportType([['Mystery', 'Columns']]), { type: 'unknown', headerIndex: -1 })
})
