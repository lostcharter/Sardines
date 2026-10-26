import {
  airportMatchesLocation,
  routeIsRoundTripForLocation,
} from './airportLocations.js'

function clean(value) {
  return String(
    value ?? ''
  ).trim()
}

function normalize(value) {
  return clean(value)
    .toUpperCase()
}

function normalizeCompact(value) {
  return normalize(value)
    .replace(
      /[^A-Z0-9]/g,
      ''
    )
}

function isAirportCode(value) {
  return /^[A-Z]{3}$/.test(
    normalize(value)
  )
}

function isOwnMarker(value) {
  const normalized =
    normalizeCompact(value)

  return (
    normalized === 'OWN' ||
    normalized === 'AIR'
  )
}

function classifyAirType(value) {
  const normalized =
    normalizeCompact(value)

  if (
    normalized === 'COMPANYAIR'
  ) {
    return 'company-air'
  }

  if (
    normalized === 'OWNAIR' ||
    normalized === 'OWN'
  ) {
    return 'own-air'
  }

  return 'unknown'
}

function getRouteAirports(record) {
  return clean(
    record?.routing
  )
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(
      (part) =>
        /^[A-Z]{3}$/.test(
          part
        )
    )
}

function getRouteOrigin(record) {
  return (
    getRouteAirports(
      record
    )[0] ?? ''
  )
}

function getRouteFinal(record) {
  const airports =
    getRouteAirports(
      record
    )

  return (
    airports[
      airports.length - 1
    ] ?? ''
  )
}

function getRouteKey(record) {
  return getRouteAirports(
    record
  ).join('-')
}

function recordAirports(record) {
  return new Set([
    ...getRouteAirports(record),
    ...(record?.flights ?? []).flatMap((flight) => [
      normalize(flight?.departureAirport),
      normalize(flight?.arrivalAirport),
    ]),
  ].filter(isAirportCode))
}

function recordIncludesLocation(record, location) {
  return [...recordAirports(record)].some((airport) =>
    airportMatchesLocation(airport, location)
  )
}

function isRoundTripFrom(
  record,
  airport
) {
  return routeIsRoundTripForLocation(
    getRouteOrigin(
      record
    ),
    getRouteFinal(
      record
    ),
    airport
  )
}

function passengerCapacity(record) {
  const parsed =
    Number(
      record?.passengerCount
    )

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0
}

function passengerPrice(record) {
  const price = Number(record?.totalPerPassenger)
  return Number.isFinite(price) ? price : Number.POSITIVE_INFINITY
}

function equivalentRecordSignature(record) {
  const header = clean(record?.sourceHeader)
  const title = header
    ? header.replace(/^Record\s+\d+\s*:\s*\d+\s+Passengers?\s*\/\s*/i, '')
    : `${clean(record?.routing)} ${clean(record?.airlineName || record?.airlineCode)}`
  const segments = (record?.flights ?? []).map((flight) => [
    flight?.flight,
    flight?.departureAirport,
    flight?.departureText,
    flight?.arrivalAirport,
    flight?.arrivalText,
  ].map(normalizeCompact).join(':')).join('|')
  return `${normalizeCompact(title)}::${segments}`
}

function travelerReservation(match) {
  return clean(match?.aevd?.reservationNumber || match?.ppdt?.reservationId)
}

function travelerNameParts(match) {
  const sources = [match?.ppdt, match?.aevd]
  return new Set(sources.flatMap((traveler) => [
    traveler?.lastName,
    traveler?.displayName?.split(/\s+/).at(-1),
    traveler?.travelerName?.split(/\s+/).at(-1),
  ]).map(normalizeCompact).filter((part) => part.length >= 3))
}

function recordNames(record) {
  const parenthetical = clean(record?.sourceHeader).match(/\(([^)]+)\)/)?.[1] ?? ''
  return parenthetical.split(/[/,;&]+/).map(normalizeCompact).filter((part) => part.length >= 3)
}

function recordNamesTraveler(record, match) {
  const names = recordNames(record)
  const travelerParts = travelerNameParts(match)
  return names.length > 0 && names.some((name) => travelerParts.has(name))
}

function recordHasSpecialAssignment(record) {
  const header = clean(record?.sourceHeader)
    .replace(/^Record\s+\d+\s*:\s*\d+\s+Passengers?\s*\/\s*/i, '')
  return recordNames(record).length > 0 || /\b(?:economy|premium|business|first(?:\s+class)?|upgrade|outbound|return)\b/i.test(header)
}

function confirmedCabinKinds(match) {
  const comment = clean(match?.aevd?.comments)
  const affirmative = '(?:confirmed|accepted|agreed|approved|ok(?:ay)?ed|booked|ticketed|took|taking)'
  const tentativeOrNegative = /\b(?:not|never|declined|cancelled|canceled|want(?:s|ed)?|would\s+like|quote|request(?:s|ed)?|interested|pending|waitlist(?:ed)?)\b/i
  const nearAffirmative = (pattern) =>
    new RegExp(`(?:${affirmative}[\\s\\S]{0,140}${pattern}|${pattern}[\\s\\S]{0,140}${affirmative})`, 'i').test(comment) &&
    !tentativeOrNegative.test(comment)
  const definitiveUpgrade = (pattern) =>
    new RegExp(`(?:${pattern}[\\s\\S]{0,40}upgrade|upgrade[\\s\\S]{0,40}${pattern})`, 'i').test(comment) &&
    !tentativeOrNegative.test(comment)
  const kinds = []
  const firstBusiness = '(?:first(?:\\s+class)?|business(?:\\s+class)?)'
  const premium = 'premium(?:\\s+economy)?'
  if (nearAffirmative(firstBusiness) || definitiveUpgrade(firstBusiness)) kinds.push('first-business')
  if (nearAffirmative(premium) || definitiveUpgrade(premium)) kinds.push('premium')
  return kinds
}

function recordMatchesConfirmedCabin(record, kinds) {
  const header = clean(record?.sourceHeader)
  return kinds.some((kind) => kind === 'first-business'
    ? /\b(?:first|business)\b/i.test(header)
    : /\bpremium\b/i.test(header))
}

function confirmedCabinLabel(records) {
  const headers = records.map((record) => clean(record?.sourceHeader)).join(' ')
  if (/\bbusiness\b/i.test(headers)) return 'Business Class'
  if (/\bfirst\b/i.test(headers)) return 'First Class'
  if (/\bpremium\b/i.test(headers)) return 'Premium cabin'
  return 'upgraded cabin'
}

function holdOversubscribedConfirmedCabins(assignments, records) {
  const confirmed = assignments.filter(
    (assignment) => assignment.assignmentSource === 'confirmed-cabin-comment'
  )
  const groups = new Map()
  confirmed.forEach((assignment) => {
    const key = (assignment.candidates ?? [])
      .map(Number)
      .sort((left, right) => left - right)
      .join('|')
    if (key) groups.set(key, [...(groups.get(key) ?? []), assignment])
  })

  let result = [...assignments]
  for (const group of groups.values()) {
    const candidateNumbers = new Set(group[0].candidates.map(Number))
    const cabinRecords = records.filter((record) => candidateNumbers.has(Number(record.recordNumber)))
    const reservedByOtherRules = assignments.filter((assignment) =>
      assignment.assignmentSource !== 'confirmed-cabin-comment' &&
      candidateNumbers.has(Number(assignment.recordNumber))
    ).length
    const available = Math.max(
      0,
      cabinRecords.reduce((total, record) => total + passengerCapacity(record), 0) - reservedByOtherRules
    )
    if (group.length <= available) continue

    const routeKeys = new Set(cabinRecords.map(getRouteKey).filter(Boolean))
    const reviewCandidates = records
      .filter((record) => routeKeys.has(getRouteKey(record)))
      .map((record) => record.recordNumber)
    const cabin = confirmedCabinLabel(cabinRecords)
    const reason = `${group.length} confirmed ${cabin} travelers are competing for ${available} available ${cabin} ${available === 1 ? 'seat' : 'seats'}. Choose who receives the cabin seat and reassign the others.`

    result = result.map((assignment) => group.includes(assignment)
      ? {
          ...assignment,
          recordNumber: null,
          record: null,
          assignmentType: 'ambiguous',
          reviewRequired: true,
          reviewReason: reason,
          candidates: reviewCandidates,
        }
      : assignment)
  }
  return result
}

function preferredCarrier(match) {
  const comment = clean(match?.aevd?.comments)
  const preference = comment.match(/prefer(?:s|red)?[\s\S]{0,40}\b(united|delta|lufthansa|american|ua|dl|lh|aa)\b/i)
    ?? comment.match(/\bon\s+(?:the\s+)?(united|delta|lufthansa|american)\s+flight/i)
  const value = normalize(preference?.[1])
  return ({ UA: 'UNITED', DL: 'DELTA', LH: 'LUFTHANSA', AA: 'AMERICAN' })[value] ?? value
}

function recordMatchesCarrier(record, carrier) {
  if (!carrier) return false
  return [record?.airlineName, record?.airlineCode, record?.sourceHeader]
    .some((value) => normalize(value).includes(carrier))
}

function roommateGroups(assignments, roomingData) {
  const parents = assignments.map((_, index) => index)
  const find = (index) => parents[index] === index ? index : (parents[index] = find(parents[index]))
  const join = (left, right) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
  }
  const names = assignments.map((item) => normalizeCompact(travelerLabel(item.match)))
  const nameParts = assignments.map((item) => travelerNameParts(item.match))
  const reservations = assignments.map((item) => travelerReservation(item.match))
  const relationshipTexts = assignments.map((item) =>
    (item.match?.aevd?.commentAnalysis?.relationshipClues ?? [])
      .filter((clue) => clue.strength === 'explicit')
      .map((clue) => normalizeCompact(clue.personText))
      .filter(Boolean)
  )

  const namesPerson = (texts, parts) => texts.some((text) =>
    [...parts].some((part) => part.length >= 3 && text.includes(part))
  )

  assignments.forEach((_, left) => assignments.forEach((__, right) => {
    if (right <= left) return
    if (reservations[left] && reservations[left] === reservations[right]) join(left, right)
    const leftRoommates = roomingData?.roommateMap?.get(reservations[left]) ?? []
    const rightRoommates = roomingData?.roommateMap?.get(reservations[right]) ?? []
    if (leftRoommates.some((name) => normalizeCompact(name) === names[right])) join(left, right)
    if (rightRoommates.some((name) => normalizeCompact(name) === names[left])) join(left, right)
    if (namesPerson(relationshipTexts[left], nameParts[right])) join(left, right)
    if (namesPerson(relationshipTexts[right], nameParts[left])) join(left, right)
  }))

  const groups = new Map()
  assignments.forEach((assignment, index) => {
    const root = find(index)
    groups.set(root, [...(groups.get(root) ?? []), assignment])
  })
  return [...groups.values()]
}

function distributeEquivalentRecordAssignments(assignments, records, roomingData) {
  const result = [...assignments]
  const pendingByCandidates = new Map()
  assignments.forEach((assignment) => {
    if (assignment.assignmentType !== 'ambiguous' || (assignment.candidates ?? []).length < 2) return
    const key = [...assignment.candidates].map(Number).sort((a, b) => a - b).join('|')
    pendingByCandidates.set(key, [...(pendingByCandidates.get(key) ?? []), assignment])
  })

  for (const pending of pendingByCandidates.values()) {
    const priceBasedRouteFill = pending.every(
      (assignment) => assignment.assignmentSource === 'route-price-capacity'
    )
    const candidates = pending[0].candidates
      .map((number) => records.find((record) => Number(record.recordNumber) === Number(number)))
      .filter(Boolean)
      .sort((left, right) => passengerPrice(left) - passengerPrice(right) || Number(left.recordNumber) - Number(right.recordNumber))
    if (candidates.length < 2) continue
    const signatures = new Set(candidates.map(equivalentRecordSignature))
    const sameRoute = new Set(candidates.map(getRouteKey)).size === 1
    if (priceBasedRouteFill) {
      if (!sameRoute || candidates.some(recordHasSpecialAssignment)) continue
    } else if (signatures.size !== 1 || ![...signatures][0]) continue

    const remaining = new Map(candidates.map((record) => {
      const alreadyAssigned = result.filter((item) => Number(item.recordNumber) === Number(record.recordNumber)).length
      return [Number(record.recordNumber), Math.max(0, passengerCapacity(record) - alreadyAssigned)]
    }))

    for (const group of roommateGroups(pending, roomingData)) {
      const record = candidates.find((item) => remaining.get(Number(item.recordNumber)) >= group.length)
      if (!record) continue
      remaining.set(Number(record.recordNumber), remaining.get(Number(record.recordNumber)) - group.length)
      for (const original of group) {
        const index = result.indexOf(original)
        result[index] = {
          ...original,
          recordNumber: record.recordNumber,
          record,
          assignmentType: 'company-air',
          assignmentSource: 'equivalent-record-capacity',
          ...(priceBasedRouteFill ? { assignmentSource: 'route-price-capacity' } : {}),
          reviewRequired: false,
          reviewReason: '',
          candidates: original.candidates,
        }
      }
    }
  }
  return result
}

export function rebalanceEquivalentRecordAssignments(assignments, records, roomingData) {
  const reset = (assignments ?? []).map((assignment) => {
    if (!['equivalent-record-capacity', 'route-price-capacity'].includes(assignment.assignmentSource) || (assignment.candidates ?? []).length < 2) return assignment
    return {
      ...assignment,
      recordNumber: null,
      record: null,
      assignmentType: 'ambiguous',
      reviewRequired: true,
    }
  })
  return distributeEquivalentRecordAssignments(reset, records ?? [], roomingData)
}

function buildRecordLabel(record) {
  return `R${
    record.recordNumber
  } · ${
    record.routing ||
    'Routing unavailable'
  } · ${
    record.passengerCount
  } pax`
}

function getSelectedTourRecordNumbers(
  tourFlight
) {
  if (
    !tourFlight?.enabled
  ) {
    return []
  }

  return (
    tourFlight.recordNumbers ??
    []
  ).map(Number)
}

function travelerLabel(match) {
  const traveler =
    match?.ppdt ??
    match?.aevd ??
    {}

  return (
    traveler.displayName ||
    traveler.travelerName ||
    [
      traveler.firstName,
      traveler.middleName,
      traveler.lastName,
    ]
      .filter(Boolean)
      .join(' ') ||
    'Unknown traveler'
  )
}

/*
 * --------------------------------------------------
 * STRUCTURED FLIGHT-COMMENT EVIDENCE
 * --------------------------------------------------
 *
 * Raw Flight Comments are analyzed once by
 * commentAnalysis.js when AEVD is parsed.
 *
 * Flight assignment consumes only the structured
 * high-confidence deviation clues here.
 *
 * Raw comments remain on traveler.comments for
 * audit/review.
 */

function findCommentOverrideRecord({
  traveler,
  companyRecords,
}) {
  const analysis =
    traveler
      ?.commentAnalysis

  if (!analysis) {
    return null
  }

  const departureCity =
    normalize(
      traveler
        ?.departureCity
    )

  const deviationAirport =
    normalize(
      analysis
        .flightDeviation
        ?.roundTripAirport
    )

  const returnAirport =
    normalize(
      analysis
        .flightDeviation
        ?.returnAirport
    )

  /*
   * Explicit return-only deviation.
   *
   * Examples:
   * "Returning to DTW instead of ORD"
   * "Deviation return to DTW"
   *
   * The matching FMG record may repeat the normal outbound but
   * end at the alternate return airport.
   */
  if (
    isAirportCode(departureCity) &&
    isAirportCode(returnAirport)
  ) {
    const candidates =
      companyRecords.filter(
        (record) =>
          airportMatchesLocation(
            getRouteOrigin(record),
            departureCity
          ) &&
          airportMatchesLocation(
            getRouteFinal(record),
            returnAirport
          )
      )

    if (candidates.length === 1) {
      return {
        record: candidates[0],
        source: 'flight-comment',
        reason: `Flight Comment says the traveler returns to ${returnAirport} instead of ${departureCity}.`,
      }
    }
  }

  /*
   * RULE 1:
   * Explicit round-trip deviation.
   *
   * Example:
   * "Deviation Flying To/From MSP"
   */
  if (
    isAirportCode(
      deviationAirport
    )
  ) {
    const candidates =
      companyRecords.filter(
        (record) =>
          isRoundTripFrom(
            record,
            deviationAirport
          )
      )

    if (
      candidates.length === 1
    ) {
      return {
        record:
          candidates[0],

        source:
          'flight-comment',

        reason:
          `Flight Comment indicates a deviation flying to/from ${deviationAirport}.`,
      }
    }
  }

  /*
   * RULE 2:
   * The final contracted FMG segment
   * was explicitly removed.
   *
   * If exactly one alternate contract
   * record starts at the traveler's normal
   * departure airport and ends elsewhere,
   * Sardines may propose that record.
   *
   * Multiple alternates remain human review.
   */
  if (
    isAirportCode(
      departureCity
    ) &&
    analysis
      .flightDeviation
      ?.lastSegmentRemoved
  ) {
    const alternateRecords =
      companyRecords.filter(
        (record) =>
          getRouteOrigin(
            record
          ) ===
            departureCity &&
          getRouteFinal(
            record
          ) !==
            departureCity
      )

    if (
      alternateRecords.length ===
      1
    ) {
      const alternate =
        alternateRecords[0]

      return {
        record:
          alternate,

        source:
          'flight-comment',

        reason:
          analysis
            .flightDeviation
            ?.ownArrangementAfterChange
            ? `Flight Comment says the final FMG segment was removed and the traveler will make their own arrangements after ${getRouteFinal(
              alternate
            )}.`
            : `Flight Comment says the final FMG segment was removed. The only alternate ${departureCity}-origin contract record ends at ${getRouteFinal(
              alternate
            )}.`,
      }
    }
  }

  return null
}

function annotateFrequentFlyerCandidates(
  traveler,
  record
) {
  const candidates =
    traveler
      ?.frequentFlyerCandidates ??
    traveler
      ?.commentAnalysis
      ?.frequentFlyerCandidates ??
    []

  if (
    candidates.length === 0
  ) {
    return []
  }

  const contractedCarrier =
    normalize(
      record?.airlineCode
    )

  return candidates.map(
    (candidate) => {
      const candidateCarrier =
        normalize(
          candidate
            .carrierCode
        )

      const directCarrierMatch =
        Boolean(
          contractedCarrier &&
          candidateCarrier &&
          contractedCarrier ===
            candidateCarrier
        )

      return {
        ...candidate,

        contractedCarrier:
          contractedCarrier,

        relevance:
          directCarrierMatch
            ? 'direct-carrier-match'
            : candidateCarrier
              ? 'partner-or-other-review'
              : 'carrier-unknown-review',

        /*
         * Sardines does not yet maintain a
         * full airline-partner table.
         *
         * A non-direct match is therefore
         * surfaced for human review rather
         * than rejected or silently used.
         */
        reviewRequired:
          true,

        reviewReason:
          directCarrierMatch
            ? `${candidate.carrierName || candidateCarrier} frequent-flyer number matches the contracted carrier. Verify before export.`
            : candidateCarrier
              ? `${candidate.carrierName || candidateCarrier} frequent-flyer number does not directly match contracted carrier ${contractedCarrier || 'unknown'}. Check whether the program is a valid partner before export.`
              : 'Frequent-flyer candidate has no clear airline/program. Verify before export.',
      }
    }
  )
}

/*
 * --------------------------------------------------
 * MAIN COMPANY AIR ASSIGNMENT
 * --------------------------------------------------
 */

function assignCompanyAirMatch(
  match,
  companyRecords
) {
  const traveler =
    match?.aevd

  if (!traveler) {
    return {
      match,

      recordNumber: null,
      record: null,

      assignmentType:
        'unassigned',

      assignmentSource:
        'none',

      reviewRequired: true,

      reviewReason:
        'No Domestic Air traveler is attached to this reconciliation match.',

      candidates: [],
    }
  }

  const airType =
    classifyAirType(
      traveler.airType
    )

  const departureCity =
    normalize(
      traveler.departureCity
    )

  /*
   * OWN AIR
   */
  if (
    airType ===
    'own-air'
  ) {
    if (
      isOwnMarker(
        departureCity
      )
    ) {
      return {
        match,

        recordNumber: null,
        record: null,

        assignmentType:
          'own-air',

        assignmentSource:
          'structured-data',

        reviewRequired:
          false,

        reviewReason: '',

        candidates: [],
      }
    }

    if (
      isAirportCode(
        departureCity
      )
    ) {
      return {
        match,

        recordNumber: null,
        record: null,

        assignmentType:
          'own-air',

        assignmentSource:
          'structured-data',

        reviewRequired:
          true,

        reviewReason:
          `Own Air traveler has ${departureCity} listed as Departure City. Confirm that this traveler is really Own Air.`,

        candidates: [],
      }
    }

    return {
      match,

      recordNumber: null,
      record: null,

      assignmentType:
        'own-air',

      assignmentSource:
        'structured-data',

      reviewRequired:
        true,

      reviewReason:
        'Own Air traveler does not have OWN or a recognizable airport code in Departure City. Verify the air arrangement.',

      candidates: [],
    }
  }

  /*
   * UNKNOWN AIR TYPE
   */
  if (
    airType !==
    'company-air'
  ) {
    return {
      match,

      recordNumber: null,
      record: null,

      assignmentType:
        'unassigned',

      assignmentSource:
        'none',

      reviewRequired:
        true,

      reviewReason:
        `Air Type "${
          clean(
            traveler.airType
          ) || 'blank'
        }" is not recognized as Company Air or Own Air.`,

      candidates: [],
    }
  }

  /*
   * COMPANY AIR + OWN / AIR
   *
   * Contradictory source data.
   */
  if (
    isOwnMarker(
      departureCity
    )
  ) {
    return {
      match,

      recordNumber: null,
      record: null,

      assignmentType:
        'unassigned',

      assignmentSource:
        'structured-data',

      reviewRequired:
        true,

      reviewReason:
        'Company Air traveler has OWN/AIR listed as Departure City. Confirm the correct group-air departure city.',

      candidates: [],
    }
  }

  if (
    !isAirportCode(
      departureCity
    )
  ) {
    return {
      match,

      recordNumber: null,
      record: null,

      assignmentType:
        'unassigned',

      assignmentSource:
        'structured-data',

      reviewRequired:
        true,

      reviewReason:
        `Company Air traveler has an invalid or missing Departure City: "${
          clean(
            traveler.departureCity
          ) || 'blank'
        }".`,

      candidates: [],
    }
  }

  const returnViaAirport = normalize(
    traveler.commentAnalysis?.flightDeviation?.returnViaAirport
  )

  if (isAirportCode(returnViaAirport)) {
    const namedDeviationRecords = companyRecords.filter(
      (record) =>
        recordNamesTraveler(record, match) &&
        recordIncludesLocation(record, returnViaAirport)
    )

    if (namedDeviationRecords.length === 1) {
      const winner = namedDeviationRecords[0]
      return {
        match,
        recordNumber: winner.recordNumber,
        record: winner,
        assignmentType: 'company-air-deviation',
        assignmentSource: 'named-deviation-record',
        reviewRequired: false,
        reviewReason: '',
        candidates: [winner.recordNumber],
        frequentFlyerCandidates: annotateFrequentFlyerCandidates(traveler, winner),
      }
    }

    return {
      match,
      recordNumber: null,
      record: null,
      assignmentType: 'unassigned',
      assignmentSource: 'missing-deviation-record',
      reviewRequired: true,
      reviewReason: `Air Report says the traveler returns via ${returnViaAirport}, but no separate deviation record was found for them. Do not add this traveler to a group record merely because it connects through ${returnViaAirport}; a separate ticket or itinerary record is required.`,
      candidates: [],
    }
  }

  /*
   * Strong comment-based exceptions are
   * checked BEFORE normal assignment.
   */
  const commentOverride =
    findCommentOverrideRecord({
      traveler,
      companyRecords,
    })

  if (commentOverride) {
    return {
      match,

      recordNumber:
        commentOverride
          .record
          .recordNumber,

      record:
        commentOverride
          .record,

      assignmentType:
        'company-air-deviation',

      assignmentSource:
        commentOverride
          .source,

      /*
       * We use the proposed record in capacity
       * calculations, but still flag it because
       * free text overrode the normal structured
       * assignment.
       */
      reviewRequired:
        true,

      reviewReason:
        `${commentOverride.reason} Confirm this proposed deviation assignment.`,

      candidates: [
        commentOverride
          .record
          .recordNumber,
      ],

      frequentFlyerCandidates:
        annotateFrequentFlyerCandidates(
          traveler,
          commentOverride
            .record
        ),
    }
  }

  /*
   * DEFAULT RULE:
   *
   * Company Air + ORD means the normal
   * group record beginning AND ending ORD.
   */
  const normalRecords =
    companyRecords.filter(
      (record) =>
        isRoundTripFrom(
          record,
          departureCity
        )
    )

  if (
    normalRecords.length ===
    1
  ) {
    const winner =
      normalRecords[0]

    return {
      match,

      recordNumber:
        winner.recordNumber,

      record:
        winner,

      assignmentType:
        'company-air',

      assignmentSource:
        'structured-data',

      reviewRequired:
        false,

      reviewReason: '',

      candidates: [
        winner.recordNumber,
      ],

      frequentFlyerCandidates:
        annotateFrequentFlyerCandidates(
          traveler,
          winner
        ),
    }
  }

  if (
    normalRecords.length >
    1
  ) {
    const namedRecords = normalRecords.filter((record) => recordNamesTraveler(record, match))
    if (namedRecords.length === 1) {
      const winner = namedRecords[0]
      return {
        match,
        recordNumber: winner.recordNumber,
        record: winner,
        assignmentType: 'company-air',
        assignmentSource: 'named-contract-record',
        reviewRequired: false,
        reviewReason: '',
        candidates: [winner.recordNumber],
        frequentFlyerCandidates: annotateFrequentFlyerCandidates(traveler, winner),
      }
    }

    const confirmedCabins = confirmedCabinKinds(match)
    const confirmedCabinRecords = normalRecords.filter((record) => recordMatchesConfirmedCabin(record, confirmedCabins))
    if (confirmedCabins.length > 0) {
      if (confirmedCabinRecords.length === 1) {
        const winner = confirmedCabinRecords[0]
        return {
          match,
          recordNumber: winner.recordNumber,
          record: winner,
          assignmentType: 'company-air',
          assignmentSource: 'confirmed-cabin-comment',
          reviewRequired: false,
          reviewReason: '',
          candidates: [winner.recordNumber],
          frequentFlyerCandidates: annotateFrequentFlyerCandidates(traveler, winner),
        }
      }

      if (confirmedCabinRecords.length > 1) {
        return {
          match,
          recordNumber: null,
          record: null,
          assignmentType: 'ambiguous',
          assignmentSource: 'confirmed-cabin-comment',
          reviewRequired: true,
          reviewReason: 'The traveler has a confirmed cabin upgrade. Sardines will place them within the matching cabin inventory.',
          candidates: confirmedCabinRecords.map((record) => record.recordNumber),
        }
      }
    }

    const ordinaryRecords = normalRecords.filter((record) => !recordHasSpecialAssignment(record))
    const carrierPreference = preferredCarrier(match)
    const preferredRecords = ordinaryRecords.filter((record) => recordMatchesCarrier(record, carrierPreference))
    if (preferredRecords.length === 1) {
      const winner = preferredRecords[0]
      return {
        match,
        recordNumber: winner.recordNumber,
        record: winner,
        assignmentType: 'company-air',
        assignmentSource: 'carrier-preference-comment',
        reviewRequired: false,
        reviewReason: '',
        candidates: [winner.recordNumber],
        frequentFlyerCandidates: annotateFrequentFlyerCandidates(traveler, winner),
      }
    }
    if (ordinaryRecords.length === 1) {
      const winner = ordinaryRecords[0]
      return {
        match,
        recordNumber: winner.recordNumber,
        record: winner,
        assignmentType: 'company-air',
        assignmentSource: 'ordinary-contract-record',
        reviewRequired: false,
        reviewReason: '',
        candidates: [winner.recordNumber],
        frequentFlyerCandidates: annotateFrequentFlyerCandidates(traveler, winner),
      }
    }

    if (
      ordinaryRecords.length > 1 &&
      new Set(ordinaryRecords.map(getRouteKey)).size === 1
    ) {
      const allPriced = ordinaryRecords.every((record) => Number.isFinite(passengerPrice(record)))
      return {
        match,
        recordNumber: null,
        record: null,
        assignmentType: 'ambiguous',
        assignmentSource: 'route-price-capacity',
        reviewRequired: true,
        reviewReason: allPriced
          ? 'Multiple priced records serve this route. Sardines will fill the lowest per-passenger fare first.'
          : 'Multiple records serve this route without complete pricing. Sardines will fill them in record order.',
        candidates: ordinaryRecords.map((record) => record.recordNumber),
      }
    }

    return {
      match,

      recordNumber: null,
      record: null,

      assignmentType:
        'ambiguous',

      assignmentSource:
        'structured-data',

      reviewRequired:
        true,

      reviewReason:
        `More than one normal ${departureCity} round-trip record exists. Verify the correct flight record.`,

      candidates:
        (ordinaryRecords.length > 0 ? ordinaryRecords : normalRecords).map(
          (record) =>
            record.recordNumber
        ),
    }
  }

  /*
   * No normal round-trip exists.
   *
   * Show same-origin possibilities,
   * but do not guess.
   */
  const sameOriginRecords =
    companyRecords.filter(
      (record) =>
        airportMatchesLocation(
          getRouteOrigin(
            record
          ),
          departureCity
        )
    )

  const throughAirportRecords = companyRecords.filter((record) =>
    recordIncludesLocation(record, departureCity)
  )

  if (throughAirportRecords.length === 1) {
    const passingRecord = throughAirportRecords[0]
    return {
      match,
      recordNumber: null,
      record: null,
      assignmentType: 'unassigned',
      assignmentSource: 'intermediate-airport-conflict',
      reviewRequired: true,
      reviewReason: `Departure gateway: ${departureCity}. R${passingRecord.recordNumber} starts in ${getRouteOrigin(passingRecord)}; a separate ${departureCity}-origin ticket record is required.`,
      candidates: [],
    }
  }

  if (companyRecords.length === 1) {
    const onlyRecord = companyRecords[0]
    return {
      match,
      recordNumber: onlyRecord.recordNumber,
      record: onlyRecord,
      assignmentType: 'company-air-deviation',
      assignmentSource: 'sole-contract-record',
      reviewRequired: true,
      reviewReason: `Company Air traveler departs from ${departureCity}, while the only contract record is ${clean(onlyRecord.routing) || 'a different route'}. Sardines placed the traveler on that sole record for capacity review; confirm the positioning or deviation arrangement.`,
      candidates: [onlyRecord.recordNumber],
      frequentFlyerCandidates: annotateFrequentFlyerCandidates(traveler, onlyRecord),
    }
  }

  return {
    match,

    recordNumber: null,
    record: null,

    assignmentType:
      'unassigned',

    assignmentSource:
      'structured-data',

    reviewRequired:
      true,

    reviewReason:
      sameOriginRecords.length >
      0
        ? `No ${departureCity} round-trip record exists, but ${sameOriginRecords.length} record${
          sameOriginRecords.length ===
          1
            ? ''
            : 's'
        } begin there. Verify whether this traveler has a deviation.`
        : `No contract record begins and ends at ${departureCity}. Verify the traveler’s group-air assignment.`,

    candidates:
      sameOriginRecords.map(
        (record) =>
          record.recordNumber
      ),
  }
}

function expandUniqueSplitJourney(
  assignment,
  companyRecords
) {
  if (
    assignment.assignmentType !== 'unassigned' ||
    !assignment.match?.aevd
  ) {
    return [assignment]
  }

  const traveler = assignment.match.aevd
  if (classifyAirType(traveler.airType) !== 'company-air') {
    return [assignment]
  }

  const departureCity = normalize(traveler.departureCity)
  if (!isAirportCode(departureCity)) return [assignment]

  const outbound = companyRecords.filter((record) =>
    airportMatchesLocation(getRouteOrigin(record), departureCity) &&
    !airportMatchesLocation(getRouteFinal(record), departureCity)
  )
  const inbound = companyRecords.filter((record) =>
    !airportMatchesLocation(getRouteOrigin(record), departureCity) &&
    airportMatchesLocation(getRouteFinal(record), departureCity)
  )

  if (outbound.length !== 1 || inbound.length !== 1) {
    return [assignment]
  }

  return [outbound[0], inbound[0]].map((record, index) => ({
    ...assignment,
    recordNumber: record.recordNumber,
    record,
    assignmentType: index === 0
      ? 'company-air-split-outbound'
      : 'company-air-split-return',
    assignmentSource: 'structured-data',
    reviewRequired: false,
    reviewReason: `Unique ${departureCity} ${index === 0 ? 'outbound' : 'return'} contract record.`,
    candidates: [record.recordNumber],
    frequentFlyerCandidates:
      annotateFrequentFlyerCandidates(traveler, record),
  }))
}

/*
 * --------------------------------------------------
 * IN-TOUR RECORDS
 * --------------------------------------------------
 */

function groupTourRecordsByRoute(
  records
) {
  const groups =
    new Map()

  records.forEach(
    (record) => {
      const key =
        getRouteKey(
          record
        ) ||
        `RECORD-${record.recordNumber}`

      if (
        !groups.has(
          key
        )
      ) {
        groups.set(
          key,
          []
        )
      }

      groups
        .get(key)
        .push(record)
    }
  )

  return Array.from(
    groups.entries()
  ).map(
    ([
      routeKey,
      routeRecords,
    ]) => ({
      routeKey,

      records:
        routeRecords,
    })
  )
}

function buildTourFlightAssignments(
  companyAssignments,
  flightRecords,
  tourFlight
) {
  const selectedNumbers =
    getSelectedTourRecordNumbers(
      tourFlight
    )

  if (
    !tourFlight?.enabled ||
    selectedNumbers.length ===
      0
  ) {
    return {
      assignments: [],
      reviewGroups: [],
    }
  }

  const selectedRecords =
    flightRecords.filter(
      (record) =>
        selectedNumbers.includes(
          Number(
            record.recordNumber
          )
        )
    )

  const routeGroups =
    groupTourRecordsByRoute(
      selectedRecords
    )

  const assignments = []
  const reviewGroups = []
  const eligibleTravelers =
    (companyAssignments ?? [])
      .filter(
        (assignment) =>
          assignment.assignmentType !==
            'own-air' &&
          assignment.match
      )
      .map(
        (assignment) =>
          assignment.match
      )

  routeGroups.forEach(
    (group) => {
      /*
       * One shared contracted record for the movement:
       * assign the Company Air roster. Own Air travelers
       * require an explicit operator decision.
       */
      if (
        group.records.length ===
        1
      ) {
        const record =
          group.records[0]

        reviewGroups.push({
          type:
            'shared-flight-roster',
          combineRecords:
            false,
          records: [record],
          routeKey:
            group.routeKey,
          defaultRecord:
            record,
          limitedRecords: [],
          travelers:
            eligibleTravelers,
          reviewRequired:
            true,
          reviewReason:
            `Confirm the Company Air roster for shared contracted record ${record.recordNumber} and explicitly add any Own Air exceptions.`,
          candidateRecordNumbers: [
            record.recordNumber,
          ],
        })

        return
      }

      /*
       * Same movement split into multiple
       * records.
       *
       * Treat the largest as standard and
       * ask who belongs on limited records.
       */
      const ordered =
        [...group.records]
          .sort(
            (a, b) =>
              passengerCapacity(
                b
              ) -
              passengerCapacity(
                a
              )
          )

      const defaultRecord =
        ordered[0]

      reviewGroups.push({
        type:
          'shared-flight-combined',

        combineRecords:
          true,

        records:
          ordered,

        routeKey:
          group.routeKey,

        defaultRecord,
        limitedRecords: [],

        travelers:
          eligibleTravelers,

        reviewRequired:
          true,

        reviewReason:
          `The selected contract records describe the same shared movement. Review one combined traveler roster and explicitly add any Own Air exceptions.`,

        candidateRecordNumbers:
          ordered.map(
            (record) =>
              record.recordNumber
          ),
      })
    }
  )

  return {
    assignments,
    reviewGroups,
  }
}

/*
 * --------------------------------------------------
 * RECORD CAPACITY
 * --------------------------------------------------
 */

function buildCompanyRecordStatus(
  companyRecords,
  companyAssignments
) {
  return companyRecords.map(
    (record) => {
      const assigned =
        companyAssignments.filter(
          (assignment) =>
            Number(
              assignment
                .recordNumber
            ) ===
            Number(
              record
                .recordNumber
            )
        )

      const contractedSeats =
        passengerCapacity(
          record
        )

      const assignedCount =
        assigned.length

      const difference =
        contractedSeats -
        assignedCount

      let status =
        'complete'

      let severity =
        'ok'

      let message = ''

      if (
        difference > 0
      ) {
        status =
          'seats-unassigned'

        severity =
          'warning'

        message =
          `${difference} contracted seat${
            difference === 1
              ? ''
              : 's'
          } do not have traveler names assigned. Confirm whether the seat${
            difference === 1
              ? ''
              : 's'
          } will be released, intentionally held, or otherwise handled before final names are submitted.`
      }

      if (
        difference < 0
      ) {
        const excess =
          Math.abs(
            difference
          )

        status =
          'over-capacity'

        severity =
          'critical'

        message =
          `${excess} traveler${
            excess === 1
              ? ''
              : 's'
          } exceed the contracted seat count. Confirm additional inventory or move traveler${
            excess === 1
              ? ''
              : 's'
          } to the correct record before finalizing.`
      }

      return {
        record,

        recordNumber:
          record.recordNumber,

        label:
          buildRecordLabel(
            record
          ),

        contractedSeats,
        assignedCount,
        difference,

        openSeats:
          difference > 0
            ? difference
            : 0,

        excessTravelers:
          difference < 0
            ? Math.abs(
              difference
            )
            : 0,

        status,
        severity,

        travelers:
          assigned.map(
            (assignment) => ({
              match:
                assignment.match,

              name:
                travelerLabel(
                  assignment.match
                ),

              assignmentType:
                assignment
                  .assignmentType,

              assignmentSource:
                assignment
                  .assignmentSource,

              reviewRequired:
                assignment
                  .reviewRequired,

              reviewReason:
                assignment
                  .reviewReason,
            })
          ),

        reviewRequired:
          status !==
          'complete',

        reviewReason:
          message,
      }
    }
  )
}

/*
 * --------------------------------------------------
 * PUBLIC ASSIGNMENT FUNCTION
 * --------------------------------------------------
 */

export function assignFlightRecords({
  reconciliation,
  flightRecords,
  tourFlight,
  roomingData = null,
}) {
  const records =
    flightRecords ?? []

  const selectedTourNumbers =
    getSelectedTourRecordNumbers(
      tourFlight
    )

  /*
   * In-Tour records do not participate
   * in normal Company Air assignment.
   */
  const companyRecords =
    records.filter(
      (record) =>
        !selectedTourNumbers.includes(
          Number(
            record.recordNumber
          )
        )
    )

  const initialCompanyAssignments =
    (
      reconciliation
        ?.matches ?? []
    ).flatMap(
      (match) =>
        expandUniqueSplitJourney(
          assignCompanyAirMatch(
            match,
            companyRecords
          ),
          companyRecords
        )
    )

  const capacityCheckedAssignments = holdOversubscribedConfirmedCabins(
    initialCompanyAssignments,
    companyRecords
  )

  const companyAssignments = distributeEquivalentRecordAssignments(
    capacityCheckedAssignments,
    companyRecords,
    roomingData
  )

  const tourFlightResult =
    buildTourFlightAssignments(
      companyAssignments,
      records,
      tourFlight
    )

  const tourFlightAssignments =
    tourFlightResult
      .assignments

  const tourFlightReviewGroups =
    tourFlightResult
      .reviewGroups

  const companyRecordStatus =
    buildCompanyRecordStatus(
      companyRecords,
      companyAssignments
    )

  const companyAssigned =
    new Set(
      companyAssignments
        .filter((assignment) => assignment.recordNumber !== null)
        .map((assignment) => assignment.match)
    ).size

  const companyNeedsReview =
    new Set(
      companyAssignments
        .filter((assignment) =>
          assignment.reviewRequired &&
          assignment.assignmentType !== 'own-air'
        )
        .map((assignment) => assignment.match)
    ).size

  const ownAir =
    new Set(
      companyAssignments
        .filter((assignment) => assignment.assignmentType === 'own-air')
        .map((assignment) => assignment.match)
    ).size

  const tourFlightAssigned =
    tourFlightAssignments.length

  const tourFlightNeedsReview =
    tourFlightReviewGroups.length

  const companyRecordReviews =
    companyRecordStatus.filter(
      (record) =>
        record
          .reviewRequired
    )

  const seatsUnassigned =
    companyRecordStatus
      .filter(
        (record) =>
          record.status ===
          'seats-unassigned'
      )
      .reduce(
        (
          total,
          record
        ) =>
          total +
          record.openSeats,
        0
      )

  const travelersOverCapacity =
    companyRecordStatus
      .filter(
        (record) =>
          record.status ===
          'over-capacity'
      )
      .reduce(
        (
          total,
          record
        ) =>
          total +
          record
            .excessTravelers,
        0
      )

  return {
    flightRecords:
      records,

    companyAssignments,

    companyRecordStatus,
    companyRecordReviews,

    tourFlightAssignments,
    tourFlightReviewGroups,

    summary: {
      companyAssigned,
      companyNeedsReview,
      ownAir,

      tourFlightAssigned,
      tourFlightNeedsReview,

      companyRecordReviews:
        companyRecordReviews
          .length,

      seatsUnassigned,
      travelersOverCapacity,
    },
  }
}

export function flightRecordLabel(
  record
) {
  if (!record) {
    return 'Unassigned'
  }

  return buildRecordLabel(
    record
  )
}
