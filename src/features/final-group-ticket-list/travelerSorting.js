function clean(value) {
  return String(value ?? '').trim()
}

function displayName(match) {
  return clean(match?.ppdt?.displayName ?? match?.aevd?.travelerName)
}

export function compareTravelerMatches(left, right) {
  const sortKey = (match) => {
    const traveler = match?.ppdt ?? match?.aevd ?? {}
    const display = displayName(match).split(/\s+/).filter(Boolean)
    return [
      traveler.lastName || display.at(-1),
      traveler.firstName || display[0],
      traveler.middleName || '',
    ].map((value) => clean(value).toLowerCase()).join('|')
  }
  return sortKey(left).localeCompare(sortKey(right))
}

export function compareTravelerAssignments(left, right) {
  return compareTravelerMatches(left?.match, right?.match)
}
