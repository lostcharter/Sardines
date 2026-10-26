export function travelerAssignmentKey(match) {
  const travelerNumber = String(match?.ppdt?.travelerNumber ?? '').trim()
  if (travelerNumber) return travelerNumber

  const name = String(match?.ppdt?.displayName ?? match?.aevd?.travelerName ?? '').trim()
  const reservation = String(match?.aevd?.reservationNumber ?? match?.ppdt?.reservationId ?? '').trim()
  return `${name}|${reservation}`
}

export function assignTravelersToRecord(current, matches, record) {
  const next = { ...current }
  for (const match of matches) {
    next[travelerAssignmentKey(match)] = {
      recordNumber: record.recordNumber,
      record,
    }
  }
  return next
}

export function updateBulkSelection({
  currentKeys,
  visibleKeys,
  clickedKey,
  anchorKey,
  shiftKey = false,
}) {
  const current = new Set(currentKeys)
  const anchorIndex = visibleKeys.indexOf(anchorKey)
  const clickedIndex = visibleKeys.indexOf(clickedKey)

  if (shiftKey && anchorIndex >= 0 && clickedIndex >= 0) {
    const start = Math.min(anchorIndex, clickedIndex)
    const end = Math.max(anchorIndex, clickedIndex)
    const range = visibleKeys.slice(start, end + 1)
    return {
      selectedKeys: [...new Set([...currentKeys, ...range])],
      anchorKey,
    }
  }

  if (current.has(clickedKey)) current.delete(clickedKey)
  else current.add(clickedKey)
  return { selectedKeys: [...current], anchorKey: clickedKey }
}

export function companyTravelerRoster(assignments) {
  return [...new Map(
    (assignments ?? [])
      .filter((assignment) => assignment.assignmentType !== 'own-air')
      .map((assignment) => [travelerAssignmentKey(assignment.match), assignment.match])
  ).values()]
}
