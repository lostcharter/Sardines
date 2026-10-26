const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')

const normalizedDate = (value) => {
  const text = String(value ?? '').trim()
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (!match) return normalize(text)

  const [, month, day, rawYear] = match
  const year = rawYear.length === 2
    ? (Number(rawYear) >= 50 ? `19${rawYear}` : `20${rawYear}`)
    : rawYear

  return `${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`
}

export function isTourDirectorRecord(traveler) {
  const name = normalize(traveler?.travelerName)
  const comments = normalize(traveler?.comments)
  return name.includes('tourdirector') ||
    comments.includes('tourdirector')
}

export function classifyAevdTraveler(traveler) {
  if (!isTourDirectorRecord(traveler)) {
    return { ...traveler, recordType: 'passenger', reviewRequired: false, reviewReason: '' }
  }
  return {
    ...traveler,
    recordType: 'tour-director',
    reviewRequired: true,
    reviewReason: 'Record is labeled or marked as a Tour Director.',
  }
}

export function findExactOperationalPassportCandidate(
  traveler,
  passportTravelers,
  usedIndexes = new Set()
) {
  const candidates = (passportTravelers ?? [])
    .map((passport, index) => ({ passport, index }))
    .filter(({ passport, index }) =>
      !usedIndexes.has(index) &&
      normalize(passport.firstName) === normalize(traveler?.firstName) &&
      normalize(passport.lastName) === normalize(traveler?.lastName) &&
      normalizedDate(passport.dateOfBirth) === normalizedDate(traveler?.dateOfBirth)
    )

  return candidates.length === 1 ? candidates[0] : null
}
