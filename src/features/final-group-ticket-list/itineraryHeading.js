function clean(value) {
  return String(value ?? '').trim()
}

export function normalizeItineraryArrivalLine(value) {
  return clean(value).replace(/^Stops:\s*\d+\s+/i, '')
}

export function itineraryRouting(flights) {
  if (!flights.length) return ''

  const breaks = []
  for (let index = 1; index < flights.length; index += 1) {
    if (flights[index - 1].arrivalAirport !== flights[index].departureAirport) {
      breaks.push(index)
    }
  }

  if (breaks.length === 1) {
    const split = breaks[0]
    return `${flights[0].departureAirport}-${flights[split - 1].arrivalAirport}/${flights[split].departureAirport}-${flights.at(-1).arrivalAirport}`
  }

  return `${flights[0].departureAirport}-${flights.at(-1).arrivalAirport}`
}

export function primaryAirlineName(flights) {
  return clean(flights[0]?.flight).replace(/\s+\d+$/, '')
}
