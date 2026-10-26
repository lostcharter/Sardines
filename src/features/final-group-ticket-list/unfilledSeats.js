export function buildUnfilledSeatMarkers({ flightRecords, effectiveAssignments, tourFlight }) {
  const records = flightRecords ?? []
  const selected = new Set(
    tourFlight?.enabled ? (tourFlight.recordNumbers ?? []).map(Number) : []
  )
  const markers = []

  for (const record of records.filter((item) => !selected.has(Number(item.recordNumber)))) {
    const assigned = (effectiveAssignments?.companyAssignments ?? []).filter(
      (item) => item.assignmentType !== 'own-air' && Number(item.recordNumber) === Number(record.recordNumber)
    ).length
    const open = Math.max(0, Number(record.passengerCount || 0) - assigned)
    for (let seat = 1; seat <= open; seat += 1) {
      markers.push({ recordLabel: `Record ${record.recordNumber}`, seat, total: open })
    }
  }

  if (selected.size > 0) {
    const selectedRecords = records.filter((item) => selected.has(Number(item.recordNumber)))
    const capacity = selectedRecords.reduce((total, item) => total + Number(item.passengerCount || 0), 0)
    const assigned = new Set(
      (effectiveAssignments?.tourFlightAssignments ?? []).map((item) => item.match)
    ).size
    const open = Math.max(0, capacity - assigned)
    const recordLabel = `Records ${selectedRecords.map((item) => item.recordNumber).join(' & ')}`
    for (let seat = 1; seat <= open; seat += 1) {
      markers.push({ recordLabel, seat, total: open })
    }
  }

  return markers
}
