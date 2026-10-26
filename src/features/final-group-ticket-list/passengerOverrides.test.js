import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyPassengerOverrides,
  passengerKey,
} from './passengerOverrides.js'

test('passenger overrides change working values without mutating source values', () => {
  const match = {
    aevd: {
      travelerName: 'Wrong Name',
      departureCity: 'NYC',
      airType: 'Company Air',
    },
    ppdt: {
      travelerNumber: '42',
      firstName: 'Wrong',
      lastName: 'Name',
      displayName: 'Wrong Name',
    },
  }
  const override = {
    firstName: 'Right',
    middleName: '',
    lastName: 'Name',
    dateOfBirth: '01/02/1990',
    gender: 'F',
    citizenship: 'USA',
    passportNumber: 'TEST123',
    passportExpireDate: '01/02/2030',
    ktnRaw: 'KTN123',
    frequentFlyerNumber: 'FF123',
    airType: 'Company Air',
    departureCity: 'JFK',
    phone: '555-0100',
    email: 'traveler@example.test',
    comments: 'Seat next to Taylor Smith',
    recordNumber: '3',
  }

  const result = applyPassengerOverrides(
    { matches: [match] },
    { [passengerKey(match)]: override }
  )

  assert.equal(result.matches[0].ppdt.displayName, 'Right Name')
  assert.equal(result.matches[0].aevd.departureCity, 'JFK')
  assert.equal(result.matches[0].frequentFlyerNumber, 'FF123')
  assert.equal(result.matches[0].aevd.phone, '555-0100')
  assert.equal(result.matches[0].aevd.comments, 'Seat next to Taylor Smith')
  assert.equal(result.matches[0].aevd.commentAnalysis.relationshipClues.length, 1)
  assert.equal(result.matches[0].sourcePpdt.displayName, 'Wrong Name')
  assert.equal(result.matches[0].sourceAevd.departureCity, 'NYC')
  assert.equal(match.ppdt.displayName, 'Wrong Name')
  assert.equal(match.aevd.departureCity, 'NYC')
})
