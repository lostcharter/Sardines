export const MANUAL_WORKBOOK_NOTE = 'Manually edited in Sardines.'

export function hasManualWorkbookCorrection(match) {
  return Boolean(
    (match?.passengerOverride && match.passengerOverride._isDraft !== true) ||
    match?.ffKtnEdited
  )
}

export function manualWorkbookNote(match) {
  return hasManualWorkbookCorrection(match)
    ? MANUAL_WORKBOOK_NOTE
    : ''
}
