export function selectedTourDirectorRecordNumbers(contact) {
  const values = Array.isArray(contact?.flightRecordNumbers)
    ? contact.flightRecordNumbers
    : (contact?.flightRecordNumber ? [contact.flightRecordNumber] : [])
  return [...new Set(values.map(Number).filter(Number.isFinite))]
}

export function withTourDirectorRecordNumbers(contact, recordNumbers) {
  const numbers = [...new Set((recordNumbers ?? []).map(Number).filter(Number.isFinite))]
  return {
    ...contact,
    flightRecordNumbers: numbers.map(String),
    flightRecordNumber: numbers.length === 1 ? String(numbers[0]) : '',
  }
}
