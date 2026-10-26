const clean = (value) => String(value ?? '').trim()

export function normalizeSeatLabel(value) {
  return clean(value).toUpperCase().replace(/^0+(?=\d+[A-Z]+$)/, '')
}

export function inferSeatLayout(seats) {
  const letters = new Set(seats.map((seat) => clean(seat).match(/[A-Z]+$/i)?.[0]?.toUpperCase()).filter(Boolean))
  if (letters.size === 0) return [['A', 'B', 'C'], ['D', 'E', 'F']]
  if (['H', 'J', 'K', 'L'].some((letter) => letters.has(letter))) return [['A', 'B', 'C'], ['D', 'E', 'F', 'G'], ['H', 'J', 'K']]
  if ([...letters].every((letter) => ['A', 'C', 'D', 'F'].includes(letter)) && !letters.has('B') && !letters.has('E')) return [['A', 'C'], ['D', 'F']]
  return [['A', 'B', 'C'], ['D', 'E', 'F']]
}

export function seatPosition(seat, layout) {
  const letter = clean(seat).match(/[A-Z]+$/i)?.[0]?.toUpperCase()
  const groupIndex = layout.findIndex((group) => group.includes(letter))
  if (groupIndex < 0) return 'unknown'
  const group = layout[groupIndex]
  const index = group.indexOf(letter)
  const outerGroup = groupIndex === 0 || groupIndex === layout.length - 1
  if (outerGroup && ((groupIndex === 0 && index === 0) || (groupIndex === layout.length - 1 && index === group.length - 1))) return 'window'
  if (index === 0 || index === group.length - 1) return 'aisle'
  return 'middle'
}

export function seatsAreAdjacent(firstSeat, secondSeat, layout) {
  const first = clean(firstSeat).match(/^(\d+)([A-Z]+)$/i)
  const second = clean(secondSeat).match(/^(\d+)([A-Z]+)$/i)
  if (!first || !second || first[1] !== second[1]) return false
  const firstLetter = first[2].toUpperCase()
  const secondLetter = second[2].toUpperCase()
  return layout.some((group) => Math.abs(group.indexOf(firstLetter) - group.indexOf(secondLetter)) === 1 && group.includes(firstLetter) && group.includes(secondLetter))
}

export function seatsAreAcrossAisle(firstSeat, secondSeat, layout) {
  const first = clean(firstSeat).match(/^(\d+)([A-Z]+)$/i)
  const second = clean(secondSeat).match(/^(\d+)([A-Z]+)$/i)
  if (!first || !second || first[1] !== second[1]) return false
  const firstLetter = first[2].toUpperCase()
  const secondLetter = second[2].toUpperCase()
  return layout.slice(0, -1).some((group, index) => {
    const nextGroup = layout[index + 1]
    return (group.at(-1) === firstLetter && nextGroup[0] === secondLetter)
      || (group.at(-1) === secondLetter && nextGroup[0] === firstLetter)
  })
}
