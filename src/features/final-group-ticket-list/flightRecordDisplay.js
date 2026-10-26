function clean(value) {
  return String(value ?? '').trim()
}

export function flightRecordTitle(record) {
  if (record?.sourceFormat === 'itinerary-record') {
    return [
      clean(record.routing),
      clean(record.airlineName || record.airlineCode),
    ].filter(Boolean).join(' ') || 'Routing unavailable'
  }

  const sourceHeader = clean(record?.sourceHeader)
  if (sourceHeader) {
    const withoutPrefix = sourceHeader.replace(
      /^Record\s+\d+\s*:\s*\d+\s+Passengers?\s*\/\s*/i,
      ''
    )
    if (withoutPrefix && withoutPrefix !== sourceHeader) return withoutPrefix
  }

  return clean(record?.routing) || 'Routing unavailable'
}

export function flightRecordDisplayLabel(record) {
  if (!record) return 'Unknown record'
  return `R${record.recordNumber} · ${flightRecordTitle(record)}`
}

export function flightRecordItineraryPath(record) {
  const paths = []
  for (const flight of record?.flights ?? []) {
    const departure = clean(flight?.departureAirport).toUpperCase()
    const arrival = clean(flight?.arrivalAirport).toUpperCase()
    if (!departure || !arrival) continue
    const current = paths.at(-1)
    if (current?.at(-1) === departure) current.push(arrival)
    else paths.push([departure, arrival])
  }
  return paths.map((path) => path.join(' → ')).join(' · ')
}
