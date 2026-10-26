import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyAevdTraveler,
  findExactOperationalPassportCandidate,
  isTourDirectorRecord,
} from './operationalTraveler.js'

test('recognizes a named traveler with an explicit Tour Director comment', () => {
  const traveler = {
    travelerName: 'Test Director',
    reservationNumber: '900001',
    comments: 'Tour Director; operational details removed during sanitization.',
  }
  assert.equal(isTourDirectorRecord(traveler), true)
  assert.equal(classifyAevdTraveler(traveler).recordType, 'tour-director')
})

test('does not treat a generic sanitizer placeholder as Tour Director evidence', () => {
  assert.equal(isTourDirectorRecord({
    travelerName: 'Sample Traveler',
    comments: 'Operational note removed during sanitization.',
  }), false)
})

test('does not classify an ordinary Pax 0 traveler as operational without evidence', () => {
  assert.equal(isTourDirectorRecord({ travelerName: 'Example Traveler', paxCountRaw: '0', comments: '' }), false)
})

test('finds the passport-backed traveler for a named Tour Director', () => {
  const candidate = findExactOperationalPassportCandidate({
    firstName: 'Morgan',
    lastName: 'Vale',
    dateOfBirth: '04/20/1985',
  }, [{
    firstName: 'Morgan',
    lastName: 'Vale',
    dateOfBirth: '4/20/1985',
    passportNumber: 'X10000001',
  }])

  assert.equal(candidate.index, 0)
  assert.equal(candidate.passport.passportNumber, 'X10000001')
})
