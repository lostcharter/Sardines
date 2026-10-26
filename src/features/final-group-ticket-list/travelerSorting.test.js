import assert from 'node:assert/strict'
import test from 'node:test'

import { compareTravelerAssignments, compareTravelerMatches } from './travelerSorting.js'

const match = (firstName, middleName, lastName) => ({
  ppdt: { firstName, middleName, lastName, displayName: [firstName, middleName, lastName].filter(Boolean).join(' ') },
})

test('sorts travelers by last name, then first and middle name', () => {
  const travelers = [
    match('Zoe', '', 'Able'),
    match('Amy', 'Zed', 'Baker'),
    match('Amy', 'Ann', 'Baker'),
  ].sort(compareTravelerMatches)

  assert.deepEqual(travelers.map((item) => item.ppdt.displayName), [
    'Zoe Able',
    'Amy Ann Baker',
    'Amy Zed Baker',
  ])
})

test('sorts flight assignments using their traveler names', () => {
  const assignments = [match('Amy', '', 'Zulu'), match('Ben', '', 'Alpha')]
    .map((traveler) => ({ match: traveler }))
    .sort(compareTravelerAssignments)

  assert.deepEqual(assignments.map((item) => item.match.ppdt.lastName), ['Alpha', 'Zulu'])
})
