import assert from 'node:assert/strict'
import test from 'node:test'

import { analyzeFlightComment } from './commentAnalysis.js'
import { manifestSpecialRequests } from './manifestSpecialRequests.js'

function matchWithComment(comments) {
  return {
    aevd: {
      comments,
      commentAnalysis: analyzeFlightComment(comments),
    },
  }
}

test('keeps ordinary manifest requests that Sardines does not classify', () => {
  assert.equal(
    manifestSpecialRequests(matchWithComment('not near the bathroom'), null),
    'not near the bathroom'
  )
  assert.equal(
    manifestSpecialRequests(matchWithComment('extra leg room requested'), null),
    'extra leg room requested'
  )
})

test('keeps both a declined upgrade note and its remaining seat request', () => {
  const value = manifestSpecialRequests(
    matchWithComment('extra leg room requested. Premium Economy Upgrade // Upgrade Declined'),
    null
  )

  assert.match(value, /extra leg room requested/i)
  assert.match(value, /Premium Economy Upgrade \/\/ Upgrade Declined/i)
})
