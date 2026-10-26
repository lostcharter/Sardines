import { matchIsTourDirector } from './tourDirectorIdentity.js'
import { selectedTourDirectorRecordNumbers } from './tourDirectorFlightRecords.js'

export function mergeTourDirectorExportAssignments({
  assignments,
  contact,
  flightRecords,
  fallbackMatch,
}) {
  const current = [...(assignments ?? [])]
  if (!contact?.present) return current

  const selectedRecords = selectedTourDirectorRecordNumbers(contact)
    .map((number) => (flightRecords ?? [])
      .find((record) => Number(record.recordNumber) === number))
    .filter(Boolean)

  // Never discard an existing passenger merely because a stale or incomplete
  // TD contact cannot be resolved to a flight record during export.
  if (selectedRecords.length === 0) return current

  const existing = current.find((assignment) =>
    matchIsTourDirector(assignment?.match, contact)
  )
  const match = existing?.match ?? fallbackMatch
  if (!match) return current

  const withoutTourDirector = current.filter((assignment) =>
    !matchIsTourDirector(assignment?.match, contact)
  )

  return [
    ...withoutTourDirector,
    ...selectedRecords.map((record) => ({
      match,
      recordNumber: record.recordNumber,
      record,
      assignmentType: 'tour-director',
      assignmentSource: 'tour-director-panel',
      reviewRequired: false,
      reviewReason: '',
    })),
  ]
}
