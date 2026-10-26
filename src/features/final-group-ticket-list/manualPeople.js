function clean(value) {
  return String(value ?? '').trim()
}

export function createManualPerson(id, role = 'passenger', values = {}) {
  return {
    ...values,
    id,
    role,
    firstName: clean(values.firstName),
    middleName: clean(values.middleName),
    lastName: clean(values.lastName),
    dateOfBirth: clean(values.dateOfBirth),
    gender: clean(values.gender),
    citizenship: clean(values.citizenship),
    passportNumber: clean(values.passportNumber),
    passportExpireDate: clean(values.passportExpireDate),
    ktnRaw: clean(values.ktnRaw),
    frequentFlyerNumber: clean(values.frequentFlyerNumber),
    airType: clean(values.airType) || 'Company Air',
    departureCity: clean(values.departureCity),
    reservationNumber: clean(values.reservationNumber),
    travelerNumber: clean(values.travelerNumber),
    phone: clean(values.phone),
    email: clean(values.email),
    comments: clean(values.comments),
    recordNumbers: values.recordNumbers ?? [],
    primaryEmergencyContact: values.primaryEmergencyContact === true,
  }
}

export function manualPersonToMatch(person) {
  const displayName = [
    person.firstName,
    person.middleName,
    person.lastName,
  ].map(clean).filter(Boolean).join(' ')

  return {
    manualId: person.id,
    manualRole: person.role,
    manuallyAdded: true,
    operational: person.role === 'tour-director',
    reviewRequired: !clean(person.firstName) || !clean(person.lastName),
    reviewReason: !clean(person.firstName) || !clean(person.lastName)
      ? 'Manually added person needs a first and last name.'
      : '',
    aevd: {
      source: 'sardines-manual',
      travelerName: displayName,
      displayName,
      firstName: clean(person.firstName),
      middleName: clean(person.middleName),
      lastName: clean(person.lastName),
      dateOfBirth: clean(person.dateOfBirth),
      reservationNumber: clean(person.reservationNumber),
      airType: clean(person.airType),
      departureCity: clean(person.departureCity).toUpperCase(),
      ktnRaw: clean(person.ktnRaw),
      comments: clean(person.comments) || (person.role === 'tour-director' ? 'Tour Director — manually added in Sardines.' : ''),
    },
    ppdt: {
      source: 'sardines-manual',
      travelerNumber: clean(person.travelerNumber),
      reservationId: clean(person.reservationNumber),
      firstName: clean(person.firstName),
      middleName: clean(person.middleName),
      lastName: clean(person.lastName),
      displayName,
      dateOfBirth: clean(person.dateOfBirth),
      gender: clean(person.gender).toUpperCase(),
      citizenship: clean(person.citizenship),
      passportNumber: clean(person.passportNumber),
      passportExpireDate: clean(person.passportExpireDate),
      ktnRaw: clean(person.ktnRaw),
    },
    frequentFlyerNumber: clean(person.frequentFlyerNumber),
    sourceAevd: person.sourceAevd ?? null,
    sourcePpdt: person.sourcePpdt ?? null,
    identity: null,
  }
}

export function manualPersonToOverride(person) {
  return {
    ...person,
    recordNumber: person.recordNumbers?.[0] ?? '',
    recordNumbers: person.recordNumbers ?? [],
  }
}
