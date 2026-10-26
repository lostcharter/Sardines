import assert from 'node:assert/strict'
import test from 'node:test'
import { inflateRawSync } from 'node:zlib'
import { Buffer } from 'node:buffer'
import { lettersForPattern, layoutSectionsForSeats, parseLayoutPattern, validateLayoutSections } from './layoutSections.js'
import { compareSeatAssignments } from './seatComparison.js'
import { buildQualityCheckWorkbook, qualityCheckWorkbookModel } from './qualityCheckWorkbook.js'

const section = (firstRow, lastRow, pattern = '2-4-2', letters = 'AB-CDEG-HJ', label = 'Economy') => ({ firstRow, lastRow, pattern, letters, label })

test('typed patterns describe seat groups separated by aisles, retaining actual letters', () => {
  assert.deepEqual(parseLayoutPattern(' 2 - 4 - 2 '), [2, 4, 2])
  assert.deepEqual(parseLayoutPattern('3-3'), [3, 3])
  assert.equal(lettersForPattern('2-4-2', ['12A', '12B', '14C', '14D', '14E', '15G', '15H', '15J']), 'AB-CDEG-HJ')
  assert.equal(lettersForPattern('3-3'), 'ABC-DEF')
  for (const bad of ['', '0-3', '3--3', '3.5-3', '33', '-3', '9-9-9']) assert.throws(() => parseLayoutPattern(bad))
})

test('row sections accept repeated cabin names but reject overlap and inconsistent letters', () => {
  assert.equal(validateLayoutSections([section(20, 40), section(1, 19, '2-2', 'AC-DF')]).length, 2)
  for (const drafts of [
    [section(1, 20), section(20, 40)], [section(0, 1)], [section(20, 10)], [section(1, 1000)],
    [section(1, 20, '2-4-2', 'AB-CDEF-FH')], [section(1, 20, '3-3', 'AB-CDEF')],
  ]) assert.throws(() => validateLayoutSections(drafts))
})

test('uncovered row ranges stay inferred and eight observed letters are only a candidate', () => {
  const seats = ['1A', '12A', '12B', '12C', '12D', '12E', '12G', '12H', '12J', '40L']
  const sections = layoutSectionsForSeats(seats, [section(10, 20)])
  assert.deepEqual(sections.map((s) => [s.firstRow, s.lastRow, s.confirmed]), [[1, 9, false], [10, 20, true], [21, 40, false]])
  const inferred = layoutSectionsForSeats(seats.slice(1, -1))[0]
  assert.equal(inferred.pattern, '2-4-2')
  assert.equal(inferred.letters, 'AB-CDEG-HJ')
  assert.equal(inferred.confirmed, false)
})

function sample(seats = ['12A', '12A', '30G', '40L']) {
  const flight = { label: 'LAX → HNL', departureAirport: 'LAX', arrivalAirport: 'HNL', airline: 'Example Air', flightNumber: '101', departureDate: '2026-10-08' }
  return { flights: [flight], unmatchedTickets: [], rows: seats.map((seat, index) => ({ flight, flightIndex: 0, seat, traveler: { displayName: `Person ${index}`, lastName: `Person ${index}`, requests: '' }, status: index < 2 ? 'conflict' : 'no-request', message: '' })) }
}

test('different Economy sections preserve all owners and keep misfitting assignments visible', () => {
  const result = sample()
  const before = JSON.stringify(result)
  result.layoutSections = { 0: [section(1, 20, '2-2', 'AC-DF'), section(21, 35)] }
  const map = qualityCheckWorkbookModel(result).maps[0]
  assert.equal(map.sections.length, 3)
  assert.equal(map.sections[0].label, map.sections[1].label)
  assert.equal(map.bySeat.get('12A').owners.length, 2)
  assert.equal(map.bySeat.get('30G').traveler.displayName, 'Person 2')
  assert.deepEqual(map.outsideDiagram.map((row) => row.seat), ['40L'])
  delete result.layoutSections
  assert.equal(JSON.stringify(result), before)
})

test('reviewed geometry evaluates positions and companions, but never clears conflicts or unknown seats', () => {
  const manifestTravelers = ['Ada Reef', 'Ben Shoal', 'Cora Coral', 'Dan Tide'].map((name, index) => ({ displayName: name, ticketName: `${name.split(' ')[1]}/${name.split(' ')[0]}`, requests: index === 0 ? 'Window seat' : index === 1 ? 'Seat next to Cora Coral' : index === 3 ? 'Window seat' : '' }))
  const ticketData = { schemaVersion: 2, flights: sample().flights, travelers: manifestTravelers.map((traveler, i) => ({ ticketName: traveler.ticketName, ticketNumber: `${1000000000000 + i}`, flightIndexes: [0], assignments: [{ flightIndex: 0, seat: ['12A', '12C', '12E', '12L'][i] }] })) }
  const base = compareSeatAssignments({ manifestTravelers, ticketData })
  assert.equal(base.rows[0].status, 'verify')
  const reviewed = compareSeatAssignments({ manifestTravelers, ticketData, layoutSections: { 0: [section(1, 20)] } })
  assert.deepEqual(reviewed.rows.map((row) => row.status), ['request-satisfied', 'request-unmet', 'no-request', 'verify'])
  ticketData.travelers[2].assignments[0].seat = '12C'
  const conflict = compareSeatAssignments({ manifestTravelers, ticketData, layoutSections: { 0: [section(1, 20)] } })
  assert.equal(conflict.rows[1].status, 'conflict')
  assert.equal(conflict.rows[2].status, 'conflict')
})

test('Excel carries section ranges, patterns, critical owners, and valid references for every map note', async () => {
  const result = sample()
  result.layoutSections = { 0: [section(1, 20, '2-2', 'AC-DF'), section(21, 35)] }
  const bytes = Buffer.from(await (await buildQualityCheckWorkbook(result)).arrayBuffer())
  const files = new Map()
  let offset = 0
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const compressed = bytes.readUInt32LE(offset + 18)
    const nameLength = bytes.readUInt16LE(offset + 26)
    const extra = bytes.readUInt16LE(offset + 28)
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString()
    const start = offset + 30 + nameLength + extra
    files.set(name, inflateRawSync(bytes.subarray(start, start + compressed)).toString())
    offset = start + compressed
  }
  const sheet = files.get('xl/worksheets/sheet2.xml')
  assert.match(sheet, /Rows 1–20 · 2-2 · REVIEWED · AC-DF/)
  assert.match(sheet, /Rows 21–35 · 2-4-2 · REVIEWED · AB-CDEG-HJ/)
  assert.match(sheet, /Person 0 \/ Person 1/)
  assert.match(sheet, /CRITICAL CONFLICT/)
  assert.match(sheet, /40L/)
  const refs = [...files.get('xl/comments2.xml').matchAll(/<comment ref="([A-Z]+\d+)"/g)].map((match) => match[1])
  for (const ref of refs) assert.ok(sheet.includes(`<c r="${ref}"`), `missing note cell ${ref}`)
  const rowNumbers = [...sheet.matchAll(/<row r="(\d+)"/g)].map((match) => Number(match[1]))
  assert.deepEqual(rowNumbers, [...new Set(rowNumbers)].sort((a, b) => a - b))
})
