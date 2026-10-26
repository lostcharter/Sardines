import { passengerKey } from './passengerOverrides.js'

export function applyManualFlightSelections(assignments, overrides, flightRecords) {
  return (assignments ?? []).flatMap((assignment) => {
    const override = overrides?.[passengerKey(assignment.match)]
    if (override?.airType === 'Own Air') {
      return [{
        ...assignment,
        recordNumber: null,
        record: null,
        assignmentType: 'own-air',
      }]
    }
    const selectedNumbers = override?.recordNumbers ?? (override?.recordNumber ? [override.recordNumber] : null)
    if (!selectedNumbers) return [assignment]
    if (selectedNumbers.length === 0) return [{
      ...assignment,
      recordNumber: null,
      record: null,
      assignmentType: override.airType === 'Own Air' ? 'own-air' : assignment.assignmentType,
    }]

    return selectedNumbers.flatMap((number) => {
      const record = (flightRecords ?? []).find(
        (item) => Number(item.recordNumber) === Number(number)
      )
      if (!record) return []
      return [{
        ...assignment,
        recordNumber: record.recordNumber,
        record,
        assignmentType: assignment.match?.manualRole === 'tour-director'
          ? 'tour-director'
          : 'manual-passenger-review',
        assignmentSource: 'passenger-review',
        reviewRequired: false,
        reviewReason: 'Manually assigned in Passenger Review.',
      }]
    })
  })
}
