import assert from 'node:assert/strict'
import test from 'node:test'

import { analyzeFlightComment } from './commentAnalysis.js'

test('removes an affirmative cabin phrase while leaving ticket and seat text available for later parsing', () => {
  const result = analyzeFlightComment(
    'Business Class upgrade | Ticket 006999000006 | Seat 3A'
  )

  assert.equal(result.commentNeedsReview, true)
  assert.doesNotMatch(result.cleanedComment, /Business Class/i)
  assert.equal(result.upgradeClues.length, 1)
  assert.equal(result.upgradeClues[0].text, 'Business Class upgrade')
})

test('recognizes a return-via deviation as separate-ticket evidence', () => {
  const result = analyzeFlightComment(
    'Deviation return via EWR | Ticket 016999000007'
  )

  assert.equal(result.flightDeviation.returnViaAirport, 'EWR')
  assert.equal(result.commentNeedsReview, true)
  assert.doesNotMatch(result.cleanedComment, /return via EWR/i)
})
