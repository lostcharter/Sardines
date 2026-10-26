import { findRoomingHeader } from './roomingListParser.js'

const normalizeHeader = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')

function headerIndex(rows, required) {
  return rows.findIndex((row) => {
    const cells = row.map(normalizeHeader)
    return required.every((header) => cells.includes(header))
  })
}

export function detectReportType(rows) {
  const domesticHeaderIndex = headerIndex(rows, ['resno', 'travelernames', 'dateofbirth'])
  if (domesticHeaderIndex !== -1) return { type: 'domestic-air', headerIndex: domesticHeaderIndex }

  const passportHeaderIndex = headerIndex(rows, ['resid', 'travelerno', 'firstname', 'lastname', 'passportno'])
  if (passportHeaderIndex !== -1) return { type: 'passport', headerIndex: passportHeaderIndex }

  const roomingHeaderIndex = findRoomingHeader(rows)
  if (roomingHeaderIndex !== -1) return { type: 'rooming-list', headerIndex: roomingHeaderIndex }

  return { type: 'unknown', headerIndex: -1 }
}
