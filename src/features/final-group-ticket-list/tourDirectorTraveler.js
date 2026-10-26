import { withTourDirectorRecordNumbers } from './tourDirectorFlightRecords.js'

function clean(value) {
  return String(value ?? '').trim()
}

export function tourDirectorContactFromTraveler(match, override, current = {}) {
  const air = match?.aevd ?? {}
  const passport = match?.ppdt ?? {}
  const next = {
    ...current,
    present: true,
    source: match?.manuallyAdded ? 'manual-traveler' : 'linked-traveler',
    linkedTraveler: true,
    manualId: clean(match?.manualId),
    firstName: clean(override?.firstName ?? passport.firstName ?? air.firstName),
    middleName: clean(override?.middleName ?? passport.middleName ?? air.middleName),
    lastName: clean(override?.lastName ?? passport.lastName ?? air.lastName),
    dateOfBirth: clean(override?.dateOfBirth ?? passport.dateOfBirth ?? air.dateOfBirth),
    gender: clean(override?.gender ?? passport.gender ?? passport.sex),
    passportNationality: clean(override?.citizenship ?? passport.citizenship),
    passportNumber: clean(override?.passportNumber ?? passport.passportNumber),
    passportExpiration: clean(override?.passportExpireDate ?? passport.passportExpireDate),
    ktn: clean(override?.ktnRaw ?? passport.ktnRaw ?? air.ktnRaw),
    frequentFlyerNumber: clean(override?.frequentFlyerNumber ?? match?.frequentFlyerNumber),
    requests: clean(override?.requests ?? current.requests) || 'Tour Director',
    phone: clean(override?.phone ?? air.phone ?? current.phone),
    email: clean(override?.email ?? air.email ?? current.email),
    reservationNumber: clean(air.reservationNumber ?? passport.reservationId),
    travelerNumber: clean(passport.travelerNumber),
    airType: clean(override?.airType ?? air.airType),
    departureCity: clean(override?.departureCity ?? air.departureCity).toUpperCase(),
  }

  return withTourDirectorRecordNumbers(next, override?.recordNumbers ?? [])
}
