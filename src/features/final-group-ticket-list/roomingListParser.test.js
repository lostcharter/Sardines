import assert from 'node:assert/strict'
import test from 'node:test'

import { roommatesForMatch } from './roomingListParser.js'

test('does not list the traveler as their own roommate when the rooming name omits a middle name', () => {
  const roomingData = {
    roommateMap: new Map([
      ['900102', ['Elena June Marrow', 'Caleb Finch']],
    ]),
  }
  const match = {
    aevd: { reservationNumber: '900102' },
    ppdt: {
      displayName: 'Caleb Arthur Finch',
      firstName: 'Caleb',
      lastName: 'Finch',
    },
  }

  assert.deepEqual(
    roommatesForMatch(roomingData, match),
    ['Elena June Marrow']
  )
})
