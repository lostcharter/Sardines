function clean(value) {
  return String(value ?? '').trim()
}

function knownAirlineCode(airlineName) {
  const normalized = clean(airlineName).toLowerCase()

  if (normalized === 'american') return 'AA'
  if (normalized === 'ita airways') return 'AZ'

  return ''
}

export function parseExplicitContractRecord(line) {
  const text = clean(line)

  // FMG uses hyphens for connected airports and may use a slash for
  // an open-jaw break, such as LAX-HNL/OGG-LAX.
  const match = text.match(
    /^Record\s+(\d+):\s*(\d+)\s+Passengers?\s*\/\s*([A-Z]{3}(?:\s*[-/]\s*[A-Z]{3})+)\s+(.+)$/i
  )

  if (!match) return null

  const airlineName = clean(match[4])

  return {
    recordNumber: Number(match[1]),
    passengerCount: Number(match[2]),
    routing: clean(match[3])
      .replace(/\s*([-/])\s*/g, '$1')
      .toUpperCase(),
    airlineName,
    airlineCode: knownAirlineCode(airlineName),
    references: [],
    reference: '',
    sourceFormat: 'numbered-contract-record',
    sourceHeader: text,
  }
}

export function parseFareBreakdown(lines) {
  const fares = {}
  let pendingRecordNumber = null

  for (const rawLine of lines ?? []) {
    const line = clean(rawLine)
    const heading = line.match(/^(\d+)\.\s+[A-Z]{3}(?:\s*[-/]\s*[A-Z]{3})+/i)
    if (heading) {
      pendingRecordNumber = Number(heading[1])
    }

    const amounts = line.match(/(?:^|\s)(\d+)\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})/)
    if (!amounts || pendingRecordNumber == null) continue

    fares[pendingRecordNumber] = {
      fareSeats: Number(amounts[1]),
      baseFarePerPassenger: Number(amounts[2].replaceAll(',', '')),
      taxesPerPassenger: Number(amounts[3].replaceAll(',', '')),
      totalPerPassenger: Number(amounts[4].replaceAll(',', '')),
      totalPerRecord: Number(amounts[5].replaceAll(',', '')),
    }
    pendingRecordNumber = null
  }

  return fares
}
