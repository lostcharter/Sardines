import assert from 'node:assert/strict'
import test from 'node:test'

import {
  groupUnmatchedSourceRows,
  removeAdoptedUnmatchedRecords,
  removeDismissedUnmatchedRecords,
  unmatchedSourceRecordKey,
} from './unmatchedSourceRecords.js'

test('combines reciprocal Air and Passport rows into one review action', () => {
  const grouped = groupUnmatchedSourceRows([
    {
      id: 'air',
      source: 'Domestic Air',
      reservation: '930108',
      issue: 'Air DOB conflicts.',
      unmatchedTraveler: {
        reservationNumber: '930108',
        firstName: 'Lila',
        lastName: 'Cove',
        dateOfBirth: '09/09/1979',
        airType: 'Company Air',
      },
    },
    {
      id: 'passport',
      source: 'Passport',
      reservation: '930108',
      issue: 'Passport row was not linked.',
      unmatchedTraveler: {
        reservationId: '930108',
        travelerNumber: '1930108',
        firstName: 'Lila',
        lastName: 'Cove',
        dateOfBirth: '09/09/1971',
        passportNumber: 'X40000008',
      },
    },
  ])

  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].source, 'Domestic Air + Passport')
  assert.equal(grouped[0].sourceUnmatchedType, 'both')
  assert.equal(
    grouped[0].issue,
    'Date of birth differs: Air Report 09/09/1979; Passport Report 09/09/1971.'
  )
  assert.equal(grouped[0].unmatchedTraveler.airType, 'Company Air')
  assert.equal(grouped[0].unmatchedTraveler.passportNumber, 'X40000008')
  assert.equal(grouped[0].unmatchedTraveler.dateOfBirth, '09/09/1971')
  assert.equal(grouped[0].unmatchedAevd.dateOfBirth, '09/09/1979')
  assert.equal(grouped[0].unmatchedPpdt.dateOfBirth, '09/09/1971')
})

test('keeps duplicate Passport rows separate so an operator can choose one', () => {
  const grouped = groupUnmatchedSourceRows([
    {
      id: 'passport-1',
      source: 'Passport',
      reservation: '940107',
      issue: 'Duplicate.',
      unmatchedTraveler: { reservationId: '940107', travelerNumber: '1940107', firstName: 'Tobin', lastName: 'Glen', passportNumber: 'X1' },
    },
    {
      id: 'passport-2',
      source: 'Passport',
      reservation: '940107',
      issue: 'Duplicate.',
      unmatchedTraveler: { reservationId: '940107', travelerNumber: '1940107', firstName: 'Tobin', lastName: 'Glen', passportNumber: 'X2' },
    },
  ])

  assert.equal(grouped.length, 2)
  assert.deepEqual(grouped.map((row) => row.unmatchedTraveler.passportNumber), ['X1', 'X2'])
})

test('excluding a cancelled air record clears only that record from the job', () => {
  const cancelled = { reservationNumber: '940110', firstName: 'Cancelled', lastName: 'Traveler' }
  const active = { reservationNumber: '940109', firstName: 'Loren', lastName: 'Field' }
  const reconciliation = {
    unmatchedAevd: [{ traveler: active }, { traveler: cancelled }],
    unmatchedPpdt: [],
  }
  const dismissed = new Set([unmatchedSourceRecordKey('air', cancelled)])

  const reviewed = removeDismissedUnmatchedRecords(reconciliation, dismissed)

  assert.deepEqual(reviewed.unmatchedAevd.map((item) => item.traveler), [active])
})

test('adopting an unmatched passport traveler preserves an air warning on the same reservation', () => {
  const reconciliation = {
    unmatchedAevd: [
      { traveler: { reservationNumber: '930108', firstName: 'Lila', lastName: 'Cove', dateOfBirth: '09/09/1979' } },
      { traveler: { reservationNumber: '930108', firstName: 'Orin', lastName: 'Spray' } },
    ],
    unmatchedPpdt: [{ traveler: { reservationId: '930108', travelerNumber: '1930108', firstName: 'Lila' } }],
  }
  const result = removeAdoptedUnmatchedRecords(
    reconciliation,
    [{
      id: 'lila',
      sourceUnmatchedType: 'both',
      sourceUnmatchedReservation: '930108',
      sourceUnmatchedTravelerNumber: '1930108',
      sourceUnmatchedFirstName: 'Lila',
      sourceUnmatchedLastName: 'Cove',
    }],
    { 'manual:lila': {} }
  )

  assert.equal(result.unmatchedPpdt.length, 0)
  assert.equal(result.unmatchedAevd.length, 1)
  assert.equal(result.unmatchedAevd[0].traveler.firstName, 'Orin')
})

test('a draft traveler does not retire its unmatched source record', () => {
  const reconciliation = {
    unmatchedAevd: [],
    unmatchedPpdt: [{ traveler: { reservationId: '930108', travelerNumber: '1930108' } }],
  }
  const result = removeAdoptedUnmatchedRecords(
    reconciliation,
    [{ id: 'lila', sourceUnmatchedType: 'passport', sourceUnmatchedTravelerNumber: '1930108' }],
    { 'manual:lila': { _isDraft: true } }
  )

  assert.equal(result.unmatchedPpdt.length, 1)
})
