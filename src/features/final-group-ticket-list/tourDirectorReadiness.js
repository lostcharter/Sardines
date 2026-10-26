import { selectedTourDirectorRecordNumbers } from './tourDirectorFlightRecords.js'

function hasValue(value) {
  return String(value ?? '').trim().length > 0
}

function hasValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim())
}

function recordNumbers(values) {
  return new Set((values ?? []).map(Number).filter(Number.isFinite))
}

export function requiredTourDirectorRecordNumbers(flightRecords) {
  return (flightRecords ?? [])
    .filter((record) => Number(record?.passengerCount) > 10)
    .map((record) => Number(record.recordNumber))
    .filter(Number.isFinite)
}

export function tourDirectorReadiness(contact, flightRecords = [], additionalTourDirectorRecordNumbers = []) {
  const assigned = recordNumbers([
    ...selectedTourDirectorRecordNumbers(contact),
    ...additionalTourDirectorRecordNumbers,
  ])
  const confirmedWithout = recordNumbers(contact?.noTourDirectorRecordNumbers)
  const uncoveredRecords = requiredTourDirectorRecordNumbers(flightRecords)
    .filter((number) => !assigned.has(number) && !confirmedWithout.has(number))

  if (contact?.present === false) {
    const incomplete = uncoveredRecords.length > 0
    return {
      complete: !incomplete,
      blocker: incomplete,
      warning: incomplete,
      uncoveredRecords,
      status: incomplete
        ? `Confirm TD coverage for ${uncoveredRecords.length} record${uncoveredRecords.length === 1 ? '' : 's'}`
        : 'Confirmed: no Tour Director',
    }
  }

  if (contact?.present !== true) {
    return {
      complete: false,
      blocker: true,
      warning: true,
      status: 'Confirmation required',
    }
  }

  const missingIdentity =
    !hasValue(contact.firstName) ||
    !hasValue(contact.lastName)
  const missingFlight =
    selectedTourDirectorRecordNumbers(contact).length === 0
  const missingPhone = !hasValue(contact.phone)
  const missingEmail = !hasValue(contact.email)
  const invalidEmail = !missingEmail && !hasValidEmail(contact.email)
  const missingContact = missingPhone || missingEmail || invalidEmail
  const incomplete = missingIdentity || missingFlight || uncoveredRecords.length > 0

  return {
    complete: !incomplete,
    blocker: incomplete,
    warning: incomplete || missingContact,
    missingIdentity,
    missingFlight,
    missingPhone,
    missingEmail,
    invalidEmail,
    missingContact,
    uncoveredRecords,
    status: missingIdentity
      ? 'Name required'
      : (missingFlight
          ? 'Flight needed'
          : (uncoveredRecords.length
              ? `Confirm TD coverage for ${uncoveredRecords.length} record${uncoveredRecords.length === 1 ? '' : 's'}`
              : (missingContact
                  ? 'Contact info missing'
                  : 'Complete'))),
  }
}
