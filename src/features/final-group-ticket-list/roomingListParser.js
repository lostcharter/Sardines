function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function splitNames(value) {
  return clean(value)
    .split(',')
    .map(clean)
    .filter(Boolean)
}

function isSameTravelerName(name, match) {
  const normalizedName = normalize(name)
  const fullName = normalize(
    match?.ppdt?.displayName ??
      match?.aevd?.travelerName
  )

  if (normalizedName && normalizedName === fullName) return true

  const firstName = normalize(
    match?.ppdt?.firstName ??
      match?.aevd?.firstName
  )
  const lastName = normalize(
    match?.ppdt?.lastName ??
      match?.aevd?.lastName
  )

  return Boolean(
    firstName &&
    lastName &&
    normalizedName === `${firstName}${lastName}`
  )
}

function buildRoommateMap(rooms) {
  const byReservation = new Map()

  rooms.forEach((room) => {
    const occupants = room.travelerNames
    const external = splitNames(room.roomWith)
    const roommateNames = [
      ...occupants,
      ...external,
    ]

    if (!room.reservationId) {
      return
    }

    const existing = byReservation.get(room.reservationId) ?? []

    byReservation.set(
      room.reservationId,
      [...new Set([...existing, ...roommateNames])]
    )
  })

  return byReservation
}

export function findRoomingHeader(rows) {
  return rows.findIndex((row) => {
    const cells = row.map(normalize)

    return (
      cells.includes('roomno') &&
      cells.includes('resid') &&
      cells.includes('travelernames') &&
      cells.includes('roomtype')
    )
  })
}

export function parseRoomingList(rows) {
  const headerIndex = findRoomingHeader(rows)

  if (headerIndex === -1) {
    throw new Error(
      "I can read that CSV, but it doesn't look like a Centaur Rooming List Domestic Report."
    )
  }

  const headers = rows[headerIndex].map(clean)

  const rooms = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => clean(cell)))
    .map((row) => {
      const record = {}

      headers.forEach((header, index) => {
        record[header] = clean(row[index])
      })

      return {
        roomNumber: clean(record['Room No']),
        reservationId: clean(record.ResId),
        travelerNames: splitNames(record['Traveler Names']),
        roomType: clean(record['Room Type']),
        roomWith: clean(record['Room With']),
        comments: clean(record.Comments),
        sourceRecord: record,
      }
    })

  return {
    headerIndex,
    rooms,
    roommateMap: buildRoommateMap(rooms),
  }
}

export function roommatesForMatch(roomingData, match) {
  if (!roomingData) {
    return []
  }

  const reservation = clean(
    match?.aevd?.reservationNumber ??
      match?.ppdt?.reservationId
  )

  if (!reservation) {
    return []
  }

  return (roomingData.roommateMap.get(reservation) ?? [])
    .filter((name) => !isSameTravelerName(name, match))
}
