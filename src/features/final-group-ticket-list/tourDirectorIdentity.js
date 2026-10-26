function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function matchIsTourDirector(match, contact) {
  const travelerNumber = clean(match?.ppdt?.travelerNumber)
  const contactTravelerNumber = clean(contact?.travelerNumber)

  if (travelerNumber && contactTravelerNumber) {
    return travelerNumber === contactTravelerNumber
  }

  const matchName = normalize(
    match?.ppdt?.displayName ?? match?.aevd?.travelerName
  )
  const contactName = normalize([
    contact?.firstName,
    contact?.middleName,
    contact?.lastName,
  ].filter(Boolean).join(' '))

  return Boolean(matchName && contactName && matchName === contactName)
}

export function findNamedTourDirectorMatch(matches, reportedName) {
  const words = clean(reportedName).split(/\s+/).filter(Boolean)
  if (words.length < 2) return null

  const reportedFirst = normalize(words[0])
  const reportedLast = normalize(words.at(-1))
  const candidates = (matches ?? []).filter((match) => {
    const traveler = match?.ppdt ?? match?.aevd ?? {}
    return normalize(traveler.firstName) === reportedFirst &&
      normalize(traveler.lastName) === reportedLast
  })

  return candidates.length === 1 ? candidates[0] : null
}
