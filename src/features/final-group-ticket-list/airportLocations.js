const METRO_AIRPORTS = {
  NYC: new Set([
    'EWR',
    'JFK',
    'LGA',
  ]),
}

function normalizeAirport(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
}

export function airportMatchesLocation(
  airport,
  location
) {
  const normalizedAirport =
    normalizeAirport(airport)
  const normalizedLocation =
    normalizeAirport(location)

  if (
    normalizedAirport ===
    normalizedLocation
  ) {
    return true
  }

  return Boolean(
    METRO_AIRPORTS[
      normalizedLocation
    ]?.has(normalizedAirport)
  )
}

export function routeIsRoundTripForLocation(
  origin,
  final,
  location
) {
  return (
    airportMatchesLocation(
      origin,
      location
    ) &&
    airportMatchesLocation(
      final,
      location
    )
  )
}
