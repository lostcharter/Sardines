import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeFrequentFlyers } from './frequentFlyer.js'

test('shows one FF review when AEVD and PPDT repeat the same KTN-field value', () => {
  const result = mergeFrequentFlyers({
    reconciliation: {
      matches: [{
        operational: false,
        aevd: { ktnRaw: 'FF123456789' },
        ppdt: { ktnRaw: 'FF123456789' },
      }],
    },
  })

  assert.equal(result.matches[0].frequentFlyerReview.length, 1)
  assert.equal(result.frequentFlyerSummary.reviewCount, 1)
})

test('recognizes a carrier-prefixed FF number misplaced in the KTN field', () => {
  const result = mergeFrequentFlyers({
    reconciliation: {
      matches: [{
        operational: false,
        aevd: { ktnRaw: 'UA:ABC12345' },
        ppdt: { travelerNumber: '101', ktnRaw: '' },
      }],
    },
  })

  assert.equal(result.matches[0].frequentFlyerReview.length, 1)
  assert.equal(result.matches[0].frequentFlyerReview[0].normalizedValue, 'UA#ABC12345')
})

test('preserves a manually supplied FF number when rebuilding review candidates', () => {
  const result = mergeFrequentFlyers({
    reconciliation: {
      matches: [{
        operational: false,
        frequentFlyerNumber: 'UA#ABC12345',
        aevd: { ktnRaw: '' },
        ppdt: { travelerNumber: '101', ktnRaw: '' },
      }],
    },
  })

  assert.equal(result.matches[0].frequentFlyerNumber, 'UA#ABC12345')
})
