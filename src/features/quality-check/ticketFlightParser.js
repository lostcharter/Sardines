const clean = (value) => String(value ?? '').trim()
export const normalizeFlightLabels = (value) => clean(value)
  .replace(/D\s*E\s*P\s*A\s*R\s*T\s*I\s*N\s*G/gi, 'DEPARTING')
  .replace(/A\s*R\s*R\s*I\s*V\s*I\s*N\s*G/gi, 'ARRIVING')

const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
export function calendarDate(text, tripStart = '') {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) {
    const date = iso[0]
    const parsed = new Date(`${date}T12:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(date) ? date : ''
  }
  const dayFirst = text.match(/\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:,?\s+(20\d{2}))?\b/i)
  if (dayFirst) return calendarDate(`${dayFirst[2]} ${dayFirst[1]}${dayFirst[3] ? `, ${dayFirst[3]}` : ''}`, tripStart)
  const match = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(20\d{2}))?\b/i)
  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/)
  if (!match && !numeric) return ''
  const month = match ? months.indexOf(match[1].slice(0, 3).toLowerCase()) + 1 : Number(numeric[1])
  const day = Number(match ? match[2] : numeric[2])
  let year = Number(match ? match[3] : numeric[3])
  if (!year && tripStart) {
    year = Number(tripStart.slice(0, 4)) + (month < Number(tripStart.slice(5, 7)) ? 1 : 0)
  }
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return ''
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return new Date(`${date}T12:00:00Z`).toISOString().startsWith(date) ? date : ''
}

export function tripStartFromLines(lines) {
  for (const line of lines) {
    if (!/\b(?:DEPARTURE|TRAVEL DATES)\b/i.test(line.text)) continue
    const date = calendarDate(line.text)
    if (date) return date
  }
  return ''
}

function airlineAndNumber(text) {
  const match = clean(text).replace(/^Flight\s+/i, '').match(/^([\p{L}][\p{L} .&'()-]*?)\s+(?:Flight\s+)?(?:(?:[A-Z][A-Z0-9]|[0-9][A-Z])\s*)?(\d{1,4})$/iu)
  if (match) match[1] = match[1].replace(/\s*\([A-Z0-9]{2}\)$/, '').trim()
  return match
}

const carriers = { DELTA: 'DL', DELTAAIRLINES: 'DL', UNITED: 'UA', UNITEDAIRLINES: 'UA', LUFTHANSA: 'LH', AIRDOLOMITI: 'EN', ALASKAAIR: 'AS', ALASKAAIRLINES: 'AS', ROYALAIRMAROC: 'AT' }
export function carrierIdentity(value) {
  const key = clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return carriers[key] ?? key
}

// Only complete dated identities are merged across booking records. Missing dates
// are uncertainty, never permission to combine two potentially different flights.
export function physicalFlightKey(flight) {
  const carrier = carrierIdentity(flight.operatingCarrier || flight.airline)
  if (flight.operatingCarrier && !flight.operatingFlightNumber && carrier !== carrierIdentity(flight.airline)) return ''
  return flight.departureDate && carrier && flight.flightNumber && flight.departureAirport && flight.arrivalAirport
    ? [flight.departureDate, carrier, String(Number(flight.operatingFlightNumber || flight.flightNumber)), flight.departureAirport, flight.arrivalAirport].join(':') : ''
}

export function flightsFromPositionedLines(lines, tripStart) {
  const flights = []
  const issues = []
  const incomplete = (source) => issues.push({ code: 'incomplete-flight', severity: 'review', message: 'A flight label could not be paired with a complete departure and arrival. Its evidence is retained.', sources: [source] })
  let pending = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const text = normalizeFlightLabels(line.text)
    const departure = text.match(/^(.*?)\b(?:DEPARTING|DEPARTURE|FROM)\s*:?\s*(?:\(([A-Z]{3})\)|([A-Z]{3})\b)(.*)$/i)
    if (departure) {
      // A trip-level "DEPARTURE Dec 06" is a date heading, not airport DEC.
      if (departure[3] && !/^[A-Z]{3}$/.test(departure[3])) continue
      if (departure[3] && months.includes(departure[3].toLowerCase()) && !airlineAndNumber(departure[1])) continue
      if (pending) incomplete(pending.sources[0])
      pending = null
      let flight = airlineAndNumber(departure[1])
      if (!flight && !clean(departure[1])) {
        // Airline/flight can be on a preceding line after a small layout change.
        for (let prior = index - 1; prior >= Math.max(0, index - 3); prior -= 1) {
          flight = airlineAndNumber(lines[prior].text)
          if (flight) break
        }
      }
      if (!flight) { incomplete(line.source); continue }
      pending = {
        airline: clean(flight[1]), flightNumber: flight[2],
        departureAirport: (departure[2] || departure[3]).toUpperCase(),
        departureDate: calendarDate(departure[4], tripStart),
        departureText: clean(departure[4]), sources: [line.source],
        departureTime: departure[4].match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)?\b/i)?.[0]?.toUpperCase().replace(/\s+/g, '') || '',
      }
      continue
    }
    const operated = text.match(/\boperated by\s+(.+?)(?:\s+(?:Flight\s+)?(?:[A-Z]{2}\s*)?(\d{1,4}))?$/i)
    if (operated && pending) { pending.operatingCarrier = clean(operated[1]); pending.operatingFlightNumber = operated[2] || ''; pending.sources.push(line.source) }
    const arrival = text.match(/\b(?:ARRIVING|ARRIVAL)\s*:?\s*(?:\(([A-Z]{3})\)|([A-Z]{3})\b)/i) || text.match(/^TO\s*:?\s*(?:\(([A-Z]{3})\)|([A-Z]{3})\b)/i)
    if (arrival?.[2] && !/^[A-Z]{3}$/.test(arrival[2])) continue
    if (arrival && pending) {
      const arrivalAirport = (arrival[1] || arrival[2]).toUpperCase()
      flights.push({ ...pending, arrivalAirport, label: `${pending.departureAirport} → ${arrivalAirport}`, sources: [...pending.sources, line.source] })
      pending = null
    } else if (arrival) incomplete(line.source)
  }
  if (pending) incomplete(pending.sources[0])
  return { flights, issues }
}
