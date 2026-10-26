import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findNamedTourDirectorMatch,
  matchIsTourDirector,
} from './tourDirectorIdentity.js'

test('finds a linked Tour Director by traveler number', () => {
  assert.equal(matchIsTourDirector(
    { ppdt: { travelerNumber: '4323', displayName: 'Synthetic Person' } },
    { travelerNumber: '4323', firstName: 'Different', lastName: 'Name' }
  ), true)
})

test('does not confuse different traveler numbers', () => {
  assert.equal(matchIsTourDirector(
    { ppdt: { travelerNumber: '1111', displayName: 'Same Name' } },
    { travelerNumber: '2222', firstName: 'Same', lastName: 'Name' }
  ), false)
})

test('finds a uniquely named Tour Director when the report header omits their middle name', () => {
  const avery = {
    ppdt: {
      firstName: 'Avery',
      middleName: 'Kai',
      lastName: 'Stone',
    },
  }

  assert.equal(findNamedTourDirectorMatch([avery], 'Avery Stone'), avery)
})
