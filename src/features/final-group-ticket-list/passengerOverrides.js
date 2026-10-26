import { analyzeFlightComment } from './commentAnalysis.js'

function clean(value) {
  return String(value ?? '').trim()
}

export function passengerKey(match) {
  if (match?.manualId) return `manual:${match.manualId}`
  const number = String(
    match?.ppdt?.travelerNumber ?? ''
  ).trim()
  if (number) return `traveler:${number}`

  const reservation = String(
    match?.aevd?.reservationNumber ??
    match?.ppdt?.reservationId ?? ''
  ).trim()
  const name = String(
    match?.ppdt?.displayName ??
    match?.aevd?.travelerName ?? ''
  ).trim().toLowerCase()
  return `reservation:${reservation}|name:${name}`
}

export function passengerOverrideFromMatch(match, assignments = []) {
  const pass = match?.ppdt ?? {}
  const air = match?.aevd ?? {}
  return {
    firstName: clean(pass.firstName || air.firstName),
    middleName: clean(pass.middleName || air.middleName),
    lastName: clean(pass.lastName || air.lastName),
    dateOfBirth: clean(pass.dateOfBirth || air.dateOfBirth),
    gender: clean(pass.gender).toUpperCase(),
    citizenship: clean(pass.citizenship),
    passportNumber: clean(pass.passportNumber),
    passportExpireDate: clean(pass.passportExpireDate),
    ktnRaw: clean(pass.ktnRaw || air.ktnRaw),
    frequentFlyerNumber: clean(match?.frequentFlyerNumber),
    phone: clean(air.phone),
    email: clean(air.email),
    comments: clean(air.comments),
    airType: clean(air.airType),
    departureCity: clean(air.departureCity).toUpperCase(),
    role: match?.manualRole ?? (match?.operational ? 'tour-director' : 'passenger'),
    recordNumbers: assignments
      .map((assignment) => assignment?.recordNumber)
      .filter((value) => value != null)
      .map(String),
  }
}

export function applyPassengerOverride(
  match,
  override
) {
  if (!override) return match

  const ppdt = {
    ...(match.ppdt ?? {}),
    firstName: override.firstName,
    middleName: override.middleName,
    lastName: override.lastName,
    displayName: [
      override.firstName,
      override.middleName,
      override.lastName,
    ].filter(Boolean).join(' '),
    dateOfBirth: override.dateOfBirth,
    gender: override.gender,
    citizenship: override.citizenship,
    passportNumber: override.passportNumber,
    passportExpireDate: override.passportExpireDate,
    ktnRaw: override.ktnRaw,
  }

  const aevd = {
    ...(match.aevd ?? {}),
    travelerName: ppdt.displayName,
    firstName: override.firstName,
    middleName: override.middleName,
    lastName: override.lastName,
    dateOfBirth: override.dateOfBirth,
    airType: override.airType,
    departureCity: override.departureCity,
    ktnRaw: override.ktnRaw,
    comments: override.comments ?? match.aevd?.comments,
    commentAnalysis: analyzeFlightComment(override.comments ?? match.aevd?.comments),
    phone: override.phone ?? match.aevd?.phone,
    email: override.email ?? match.aevd?.email,
  }

  return {
    ...match,
    sourceAevd: match.sourceAevd ?? match.aevd ?? null,
    sourcePpdt: match.sourcePpdt ?? match.ppdt ?? null,
    ppdt,
    aevd,
    frequentFlyerNumber:
      override.frequentFlyerNumber,
    passengerOverride: override,
    manualRole: override.role ?? match.manualRole,
    operational: (override.role ?? match.manualRole) === 'tour-director' || (match.operational && !override.role),
  }
}

export function applyPassengerOverrides(
  reconciliation,
  overrides
) {
  if (!reconciliation) return reconciliation

  return {
    ...reconciliation,
    matches: (reconciliation.matches ?? [])
      .map((match) =>
        applyPassengerOverride(
          match,
          overrides[passengerKey(match)]
        )
      ),
  }
}
