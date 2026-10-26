import {
  analyzeFlightComment,
} from './commentAnalysis'

function clean(value) {
  return String(value ?? '').trim()
}

function splitList(value) {
  const text = clean(value)

  if (!text || text === '-') {
    return []
  }

  return text
    .split(',')
    .map((item) => item.trim())
}

function getValue(record, key) {
  return clean(record[key])
}

function normalizePax(value) {
  const raw = clean(value)
  const parsed = Number(raw)

  if (!Number.isFinite(parsed)) {
    return {
      raw,
      effective: 1,
    }
  }

  return {
    raw,
    effective: parsed <= 0 ? 1 : parsed,
  }
}

function parseTravelerName(name) {
  const parts = clean(name)
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) {
    return {
      firstName: '',
      middleName: '',
      lastName: '',
    }
  }

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      middleName: '',
      lastName: '',
    }
  }

  if (parts.length === 2) {
    return {
      firstName: parts[0],
      middleName: '',
      lastName: parts[1],
    }
  }

  return {
    firstName: parts[0],
    middleName: parts
      .slice(1, -1)
      .join(' '),
    lastName:
      parts[parts.length - 1],
  }
}

export function parseAevdTravelers(
  records
) {
  const travelers = []

  records.forEach((record) => {
    const names = splitList(
      getValue(
        record,
        'Traveler Names'
      )
    )

    const birthDates = splitList(
      getValue(
        record,
        'Date Of Birth'
      )
    )

    const ktnValues = splitList(
      getValue(
        record,
        'Global Entry/KTN'
      )
    )

    const pax = normalizePax(
      getValue(record, 'Pax')
    )

    const comments =
      getValue(
        record,
        'Comments'
      )

    const commentAnalysis =
      analyzeFlightComment(
        comments
      )

    if (names.length === 0) {
      return
    }

    names.forEach(
      (name, index) => {
        const parsedName =
          parseTravelerName(name)

        travelers.push({
          source:
            'centaur-domestic-air',

          reservationNumber:
            getValue(
              record,
              'Res.No'
            ),

          /*
           * Keep what Centaur actually said,
           * but give downstream Sardines code
           * the normalized passenger count.
           *
           * Centaur Pax 0 = effective Pax 1.
           */
          paxCountRaw: pax.raw,
          paxCount: String(
            pax.effective
          ),
          effectivePaxCount:
            pax.effective,

          travelerName: name,

          firstName:
            parsedName.firstName,

          middleName:
            parsedName.middleName,

          lastName:
            parsedName.lastName,

          dateOfBirth:
            birthDates[index] ?? '',

          ktnRaw:
            ktnValues[index] ?? '',

          airType:
            getValue(
              record,
              'Type'
            ),

          arrivalCity:
            getValue(
              record,
              'Arrival\nCity'
            ),

          arrivalDate:
            getValue(
              record,
              'Arrival\nDate'
            ),

          arrivalTime:
            getValue(
              record,
              'Arrival\nTime'
            ),

          departureCity:
            getValue(
              record,
              'Departure\nCity'
            ),

          departureDate:
            getValue(
              record,
              'Departure\nDate'
            ),

          departureTime:
            getValue(
              record,
              'Departure Time'
            ),

          /*
           * Preserve the untouched Centaur
           * comment while also exposing a
           * conservative structured analysis.
           */
          comments,

          cleanedComments:
            commentAnalysis
              .cleanedComment,

          commentAnalysis,

          frequentFlyerCandidates:
            commentAnalysis
              .frequentFlyerCandidates,

          relationshipClues:
            commentAnalysis
              .relationshipClues,

          seatingClues:
            commentAnalysis
              .seatingClues,

          upgradeClues:
            commentAnalysis
              .upgradeClues,

          sourceRecord: record,
        })
      }
    )
  })

  return travelers
}