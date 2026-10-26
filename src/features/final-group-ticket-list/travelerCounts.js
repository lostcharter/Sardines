function clean(value) {
  return String(value ?? '').trim()
}

function sameTourDirector(match, contact) {
  const matchNumber = clean(match?.ppdt?.travelerNumber || match?.aevd?.travelerNumber)
  const contactNumber = clean(contact?.travelerNumber)
  if (matchNumber && contactNumber) return matchNumber === contactNumber

  const normalize = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '')
  const matchName = normalize(match?.ppdt?.displayName || match?.aevd?.travelerName)
  const contactName = normalize([contact?.firstName, contact?.middleName, contact?.lastName].filter(Boolean).join(' '))
  return Boolean(matchName && contactName && matchName === contactName)
}

export function travelerRosterCounts(reconciliation, tourDirectorContact) {
  const matches = (reconciliation?.matches ?? [])
    .filter((match) => match?.passengerOverride?._isDraft !== true)
  const unresolved = Math.max(
    reconciliation?.unmatchedAevd?.length ?? 0,
    reconciliation?.unmatchedPpdt?.length ?? 0
  )
  const matchedTourDirectors = matches.filter((match) =>
    match?.operational === true || sameTourDirector(match, tourDirectorContact)
  ).length
  const primaryTourDirectorIsExtra =
    tourDirectorContact?.present === true &&
    !matches.some((match) => sameTourDirector(match, tourDirectorContact))

  return {
    totalTravelers: matches.length + unresolved + (primaryTourDirectorIsExtra ? 1 : 0),
    tourDirectors: matchedTourDirectors + (primaryTourDirectorIsExtra ? 1 : 0),
  }
}
