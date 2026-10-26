function clean(value) {
  return String(value ?? '').trim()
}

function buildDisplayName(firstName, middleName, lastName) {
  return [firstName, middleName, lastName]
    .map(clean)
    .filter(Boolean)
    .join(' ')
}

export function parsePpdtTravelers(records) {
  return records.map((record) => {
    const firstName = clean(record['First Name'])
    const middleName = clean(record['Middle Initial'])
    const lastName = clean(record['Last Name'])

    return {
      source: 'centaur-passport',

      reservationId: clean(record['Res ID']),
      travelerNumber: clean(record['Traveler No']),

      title: clean(record['Title']),
      firstName,
      middleName,
      lastName,
      displayName: buildDisplayName(
        firstName,
        middleName,
        lastName
      ),

      gender: clean(record['Gender']),
      dateOfBirth: clean(record['Date of Birth']),

      passportNumber: clean(record['Passport No']),
      passportName: clean(record['Passport Name']),
      passportIssueCity: clean(record['Passport Issue City']),
      passportIssueDate: clean(record['Passport Issue Date']),
      passportExpireDate: clean(record['Expire Date']),
      citizenship: clean(record['Citizen']),
      placeOfBirth: clean(record['Place of Birth']),
      passportOnFile: clean(record['Passport on File']),

      ktnRaw: clean(record['Global Entry/KTN']),

      sourceRecord: record,
    }
  })
}