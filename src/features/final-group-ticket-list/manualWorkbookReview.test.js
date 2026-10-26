import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasManualWorkbookCorrection,
  manualWorkbookNote,
} from './manualWorkbookReview.js'

test('marks a saved Sardines passenger override for workbook review', () => {
  const match = { passengerOverride: { firstName: 'Ada' } }

  assert.equal(hasManualWorkbookCorrection(match), true)
  assert.equal(manualWorkbookNote(match), 'Manually edited in Sardines.')
})

test('does not mark source-only travelers or unsaved drafts', () => {
  assert.equal(hasManualWorkbookCorrection({}), false)
  assert.equal(hasManualWorkbookCorrection({ passengerOverride: { _isDraft: true } }), false)
  assert.equal(manualWorkbookNote({}), '')
})

test('marks an applied FF or KTN edit but not a review-only dismissal', () => {
  assert.equal(hasManualWorkbookCorrection({ ffKtnEdited: true }), true)
  assert.equal(hasManualWorkbookCorrection({ ffKtnReviewed: true, ffKtnEdited: false }), false)
})
