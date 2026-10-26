import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyFrequentFlyerDecisions,
  frequentFlyerReviewKey,
  isPlausibleKtn,
} from './frequentFlyerDecisions.js'

function fixture() {
  const review = { number: 'FF123456789', sourceField: 'KTN / Global Entry' }
  const match = {
    ppdt: { travelerNumber: '101', ktnRaw: 'FF123456789' },
    aevd: { ktnRaw: 'FF123456789' },
    frequentFlyerNumbers: [],
    frequentFlyerNumber: '',
    frequentFlyerReview: [review],
  }
  return { review, match, reconciliation: { matches: [match], frequentFlyerSummary: { reviewCount: 1 } } }
}

test('moves a reviewed KTN-field candidate into FF# and clears the misplaced KTN', () => {
  const { review, match, reconciliation } = fixture()
  const key = frequentFlyerReviewKey(match, review)
  const result = applyFrequentFlyerDecisions(reconciliation, {
    [key]: { action: 'ff', value: 'AA#123456789' },
  })

  assert.equal(result.matches[0].frequentFlyerNumber, 'AA#123456789')
  assert.equal(result.matches[0].ppdt.ktnRaw, '')
  assert.equal(result.matches[0].aevd.ktnRaw, '')
  assert.equal(result.frequentFlyerSummary.reviewCount, 0)
})

test('keeps a reviewed value as KTN without adding an FF#', () => {
  const { review, match, reconciliation } = fixture()
  const key = frequentFlyerReviewKey(match, review)
  const result = applyFrequentFlyerDecisions(reconciliation, {
    [key]: { action: 'ktn', value: '123456789' },
  })

  assert.equal(result.matches[0].frequentFlyerNumber, '')
  assert.equal(result.matches[0].ppdt.ktnRaw, '123456789')
  assert.equal(result.frequentFlyerSummary.reviewCount, 0)
})

test('removes a dismissed false candidate from the exported KTN field', () => {
  const { review, match, reconciliation } = fixture()
  const key = frequentFlyerReviewKey(match, review)
  const result = applyFrequentFlyerDecisions(reconciliation, {
    [key]: { action: 'ignore', value: 'FF123456789' },
  })

  assert.equal(result.matches[0].frequentFlyerNumber, '')
  assert.equal(result.matches[0].ppdt.ktnRaw, '')
  assert.equal(result.matches[0].aevd.ktnRaw, '')
  assert.equal(result.frequentFlyerSummary.reviewCount, 0)
})

test('accepts numeric and enrollment-prefix KTNs but rejects airline-style values', () => {
  assert.equal(isPlausibleKtn('123456789'), true)
  assert.equal(isPlausibleKtn('991234567'), true)
  assert.equal(isPlausibleKtn('TT1234567'), true)
  assert.equal(isPlausibleKtn('TE12345678'), true)
  assert.equal(isPlausibleKtn('UA:ABC12345'), false)
  assert.equal(isPlausibleKtn('UA#ABC12345'), false)
})
