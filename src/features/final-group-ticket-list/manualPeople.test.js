import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createManualPerson,
  manualPersonToMatch,
} from './manualPeople.js'

test('creates repeatable manual people with stable independent ids', () => {
  assert.notEqual(createManualPerson('one').id, createManualPerson('two').id)
})

test('prefills a manual traveler from an unmatched air record', () => {
  const person = createManualPerson('pippa', 'passenger', {
    firstName: 'Pippa',
    lastName: 'Ash',
    reservationNumber: '910999',
    sourceUnmatchedReservation: '910999',
  })

  assert.equal(person.firstName, 'Pippa')
  assert.equal(person.lastName, 'Ash')
  assert.equal(person.reservationNumber, '910999')
  assert.equal(person.sourceUnmatchedReservation, '910999')
})

test('converts a manual Tour Director to an exportable match', () => {
  const person = {
    ...createManualPerson('manual-1', 'tour-director'),
    firstName: 'Test',
    lastName: 'Director',
    recordNumbers: ['1', '3'],
  }
  const match = manualPersonToMatch(person)
  assert.equal(match.manualRole, 'tour-director')
  assert.equal(match.operational, true)
  assert.equal(match.ppdt.displayName, 'Test Director')
})
