import Papa from 'papaparse'

import { parseAevdTravelers } from '../final-group-ticket-list/aevdParser.js'
import { assignFlightRecords } from '../final-group-ticket-list/flightRecordAssignment.js'
import { mergeFrequentFlyers } from '../final-group-ticket-list/frequentFlyer.js'
import { parsePpdtTravelers } from '../final-group-ticket-list/ppdtParser.js'
import { readPdfText } from '../final-group-ticket-list/readPdfText.js'
import { reconcileTravelers } from '../final-group-ticket-list/reconcileTravelers.js'
import { parseRoomingList } from '../final-group-ticket-list/roomingListParser.js'
import { compareExpected } from './testCanUtils.js'

const clean = (value) => String(value ?? '').trim()
const normalized = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '')

function headerIndex(rows, required) {
  return rows.findIndex((row) => {
    const cells = row.map(normalized)
    return required.every((field) => cells.includes(field))
  })
}

function recordsFromRows(rows, index) {
  if (index < 0) return []
  const headers = rows[index].map(clean)
  return rows.slice(index + 1)
    .filter((row) => row.some((cell) => clean(cell)))
    .map((row) => Object.fromEntries(headers.flatMap((header, column) => header ? [[header, clean(row[column])]] : [])))
}

function parseCsv(file) {
  return new Promise((resolve, reject) => Papa.parse(file, {
    header: false,
    skipEmptyLines: false,
    complete: (result) => resolve(result.data),
    error: reject,
  }))
}

function recordCounts(assignments) {
  const result = {}
  for (const assignment of assignments?.companyAssignments ?? []) {
    if (assignment.recordNumber != null) {
      const key = String(assignment.recordNumber)
      result[key] = (result[key] ?? 0) + 1
    }
  }
  return result
}

function unassignedTravelerCount(assignments) {
  return new Set(
    (assignments?.companyAssignments ?? [])
      .filter((assignment) => assignment.recordNumber == null && assignment.assignmentType !== 'own-air')
      .map((assignment) => assignment.match)
  ).size
}

function recordSeatCounts(assignments) {
  return Object.fromEntries((assignments?.companyRecordStatus ?? []).map((status) => [
    String(status.recordNumber),
    {
      capacity: status.contractedSeats,
      assigned: status.assignedCount,
      open: status.openSeats,
      excess: status.excessTravelers,
    },
  ]))
}

export async function runTestCase(testCase) {
  const pdf = testCase.files.find((file) => file.name.toLowerCase().endsWith('.pdf'))
  const json = testCase.files.find((file) => /(?:expected|test-can)\.json$/i.test(file.name))
  const csvFiles = testCase.files.filter((file) => file.name.toLowerCase().endsWith('.csv'))
  if (!pdf) throw new Error('Missing contract/itinerary PDF.')

  const parsedCsv = await Promise.all(csvFiles.map(async (file) => ({ file, rows: await parseCsv(file) })))
  const domestic = parsedCsv.find(({ rows }) => headerIndex(rows, ['resno', 'travelernames', 'dateofbirth']) >= 0)
  const passport = parsedCsv.find(({ rows }) => headerIndex(rows, ['resid', 'travelerno', 'firstname', 'lastname', 'passportno']) >= 0)
  if (!domestic) throw new Error('Missing recognizable AEVD/Domestic Air CSV.')
  if (!passport) throw new Error('Missing recognizable PPDT/Passport CSV.')

  const rooming = parsedCsv.find((item) => item !== domestic && item !== passport)
  const contract = await readPdfText(pdf)
  const flightRecords = contract.records ?? []
  const aevd = parseAevdTravelers(recordsFromRows(domestic.rows, headerIndex(domestic.rows, ['resno', 'travelernames', 'dateofbirth'])))
  const ppdt = parsePpdtTravelers(recordsFromRows(passport.rows, headerIndex(passport.rows, ['resid', 'travelerno', 'firstname', 'lastname', 'passportno'])))
  const roomingData = rooming ? parseRoomingList(rooming.rows) : null
  const reconciliation = mergeFrequentFlyers({ reconciliation: reconcileTravelers(aevd, ppdt), flightRecords })
  const assignments = assignFlightRecords({ reconciliation, flightRecords, tourFlight: { enabled: false, recordNumbers: [] }, roomingData })

  const recordSeats = recordSeatCounts(assignments)
  const snapshot = {
    contractPages: contract.pageCount,
    flightRecords: flightRecords.length,
    travelers: reconciliation.matches.length,
    unmatchedAir: reconciliation.unmatchedAevd.length,
    unmatchedPassport: reconciliation.unmatchedPpdt.length,
    reviews: reconciliation.matches.filter((match) => match.reviewRequired).length,
    companyAssigned: assignments.summary.companyAssigned,
    ownAir: assignments.summary.ownAir,
    assignmentReviews: assignments.summary.companyNeedsReview,
    unassignedTravelers: unassignedTravelerCount(assignments),
    seatCapacity: Object.values(recordSeats).reduce((total, record) => total + record.capacity, 0),
    openSeats: assignments.summary.seatsUnassigned,
    travelersOverCapacity: assignments.summary.travelersOverCapacity,
    recordAssignments: recordCounts(assignments),
    recordSeats,
    rooms: roomingData?.rooms?.length ?? 0,
    qualityCheck: { available: false },
  }
  const definition = json ? JSON.parse(await json.text()) : {}
  const failures = compareExpected(snapshot, definition.expected ?? definition.expect ?? {})

  return {
    id: testCase.folder,
    name: definition.name || testCase.folder.split('/').at(-1),
    status: failures.length ? 'fail' : (definition.expected || definition.expect ? 'pass' : 'unverified'),
    files: { contract: pdf.name, domestic: domestic.file.name, passport: passport.file.name, rooming: rooming?.file.name ?? '' },
    snapshot,
    failures,
    hasExpectations: Boolean(definition.expected || definition.expect),
    expectationSource: json ? 'expected.json' : '',
    expectationNote: definition.note ?? '',
  }
}
