import { inferSeatLayout } from './seatLayout.js'

export function parseLayoutPattern(value) {
  const text = String(value).trim()
  if (!/^[1-9](?:\s*-\s*[1-9]){0,3}$/.test(text)) throw new Error('Use a pattern such as 3-3 or 2-4-2 (1–9 seats per group).')
  const sizes = text.split('-').map(Number)
  if (sizes.reduce((sum, size) => sum + size, 0) > 20) throw new Error('A layout can contain at most 20 seats per row.')
  return sizes
}

export function lettersForPattern(pattern, observedSeats = []) {
  const sizes = parseLayoutPattern(pattern)
  const count = sizes.reduce((sum, size) => sum + size, 0)
  const observed = [...new Set(observedSeats.map((seat) => seat.match(/[A-Z]+$/i)?.[0]?.toUpperCase()).filter(Boolean))].sort()
  const letters = observed.length === count && observed.every((letter) => letter.length === 1)
    ? observed : [...'ABCDEFGHJKLMNPQRSTUVWXYZ'].slice(0, count)
  let offset = 0
  return sizes.map((size) => letters.slice(offset, offset += size).join('')).join('-')
}

export function validateLayoutSections(drafts) {
  const sections = drafts.map((draft, index) => {
    const firstRow = Number(draft.firstRow)
    const lastRow = Number(draft.lastRow)
    if (!Number.isInteger(firstRow) || !Number.isInteger(lastRow) || firstRow < 1 || lastRow > 999 || firstRow > lastRow) throw new Error(`Section ${index + 1}: enter a row range from 1 to 999, with the first row before the last.`)
    const sizes = parseLayoutPattern(draft.pattern)
    const groups = String(draft.letters).toUpperCase().replace(/\s/g, '').split('-')
    const letters = groups.join('')
    if (groups.length !== sizes.length || groups.some((group, i) => !/^[A-Z]+$/.test(group) || group.length !== sizes[i]) || new Set(letters).size !== letters.length) throw new Error(`Section ${index + 1}: seat letters must match ${sizes.join('-')} with no repeated letters (for example AB-CDEG-HJ).`)
    return { firstRow, lastRow, label: String(draft.label || '').trim().slice(0, 80), pattern: sizes.join('-'), letters: groups.join('-'), layout: groups.map((group) => [...group]), confirmed: true }
  }).sort((a, b) => a.firstRow - b.firstRow)
  if (sections.some((section, index) => index > 0 && section.firstRow <= sections[index - 1].lastRow)) throw new Error('Section row ranges overlap. Give each row one layout.')
  return sections
}

export function layoutSectionsForSeats(seats, confirmed = []) {
  // Validate again at the model boundary; exports must never silently pick one
  // of two overlapping layouts, even when called outside the UI.
  const reviewed = validateLayoutSections(confirmed)
  const numbers = seats.map((seat) => Number.parseInt(seat, 10)).filter(Number.isFinite)
  const first = Math.min(...numbers, ...reviewed.map((section) => section.firstRow))
  const last = Math.max(...numbers, ...reviewed.map((section) => section.lastRow))
  const firstRow = Number.isFinite(first) ? first : 1
  const lastRow = Number.isFinite(last) ? last : 3
  const sections = []
  let cursor = firstRow
  function inferred(start, end) {
    const local = seats.filter((seat) => { const row = Number.parseInt(seat, 10); return row >= start && row <= end })
    const observed = [...new Set(local.map((seat) => seat.match(/[A-Z]+$/i)?.[0]?.toUpperCase()).filter(Boolean))].sort()
    // Eight distinct letters suggest 2-4-2, but do not establish an aircraft
    // layout. The user must still review the grouping and confirm the range.
    const layout = observed.length === 8 && observed.every((letter) => letter.length === 1)
      ? [observed.slice(0, 2), observed.slice(2, 6), observed.slice(6)] : inferSeatLayout(local)
    sections.push({ firstRow: start, lastRow: end, label: 'Layout needs review', layout, pattern: layout.map((group) => group.length).join('-'), letters: layout.map((group) => group.join('')).join('-'), confirmed: false })
  }
  for (const section of reviewed) {
    if (cursor < section.firstRow) inferred(cursor, section.firstRow - 1)
    sections.push(section)
    cursor = section.lastRow + 1
  }
  if (cursor <= lastRow) inferred(cursor, lastRow)
  return sections
}

export function sectionForSeat(sections, seat) {
  const row = Number.parseInt(seat, 10)
  return sections.find((section) => row >= section.firstRow && row <= section.lastRow)
}
