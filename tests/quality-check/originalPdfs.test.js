import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { ticketDataFromDocuments } from '../../src/features/quality-check/ticketDocumentParser.js'
import { physicalFlightKey } from '../../src/features/quality-check/ticketFlightParser.js'
import { parsePdfBytes } from './pdfBaselineHelpers.js'

// Documents, filenames, fingerprints, and reviewed totals belong in local-only
// metadata alongside the operator's originals, never in the public test source.
const directory = process.env.SARDINES_QC_INPUT_DIR
const manifest = directory ? JSON.parse(await readFile(path.join(directory, 'baseline.private.json'), 'utf8')) : null
const cases = manifest?.files ?? [{}, {}, {}]
if (manifest) assert.equal(cases.length, 3, 'Provide the three reviewed layouts in baseline.private.json.')
const options = { skip: directory ? false : 'Set SARDINES_QC_INPUT_DIR to the local originals folder.' }
const cache = new Map()
async function load(fixture) {
  if (!cache.has(fixture.name)) cache.set(fixture.name, (async () => {
    const bytes = await readFile(path.join(directory, fixture.name))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.sha256, 'Input differs from the reviewed original; review it separately.')
    return parsePdfBytes(bytes, { sourceDocument: fixture.name })
  })())
  return cache.get(fixture.name)
}

function assertOwnership(data) {
  assert.equal(data.travelers.length, manifest.expected.travelers)
  assert.equal(data.flights.length, manifest.expected.flights)
  assert.equal(data.travelers.reduce((count, person) => count + person.assignments.length, 0), manifest.expected.assignments)
  assert.ok(data.travelers.every((person) => person.associationStatus === 'associated' && person.problems.length === 0))
  assert.deepEqual(data.issues.map((issue) => issue.code).sort(), manifest.expected.duplicateSeats.map(() => 'duplicate-seat'))
  assert.deepEqual(data.issues.map((issue) => issue.seat).sort(), [...manifest.expected.duplicateSeats].sort())
  assert.ok(data.issues.every((issue) => issue.severity === 'critical' && issue.sources.length))
  const snapshot = data.travelers.map((person) => ({ ticket: person.ticketNumber.replace(/\D/g, ''), name: person.ticketName.replace(/[^A-Z]/g, ''),
    assignments: person.assignments.map((assignment) => [physicalFlightKey(data.flights[assignment.flightIndex]), assignment.seat].join(':')).sort(),
  })).sort((a, b) => a.ticket.localeCompare(b.ticket))
  // Independently cross-checked against all three layouts; no extracted PII stored.
  assert.equal(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'), manifest.expected.ownershipSha256)
}

for (const [index, fixture] of cases.entries()) {
  test(`PRIVATE ORIGINAL correctness: layout ${index + 1}`, options, async () => {
    const { pageCount, data } = await load(fixture)
    assert.equal(pageCount, fixture.pages)
    assert.equal(data.records.length, fixture.records)
    assertOwnership(data)
    assert.ok(data.travelers.every((person) => person.sources.every((source) => source.document === fixture.name && source.page >= 1 && source.page <= pageCount)))
  })
}

test('PRIVATE ORIGINALS together preserve ownership without triple-counting passengers or flights', options, async () => {
  const documents = await Promise.all(cases.map(async (fixture) => ({ name: fixture.name, pages: (await load(fixture)).pages })))
  const data = ticketDataFromDocuments(documents)
  assertOwnership(data)
  assert.ok(data.travelers.every((person) => new Set(person.sources.map((source) => source.document)).size === 3))
})
