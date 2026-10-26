import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { parsePdfBytes } from './pdfBaselineHelpers.js'
import { physicalFlightKey } from '../../src/features/quality-check/ticketFlightParser.js'
import { compareSeatAssignments } from '../../src/features/quality-check/seatComparison.js'
import { qualityCheckWorkbookModel } from '../../src/features/quality-check/qualityCheckWorkbook.js'

const directory = process.env.SARDINES_QC_LAYOUT_INPUT_DIR
test('PRIVATE LAYOUT: reviewed 2-4-2 sections preserve ticket ownership', {
  skip: directory ? false : 'Set SARDINES_QC_LAYOUT_INPUT_DIR to a local reviewed-layout folder.',
}, async () => {
  const manifest = JSON.parse(await readFile(path.join(directory, 'layout.private.json'), 'utf8'))
  const bytes = await readFile(path.join(directory, manifest.file))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256)
  const { data, pageCount } = await parsePdfBytes(bytes)
  assert.equal(pageCount, manifest.expected.pages)
  assert.equal(data.travelers.length, manifest.expected.travelers)
  assert.equal(data.flights.length, manifest.expected.flights)
  assert.equal(data.travelers.reduce((sum, person) => sum + person.assignments.length, 0), manifest.expected.assignments)
  assert.deepEqual(data.issues, [])
  const snapshot = data.travelers.map((person) => ({ ticket: person.ticketNumber.replace(/\D/g, ''), name: person.ticketName.replace(/[^A-Z]/g, ''),
    assignments: person.assignments.map((assignment) => [physicalFlightKey(data.flights[assignment.flightIndex]), assignment.seat].join(':')).sort(),
  })).sort((a, b) => a.ticket.localeCompare(b.ticket))
  assert.equal(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'), manifest.expected.ownershipSha256)
  const comparison = compareSeatAssignments({ manifestTravelers: data.travelers.map((person) => ({ ticketName: person.ticketName, displayName: person.ticketName, requests: '' })), ticketData: data })
  const result = { ...comparison, flights: data.flights, layoutSections: {} }
  const before = qualityCheckWorkbookModel(result)
  for (const map of before.maps) {
    if (!manifest.reviewedRoutes.includes(`${map.flight.departureAirport}:${map.flight.arrivalAirport}`)) continue
    assert.equal(map.sections[0].pattern, '2-4-2')
    assert.equal(map.sections[0].letters, 'AB-CDEG-HJ')
    result.layoutSections[map.flightIndex] = [{ firstRow: map.firstRow, lastRow: map.lastRow, pattern: '2-4-2', letters: 'AB-CDEG-HJ', label: 'Economy' }]
  }
  assert.equal(Object.keys(result.layoutSections).length, manifest.reviewedRoutes.length)
  const after = qualityCheckWorkbookModel(result)
  assert.equal(after.maps.flatMap((map) => map.rows).length, manifest.expected.assignments)
  for (const map of after.maps) {
    assert.deepEqual([...map.bySeat.keys()], [...before.maps[map.flightIndex].bySeat.keys()])
    if (result.layoutSections[map.flightIndex]) {
      assert.equal(map.geometryIsInferred, false)
      assert.equal(map.outsideDiagram.length, 0)
    } else assert.equal(map.geometryIsInferred, true)
  }
})
