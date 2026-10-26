import {
  Fragment,
  useCallback,
  useMemo,
  useState,
} from 'react'

import Papa from 'papaparse'

import './analyzeRepair.css'

import ContractInput from './ContractInput'

import {
  parseAevdTravelers,
} from './aevdParser'

import {
  parsePpdtTravelers,
} from './ppdtParser'

import {
  reconcileTravelers,
} from './reconcileTravelers'

import {
  mergeFrequentFlyers,
} from './frequentFlyer'
import {
  applyFrequentFlyerDecisions,
  frequentFlyerReviewKey,
  isPlausibleKtn,
  suggestedFrequentFlyerValue,
} from './frequentFlyerDecisions'

import {
  assignFlightRecords,
  rebalanceEquivalentRecordAssignments,
} from './flightRecordAssignment'

import {
  parseRoomingList,
} from './roomingListParser'
import { detectReportType } from './reportTypeDetection'

import {
  routeIsRoundTripForLocation,
} from './airportLocations'

import {
  exportFmgWorkbook,
} from './fmgWorkbookExport'
import FlightRecordReviewPanel
  from './FlightRecordReviewPanel'

import TourDirectorPanel, {
  createTourDirectorContact,
  emptyTourDirectorContact,
} from './TourDirectorPanel'

import PassengerReviewPanel from './PassengerReviewPanel'

import {
  applyPassengerOverrides,
  passengerKey,
  passengerOverrideFromMatch,
} from './passengerOverrides'

import {
  createManualPerson,
  manualPersonToMatch,
  manualPersonToOverride,
} from './manualPeople'
import { applyManualFlightSelections } from './manualFlightAssignments'

import {
  findNamedTourDirectorMatch,
  matchIsTourDirector,
} from './tourDirectorIdentity'
import { selectedTourDirectorRecordNumbers, withTourDirectorRecordNumbers } from './tourDirectorFlightRecords'
import { tourDirectorContactFromTraveler } from './tourDirectorTraveler'
import { tourDirectorReadiness } from './tourDirectorReadiness'
import { travelerRosterCounts } from './travelerCounts'
import {
  removeAdoptedUnmatchedRecords,
  removeDismissedUnmatchedRecords,
  unmatchedSourceRecordKey,
} from './unmatchedSourceRecords'

function cleanCell(value) {
  return String(
    value ?? ''
  ).trim()
}

function isCsvFile(file) {
  if (!file) {
    return false
  }

  return file.name
    .toLowerCase()
    .endsWith('.csv')
}

function reportLabel(type) {
  if (
    type === 'domestic-air'
  ) {
    return 'Centaur Domestic Air Report'
  }

  if (
    type === 'passport'
  ) {
    return 'Centaur Passport Report'
  }

  if (
    type === 'rooming-list'
  ) {
    return 'Centaur Rooming List'
  }

  return 'Unknown report'
}

function missingReportLabel(
  type
) {
  if (
    type === 'domestic-air'
  ) {
    return 'Centaur Passport Report'
  }

  if (
    type === 'passport'
  ) {
    return 'Centaur Domestic Air Report'
  }

  return 'second Centaur report'
}

function missingReportHelper(
  type
) {
  if (
    type === 'passport'
  ) {
    return 'Use Domestic Air. The International report is, unhelpfully, not the useful one.'
  }

  return ''
}

function parseCsv(file) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      Papa.parse(
        file,
        {
          header: false,

          skipEmptyLines:
            false,

          complete:
            (result) =>
              resolve(
                result.data
              ),

          error:
            (parseError) =>
              reject(
                parseError
              ),
        }
      )
    }
  )
}

function rowsToRecords(
  rows,
  headerIndex
) {
  if (
    headerIndex === -1
  ) {
    return {
      headers: [],
      records: [],
    }
  }

  const headers =
    rows[
      headerIndex
    ].map(cleanCell)

  const records = rows
    .slice(
      headerIndex + 1
    )
    .filter(
      (row) =>
        row.some(
          (cell) =>
            cleanCell(
              cell
            ) !== ''
        )
    )
    .map(
      (row) => {
        const record = {}

        headers.forEach(
          (
            header,
            index
          ) => {
            if (!header) {
              return
            }

            record[
              header
            ] = cleanCell(
              row[index]
            )
          }
        )

        return record
      }
    )

  return {
    headers,
    records,
  }
}

function reportMetadataValue(rows, label) {
  const wanted = cleanCell(label).toLowerCase()
  const row = (rows ?? []).find((item) =>
    cleanCell(item?.[0]).toLowerCase() === wanted
  )
  return cleanCell(row?.[1])
}


function routeAirports(
  record
) {
  return cleanCell(
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

function routeOrigin(
  record
) {
  return (
    routeAirports(
      record
    )[0] ?? ''
  )
}

function routeFinal(
  record
) {
  const airports =
    routeAirports(
      record
    )

  return (
    airports[
      airports.length - 1
    ] ?? ''
  )
}

function passengerCapacity(
  record
) {
  const value =
    Number(
      record?.passengerCount
    )

  return Number.isFinite(
    value
  )
    ? value
    : 0
}

function companyFlightRecords(
  flightRecords,
  tourFlight
) {
  const inTourNumbers =
    new Set(
      (
        tourFlight
          ?.recordNumbers ??
        []
      ).map(Number)
    )

  return (
    flightRecords ??
    []
  ).filter(
    (record) =>
      !inTourNumbers.has(
        Number(
          record.recordNumber
        )
      )
  )
}

function suggestTourDirectorFlightRecord(
  contact,
  flightRecords,
  tourFlight
) {
  if (
    !contact ||
    contact.present !== true ||
    contact.linkedTraveler
  ) {
    return contact
  }

  const airType =
    cleanCell(
      contact.airType
    )
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/g,
        ''
      )

  const departureCity =
    cleanCell(
      contact.departureCity
    ).toUpperCase()

  if (
    airType !==
      'COMPANYAIR' ||
    !/^[A-Z]{3}$/.test(
      departureCity
    )
  ) {
    return contact
  }

  const candidates =
    companyFlightRecords(
      flightRecords,
      tourFlight
    ).filter(
      (record) =>
        routeIsRoundTripForLocation(
          routeOrigin(record),
          routeFinal(record),
          departureCity
        )
    )

  if (
    candidates.length !== 1
  ) {
    return contact
  }

  return {
    ...contact,
    ...withTourDirectorRecordNumbers(contact, [candidates[0].recordNumber]),
  }
}

function tourDirectorDisplayName(
  contact
) {
  const name = [
    contact?.firstName,
    contact?.middleName,
    contact?.lastName,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    name ||
    'Tour Director'
  )
}

function recordCapacityState(
  record,
  assignedCount
) {
  const contractedSeats =
    passengerCapacity(
      record
    )

  const difference =
    contractedSeats -
    assignedCount

  let status =
    'complete'

  let severity =
    'ok'

  let reviewReason = ''

  if (
    difference > 0
  ) {
    status =
      'seats-unassigned'

    severity =
      'warning'

    reviewReason =
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

    reviewReason =
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

    reviewRequired:
      status !==
      'complete',

    reviewReason,
  }
}

function applyTourDirectorFlightAssignment(
  flightAssignments,
  contact,
  roomingData
) {
  if (
    !flightAssignments ||
    !contact ||
    contact.present !== true ||
    selectedTourDirectorRecordNumbers(contact).length === 0
  ) {
    return flightAssignments
  }

  const selectedRecords = selectedTourDirectorRecordNumbers(contact)
    .map((number) => (flightAssignments.companyRecordStatus ?? [])
      .find((item) => Number(item.recordNumber) === number)?.record)
    .filter(Boolean)

  if (selectedRecords.length === 0) {
    return flightAssignments
  }

  const linkedAssignment =
    (flightAssignments.companyAssignments ?? [])
      .find((assignment) =>
        matchIsTourDirector(assignment.match, contact)
      )

  const tdMatch = linkedAssignment?.match ?? {
    operational: true,

    aevd: {
      displayName:
        tourDirectorDisplayName(
          contact
        ),

      travelerName:
        tourDirectorDisplayName(
          contact
        ),

      firstName:
        contact.firstName,

      middleName:
        contact.middleName,

      lastName:
        contact.lastName,

      dateOfBirth:
        contact.dateOfBirth,

      reservationNumber:
        contact.reservationNumber,

      airType:
        contact.airType,

      departureCity:
        contact.departureCity,
    },

    ppdt: null,
  }

  const tdAssignments = selectedRecords.map((selectedRecord) => ({
    match:
      tdMatch,

    recordNumber:
      selectedRecord
        .recordNumber,

    record:
      selectedRecord,

    assignmentType:
      'tour-director',

    assignmentSource:
      'tour-director-panel',

    reviewRequired:
      false,

    reviewReason: '',

    candidates: [
      selectedRecord
        .recordNumber,
    ],
  }))

  const companyAssignments = rebalanceEquivalentRecordAssignments([
    ...(flightAssignments.companyAssignments ?? [])
      .filter((assignment) =>
        !linkedAssignment ||
        !matchIsTourDirector(assignment.match, contact)
      ),
    ...tdAssignments,
  ], flightAssignments.flightRecords, roomingData)

  const companyRecordStatus =
    (
      flightAssignments
        .companyRecordStatus ??
      []
    ).map(
      (item) => {
        const assignedCount =
          companyAssignments.filter(
            (assignment) =>
              Number(
                assignment
                  .recordNumber
              ) ===
              Number(
                item.recordNumber
              )
          ).length

        const capacityState =
          recordCapacityState(
            item.record,
            assignedCount
          )

        const travelers =
          companyAssignments
            .filter(
              (assignment) =>
                Number(
                  assignment
                    .recordNumber
                ) ===
                Number(
                  item.recordNumber
                )
            )
            .map(
              (assignment) => ({
                match:
                  assignment.match,

                name:
                  assignment
                    .match
                    ?.aevd
                    ?.displayName ||
                  assignment
                    .match
                    ?.aevd
                    ?.travelerName ||
                  'Traveler',

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
            )

        return {
          ...item,
          ...capacityState,
          travelers,
        }
      }
    )

  const companyRecordReviews =
    companyRecordStatus.filter(
      (item) =>
        item.reviewRequired
    )

  const seatsUnassigned =
    companyRecordStatus
      .reduce(
        (
          total,
          item
        ) =>
          total +
          (
            item.openSeats ??
            0
          ),
        0
      )

  const travelersOverCapacity =
    companyRecordStatus
      .reduce(
        (
          total,
          item
        ) =>
          total +
          (
            item.excessTravelers ??
            0
          ),
        0
      )

  return {
    ...flightAssignments,

    companyAssignments,
    companyRecordStatus,
    companyRecordReviews,

    summary: {
      ...(
        flightAssignments
          .summary ??
        {}
      ),

      companyAssigned:
        companyAssignments.filter(
          (assignment) =>
            assignment.recordNumber !== null
        ).length,

      companyNeedsReview:
        new Set(
          companyAssignments
            .filter((assignment) =>
              assignment.reviewRequired &&
              assignment.assignmentType !== 'own-air'
            )
            .map((assignment) => assignment.match)
        ).size,

      ownAir:
        companyAssignments.filter(
          (assignment) =>
            assignment.assignmentType === 'own-air'
        ).length,

      companyRecordReviews:
        companyRecordReviews
          .length,

      seatsUnassigned,
      travelersOverCapacity,
    },
  }
}

function refreshFlightAssignmentSummary(flightAssignments) {
  if (!flightAssignments) return flightAssignments
  const companyAssignments = flightAssignments.companyAssignments ?? []
  const companyRecordStatus = (flightAssignments.companyRecordStatus ?? []).map((item) => {
    const recordAssignments = companyAssignments.filter(
      (assignment) => Number(assignment.recordNumber) === Number(item.recordNumber)
    )
    return {
      ...item,
      ...recordCapacityState(item.record, recordAssignments.length),
      travelers: recordAssignments.map((assignment) => ({
        match: assignment.match,
        name: assignment.match?.ppdt?.displayName || assignment.match?.aevd?.travelerName || 'Traveler',
        assignmentType: assignment.assignmentType,
        assignmentSource: assignment.assignmentSource,
        reviewRequired: assignment.reviewRequired,
        reviewReason: assignment.reviewReason,
      })),
    }
  })
  const companyRecordReviews = companyRecordStatus.filter((item) => item.reviewRequired)
  const uniqueMatches = (predicate) => new Set(companyAssignments.filter(predicate).map((item) => item.match)).size
  return {
    ...flightAssignments,
    companyRecordStatus,
    companyRecordReviews,
    summary: {
      ...(flightAssignments.summary ?? {}),
      companyAssigned: uniqueMatches((item) => item.recordNumber != null),
      companyNeedsReview: uniqueMatches((item) => item.reviewRequired && item.assignmentType !== 'own-air'),
      ownAir: uniqueMatches((item) => item.assignmentType === 'own-air'),
      companyRecordReviews: companyRecordReviews.length,
      seatsUnassigned: companyRecordStatus.reduce((total, item) => total + (item.openSeats ?? 0), 0),
      travelersOverCapacity: companyRecordStatus.reduce((total, item) => total + (item.excessTravelers ?? 0), 0),
    },
  }
}

function exceptionName(
  item
) {
  if (
    item?.operational &&
    item?.aevd
  ) {
    return (
      item.aevd
        .displayName ||
      item.aevd
        .travelerName ||
      [
        item.aevd
          .firstName,
        item.aevd
          .middleName,
        item.aevd
          .lastName,
      ]
        .filter(Boolean)
        .join(' ') ||
      'Tour Director'
    )
  }

  const traveler =
    item?.traveler ??
    item?.ppdt ??
    item?.aevd ??
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

function exceptionDob(
  item
) {
  const traveler =
    item?.traveler ??
    item?.ppdt ??
    item?.aevd ??
    {}

  return (
    traveler.dateOfBirth ||
    'Not provided'
  )
}

function exceptionReservation(
  item
) {
  const traveler =
    item?.traveler ??
    item?.aevd ??
    item?.ppdt ??
    {}

  return (
    traveler.reservationNumber ||
    traveler.reservationId ||
    'Not provided'
  )
}

function exceptionTravelerNumber(
  item
) {
  const traveler =
    item?.traveler ??
    item?.ppdt ??
    item?.aevd ??
    {}

  return (
    traveler.travelerNumber ||
    'Not provided'
  )
}

function exceptionKtn(
  item
) {
  const traveler =
    item?.traveler ??
    item?.ppdt ??
    item?.aevd ??
    {}

  return (
    traveler.ktnRaw ||
    'Not provided'
  )
}

function identityReviewReason(
  match
) {
  if (
    match.operational
  ) {
    return (
      match.reviewReason ||
      'Tour Director information requires review.'
    )
  }

  const reasons = []

  if (
    match.identity
      ?.firstName
      ?.reviewRequired
  ) {
    reasons.push(
      match.identity
        .firstName
        .message
    )
  }

  if (
    match.identity
      ?.middleName
      ?.reviewRequired
  ) {
    reasons.push(
      match.identity
        .middleName
        .message
    )
  }

  if (
    reasons.length > 0
  ) {
    return reasons.join(' ')
  }

  if (
    match.reviewReason
  ) {
    return match.reviewReason
  }

  return 'Identity requires review.'
}

function parseContractDate(value) {
  const text = cleanCell(value)
  if (!text) return null

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function contractReturnDate(contractData, reportReturnDate = '') {
  const travelRange = cleanCell(contractData?.text).match(
    /Travel\s+Dates\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
  )

  if (travelRange?.[2]) {
    return parseContractDate(travelRange[2])
  }

  const dates = (contractData?.flightRecords ?? [])
    .flatMap((record) => record.flights ?? [])
    .flatMap((flight) => [
      flight.arrivalDate,
      flight.departureDate,
    ])
    .map(parseContractDate)
    .filter(Boolean)

  if (dates.length === 0) return parseContractDate(reportReturnDate)
  return new Date(Math.max(...dates.map((date) => date.getTime())))
}

function sixMonthsAfter(date) {
  const threshold = new Date(date.getTime())
  threshold.setMonth(threshold.getMonth() + 6)
  return threshold
}

function passportDateReview(expiration, returnDate) {
  if (!returnDate) return null
  const expires = parseContractDate(expiration)
  if (!expires) return 'Passport expiration date is missing or unreadable.'

  const threshold = sixMonthsAfter(returnDate)
  if (expires < threshold) {
    return `Passport expires before the six-month post-return threshold (${threshold.toLocaleDateString('en-US')}).`
  }
  return null
}

function passportReviewRows(reconciliation, tripType, contractData, reportReturnDate = '') {
  if (tripType !== 'international') return []
  const returnDate = contractReturnDate(contractData, reportReturnDate)
  if (!returnDate) return []

  return (reconciliation?.matches ?? []).flatMap((match, index) => {
    if (match.operational) return []
    const ppdt = match.ppdt ?? {}
    const issues = []
    if (!cleanCell(ppdt.passportNumber)) issues.push('Passport number is missing.')
    if (!cleanCell(ppdt.citizenship || ppdt.passportNationality || ppdt.nationality)) issues.push('Passport nationality/citizenship is missing.')
    if (!['M', 'F', 'X'].includes(cleanCell(ppdt.gender).toUpperCase())) issues.push('Gender must be M, F, or X.')
    const expirationIssue = passportDateReview(ppdt.passportExpireDate, returnDate)
    if (expirationIssue) issues.push(expirationIssue)
    if (issues.length === 0) return []

    return [{
      id: `passport-check-${index}`,
      status: 'Review',
      source: 'Passport',
      name: exceptionName(match),
      dob: exceptionDob(match),
      reservation: exceptionReservation(match),
      travelerNumber: exceptionTravelerNumber(match),
      ktn: exceptionKtn(match),
      issue: issues.join(' '),
    }]
  })
}

function tourDirectorPassportReviewRow(contact, tripType, contractData, reportReturnDate = '') {
  if (tripType !== 'international' || contact?.present !== true) return null
  const returnDate = contractReturnDate(contractData, reportReturnDate)
  if (!returnDate) return null
  const issues = []
  if (!cleanCell(contact.passportNumber)) issues.push('Tour Director passport number is missing.')
  if (!cleanCell(contact.passportNationality)) issues.push('Tour Director passport nationality/citizenship is missing.')
  if (!['M', 'F', 'X'].includes(cleanCell(contact.gender).toUpperCase())) issues.push('Tour Director gender must be M, F, or X.')
  const expirationIssue = passportDateReview(contact.passportExpiration, returnDate)
  if (expirationIssue) issues.push(`Tour Director ${expirationIssue.charAt(0).toLowerCase()}${expirationIssue.slice(1)}`)
  if (issues.length === 0) return null
  return {
    id: 'tour-director-passport-check',
    status: 'Review',
    source: 'Tour Director',
    name: [contact.firstName, contact.middleName, contact.lastName].filter(Boolean).join(' ') || 'Tour Director',
    dob: contact.dateOfBirth || 'Not provided',
    reservation: contact.reservationNumber || 'Not provided',
    travelerNumber: contact.travelerNumber || 'Not provided',
    ktn: contact.ktn || 'Not provided',
    issue: issues.join(' '),
  }
}

function buildExceptionRows(
  reconciliation
) {
  const rows = []

  reconciliation
    .unmatchedAevd
    .forEach(
      (item) => {
        rows.push({
          id:
            `aevd-${rows.length}`,

          status:
            'Review',

          source:
            'Domestic Air',

          name:
            exceptionName(
              item
            ),

          dob:
            exceptionDob(
              item
            ),

          reservation:
            exceptionReservation(
              item
            ),

          travelerNumber:
            '—',

          ktn:
            exceptionKtn(
              item
            ),

          issue:
            item.reviewReason ||
            'No exact match found.',

          unmatchedTraveler:
            item.traveler,
        })
      }
    )

  reconciliation
    .unmatchedPpdt
    .forEach(
      (item) => {
        rows.push({
          id:
            `ppdt-${rows.length}`,

          status:
            'Review',

          source:
            'Passport',

          name:
            exceptionName(
              item
            ),

          dob:
            exceptionDob(
              item
            ),

          reservation:
            exceptionReservation(
              item
            ),

          travelerNumber:
            exceptionTravelerNumber(
              item
            ),

          ktn:
            exceptionKtn(
              item
            ),

          issue:
            item.reviewReason ||
            'No exact match found.',

          unmatchedTraveler:
            item.traveler,
        })
      }
    )

  reconciliation
    .operationalRecords
    .forEach(
      (traveler) => {
        rows.push({
          id:
            `operational-${rows.length}`,

          status:
            'Review',

          source:
            'Domestic Air',

          name:
            exceptionName({
              traveler,
            }),

          dob:
            exceptionDob({
              traveler,
            }),

          reservation:
            exceptionReservation({
              traveler,
            }),

          travelerNumber:
            '—',

          ktn:
            exceptionKtn({
              traveler,
            }),

          issue:
            traveler.reviewReason ||
            'Tour Director information requires review.',
        })
      }
    )

  reconciliation.matches
    .filter(
      (match) =>
        match.reviewRequired
    )
    .forEach(
      (match) => {
        const possibleNickname =
          match.identity
            ?.firstName
            ?.status ===
          'possible-nickname'

        rows.push({
          id:
            `match-${rows.length}`,

          status:
            possibleNickname
              ? 'Possible nickname'
              : 'Review',

          source:
            'Both',

          name:
            exceptionName(
              match
            ),

          dob:
            exceptionDob(
              match
            ),

          reservation:
            exceptionReservation(
              match
            ),

          travelerNumber:
            match.ppdt
              ?.travelerNumber ||
            '—',

          ktn:
            exceptionKtn(
              match
            ),

          issue:
            identityReviewReason(
              match
            ),
        })
      }
    )

  return rows
}


function travelerDisplayName(
  traveler
) {
  if (!traveler) {
    return 'Traveler'
  }

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
    'Traveler'
  )
}

function collectCommentReviews(
  reconciliation
) {
  const reviews = []

  ;(
    reconciliation
      ?.matches ??
    []
  ).forEach(
    (match, index) => {
      const traveler =
        match.aevd

      const analysis =
        traveler
          ?.commentAnalysis

      if (
        !traveler ||
        !analysis
      ) {
        return
      }

      const hasClues =
        analysis
          .boilerplateRemoved ||
        analysis
          .flightDeviation
          ?.roundTripAirport ||
        analysis
          .flightDeviation
          ?.lastSegmentRemoved ||
        (
          analysis
            .frequentFlyerCandidates ??
          []
        ).length > 0 ||
        (
          analysis
            .relationshipClues ??
          []
        ).length > 0 ||
        (
          analysis
            .seatingClues ??
          []
        ).length > 0 ||
        (
          analysis
            .upgradeClues ??
          []
        ).length > 0 ||
        (
          analysis
            .ownAirClues ??
          []
        ).length > 0 ||
        (
          analysis
            .groupFlightClues ??
          []
        ).length > 0

      if (!hasClues) {
        return
      }

      reviews.push({
        id:
          `comment-${index}`,

        match,

        traveler,

        analysis,
      })
    }
  )

  return reviews
}

function buildReviewSummary({
  exceptionRows,
  flightAssignments,
  commentReviews,
  frequentFlyerReviewCount = 0,
  tourDirectorContact,
  flightRecords,
  additionalTourDirectorRecordNumbers,
}) {
  const identityWarnings =
    exceptionRows.length

  const flightWarnings =
    (
      flightAssignments
        ?.companyRecordReviews ??
      []
    ).length +
    (
      flightAssignments
        ?.unassignedCompany ??
      []
    ).length +
    (
      flightAssignments
        ?.tourFlightReview ??
      []
    ).length

  const ffWarnings =
    frequentFlyerReviewCount

  const commentWarnings =
    commentReviews.filter(
      (item) =>
        item.analysis
          .commentNeedsReview
    ).length

  const tourDirectorStatus = tourDirectorReadiness(
    tourDirectorContact,
    flightRecords,
    additionalTourDirectorRecordNumbers
  )
  const tourDirectorWarnings = tourDirectorStatus.warning ? 1 : 0
  const blockers = tourDirectorStatus.blocker ? 1 : 0

  return {
    identityWarnings,
    flightWarnings,
    ffWarnings,
    commentWarnings,
    tourDirectorWarnings,
    blockers,

    totalWarnings:
      identityWarnings +
      flightWarnings +
      ffWarnings +
      commentWarnings +
      tourDirectorWarnings,
  }
}

function ReviewNavButton({
  active,
  label,
  count,
  onClick,
}) {
  return (
    <button
      type="button"
      className={
        `analyze-nav-button${
          active
            ? ' active'
            : ''
        }`
      }
      aria-pressed={active}
      onClick={
        onClick
      }
    >
      <span className="analyze-nav-label">
        {label}
      </span>

      <strong
        className={count > 0 ? 'has-warnings' : ''}
        aria-label={`${count} warnings`}
      >
        {count}
      </strong>
    </button>
  )
}

function CommentReviewPanel({
  reviews,
}) {
  const [
    expandedId,
    setExpandedId,
  ] = useState(null)

  if (
    reviews.length === 0
  ) {
    return (
      <div className="analyze-empty-state">
        <h4>
          No comment review needed.
        </h4>

        <p>
          Sardines did not find
          unresolved operational
          information in the Flight
          Comments.
        </p>
      </div>
    )
  }

  return (
    <div className="comment-table-wrap">
      <table className="comment-review-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Traveler</th>
            <th>Res</th>
            <th>Comment</th>
            <th>Found</th>
            <th aria-label="Details" />
          </tr>
        </thead>

        <tbody>
          {reviews.map(
            (item) => {
              const analysis =
                item.analysis

              const deviation =
                analysis
                  .flightDeviation ??
                {}

              const found = []

              if (
                deviation
                  .roundTripAirport
              ) {
                found.push(
                  `Deviation: ${deviation.roundTripAirport}`
                )
              }

              if (
                deviation
                  .lastSegmentRemoved
              ) {
                found.push(
                  'Final segment removed'
                )
              }

              const ff =
                analysis
                  .frequentFlyerCandidates ??
                []

              if (ff.length) {
                found.push(
                  ff
                    .map(
                      (candidate) =>
                        candidate
                          .normalizedValue ||
                        candidate
                          .number
                    )
                    .join(', ')
                )
              }

              const relationships =
                analysis
                  .relationshipClues ??
                []

              if (
                relationships.length
              ) {
                found.push(
                  `${relationships.length} travel-with clue${relationships.length === 1 ? '' : 's'}`
                )
              }

              const seating =
                analysis
                  .seatingClues ??
                []

              if (
                seating.length
              ) {
                found.push(
                  `${seating.length} seating clue${seating.length === 1 ? '' : 's'}`
                )
              }

              const upgrades =
                analysis
                  .upgradeClues ??
                []

              if (
                upgrades.length
              ) {
                found.push(
                  `${upgrades.length} cabin/upgrade clue${upgrades.length === 1 ? '' : 's'}`
                )
              }

              const groupFlights =
                analysis
                  .groupFlightClues ??
                []

              if (
                groupFlights.length
              ) {
                found.push(
                  'Own Air on group flights'
                )
              }

              const isExpanded =
                expandedId ===
                item.id

              return (
                <Fragment
                  key={item.id}
                >
                  <tr>
                    <td className="comment-status-cell">
                      <span className="comment-status">
                        Review
                      </span>
                    </td>

                    <td className="comment-traveler-cell">
                      {travelerDisplayName(
                        item.traveler
                      )}
                    </td>

                    <td className="comment-res-cell">
                      {item.traveler
                        .reservationNumber ||
                        '—'}
                    </td>

                    <td
                      className="comment-text-cell"
                      title={
                        analysis
                          .cleanedComment ||
                        analysis
                          .rawComment ||
                        ''
                      }
                    >
                      <span>
                        {analysis
                          .cleanedComment ||
                          analysis
                            .rawComment ||
                          '—'}
                      </span>
                    </td>

                    <td className="comment-found-cell">
                      {found.length
                        ? found.join(' · ')
                        : 'Unclassified comment'}
                    </td>

                    <td className="comment-action-cell">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(
                            isExpanded
                              ? null
                              : item.id
                          )
                        }
                        aria-expanded={
                          isExpanded
                        }
                      >
                        {isExpanded
                          ? 'Close'
                          : 'Details'}
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="comment-detail-row">
                      <td
                        colSpan="6"
                      >
                        <div className="comment-detail-grid">
                          <div>
                            <strong>
                              Raw Centaur comment
                            </strong>

                            <p>
                              {analysis
                                .rawComment ||
                                '—'}
                            </p>
                          </div>

                          <div>
                            <strong>
                              Sardines found
                            </strong>

                            <p>
                              {found.length
                                ? found.join(
                                  ' · '
                                )
                                : 'Nothing classified yet.'}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            }
          )}
        </tbody>
      </table>
    </div>
  )
}

function FrequentFlyerReviewPanel({
  reviewItems,
  decisions,
  onDecision,
  onUndoDecision,
}) {
  const completed = Object.entries(decisions ?? {})
  const autoMoved = []
  return (
    <div>
      {reviewItems.length ===
      0 && (
        <div className="analyze-empty-state">
          <h4>
            No FF# review needed.
          </h4>

          <p>
            No unresolved frequent-flyer or KTN candidates remain.
          </p>
        </div>
      )}

      {autoMoved.length >
        0 && (
          <div className="compact-review-list">
            {autoMoved.map(
              (match) => (
                <article
                  className="compact-review-card"
                  key={
                    match.ppdt
                      ?.travelerNumber ||
                    travelerDisplayName(
                      match.ppdt ||
                      match.aevd
                    )
                  }
                >
                  <div>
                    <strong>
                      {travelerDisplayName(
                        match.ppdt ||
                        match.aevd
                      )}
                    </strong>

                    <span>
                      Moved automatically
                    </span>
                  </div>

                  <p>
                    {
                      match
                        .frequentFlyerAutoAdded
                        .join('; ')
                    }
                  </p>

                  <small>
                    FF# field:{' '}
                    {
                      match
                        .frequentFlyerNumber ||
                      '—'
                    }
                  </small>
                </article>
              )
            )}
          </div>
        )}

      {completed.length > 0 && (
        <div className="ff-reviewed-list">
          <h4>Reviewed</h4>
          {completed.map(([key, decision]) => (
            <article className="ff-reviewed-item" key={key}>
              <div>
                <strong>{decision.travelerName}</strong>
                <span>{decision.action === 'ff' ? `FF#: ${decision.value}` : decision.action === 'ktn' ? `KTN: ${decision.value}` : `Not used: ${decision.value}`}</span>
              </div>
              <button type="button" onClick={() => onUndoDecision(key)}>Change</button>
            </article>
          ))}
        </div>
      )}

      {reviewItems.length >
        0 && (
          <div className="compact-review-list">
            {reviewItems.map(
              (
                item,
                index
              ) => (
                <article
                  className="compact-review-card ff-review-card"
                  key={`ff-review-${index}`}
                >
                  <div>
                    <strong>
                      {travelerDisplayName(
                        item.match
                          .ppdt ||
                        item.match
                          .aevd
                      )}
                    </strong>

                    <span>
                      Review
                    </span>
                  </div>

                  <p>
                    {
                      item.review
                        .normalizedValue ||
                      item.review
                        .number ||
                      'Unknown FF#'
                    }
                  </p>

                  <small>
                    {
                      item.review
                        .reason
                    }
                  </small>

                  <form
                    className="ff-review-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const form = new FormData(event.currentTarget)
                      const action = event.nativeEvent.submitter?.value
                      onDecision(item, action, form.get('value'))
                    }}
                  >
                    <label>
                      <span>Candidate value</span>
                      <input
                        name="value"
                        defaultValue={suggestedFrequentFlyerValue(item.review)}
                        required
                      />
                    </label>
                    <div className="ff-review-actions">
                      <button type="submit" name="action" value="ff">Use as FF#</button>
                      <button type="submit" name="action" value="ktn">Use as KTN</button>
                      <button type="submit" name="action" value="ignore" formNoValidate className="quiet">Not needed</button>
                    </div>
                  </form>
                </article>
              )
            )}
          </div>
        )}
    </div>
  )
}

function AnalyzeRepairWorkspace({
  activeSection,
  onActiveSectionChange,
  passengerInitialAirFilter,
  focusedRecord,
  tripType,
  onTripTypeChange,
  exceptionRows,
  flightAssignments,
  commentReviews,
  reconciliation,
  tourFlightEnabled,
  travelers,
  tourDirectorContact,
  onEffectiveAssignmentsChange,
  effectiveAssignments,
  onExport,
  exporting,
  exportLocked,
  passengerOverrides,
  onPassengerOverrideChange,
  onAddManualPerson,
  onRemoveManualPerson,
  onDismissUnmatched,
  flightRecords,
  tourDirectorFlightRecords,
  additionalTourDirectorRecordNumbers,
  frequentFlyerDecisions,
  onFrequentFlyerDecision,
  onUndoFrequentFlyerDecision,
}) {
  const setActiveSection = onActiveSectionChange

  const [
    lastConfirmationId,
    setLastConfirmationId,
  ] = useState('')

  const ffReviewItems =
    (
      reconciliation
        ?.matches ??
      []
    ).flatMap(
      (match) =>
        (
          match
            .frequentFlyerReview ??
          []
        ).map(
          (review) => ({
            match,
            review,
          })
        )
    )

  const ownAirMatches =
    new Set(
      (
        flightAssignments
          ?.companyAssignments ??
        []
      )
        .filter(
          (assignment) =>
            assignment
              .assignmentType ===
            'own-air'
        )
        .map(
          (assignment) =>
            assignment.match
        )
    )

  const scopedCommentReviews =
    commentReviews.filter(
      (item) =>
        tourFlightEnabled ||
        !ownAirMatches.has(
          item.match
        )
    )

  const unresolvedCommentReviews =
    scopedCommentReviews.filter(
      (item) =>
        item.analysis
          .commentNeedsReview
    )


  const summary =
    buildReviewSummary({
      exceptionRows,
      flightAssignments,

      commentReviews:
        scopedCommentReviews,

      frequentFlyerReviewCount:
        reconciliation
          ?.frequentFlyerSummary
          ?.reviewCount ??
        0,
      tourDirectorContact,
      flightRecords: tourDirectorFlightRecords,
      additionalTourDirectorRecordNumbers,
    })

  const exportBlockers =
    summary.blockers +
    (exportLocked ? 1 : 0)

  const pendingConfirmations =
    effectiveAssignments
      ?.pendingConfirmations ?? []

  function goToConfirmation(id) {
    setActiveSection('flights')

    window.requestAnimationFrame(() => {
      const target = document.getElementById(id)
      target?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      target?.classList.add('confirmation-target')
      window.setTimeout(
        () => target?.classList.remove('confirmation-target'),
        1600
      )
    })
  }

  function goToNextConfirmation() {
    if (pendingConfirmations.length === 0) {
      return
    }

    const previousIndex =
      pendingConfirmations.findIndex(
        (item) => item.id === lastConfirmationId
      )
    const nextIndex =
      previousIndex < 0
        ? 0
        : (previousIndex + 1) % pendingConfirmations.length

    goToConfirmation(pendingConfirmations[nextIndex].id)
    setLastConfirmationId(pendingConfirmations[nextIndex].id)
  }

  function goToNextBlocker() {
    if (!tripType) {
      const target = document.querySelector('.trip-type-selector')
      target?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      target?.classList.add('confirmation-target')
      window.setTimeout(() => target?.classList.remove('confirmation-target'), 1600)
      return
    }

    if (summary.blockers > 0) {
      const target = document.querySelector(
        '.tour-director-task, .tour-director-disclosure'
      )
      target?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      target?.classList.add('confirmation-target')
      window.setTimeout(() => target?.classList.remove('confirmation-target'), 1600)
      return
    }

    if (pendingConfirmations.length > 0) {
      goToNextConfirmation()
      return
    }

    setActiveSection('flights')
  }

  return (
    <div className={`analyze-repair-workspace${['passengers', 'flights'].includes(activeSection) ? ' list-workspace' : ''}`}>
      <div className="analyze-repair-header">
        <div>
          <p className="analyze-kicker">
            Analyze &amp; Repair
          </p>

          <h3>
            Check the fish before
            sealing the tin.
          </h3>

          <div className={`trip-type-selector${tripType ? '' : ' required'}`} role="radiogroup" aria-label="Trip type" aria-required="true">
            <span>
              Trip type
            </span>

            <label className="trip-type-option">
              <input
                type="radio"
                name="trip-type"
                value="domestic"
                checked={tripType === 'domestic'}
                onChange={() =>
                  onTripTypeChange('domestic')
                }
              />
              <span className="relabel-radio" aria-hidden="true" />
              <strong>Domestic</strong>
            </label>

            <label className="trip-type-option">
              <input
                type="radio"
                name="trip-type"
                value="international"
                checked={tripType === 'international'}
                onChange={() =>
                  onTripTypeChange('international')
                }
              />
              <span className="relabel-radio" aria-hidden="true" />
              <strong>International</strong>
            </label>
          </div>

          <p className="trip-type-note">
            {!tripType
              ? 'Required: choose the trip type so Sardines applies the correct passport review rules.'
              : tripType === 'domestic'
              ? 'AEVD + PPDT are still required. A missing passport for an individual traveler is not a Domestic warning; passport-backed names are preferred when available.'
              : 'International review expects passport-backed traveler identity and will treat missing required passport information as review work.'}
          </p>
        </div>

        <aside className="export-readiness">
          <span>
            Export Readiness
          </span>

          <strong>
            {exportBlockers ===
            0
              ? 'Can export'
              : 'Not ready'}
          </strong>

          <p>
            {
              summary
                .totalWarnings
            }{' '}
            warning{
              summary
                .totalWarnings ===
              1
                ? ''
                : 's'
            } ·{' '}
            {exportBlockers > 0 ? (
              <button
                type="button"
                className="readiness-blocker-link"
                onClick={goToNextBlocker}
              >
                {exportBlockers} blocker{exportBlockers === 1 ? '' : 's'}
              </button>
            ) : '0 blockers'}
          </p>

          {pendingConfirmations.length > 0 && (
            <div className="readiness-confirmation-links">
              <button
                type="button"
                onClick={goToNextConfirmation}
              >
                ⚠ {pendingConfirmations.length}{' '}
                confirmation{pendingConfirmations.length === 1 ? '' : 's'} needed
              </button>
            </div>
          )}

          <button
            type="button"
            className={`open-can-button${exporting ? ' opening' : ''}`}
            onClick={onExport}
            disabled={
              exporting ||
              exportLocked
            }
            title={
              !tripType
                ? 'Choose Domestic or International before opening the can.'
                : exportLocked
                ? 'Complete every required flight confirmation before opening the can.'
                : summary.blockers > 0
                  ? 'Open the can: build Untitled.xlsx with the FMG Final Names List and Sardines review sheets. Unresolved items will remain flagged for review.'
                  : 'Open the can: build Untitled.xlsx with the FMG Final Names List and Sardines review sheets.'
            }
          >
            <svg
              className="open-can-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M5 9.5v9c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-9" />
              <path d="M5 9.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
              <path d="M6.5 6.5c1.2.7 3.2 1.1 5.5 1.1 2.1 0 4-.4 5.2-1" />
              <path className="open-can-lid" d="M6.5 6.5 9 2.7c.8-1.2 3.6-.8 6.2.9s4 4 3.2 5.2l-1.2 1.8" />
            </svg>
            {exporting
              ? ' Peeling the Tin…'
              : tripType
                ? ` Open ${tripType === 'domestic' ? 'Domestic' : 'International'} Can`
                : ' Open the Can'}
          </button>
        </aside>
      </div>

      <div className="analyze-repair-body">
        <nav className="analyze-nav">
          <ReviewNavButton
            active={activeSection === 'passengers'}
            label="Passengers"
            count={summary.identityWarnings}
            onClick={() => setActiveSection('passengers')}
          />

          <ReviewNavButton
            active={
              activeSection ===
              'flights'
            }
            label="Flights"
            count={
              summary
                .flightWarnings
            }
            onClick={() =>
              setActiveSection(
                'flights'
              )
            }
          />

          <ReviewNavButton
            active={
              activeSection ===
              'comments'
            }
            label="Comments"
            count={
              summary
                .commentWarnings
            }
            onClick={() =>
              setActiveSection(
                'comments'
              )
            }
          />

          <ReviewNavButton
            active={
              activeSection ===
              'ff'
            }
            label="FF# / KTN"
            count={
              summary
                .ffWarnings
            }
            onClick={() =>
              setActiveSection(
                'ff'
              )
            }
          />
        </nav>

        <div className="analyze-panel">
          {activeSection === 'passengers' && (
            <>
              <div className="analyze-panel-heading">
                <h3>Passenger Review</h3>
                <p>Correct source-report mistakes and choose a flight record. Manual values are used for this job without changing the uploaded files.</p>
              </div>
              <PassengerReviewPanel
                key={passengerInitialAirFilter}
                travelers={travelers}
                flightRecords={flightRecords}
                flightAssignments={flightAssignments}
                overrides={passengerOverrides}
                onChange={onPassengerOverrideChange}
                onAdd={onAddManualPerson}
                onRemove={onRemoveManualPerson}
                onDismissUnmatched={onDismissUnmatched}
                exceptionRows={exceptionRows}
                initialAirFilter={passengerInitialAirFilter}
              />
            </>
          )}

          {activeSection ===
            'comments' && (
              <>
                <div className="analyze-panel-heading">
                  <h3>
                    Flight Comments
                  </h3>

                  <p>
                    Only unresolved comment text appears here.
                    Known operational prose is removed once Sardines
                    has already understood and routed it elsewhere.
                  </p>
                </div>

                <CommentReviewPanel
                  reviews={
                    unresolvedCommentReviews
                  }
                />
              </>
            )}

          {activeSection ===
            'ff' && (
              <>
                <div className="analyze-panel-heading">
                  <h3>
                    Frequent Flyer / KTN
                  </h3>

                  <p>
                    Comment-derived FF#
                    values are candidates,
                    never silent corrections.
                    {' '}KTNs are 9–10 letters/numbers; a Global Entry PASSID is exactly 9 digits.
                  </p>
                </div>

                <FrequentFlyerReviewPanel
                  reviewItems={
                    ffReviewItems
                  }
                  decisions={frequentFlyerDecisions}
                  onDecision={onFrequentFlyerDecision}
                  onUndoDecision={onUndoFrequentFlyerDecision}
                />
              </>
            )}

          {activeSection ===
            'flights' && (
              <>
                <div className="analyze-panel-heading">
                  <h3>
                    Flight Records
                  </h3>

                  <p>
                    Record capacity,
                    assignment exceptions,
                    and traveler placement.
                  </p>
                </div>

                <FlightRecordReviewPanel
                  flightAssignments={
                    flightAssignments
                  }
                  travelers={
                    travelers
                  }
                  onEffectiveAssignmentsChange={
                    onEffectiveAssignmentsChange
                  }
                  focusedRecord={focusedRecord}
                  onMarkSeparatelyTicketed={(match) => {
                    const key = passengerKey(match)
                    onPassengerOverrideChange(
                      key,
                      {
                        ...(passengerOverrides[key] ?? passengerOverrideFromMatch(match)),
                        airType: 'Own Air',
                        recordNumbers: [],
                      },
                      match
                    )
                  }}
                />
              </>
            )}
        </div>
      </div>
    </div>
  )
}

function FileInput({
  label,
  files,
  onFiles,
  multiple = false,
}) {
  return (
    <div className={`centaur-file-input ${files.length > 0 ? 'has-files' : ''}`}>
      {files.length >
        0 && (
          <div className="selected-files">
            {files.map(
              (file) => (
                <div
                  className="selected-file"
                  key={`${file.name}-${file.size}`}
                >
                  ✓ {file.name}
                </div>
              )
            )}
          </div>
        )}

      <label className={files.length > 0 ? 'secondary-button' : 'file-picker'}>
        <span>
          {files.length > 0 ? 'Change Centaur reports' : label}
        </span>

        <input
          type="file"
          accept=".csv,text/csv"
          multiple={
            multiple
          }
          onChange={(
            event
          ) =>
            onFiles(
              Array.from(
                event.target
                  .files ?? []
              )
            )
          }
        />
      </label>
    </div>
  )
}

function defaultEffectiveAssignments(
  flightAssignments
) {
  if (!flightAssignments) {
    return {
      companyAssignments: [],
      tourFlightAssignments: [],
    }
  }

  const tourFlightAssignments = [
    ...(flightAssignments
      .tourFlightAssignments ??
    []),
  ]

  ;(flightAssignments
    .tourFlightReviewGroups ??
  []).forEach((group) => {
    ;(group.travelers ?? []).forEach(
      (match) => {
        tourFlightAssignments.push({
          match,
          recordNumber:
            group.defaultRecord
              .recordNumber,
          record:
            group.defaultRecord,
          assignmentType:
            'shared-flight-default',
          reviewRequired:
            true,
          reviewReason:
            'Shared-flight split has not been reviewed. Traveler is provisionally on the standard record.',
        })
      }
    )
  })

  return {
    companyAssignments:
      flightAssignments
        .companyAssignments ??
      [],
    tourFlightAssignments,
    sharedFlightConfirmed:
      (flightAssignments
        .tourFlightReviewGroups ??
      []).length === 0,
    flightWarningsConfirmed:
      (flightAssignments
        .companyRecordStatus ??
      []).every((status) => !status.reviewRequired),
  }
}

function FinalGroupTicketList() {
  const [
    contractFile,
    setContractFile,
  ] = useState(null)

  const [
    contractData,
    setContractData,
  ] = useState(null)

  const [
    firstFile,
    setFirstFile,
  ] = useState(null)

  const [
    firstReport,
    setFirstReport,
  ] = useState(null)

  const [
    secondFile,
    setSecondFile,
  ] = useState(null)

  const [
    secondReport,
    setSecondReport,
  ] = useState(null)

  const [
    results,
    setResults,
  ] = useState(null)

  const [
    showFileSetup,
    setShowFileSetup,
  ] = useState(true)

  const [
    error,
    setError,
  ] = useState('')

  const [
    analyzing,
    setAnalyzing,
  ] = useState(false)

  const [
    tripType,
    setTripType,
  ] = useState('')

  const [
    tourDirectorContact,
    setTourDirectorContact,
  ] = useState(
    emptyTourDirectorContact()
  )

  const [
    roomingFile,
    setRoomingFile,
  ] = useState(null)

  const [
    roomingData,
    setRoomingData,
  ] = useState(null)

  const [
    effectiveAssignments,
    setEffectiveAssignments,
  ] = useState(null)

  const [
    exporting,
    setExporting,
  ] = useState(false)

  const [
    showContactExportPrompt,
    setShowContactExportPrompt,
  ] = useState(false)

  const [
    passengerOverrides,
    setPassengerOverrides,
  ] = useState({})

  const [manualPeople, setManualPeople] = useState([])
  const [dismissedUnmatchedKeys, setDismissedUnmatchedKeys] = useState(() => new Set())
  const [frequentFlyerDecisions, setFrequentFlyerDecisions] = useState({})

  const [reviewSection, setReviewSection] = useState('flights')
  const [passengerInitialAirFilter, setPassengerInitialAirFilter] = useState('all')
  const [focusedRecord, setFocusedRecord] = useState(null)

  const handlePassengerOverrideChange =
    useCallback((key, override, match) => {
      setPassengerOverrides((current) => {
        const next = { ...current }
        if (override) next[key] = override
        else delete next[key]
        return next
      })
      setEffectiveAssignments(null)
      if (override?.role === 'tour-director' && match) {
        setTourDirectorContact((current) =>
          tourDirectorContactFromTraveler(match, override, current)
        )
      } else if (override?.role === 'passenger' && match) {
        setTourDirectorContact((current) =>
          matchIsTourDirector(match, current)
            ? emptyTourDirectorContact()
            : current
        )
      }
    }, [])

  const handleAddManualPerson = useCallback((role, values = {}) => {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    const person = createManualPerson(id, role, values)
    const key = `manual:${id}`
    setManualPeople((current) => [...current, person])
    setPassengerOverrides((current) => ({
      ...current,
      [key]: { ...manualPersonToOverride(person), _isDraft: true },
    }))
    setEffectiveAssignments(null)
    return key
  }, [])

  const handleRemoveManualPerson = useCallback((id) => {
    const key = `manual:${id}`
    setManualPeople((current) => current.filter((person) => person.id !== id))
    setPassengerOverrides((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setEffectiveAssignments(null)
  }, [])

  const handleDismissUnmatched = useCallback((row) => {
    const sourceType = row.sourceUnmatchedType
    if (!['air', 'passport'].includes(sourceType) || !row.unmatchedTraveler) return
    const key = unmatchedSourceRecordKey(sourceType, row.unmatchedTraveler)
    setDismissedUnmatchedKeys((current) => new Set([...current, key]))
    setEffectiveAssignments(null)
  }, [])

  const handleFrequentFlyerDecision = useCallback((item, action, value) => {
    if (!['ff', 'ktn', 'ignore'].includes(action)) return
    const cleanedValue = cleanCell(value).toUpperCase()
    if (action === 'ktn' && !isPlausibleKtn(cleanedValue)) {
      setError('A KTN must be 9–10 letters and numbers with no punctuation. Choose FF# instead when the value includes an airline prefix such as UA:.')
      return
    }
    if (action === 'ff' && !cleanedValue) {
      setError('Enter the frequent-flyer number before using it as FF#.')
      return
    }
    const key = frequentFlyerReviewKey(item.match, item.review)
    setError('')
    setFrequentFlyerDecisions((current) => ({
      ...current,
      [key]: {
        action,
        value: cleanedValue,
        travelerName: travelerDisplayName(item.match.ppdt || item.match.aevd),
      },
    }))
  }, [])

  const handleUndoFrequentFlyerDecision = useCallback((key) => {
    setFrequentFlyerDecisions((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }, [])

  const handleEffectiveAssignments =
    useCallback(
      (next) => {
        setEffectiveAssignments(next)
      },
      []
    )

  async function handleExport(options = {}) {
    if (!results) {
      return
    }

    if (!tripType) {
      setError('Choose Domestic or International before opening the can.')
      document.querySelector('.trip-type-selector')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      return
    }

    const exportAssignments =
      effectiveAssignments ??
      defaultEffectiveAssignments(
        displayedFlightAssignments
      )

    const sharedFlightNeedsConfirmation =
      results.tourFlight?.enabled ===
        true &&
      (results.flightAssignments
        ?.tourFlightReviewGroups ??
      []).length > 0

    if (
      sharedFlightNeedsConfirmation &&
      exportAssignments
        .sharedFlightConfirmed !==
      true
    ) {
      setError(
        'Confirm the shared contracted flight traveler list before exporting.'
      )
      return
    }

    if (
      exportAssignments
        .flightWarningsConfirmed !==
      true
    ) {
      setError(
        'Open each flight-record warning and confirm that the seat difference is acceptable before exporting.'
      )
      return
    }

    if (
      currentTourDirectorReadiness.missingContact &&
      options.skipContactWarning !== true
    ) {
      setShowContactExportPrompt(true)
      return
    }

    setShowContactExportPrompt(false)
    setExporting(true)
    setError('')

    try {
      const exportFlightRecords =
        contractData?.flightRecords ??
        results.flightRecords

      await exportFmgWorkbook({
        contractFileName:
          results.contractFileName,
        // Contract metadata belongs to the contract, not to the analysis
        // snapshot. Export the current parsed contract records so FMG record
        // headings/capacities stay authoritative even when traveler
        // assignments change during review.
        flightRecords:
          exportFlightRecords,
        reconciliation:
          reviewedReconciliation,
        effectiveAssignments:
          exportAssignments,
        roomingData,
        tourFlight:
          results.tourFlight,
        tourDirectorContact,
        tripType,
        contractText:
          contractData?.text ?? '',
      })
    } catch (err) {
      console.error(err)
      setError(
        'The fish packed the travelers but dropped the spreadsheet. Try the export again and check the browser console if it keeps happening.'
      )
    } finally {
      setExporting(false)
    }
  }

  function goToTourDirectorContact() {
    setShowContactExportPrompt(false)
    window.requestAnimationFrame(() => {
      const details = document.querySelector('.tour-director-disclosure')
      if (details) details.open = true
      details?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  function handleContractFile(
    file
  ) {
    const hadSourceFiles = Boolean(firstFile || secondFile || roomingFile)
    setContractFile(
      file
    )
    setFirstFile(null)
    setFirstReport(null)
    setSecondFile(null)
    setSecondReport(null)
    setRoomingFile(null)
    setRoomingData(null)
    setResults(null)
    setTourDirectorContact(emptyTourDirectorContact())
    setPassengerOverrides({})
    setManualPeople([])
    setDismissedUnmatchedKeys(new Set())
    setFrequentFlyerDecisions({})
    setEffectiveAssignments(null)
    setTripType('')

    if (hadSourceFiles) {
      setError('Contract changed. The previous tour reports and rooming list were cleared; upload the matching files for this contract.')
    }
  }

  function handleContractData(
    data
  ) {
    setContractData(
      data
    )

    setResults(null)
  }

  async function inspectFile(
    file
  ) {
    if (!file) {
      return null
    }

    if (
      !isCsvFile(file)
    ) {
      throw new Error(
        "This file isn't my type. Upload a CSV here."
      )
    }

    const rows =
      await parseCsv(file)

    const detected =
      detectReportType(
        rows
      )

    if (
      detected.type ===
      'unknown'
    ) {
      throw new Error(
        "I can read it, but I can't identify it as a Domestic Air, Passport, or Rooming List report from its columns."
      )
    }

    return {
      file,

      report: {
        ...detected,
        rows,
      },
    }
  }

  async function handleSourceFiles(
    selectedFiles
  ) {
    setError('')
    setResults(null)

    if (
      selectedFiles.length ===
      0
    ) {
      return
    }

    setAnalyzing(true)

    try {
      const inspected = []

      for (
        const file
        of selectedFiles
      ) {
        const result =
          await inspectFile(
            file
          )

        if (result) {
          inspected.push(
            result
          )
        }
      }

      const selectedTypes = inspected.map((item) => item.report.type)
      const duplicateType = selectedTypes.find((type, index) => selectedTypes.indexOf(type) !== index)
      if (duplicateType) {
        throw new Error(`Two selected files both look like the ${reportLabel(duplicateType)}. Choose only one of each report type.`)
      }

      const currentReports = [
        firstFile &&
          firstReport
          ? {
            file:
              firstFile,

            report:
              firstReport,
          }
          : null,

        secondFile &&
          secondReport
          ? {
            file:
              secondFile,

            report:
              secondReport,
          }
          : null,
      ].filter(Boolean)

      const combined = [
        ...currentReports.filter((item) => !selectedTypes.includes(item.report.type)),
        ...inspected.filter((item) => item.report.type !== 'rooming-list'),
      ]

      const domestic =
        combined.find(
          (item) =>
            item.report
              .type ===
            'domestic-air'
        )

      const passport =
        combined.find(
          (item) =>
            item.report
              .type ===
            'passport'
        )

      setFirstFile(
        domestic?.file ||
        passport?.file ||
        null
      )

      setFirstReport(
        domestic?.report ||
        passport?.report ||
        null
      )

      setSecondFile(
        domestic &&
          passport
          ? passport.file
          : null
      )

      setSecondReport(
        domestic &&
          passport
          ? passport.report
          : null
      )

      const rooming = inspected.find((item) => item.report.type === 'rooming-list')
      if (rooming) {
        setRoomingFile(rooming.file)
        setRoomingData(parseRoomingList(rooming.report.rows))
      }
    } catch (err) {
      console.error(err)

      setError(
        err.message ||
        'I tried reading those CSVs and things went poorly. Try exporting the Centaur reports again.'
      )
    } finally {
      setAnalyzing(false)
    }
  }

  function processFiles() {
    if (
      !contractFile ||
      !contractData ||
      !firstReport ||
      !secondReport
    ) {
      setError(
        'Sorry, you are not a winner. Please play again with proper files.'
      )
      return
    }

    setError('')
    setTourDirectorContact(
      emptyTourDirectorContact()
    )
    setPassengerOverrides({})
    setManualPeople([])
    setDismissedUnmatchedKeys(new Set())
    setFrequentFlyerDecisions({})

    const domestic =
      firstReport.type ===
        'domestic-air'
        ? {
          file:
            firstFile,

          report:
            firstReport,
        }
        : {
          file:
            secondFile,

          report:
            secondReport,
        }

    const passport =
      firstReport.type ===
        'passport'
        ? {
          file:
            firstFile,

          report:
            firstReport,
        }
        : {
          file:
            secondFile,

          report:
            secondReport,
        }

    const domesticData =
      rowsToRecords(
        domestic.report
          .rows,

        domestic.report
          .headerIndex
      )

    const passportData =
      rowsToRecords(
        passport.report
          .rows,

        passport.report
          .headerIndex
      )

    const aevdTravelers =
      parseAevdTravelers(
        domesticData.records
      )

    const ppdtTravelers =
      parsePpdtTravelers(
        passportData.records
      )

    const baseReconciliation =
      reconcileTravelers(
        aevdTravelers,
        ppdtTravelers
      )

    const reportedTourDirector =
      findNamedTourDirectorMatch(
        baseReconciliation.matches,
        reportMetadataValue(
          passport.report.rows,
          'Tour Director'
        )
      )

    const roleAwareReconciliation = reportedTourDirector
      ? {
          ...baseReconciliation,
          matches: baseReconciliation.matches.map((match) =>
            match === reportedTourDirector
              ? { ...match, operational: true }
              : match
          ),
        }
      : baseReconciliation

    const reconciliation =
      mergeFrequentFlyers({
        reconciliation:
          roleAwareReconciliation,

        flightRecords:
          contractData
            .flightRecords ??
          [],
      })

    const detectedTourDirector =
      createTourDirectorContact(
        reconciliation
      )

    const preparedTourDirector =
      suggestTourDirectorFlightRecord(
        detectedTourDirector,

        contractData
          .flightRecords ??
          [],

        contractData
          .tourFlight
      )

    setTourDirectorContact(
      preparedTourDirector
    )

    const flightAssignments =
      assignFlightRecords({
        reconciliation,

        ppdtTravelers,

        flightRecords:
          contractData
            .flightRecords ??
          [],

        tourFlight:
          contractData
            .tourFlight,
        roomingData,
      })

    setEffectiveAssignments(null)

    setResults({
      domesticFileName:
        domestic.file.name,

      passportFileName:
        passport.file.name,

      contractFileName:
        contractFile.name,

      domesticHeaderIndex:
        domestic.report
          .headerIndex,

      passportHeaderIndex:
        passport.report
          .headerIndex,

      domestic:
        domesticData,

      passport:
        passportData,

      aevdTravelers,

      ppdtTravelers,

      passportReturnDate:
        reportMetadataValue(
          passport.report.rows,
          'Return Date'
        ),

      reconciliation,

      flightRecords:
        contractData
          .flightRecords ??
        [],

      tourFlight:
        contractData
          .tourFlight,

      flightAssignments,
    })
    setShowFileSetup(false)
  }

  const sourceFiles = [
    firstFile,
    secondFile,
    roomingFile,
  ].filter(Boolean)

  /* These values must retain object identity between unrelated UI renders.
     FlightRecordReviewPanel publishes effective assignments in an effect;
     rebuilding these objects on every render creates a parent/child update loop. */
  /* eslint-disable react-hooks/preserve-manual-memoization */
  const reviewedReconciliation =
    useMemo(
      () => {
        if (!results) return null

        return applyFrequentFlyerDecisions(
          mergeFrequentFlyers({
            reconciliation: applyPassengerOverrides({
            ...removeAdoptedUnmatchedRecords(
              removeDismissedUnmatchedRecords(
                results.reconciliation,
                dismissedUnmatchedKeys
              ),
              manualPeople,
              passengerOverrides
            ),
            matches: [
              ...(results.reconciliation.matches ?? []),
              ...manualPeople.map(manualPersonToMatch),
            ],
            }, passengerOverrides),
          }),
          frequentFlyerDecisions
        )
      },
      [results, passengerOverrides, manualPeople, dismissedUnmatchedKeys, frequentFlyerDecisions]
    )

  const reviewedFlightAssignments =
    useMemo(() => {
      if (!results || !reviewedReconciliation) return null

      const assigned = assignFlightRecords({
        reconciliation: reviewedReconciliation,
        flightRecords: contractData?.flightRecords ?? results.flightRecords,
        tourFlight: results.tourFlight,
        roomingData,
      })

      return refreshFlightAssignmentSummary({
        ...assigned,
        companyAssignments: applyManualFlightSelections(
          assigned.companyAssignments,
          passengerOverrides,
          contractData?.flightRecords ?? results.flightRecords
        ),
      })
    }, [results, reviewedReconciliation, passengerOverrides, contractData, roomingData])
  /* eslint-enable react-hooks/preserve-manual-memoization */

  const exceptionRows =
    results
      ? [
          ...buildExceptionRows(
            reviewedReconciliation
          ),
          ...passportReviewRows(
            reviewedReconciliation,
            tripType,
            contractData,
            results.passportReturnDate
          ),
          ...(tourDirectorPassportReviewRow(
            tourDirectorContact,
            tripType,
            contractData,
            results.passportReturnDate
          )
            ? [tourDirectorPassportReviewRow(
                tourDirectorContact,
                tripType,
                contractData,
                results.passportReturnDate
              )]
            : []),
        ]
      : []

  const rosterCounts = travelerRosterCounts(
    reviewedReconciliation,
    tourDirectorContact
  )

  const commentReviews =
    results
      ? collectCommentReviews(
        reviewedReconciliation
      )
      : []

  /* Keep the assignment object stable across unrelated state updates.
     FlightRecordReviewPanel publishes derived state in an effect. */
  /* eslint-disable react-hooks/preserve-manual-memoization */
  const displayedFlightAssignments =
    useMemo(
      () => results
        ? applyTourDirectorFlightAssignment(
          reviewedFlightAssignments,
          tourDirectorContact,
          roomingData
        )
        : null,
      [results, reviewedFlightAssignments, tourDirectorContact, roomingData]
    )
  /* eslint-enable react-hooks/preserve-manual-memoization */

  const quickViewRecordStatuses = results
    ? (() => {
    const sharedRecordNumbers = new Set(
      (results.tourFlight?.recordNumbers ?? []).map(Number)
    )
    const sharedAssignments =
      effectiveAssignments
        ? (effectiveAssignments.tourFlightAssignments ?? [])
        : [
            ...(displayedFlightAssignments?.tourFlightAssignments ?? []),
            ...(displayedFlightAssignments?.tourFlightReviewGroups ?? []).flatMap(
              (group) => (group.travelers ?? []).map((match) => ({
                match,
                recordNumber: group.defaultRecord.recordNumber,
              }))
            ),
          ]
    const sharedStatuses = (results.flightRecords ?? [])
      .filter((record) => sharedRecordNumbers.has(Number(record.recordNumber)))
      .map((record) => {
        const assignedCount = sharedAssignments.filter(
          (assignment) => Number(assignment.recordNumber) === Number(record.recordNumber)
        ).length
        const capacityState = recordCapacityState(record, assignedCount)

        return {
          record,
          recordNumber: record.recordNumber,
          ...capacityState,
          isShared: true,
          reviewRequired:
            effectiveAssignments?.sharedFlightConfirmed !== true ||
            capacityState.reviewRequired,
        }
      })

    return [
      ...(displayedFlightAssignments?.companyRecordStatus ?? []),
      ...sharedStatuses,
    ].sort((left, right) => Number(left.recordNumber) - Number(right.recordNumber))
      })()
    : []

  const sharedFlightExportLocked =
    (
      results?.tourFlight?.enabled ===
        true &&
      (results.flightAssignments
        ?.tourFlightReviewGroups ??
      []).length > 0 &&
      effectiveAssignments
        ?.sharedFlightConfirmed !==
        true
    ) ||
    (effectiveAssignments
      ? effectiveAssignments.flightWarningsConfirmed !== true
      : (displayedFlightAssignments?.companyRecordStatus ?? [])
          .some((status) => status.reviewRequired))

  const availableCompanyFlightRecords =
    results
      ? companyFlightRecords(
        results.flightRecords,
        results.tourFlight
      )
      : []

  const additionalTourDirectorRecordNumbers =
    Object.values(passengerOverrides)
      .filter((override) => override?.role === 'tour-director')
      .flatMap((override) => override.recordNumbers ?? (override.recordNumber ? [override.recordNumber] : []))
      .map(Number)
      .filter(Number.isFinite)

  const currentTourDirectorReadiness = tourDirectorReadiness(
    tourDirectorContact,
    availableCompanyFlightRecords,
    additionalTourDirectorRecordNumbers
  )
  const missingTourDirectorContactLabel = [
    currentTourDirectorReadiness.missingPhone ? 'phone' : '',
    currentTourDirectorReadiness.missingEmail
      ? 'email'
      : (currentTourDirectorReadiness.invalidEmail ? 'valid email' : ''),
  ].filter(Boolean).join(' and ')

  return (
    <section className="manifest-workflow">
      {results && !showFileSetup ? (
        <div className="job-files-summary">
          <span><strong>Files ready</strong><small>{results.contractFileName}</small></span>
          <button type="button" onClick={() => setShowFileSetup(true)}>Review files &amp; routes</button>
        </div>
      ) : (
      <section className="job-files">
        <div className="job-files-heading">
          <span><strong>Start a new can</strong><small>{results ? `${results.contractFileName} · source reports loaded` : 'Add the current FMG contract and traveler reports'}</small></span>
        </div>
        <div className="intake-grid">
      <ContractInput
        file={
          contractFile
        }
        contractData={
          contractData
        }
        onFile={
          handleContractFile
        }
        onContractData={
          handleContractData
        }
      />

      <div className="source-reports">
        <h3>
          Traveler Reports
        </h3>

        <p>
          Choose the Domestic Air and Passport CSVs. Add the Rooming List too when you have it; filenames do not matter.
        </p>

        <FileInput
          label="Choose Centaur reports"
          files={
            sourceFiles
          }
          onFiles={
            handleSourceFiles
          }
          multiple
        />

        {roomingData && (
          <p className="rooming-report-ready">
            ✓ Rooming list loaded · {roomingData.rooms.length} rooms
          </p>
        )}

        {error && (
          <p className="source-report-error">
            {error}
          </p>
        )}
      </div>

        </div>

      {analyzing && (
        <p>
          Inspecting your
          Centaur Files...
        </p>
      )}

      {firstReport &&
        !secondReport && (
          <p>
            Got the{' '}
            <strong>
              {reportLabel(
                firstReport.type
              )}
            </strong>
            . Sardines still needs
            the{' '}
            <strong>
              {missingReportLabel(
                firstReport.type
              )}
            </strong>
            .
            {missingReportHelper(
              firstReport.type
            ) && (
                <>
                  <br />

                  {missingReportHelper(
                    firstReport.type
                  )}
                </>
              )}
          </p>
        )}

      <div className="process-action">
      <span>{contractFile && firstReport && secondReport ? 'Everything is ready' : 'Add both required file groups to continue'}</span>
      <button
        type="button"
        className="tin-button"
        onClick={
          processFiles
        }
        disabled={
          !contractFile ||
          !contractData ||
          !firstReport ||
          !secondReport
        }
      >
        🐟 Put Those Fish in a Tin!
      </button>
      </div>
      </section>
      )}

      {results && (!currentTourDirectorReadiness.complete || currentTourDirectorReadiness.missingContact) && (
        <section className={`tour-director-task ${currentTourDirectorReadiness.complete ? 'contact-warning' : 'required'}`}>
          <div className="tour-director-task-heading">
            <span><strong>Lead Tour Director</strong><small>Primary emergency contact · {tourDirectorContact.present === true && currentTourDirectorReadiness.complete ? `${tourDirectorDisplayName(tourDirectorContact)} · ${selectedTourDirectorRecordNumbers(tourDirectorContact).map((number) => `R${number}`).join(' + ')}` : currentTourDirectorReadiness.status}</small></span>
            <b>{currentTourDirectorReadiness.complete ? `Warning · ${missingTourDirectorContactLabel} missing · export allowed` : 'Required · open and complete'}</b>
          </div>
          <TourDirectorPanel
            value={tourDirectorContact}
            onChange={setTourDirectorContact}
            travelers={results.reconciliation.matches}
            flightRecords={availableCompanyFlightRecords}
            additionalTourDirectorRecordNumbers={additionalTourDirectorRecordNumbers}
          />
        </section>
      )}

      {results && currentTourDirectorReadiness.complete && !currentTourDirectorReadiness.missingContact && (
        <details className="tour-director-disclosure">
          <summary>
            <span><strong>Lead Tour Director</strong><small>Primary emergency contact · {tourDirectorContact.present === true ? `${tourDirectorDisplayName(tourDirectorContact)} · ${selectedTourDirectorRecordNumbers(tourDirectorContact).map((number) => `R${number}`).join(' + ')}${currentTourDirectorReadiness.missingContact ? ` · ${missingTourDirectorContactLabel} missing` : ''}` : currentTourDirectorReadiness.status}</small></span>
            <b>
              {currentTourDirectorReadiness.missingContact
                ? `Warning · ${missingTourDirectorContactLabel} missing · export allowed`
                : 'Tour Director details'}
              <span
                className="tour-director-disclosure-action closed-action"
                title="Expand Tour Director details"
                aria-hidden="true"
              >
                ▾
              </span>
              <span
                className="tour-director-disclosure-action open-action"
                title="Collapse Tour Director details"
                aria-hidden="true"
              >
                ▴
              </span>
            </b>
          </summary>
          <TourDirectorPanel
            value={tourDirectorContact}
            onChange={setTourDirectorContact}
            travelers={results.reconciliation.matches}
            flightRecords={availableCompanyFlightRecords}
            additionalTourDirectorRecordNumbers={additionalTourDirectorRecordNumbers}
          />
        </details>
      )}

      {results && (
        <div>
          <section className="flight-record-quick-view" aria-label="Flight record quick view">
            <div
              className="quick-view-total quick-view-total-tooltip"
              tabIndex={0}
              aria-describedby="total-pax-help"
            >
              <strong>{rosterCounts.totalTravelers}</strong>
              <span>Total PAX</span>
              <span id="total-pax-help" className="quick-view-tooltip" role="tooltip">
                Travelers + TDs
              </span>
            </div>
            <div
              className="quick-view-total quick-view-total-tooltip"
              tabIndex={0}
              aria-describedby="total-td-help"
            >
              <strong>{rosterCounts.tourDirectors}</strong>
              <span>Total TD</span>
              <span id="total-td-help" className="quick-view-tooltip" role="tooltip">
                Travelers tagged as Tour Directors
              </span>
            </div>
            <button
              type="button"
              className="quick-view-total own-air quick-view-total-tooltip"
              onClick={() => {
                setPassengerInitialAirFilter('own')
                setReviewSection('passengers')
              }}
              aria-describedby="own-air-help"
            >
              <strong>{displayedFlightAssignments?.summary?.ownAir ?? 0}</strong><span>View Own Air</span>
              <span id="own-air-help" className="quick-view-tooltip" role="tooltip">
                Travelers arranging their own air
              </span>
            </button>
            {quickViewRecordStatuses.map((status) => (
              <button
                type="button"
                className={`quick-view-record quick-view-total-tooltip ${status.reviewRequired ? 'needs-review' : 'complete'}`}
                key={status.recordNumber}
                aria-describedby={`record-${status.recordNumber}-help`}
                onClick={() => {
                  setFocusedRecord({ recordNumber: status.recordNumber, requestedAt: Date.now() })
                  setReviewSection('flights')
                }}
              >
                <span>R{status.recordNumber}</span>
                <strong>{status.assignedCount}/{status.contractedSeats}</strong>
                {status.isShared && (
                  <span className="quick-view-record-kind">Shared</span>
                )}
                {status.openSeats > 0 && (
                  <span className="quick-view-seat-difference">{status.openSeats} open</span>
                )}
                {status.excessTravelers > 0 && (
                  <span className="quick-view-seat-difference critical">{status.excessTravelers} over</span>
                )}
                <span
                  id={`record-${status.recordNumber}-help`}
                  className="quick-view-tooltip quick-view-record-tooltip"
                  role="tooltip"
                >
                  <strong>
                    {status.record?.sourceHeader ||
                      status.record?.routing ||
                      `Record ${status.recordNumber}`}
                  </strong>
                  <span>
                    {status.assignedCount}/{status.contractedSeats} assigned travelers / contracted seats
                  </span>
                  {status.isShared && <span>Shared in-tour flight record</span>}
                </span>
              </button>
            ))}
          </section>

          <AnalyzeRepairWorkspace
            activeSection={reviewSection}
            onActiveSectionChange={setReviewSection}
            passengerInitialAirFilter={passengerInitialAirFilter}
            focusedRecord={focusedRecord}
            tripType={
              tripType
            }
            onTripTypeChange={
              setTripType
            }
            exceptionRows={
              exceptionRows
            }
            flightAssignments={
              displayedFlightAssignments
            }
            commentReviews={
              commentReviews
            }
            reconciliation={
              reviewedReconciliation
            }
            tourFlightEnabled={
              results.tourFlight
                ?.enabled === true
            }
            travelers={
              reviewedReconciliation
                .matches
            }
            tourDirectorContact={
              tourDirectorContact
            }
            onEffectiveAssignmentsChange={
              handleEffectiveAssignments
            }
            effectiveAssignments={
              effectiveAssignments
            }
            onExport={
              handleExport
            }
            exporting={
              exporting
            }
            exportLocked={
              sharedFlightExportLocked || !tripType
            }
            passengerOverrides={passengerOverrides}
            onPassengerOverrideChange={handlePassengerOverrideChange}
            onAddManualPerson={handleAddManualPerson}
            onRemoveManualPerson={handleRemoveManualPerson}
            onDismissUnmatched={handleDismissUnmatched}
            flightRecords={contractData?.flightRecords ?? results.flightRecords}
            tourDirectorFlightRecords={availableCompanyFlightRecords}
            additionalTourDirectorRecordNumbers={additionalTourDirectorRecordNumbers}
            frequentFlyerDecisions={frequentFlyerDecisions}
            onFrequentFlyerDecision={handleFrequentFlyerDecision}
            onUndoFrequentFlyerDecision={handleUndoFrequentFlyerDecision}
          />
        </div>
      )}

      {showContactExportPrompt && (
        <div
          className="sardines-dialog-backdrop"
          role="presentation"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setShowContactExportPrompt(false)
          }}
        >
          <section
            className="sardines-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-export-title"
            aria-describedby="contact-export-description"
          >
            <button
              type="button"
              className="sardines-dialog-close"
              aria-label="Close dialog"
              onClick={() => setShowContactExportPrompt(false)}
            >
              ×
            </button>
            <p className="sardines-dialog-kicker">Before opening the can</p>
            <h2 id="contact-export-title">Tour Director contact info is missing</h2>
            <p id="contact-export-description">
              Add the Lead Tour Director's{' '}
              {[
                currentTourDirectorReadiness.missingPhone ? 'phone' : '',
                currentTourDirectorReadiness.missingEmail
                  ? 'email'
                  : (currentTourDirectorReadiness.invalidEmail ? 'valid email' : ''),
              ].filter(Boolean).join(' and ')}{' '}
              so it appears in the FMG emergency-contact section.
            </p>
            <div className="sardines-dialog-actions">
              <button
                type="button"
                className="dialog-cancel-action"
                onClick={() => setShowContactExportPrompt(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dialog-secondary-action"
                onClick={() => handleExport({ skipContactWarning: true })}
              >
                Export anyway
              </button>
              <button
                type="button"
                className="dialog-primary-action"
                onClick={goToTourDirectorContact}
                autoFocus
              >
                Add contact info
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default FinalGroupTicketList
