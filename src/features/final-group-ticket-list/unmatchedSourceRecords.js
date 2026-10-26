function clean(value) {
  return String(value ?? '').trim()
}

export function unmatchedSourceRecordKey(sourceType, traveler) {
  return [
    sourceType,
    traveler?.reservationNumber ?? traveler?.reservationId,
    traveler?.travelerNumber,
    traveler?.firstName,
    traveler?.middleName,
    traveler?.lastName,
    traveler?.dateOfBirth,
    traveler?.passportNumber,
  ].map((value) => clean(value).toLowerCase()).join('|')
}

export function removeDismissedUnmatchedRecords(reconciliation, dismissedKeys) {
  const dismissed = dismissedKeys ?? new Set()
  return {
    ...reconciliation,
    unmatchedAevd: (reconciliation?.unmatchedAevd ?? []).filter((item) =>
      !dismissed.has(unmatchedSourceRecordKey('air', item?.traveler))
    ),
    unmatchedPpdt: (reconciliation?.unmatchedPpdt ?? []).filter((item) =>
      !dismissed.has(unmatchedSourceRecordKey('passport', item?.traveler))
    ),
  }
}

function passportSourceKey(traveler) {
  return [
    traveler?.reservationId,
    traveler?.firstName,
    traveler?.middleName,
    traveler?.lastName,
    traveler?.dateOfBirth,
  ].map(clean).join('|')
}

function unmatchedGroupKey(row) {
  const traveler = row?.unmatchedTraveler
  const reservation = clean(
    traveler?.reservationNumber ?? traveler?.reservationId ?? row?.reservation
  ).toLowerCase()
  const first = clean(traveler?.firstName).toLowerCase()
  const last = clean(traveler?.lastName).toLowerCase()
  return reservation && first && last
    ? `${reservation}|${first}|${last}`
    : `row:${row?.id}`
}

function sourceConflictIssues(airTraveler, passportTraveler) {
  const issues = []
  const airDob = clean(airTraveler?.dateOfBirth)
  const passportDob = clean(passportTraveler?.dateOfBirth)
  if (airDob && passportDob && airDob !== passportDob) {
    issues.push(
      `Date of birth differs: Air Report ${airDob}; Passport Report ${passportDob}.`
    )
  }
  return issues
}

export function groupUnmatchedSourceRows(rows) {
  const groups = new Map()

  ;(rows ?? []).forEach((row) => {
    const baseKey = unmatchedGroupKey(row)
    const existing = groups.get(baseKey)
    const key = existing?.sources?.includes(row.source)
      ? `${baseKey}|${row.source}|${row.id}`
      : baseKey
    const current = groups.get(key)
    if (!current) {
      groups.set(key, {
        ...row,
        sources: [row.source],
        issues: [row.issue],
        sourceUnmatchedType: row.source === 'Passport' ? 'passport' : 'air',
        unmatchedAevd: row.source === 'Domestic Air' ? row.unmatchedTraveler : null,
        unmatchedPpdt: row.source === 'Passport' ? row.unmatchedTraveler : null,
      })
      return
    }

    const sources = [...new Set([...current.sources, row.source])]
    const unmatchedAevd =
      row.source === 'Domestic Air'
        ? row.unmatchedTraveler
        : current.unmatchedAevd
    const unmatchedPpdt =
      row.source === 'Passport'
        ? row.unmatchedTraveler
        : current.unmatchedPpdt
    const conflicts = sourceConflictIssues(unmatchedAevd, unmatchedPpdt)
    const issues = conflicts.length > 0
      ? conflicts
      : [...new Set([...current.issues, row.issue])]
    groups.set(key, {
      ...current,
      id: `${current.id}+${row.id}`,
      source: sources.join(' + '),
      sources,
      issue: issues.join(' '),
      issues,
      unmatchedTraveler: {
        ...current.unmatchedTraveler,
        ...row.unmatchedTraveler,
      },
      unmatchedAevd,
      unmatchedPpdt,
      sourceUnmatchedType: sources.length > 1 ? 'both' : current.sourceUnmatchedType,
    })
  })

  return [...groups.values()]
}

function sourceIdentityMatches(person, traveler, reservationField) {
  const sourceReservation = clean(person.sourceUnmatchedReservation)
  const travelerReservation = clean(traveler?.[reservationField])
  if (!sourceReservation || sourceReservation !== travelerReservation) return false

  const sourceFirst = clean(person.sourceUnmatchedFirstName).toLowerCase()
  const sourceLast = clean(person.sourceUnmatchedLastName).toLowerCase()
  if (!sourceFirst && !sourceLast) return true

  return sourceFirst === clean(traveler?.firstName).toLowerCase() &&
    sourceLast === clean(traveler?.lastName).toLowerCase()
}

export function removeAdoptedUnmatchedRecords(reconciliation, manualPeople, passengerOverrides) {
  const savedPeople = (manualPeople ?? []).filter(
    (person) => passengerOverrides?.[`manual:${person.id}`]?._isDraft !== true
  )
  const resolvedPassportTravelerNumbers = new Set(
    savedPeople
      .filter((person) => ['passport', 'both'].includes(person.sourceUnmatchedType) && person.sourceUnmatchedTravelerNumber)
      .map((person) => clean(person.sourceUnmatchedTravelerNumber))
  )
  const resolvedPassportSourceKeys = new Set(
    savedPeople
      .filter((person) => ['passport', 'both'].includes(person.sourceUnmatchedType) && !person.sourceUnmatchedTravelerNumber)
      .map((person) => passportSourceKey({
        reservationId: person.sourceUnmatchedReservation,
        firstName: person.sourceUnmatchedFirstName,
        middleName: person.sourceUnmatchedMiddleName,
        lastName: person.sourceUnmatchedLastName,
        dateOfBirth: person.sourceUnmatchedDateOfBirth,
      }))
  )

  return {
    ...reconciliation,
    unmatchedAevd: (reconciliation?.unmatchedAevd ?? []).filter(
      (item) => !savedPeople.some((person) =>
        sourceIdentityMatches(person, item?.traveler, 'reservationNumber')
      )
    ),
    unmatchedPpdt: (reconciliation?.unmatchedPpdt ?? []).filter((item) => {
      const travelerNumber = clean(item?.traveler?.travelerNumber)
      const adoptedPassport = travelerNumber
        ? resolvedPassportTravelerNumbers.has(travelerNumber)
        : resolvedPassportSourceKeys.has(passportSourceKey(item?.traveler))
      const adoptedMatchingAirTraveler = savedPeople.some((person) =>
        person.sourceUnmatchedType !== 'passport' &&
        sourceIdentityMatches(person, item?.traveler, 'reservationId')
      )
      return !adoptedPassport && !adoptedMatchingAirTraveler
    }),
  }
}
