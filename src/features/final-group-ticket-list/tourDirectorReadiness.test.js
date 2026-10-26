import test from 'node:test'
import assert from 'node:assert/strict'

import { tourDirectorReadiness } from './tourDirectorReadiness.js'

test('requires an explicit Tour Director decision', () => {
  assert.equal(tourDirectorReadiness({ present: null }).blocker, true)
})

test('accepts an explicit confirmation that there is no Tour Director', () => {
  assert.deepEqual(tourDirectorReadiness({ present: false }), {
    complete: true,
    blocker: false,
    warning: false,
    uncoveredRecords: [],
    status: 'Confirmed: no Tour Director',
  })
})

test('requires TD coverage or an explicit no-TD confirmation on records over ten seats', () => {
  const records = [
    { recordNumber: 1, passengerCount: 10 },
    { recordNumber: 2, passengerCount: 11 },
    { recordNumber: 3, passengerCount: 20 },
  ]
  const incomplete = tourDirectorReadiness({
    present: true,
    firstName: 'Test',
    lastName: 'Director',
    flightRecordNumbers: ['2'],
  }, records)
  assert.deepEqual(incomplete.uncoveredRecords, [3])
  assert.equal(incomplete.blocker, true)

  const complete = tourDirectorReadiness({
    present: true,
    firstName: 'Test',
    lastName: 'Director',
    flightRecordNumbers: ['2'],
    noTourDirectorRecordNumbers: ['3'],
  }, records)
  assert.equal(complete.complete, true)
})

test('counts additional Tour Directors toward large-record coverage', () => {
  const result = tourDirectorReadiness({
    present: true,
    firstName: 'Test',
    lastName: 'Director',
    flightRecordNumbers: ['2'],
  }, [
    { recordNumber: 2, passengerCount: 20 },
    { recordNumber: 3, passengerCount: 20 },
  ], ['3'])
  assert.equal(result.complete, true)
})

test('blocks a detected Tour Director with no identity', () => {
  const result = tourDirectorReadiness({
    present: true,
    flightRecordNumbers: ['2'],
  })

  assert.equal(result.blocker, true)
  assert.equal(result.missingIdentity, true)
  assert.equal(result.status, 'Name required')
})

test('blocks an identified Tour Director with no flight', () => {
  const result = tourDirectorReadiness({
    present: true,
    firstName: 'Test',
    lastName: 'Director',
  })

  assert.equal(result.blocker, true)
  assert.equal(result.missingFlight, true)
  assert.equal(result.status, 'Flight needed')
})

test('accepts an identified Tour Director assigned to a flight', () => {
  const result = tourDirectorReadiness({
    present: true,
    firstName: 'Test',
    lastName: 'Director',
    flightRecordNumbers: ['2', '3'],
  })

  assert.equal(result.complete, true)
  assert.equal(result.blocker, false)
  assert.equal(result.warning, true)
  assert.equal(result.missingPhone, true)
  assert.equal(result.missingEmail, true)
  assert.equal(result.status, 'Contact info missing')
})

test('clears the non-blocking contact warning when phone and email are supplied', () => {
  const result = tourDirectorReadiness({
    present: true,
    firstName: 'Test',
    lastName: 'Director',
    flightRecordNumbers: ['2'],
    phone: '555-0100',
    email: 'director@example.test',
  })

  assert.equal(result.complete, true)
  assert.equal(result.blocker, false)
  assert.equal(result.warning, false)
  assert.equal(result.status, 'Complete')
})

test('keeps an invalid Tour Director email as a non-blocking warning', () => {
  const result = tourDirectorReadiness({
    present: true,
    firstName: 'Test',
    lastName: 'Director',
    flightRecordNumbers: ['2'],
    phone: '555-0100',
    email: '555-0100',
  })

  assert.equal(result.complete, true)
  assert.equal(result.blocker, false)
  assert.equal(result.invalidEmail, true)
  assert.equal(result.warning, true)
})
