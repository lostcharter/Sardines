import {
  isPossibleNickname,
} from './nicknameLookup.js'
import {
  classifyAevdTraveler,
  findExactOperationalPassportCandidate,
} from './operationalTraveler.js'

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeName(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeDate(value) {
  const text = clean(value)

  if (!text) {
    return ''
  }

  const match = text.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/
  )

  if (match) {
    let [, month, day, year] =
      match

    if (year.length === 2) {
      year =
        Number(year) >= 50
          ? `19${year}`
          : `20${year}`
    }

    return [
      year,
      month.padStart(2, '0'),
      day.padStart(2, '0'),
    ].join('-')
  }

  const date = new Date(text)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return text.toLowerCase()
  }

  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(2, '0'),
    String(
      date.getDate()
    ).padStart(2, '0'),
  ].join('-')
}

function getFirstName(traveler) {
  return clean(
    traveler.firstName
  )
}

function getMiddleName(traveler) {
  return clean(
    traveler.middleName
  )
}

function getLastName(traveler) {
  return clean(
    traveler.lastName
  )
}

function getReservation(traveler) {
  return clean(
    traveler.reservationNumber ??
      traveler.reservationId
  )
}

function fullNamesMatch(
  aevdTraveler,
  ppdtTraveler
) {
  return (
    normalizeName(
      getFirstName(
        aevdTraveler
      )
    ) ===
    normalizeName(
      getFirstName(
        ppdtTraveler
      )
    ) &&
    normalizeName(
      getLastName(
        aevdTraveler
      )
    ) ===
    normalizeName(
      getLastName(
        ppdtTraveler
      )
    )
  )
}

function lastNamesMatch(
  aevdTraveler,
  ppdtTraveler
) {
  return (
    normalizeName(
      getLastName(
        aevdTraveler
      )
    ) ===
    normalizeName(
      getLastName(
        ppdtTraveler
      )
    )
  )
}

function datesMatch(
  aevdTraveler,
  ppdtTraveler
) {
  return (
    normalizeDate(
      aevdTraveler
        .dateOfBirth
    ) ===
    normalizeDate(
      ppdtTraveler
        .dateOfBirth
    )
  )
}

function reservationsMatch(
  aevdTraveler,
  ppdtTraveler
) {
  const aevdReservation =
    getReservation(
      aevdTraveler
    )

  const ppdtReservation =
    getReservation(
      ppdtTraveler
    )

  return (
    Boolean(
      aevdReservation
    ) &&
    Boolean(
      ppdtReservation
    ) &&
    aevdReservation ===
      ppdtReservation
  )
}

function analyzeMiddleName(
  aevdTraveler,
  ppdtTraveler
) {
  const aevdMiddle =
    getMiddleName(
      aevdTraveler
    )

  const ppdtMiddle =
    getMiddleName(
      ppdtTraveler
    )

  const aevdIsNmn =
    aevdMiddle
      .toUpperCase() ===
    '(NMN)'

  const ppdtIsNmn =
    ppdtMiddle
      .toUpperCase() ===
    '(NMN)'

  if (
    aevdIsNmn ||
    ppdtIsNmn
  ) {
    return {
      status:
        'confirmed-none',

      reviewRequired:
        false,

      message:
        'No middle name confirmed by source.',

      outputMiddleName:
        '',
    }
  }

  /*
   * Passport-backed PPDT identity is the
   * preferred name source.
   *
   * A blank PPDT middle-name field is not
   * suspicious by itself when the traveler
   * has actual passport evidence. Sardines
   * should trust the data Centaur exported
   * unless another supplied source gives us
   * concrete contradictory information.
   */
  if (
    hasPassportBackedIdentity(
      ppdtTraveler
    )
  ) {
    if (
      !ppdtMiddle
    ) {
      if (
        aevdMiddle
      ) {
        return {
          status:
            'conflict',

          reviewRequired:
            true,

          message:
            `Domestic Air lists middle name "${aevdMiddle}", but the passport-backed Passport Report middle name is blank. Review the conflicting supplied data.`,

          outputMiddleName:
            '',
        }
      }

      return {
        status:
          'passport-backed-blank',

        reviewRequired:
          false,

        message:
          'Passport-backed name has no middle name.',

        outputMiddleName:
          '',
      }
    }

    if (
      !aevdMiddle
    ) {
      return {
        status:
          'passport-backed',

        reviewRequired:
          false,

        message:
          'Using the passport-backed middle name.',

        outputMiddleName:
          ppdtMiddle,
      }
    }

    if (
      normalizeName(
        aevdMiddle
      ) ===
      normalizeName(
        ppdtMiddle
      )
    ) {
      return {
        status:
          'confirmed',

        reviewRequired:
          false,

        message:
          'Middle names match.',

        outputMiddleName:
          ppdtMiddle,
      }
    }

    return {
      status:
        'conflict',

      reviewRequired:
        true,

      message:
        `Domestic Air and passport-backed Passport Report middle names differ. Review the conflicting supplied data.`,

      outputMiddleName:
        ppdtMiddle,
    }
  }

  if (
    !aevdMiddle &&
    !ppdtMiddle
  ) {
    return {
      status: 'unknown',

      reviewRequired:
        true,

      message:
        'No passport-backed identity is available and the middle name is blank in both sources. Verify the legal/ticketing name.',

      outputMiddleName:
        '',
    }
  }

  if (
    !aevdMiddle ||
    !ppdtMiddle
  ) {
    return {
      status: 'partial',

      reviewRequired:
        true,

      message:
        'No passport-backed identity is available and a middle name appears in only one source. Verify the legal/ticketing name.',

      outputMiddleName:
        aevdMiddle ||
        ppdtMiddle,
    }
  }

  if (
    normalizeName(
      aevdMiddle
    ) ===
    normalizeName(
      ppdtMiddle
    )
  ) {
    return {
      status:
        'confirmed',

      reviewRequired:
        false,

      message:
        'Middle names match.',

      outputMiddleName:
        ppdtMiddle,
    }
  }

  return {
    status: 'conflict',

    reviewRequired:
      true,

    message:
      'Middle names differ between sources and no passport-backed identity is available. Verify the legal/ticketing name.',

    outputMiddleName:
      ppdtMiddle,
  }
}

function hasPassportBackedIdentity(
  ppdtTraveler
) {
  if (!ppdtTraveler) {
    return false
  }

  /*
   * Do NOT use Centaur's freeform /
   * "Complete Name" field as authority.
   *
   * For this workflow, actual passport
   * evidence means the parsed traveler
   * row has a passport number.
   */
  return Boolean(
    clean(
      ppdtTraveler
        .passportNumber
    ) ||
    clean(
      ppdtTraveler
        .passportNo
    ) ||
    clean(
      ppdtTraveler
        .sourceRecord
        ?.['Passport No']
    ) ||
    clean(
      ppdtTraveler
        .sourceRecord
        ?.['PassportNo']
    )
  )
}

function analyzeFirstName(
  aevdTraveler,
  ppdtTraveler
) {
  const aevdFirst =
    getFirstName(
      aevdTraveler
    )

  const ppdtFirst =
    getFirstName(
      ppdtTraveler
    )

  if (
    !aevdFirst ||
    !ppdtFirst
  ) {
    return {
      status: 'unknown',

      reviewRequired:
        true,

      message:
        'First name is missing from one source. Verify the traveler identity.',
    }
  }

  const firstNamesMatch =
    normalizeName(
      aevdFirst
    ) ===
    normalizeName(
      ppdtFirst
    )

  /*
   * If both source reports agree AND
   * there is actual passport evidence,
   * do not create nickname noise.
   *
   * The passport-backed parsed First /
   * Middle / Last fields are what matter.
   * Sardines does not rely on the unused
   * freeform "Complete Name" field.
   */
  if (
    firstNamesMatch &&
    hasPassportBackedIdentity(
      ppdtTraveler
    )
  ) {
    return {
      status:
        'confirmed',

      reviewRequired:
        false,

      message:
        'First names match with passport-backed identity data.',
    }
  }

  if (
    firstNamesMatch
  ) {
    return {
      status:
        'confirmed',

      reviewRequired:
        false,

      message:
        'First names match.',
    }
  }

  /*
   * Different first names:
   *
   * A known Carlton relationship makes
   * the review more informative, but it
   * still requires a human. Sardines does
   * not automatically replace either name.
   */
  if (
    isPossibleNickname(
      aevdFirst,
      ppdtFirst
    )
  ) {
    return {
      status:
        'possible-nickname',

      reviewRequired:
        true,

      message:
        `Possible nickname: ${aevdFirst} / ${ppdtFirst}. Verify the legal/ticketing first name.`,
    }
  }

  return {
    status:
      'first-name-conflict',

    reviewRequired:
      true,

    message:
      'First names differ and Sardines does not have a known nickname relationship for them. Verify against passport or government ID.',
  }
}

function analyzeIdentity(
  aevdTraveler,
  ppdtTraveler
) {
  const firstName =
    analyzeFirstName(
      aevdTraveler,
      ppdtTraveler
    )

  const middleName =
    analyzeMiddleName(
      aevdTraveler,
      ppdtTraveler
    )

  return {
    reviewRequired:
      firstName
        .reviewRequired ||
      middleName
        .reviewRequired,

    firstName,
    middleName,
  }
}

function findBestCandidate(
  aevdTraveler,
  ppdtTravelers,
  usedPpdtIndexes
) {
  const candidates =
    ppdtTravelers
      .map(
        (
          traveler,
          index
        ) => ({
          traveler,
          index,
        })
      )
      .filter(
        ({ index }) =>
          !usedPpdtIndexes.has(
            index
          )
      )

  const exact =
    candidates.filter(
      ({ traveler }) =>
        fullNamesMatch(
          aevdTraveler,
          traveler
        ) &&
        datesMatch(
          aevdTraveler,
          traveler
        )
    )

  if (
    exact.length === 1
  ) {
    return {
      type: 'exact',
      candidate:
        exact[0],
    }
  }

  const reservationExact =
    candidates.filter(
      ({ traveler }) =>
        reservationsMatch(
          aevdTraveler,
          traveler
        ) &&
        fullNamesMatch(
          aevdTraveler,
          traveler
        ) &&
        datesMatch(
          aevdTraveler,
          traveler
        )
    )

  if (
    reservationExact.length ===
    1
  ) {
    return {
      type: 'exact',
      candidate:
        reservationExact[0],
    }
  }

  const strong =
    candidates.filter(
      ({ traveler }) =>
        lastNamesMatch(
          aevdTraveler,
          traveler
        ) &&
        datesMatch(
          aevdTraveler,
          traveler
        )
    )

  if (
    strong.length === 1
  ) {
    return {
      type:
        'possible-identity-match',

      candidate:
        strong[0],
    }
  }

  return {
    type:
      strong.length > 1
        ? 'ambiguous'
        : 'none',

    candidates:
      strong,
  }
}

function ppdtHasIdentity(
  traveler
) {
  return Boolean(
    clean(
      traveler.firstName
    ) ||
      clean(
        traveler.middleName
      ) ||
      clean(
        traveler.lastName
      ) ||
      clean(
        traveler.dateOfBirth
      ) ||
      clean(
        traveler.passportNumber
      ) ||
      clean(
        traveler.passportNo
      ) ||
      clean(
        traveler.displayName
      )
  )
}

function findOperationalPassportCandidate(
  aevdTraveler,
  ppdtTravelers,
  usedPpdtIndexes
) {
  const reservation =
    getReservation(
      aevdTraveler
    )

  if (!reservation) {
    return {
      type: 'none',
      candidates: [],
    }
  }

  const candidates =
    ppdtTravelers
      .map(
        (
          traveler,
          index
        ) => ({
          traveler,
          index,
        })
      )
      .filter(
        ({ index }) =>
          !usedPpdtIndexes.has(
            index
          )
      )
      .filter(
        ({ traveler }) =>
          getReservation(
            traveler
          ) ===
          reservation
      )
      .filter(
        ({ traveler }) =>
          !ppdtHasIdentity(
            traveler
          )
      )

  if (
    candidates.length === 1
  ) {
    return {
      type:
        'operational-reservation-link',

      candidate:
        candidates[0],
    }
  }

  return {
    type:
      candidates.length > 1
        ? 'ambiguous'
        : 'none',

    candidates,
  }
}

export function reconcileTravelers(
  aevdTravelers,
  ppdtTravelers
) {
  const classifiedAevd =
    aevdTravelers.map(
      classifyAevdTraveler
    )

  const passengerAevd =
    classifiedAevd.filter(
      (traveler) =>
        traveler.recordType ===
        'passenger'
    )

  const operationalAevd =
    classifiedAevd.filter(
      (traveler) =>
        traveler.recordType !==
        'passenger'
    )

  const matches = []
  const unmatchedAevd = []
  const operationalRecords =
    []

  const usedPpdtIndexes =
    new Set()

  passengerAevd.forEach(
    (aevdTraveler) => {
      const result =
        findBestCandidate(
          aevdTraveler,
          ppdtTravelers,
          usedPpdtIndexes
        )

      if (
        result.type ===
          'exact' &&
        result.candidate
      ) {
        const match =
          result.candidate

        usedPpdtIndexes.add(
          match.index
        )

        const identity =
          analyzeIdentity(
            aevdTraveler,
            match.traveler
          )

        matches.push({
          aevd:
            aevdTraveler,

          ppdt:
            match.traveler,

          matchType:
            'exact-name-and-dob',

          identity,

          operational:
            false,

          reviewRequired:
            identity
              .reviewRequired,
        })

        return
      }

      if (
        result.type ===
          'possible-identity-match' &&
        result.candidate
      ) {
        const match =
          result.candidate

        usedPpdtIndexes.add(
          match.index
        )

        const identity =
          analyzeIdentity(
            aevdTraveler,
            match.traveler
          )

        matches.push({
          aevd:
            aevdTraveler,

          ppdt:
            match.traveler,

          matchType:
            'possible-identity-match',

          identity,

          operational:
            false,

          reviewRequired:
            true,

          reviewReason:
            identity
              .firstName
              .message ||
            'Last name and date of birth match, but the first name differs. Human verification required.',
        })

        return
      }

      unmatchedAevd.push({
        traveler:
          aevdTraveler,

        candidateCount:
          result.candidates
            ?.length ?? 0,

        reviewRequired:
          true,

        reviewReason:
          result.type ===
          'ambiguous'
            ? 'Multiple possible Passport Report matches were found.'
            : 'Sardines could not safely link this Air Report traveler to a Passport Report row. The passport may exist with conflicting identifying data.',
      })
    }
  )

  /*
   * Operational/Tour Director pass.
   *
   * This happens AFTER normal passengers
   * have claimed their PPDT rows.
   *
   * It is intentionally narrow:
   *
   * - AEVD must actually be classified as
   *   an operational/Tour Director record.
   * - PPDT row must still be unused.
   * - Reservation numbers must match.
   * - PPDT identity fields must be blank.
   * - There must be exactly one candidate.
   *
   * This does NOT allow normal travelers
   * to match on reservation alone.
   */
  operationalAevd.forEach(
    (aevdTraveler) => {
      const exactCandidate =
        findExactOperationalPassportCandidate(
          aevdTraveler,
          ppdtTravelers,
          usedPpdtIndexes
        )

      if (
        exactCandidate
      ) {
        const match =
          exactCandidate

        usedPpdtIndexes.add(
          match.index
        )

        const identity =
          analyzeIdentity(
            aevdTraveler,
            match.passport
          )

        matches.push({
          aevd:
            aevdTraveler,

          ppdt:
            match.passport,

          matchType:
            'exact-name-and-dob',

          identity,

          operational:
            true,

          reviewRequired:
            identity.reviewRequired,
        })

        return
      }

      const result =
        findOperationalPassportCandidate(
          aevdTraveler,
          ppdtTravelers,
          usedPpdtIndexes
        )

      if (
        result.type ===
          'operational-reservation-link' &&
        result.candidate
      ) {
        const match =
          result.candidate

        usedPpdtIndexes.add(
          match.index
        )

        matches.push({
          aevd:
            aevdTraveler,

          ppdt:
            match.traveler,

          matchType:
            'operational-reservation-link',

          identity: null,

          operational:
            true,

          reviewRequired:
            true,

          reviewReason:
            'Tour Director record was linked to a blank Passport Report row using the shared reservation number. Verify identity and passport information.',
        })

        return
      }

      operationalRecords.push({
        ...aevdTraveler,

        reviewRequired:
          true,

        reviewReason:
          result.type ===
          'ambiguous'
            ? 'Tour Director record has multiple blank Passport Report rows on the same reservation. Human review required.'
            : aevdTraveler
                .reviewReason ||
              'Tour Director record could not be linked to a Passport Report row.',
      })
    }
  )

  const unmatchedPpdt =
    ppdtTravelers
      .map(
        (
          traveler,
          index
        ) => ({
          traveler,
          index,
        })
      )
      .filter(
        ({ index }) =>
          !usedPpdtIndexes.has(
            index
          )
      )
      .map(
        ({ traveler }) => ({
          traveler,

          reviewRequired:
            true,

          reviewReason:
            'Passport record found, but Sardines could not safely link it to a traveler in the Domestic Air Report.',
        })
      )

  return {
    matches,
    unmatchedAevd,
    unmatchedPpdt,
    operationalRecords,
  }
}
