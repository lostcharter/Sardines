import { roommatesForMatch } from './roomingListParser.js'

const clean = (value) => String(value ?? '').trim()

function hasExplicitProximityInstruction(match) {
  const source = clean(match?.aevd?.comments)
  return /\b(?:SEAT|SIT)\s+(?:NEAR|NEXT\s+TO|WITH|BESIDE)|\bACROSS\s+FROM\b/i.test(source)
}

export function manifestSpecialRequests(match, roomingData) {
  const analysis = match?.aevd?.commentAnalysis
  const parts = []

  // Anything the conservative parser did not classify is still the
  // operator's manifest instruction and must not disappear at export.
  if (analysis?.cleanedComment) parts.push(clean(analysis.cleanedComment))

  ;(analysis?.seatingClues ?? []).forEach((item) => {
    if (item.sourceText) parts.push(clean(item.sourceText))
  })
  ;(analysis?.relationshipClues ?? []).forEach((item) => {
    if (item.sourceText) parts.push(clean(item.sourceText))
  })
  ;(analysis?.upgradeClues ?? []).forEach((item) => {
    if (item.sourceText) parts.push(clean(item.sourceText))
  })

  const roommates = roommatesForMatch(roomingData, match)
  if (roommates.length > 0 && !hasExplicitProximityInstruction(match)) {
    parts.push(`Seat near ${roommates.join(' / ')}`)
  }

  return [...new Set(parts.filter(Boolean))].join('; ')
}
