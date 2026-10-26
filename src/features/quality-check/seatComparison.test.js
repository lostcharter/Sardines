import assert from 'node:assert/strict'
import test from 'node:test'
import { compareSeatAssignments, seatComparisonSummary } from './seatComparison.js'

for (const ambiguous of [false, true]) {
  for (const position of ['', 'Window seat; ']) {
    test(`keeps ${ambiguous ? 'ambiguous' : 'missing'} companions pending ${position ? 'with a satisfied window request' : 'without a position request'}`, () => {
      const alice = { displayName: 'Alice Smith', ticketName: 'SMITH/ALICE', requests: `${position}next to Bob Jones` }
      const companions = ambiguous ? ['Alan', 'Brian'].map((middle) => ({ displayName: `Bob ${middle} Jones`, ticketName: `JONES/BOB ${middle}`, requests: '' })) : []
      const manifestTravelers = [alice, ...companions]
      const comparison = compareSeatAssignments({
        manifestTravelers,
        ticketData: {
          schemaVersion: 2, flights: [{ label: 'SEA to JFK' }],
          travelers: manifestTravelers.map((person, index) => ({ ticketName: person.ticketName, flightIndexes: [0], assignments: [{ flightIndex: 0, seat: `12${'ABC'[index]}` }] })),
        },
        layoutSections: { 0: [{ firstRow: 1, lastRow: 30, pattern: '3-3', letters: 'ABC-DEF' }] },
      })
      assert.equal(comparison.rows[0].status, 'verify')
      assert.match(comparison.rows[0].message, /next to Bob Jones/)
      assert.match(comparison.rows[0].message, ambiguous ? /companion match is ambiguous/ : /companion could not be matched on this flight/)
      if (position) assert.match(comparison.rows[0].message, /✓ window seat/)
    })
  }
}

test('keeps a traveler’s outbound and return seats attached to their flights', () => {
  const comparison = compareSeatAssignments({
    manifestTravelers: [{ displayName: 'Cora May Silverbrook', ticketName: 'SILVERBROOK/CORA MAY', requests: 'Window seat' }],
    ticketData: {
      flights: [{ label: 'JFK → CMN' }, { label: 'CMN → JFK' }],
      travelers: [{ ticketName: 'SILVERBROOK/CORA MAY', ticketNumber: '000-0000000001', seats: ['36D', '32K'] }],
    },
  })
  assert.deepEqual(comparison.rows.map((row) => [row.flight.label, row.seat]), [['JFK → CMN', '36D'], ['CMN → JFK', '32K']])
})

test('flags a duplicate seat only within the same flight', () => {
  const comparison = compareSeatAssignments({
    manifestTravelers: [
      { displayName: 'One', ticketName: 'ONE/PERSON', requests: '' },
      { displayName: 'Two', ticketName: 'TWO/PERSON', requests: '' },
    ],
    ticketData: {
      flights: [{ label: 'JFK → CMN' }, { label: 'CMN → JFK' }],
      travelers: [
        { ticketName: 'ONE/PERSON', seats: ['12A', '14C'] },
        { ticketName: 'TWO/PERSON', seats: ['12A', '12A'] },
      ],
    },
  })
  assert.equal(seatComparisonSummary(comparison).conflict, 2)
  assert.equal(comparison.rows.find((row) => row.traveler.displayName === 'Two' && row.flightIndex === 1).status, 'no-request')
})

test('reviews a partly satisfied outbound request and satisfies the return request', () => {
  const ada = { displayName: 'Ada Iris Reef', ticketName: 'REEF/ADA IRIS', requests: 'Tour Director; aisle; furthest forward; next to Ben' }
  const ben = { displayName: 'Ben Lee Reef', ticketName: 'REEF/BEN LEE', requests: 'Next to Ada Reef' }
  const comparison = compareSeatAssignments({
    manifestTravelers: [ada, ben],
    ticketData: {
      flights: [{ label: 'JFK → CMN' }, { label: 'CMN → JFK' }],
      travelers: [{ ticketName: ada.ticketName, seats: ['29F', '30H'] }, { ticketName: ben.ticketName, seats: ['29E', '30J'] }],
    },
  })
  const annRows = comparison.rows.filter((row) => row.traveler === ada)
  assert.equal(annRows[0].status, 'verify')
  assert.match(annRows[0].message, /✕ aisle seat/)
  assert.equal(annRows[1].status, 'request-satisfied')
})

test('marks a missed window but satisfied companion request as partial review', () => {
  const dara = { displayName: 'Dara Fern Shoal', ticketName: 'SHOAL/DARA FERN', requests: 'Window seat; next to Tobin Lee Shoal' }
  const tobin = { displayName: 'Tobin Lee Shoal', ticketName: 'SHOAL/TOBIN LEE', requests: '' }
  const comparison = compareSeatAssignments({
    manifestTravelers: [dara, tobin],
    ticketData: {
      flights: [{ label: 'STL → PHL' }],
      travelers: [{ ticketName: dara.ticketName, seats: ['24B'] }, { ticketName: tobin.ticketName, seats: ['24A'] }],
    },
  })
  const donnaRow = comparison.rows.find((row) => row.traveler === dara)
  assert.equal(donnaRow.status, 'verify')
  assert.match(donnaRow.message, /✕ window seat · ✓ next to Tobin Lee Shoal/)
})

test('normalizes zero-padded business-class seat labels', () => {
  const traveler = { displayName: 'Vera Ada Coral', ticketName: 'CORAL/VERA ADA', requests: 'Aisle seat' }
  const comparison = compareSeatAssignments({
    manifestTravelers: [traveler],
    ticketData: { flights: [{ label: 'STL → PHL' }], travelers: [{ ticketName: traveler.ticketName, seats: ['09B'] }] },
  })
  assert.equal(comparison.rows[0].seat, '9B')
})

test('uses the named travelers own preference in a shared request sentence', () => {
  const request = 'Wren Ray Tide requests a window seat; Tessa Sage Tide requests a middle seat next to Wren Ray Tide. Seat these travelers together.'
  const wren = { displayName: 'Wren Ray Tide', ticketName: 'TIDE/WREN RAY', requests: request }
  const tessa = { displayName: 'Tessa Sage Tide', ticketName: 'TIDE/TESSA SAGE', requests: request }
  const comparison = compareSeatAssignments({
    manifestTravelers: [wren, tessa],
    ticketData: {
      flights: [{ label: 'JFK → CMN' }],
      travelers: [{ ticketName: wren.ticketName, seats: ['35K'] }, { ticketName: tessa.ticketName, seats: ['35J'] }],
    },
  })
  assert.deepEqual(comparison.rows.map((row) => row.status), ['request-satisfied', 'request-satisfied'])
})

test('keeps repeated travelers on only the flights in each booking record', () => {
  const traveler = { displayName: 'Repeat Traveler', ticketName: 'TRAVELER/REPEAT', requests: '', record: 'Record 2' }
  const comparison = compareSeatAssignments({
    manifestTravelers: [traveler],
    ticketData: {
      flights: [{ label: 'LAX → HNL' }, { label: 'OGG → HNL' }, { label: 'HNL → LAX' }, { label: 'HNL → KOA' }, { label: 'KOA → OGG' }],
      records: [{ flightIndexes: [0, 1, 2] }, { flightIndexes: [3, 4] }],
      travelers: [{ ticketName: traveler.ticketName, seats: ['23E', '23E'], recordIndex: 1, flightIndexes: [3, 4] }],
    },
  })
  assert.deepEqual(comparison.rows.map((row) => [row.flightIndex, row.seat]), [[3, '23E'], [4, '23E']])
})

test('matches a domestic first-and-last manifest name to a unique ticket middle name in the same record', () => {
  const comparison = compareSeatAssignments({
    manifestTravelers: [{ displayName: 'Nora Pebble', firstName: 'Nora', lastName: 'Pebble', ticketName: 'PEBBLE/NORA', requests: '', record: 'Record 1' }],
    ticketData: {
      flights: [{ label: 'LAX → HNL' }],
      records: [{ flightIndexes: [0] }],
      travelers: [{ ticketName: 'PEBBLE/NORA IRIS', seats: ['41B'], recordIndex: 0, flightIndexes: [0] }],
    },
  })
  assert.equal(comparison.rows[0].seat, '41B')
  assert.equal(comparison.rows[0].status, 'no-request')
  assert.equal(comparison.unmatchedTickets.length, 0)
})

test('does not guess when first and last name match multiple tickets in one record', () => {
  const comparison = compareSeatAssignments({
    manifestTravelers: [{ displayName: 'Alex Reef', ticketName: 'REEF/ALEX', requests: '', record: 'Record 1' }],
    ticketData: {
      flights: [{ label: 'LAX → HNL' }], records: [{ flightIndexes: [0] }],
      travelers: [
        { ticketName: 'REEF/ALEX ONE', seats: ['10A'], recordIndex: 0, flightIndexes: [0] },
        { ticketName: 'REEF/ALEX TWO', seats: ['10B'], recordIndex: 0, flightIndexes: [0] },
      ],
    },
  })
  assert.equal(comparison.rows[0].status, 'unmatched')
  assert.equal(comparison.unmatchedTickets.length, 2)
})

test('marks a same-row across-aisle placement for review instead of failing a next-to request', () => {
  const jules = { displayName: 'Jules Moss Driftwood', ticketName: 'DRIFTWOOD/JULES MOSS', requests: 'Seat next to Skye Driftwood' }
  const skye = { displayName: 'Skye Iris Driftwood', ticketName: 'DRIFTWOOD/SKYE IRIS', requests: 'Seat next to Jules Driftwood' }
  const comparison = compareSeatAssignments({
    manifestTravelers: [jules, skye],
    ticketData: {
      flights: [{ label: 'LAX → HNL' }],
      travelers: [{ ticketName: jules.ticketName, seats: ['41G'] }, { ticketName: skye.ticketName, seats: ['41H'] }],
    },
  })
  assert.deepEqual(comparison.rows.map((row) => row.status), ['verify', 'verify'])
  assert.match(comparison.rows[0].message, /across the aisle/)
})

test('marks same-row skipped-letter companions as dependent on the actual layout', () => {
  const della = { displayName: 'Della June Seagrass', ticketName: 'SEAGRASS/DELLA JUNE', requests: 'Seat next to Ben Seagrass' }
  const ben = { displayName: 'Ben Elm Seagrass', ticketName: 'SEAGRASS/BEN ELM', requests: 'Seat next to Della Seagrass' }
  const cabinEvidence = { displayName: 'Cabin Evidence', ticketName: 'EVIDENCE/CABIN', requests: '' }
  const comparison = compareSeatAssignments({
    manifestTravelers: [della, ben, cabinEvidence],
    ticketData: {
      flights: [{ label: 'YYZ → PRG' }],
      travelers: [{ ticketName: della.ticketName, seats: ['37A'] }, { ticketName: ben.ticketName, seats: ['37C'] }, { ticketName: cabinEvidence.ticketName, seats: ['36K'] }],
    },
  })
  assert.deepEqual(comparison.rows.slice(0, 2).map((row) => row.status), ['verify', 'verify'])
  assert.match(comparison.rows[0].message, /depends on actual seat layout/)
})

test('keeps companions in different rows as a failed request', () => {
  const one = { displayName: 'One Fish', ticketName: 'FISH/ONE', requests: 'Seat next to Two Fish' }
  const two = { displayName: 'Two Fish', ticketName: 'FISH/TWO', requests: '' }
  const comparison = compareSeatAssignments({
    manifestTravelers: [one, two],
    ticketData: { flights: [{ label: 'SEA → SFO' }], travelers: [{ ticketName: one.ticketName, seats: ['12A'] }, { ticketName: two.ticketName, seats: ['13A'] }] },
  })
  assert.equal(comparison.rows[0].status, 'request-unmet')
})

test('matches one submitted traveler to separate outbound and return ticket records', () => {
  const traveler = { displayName: 'River Traveler', ticketName: 'TRAVELER/RIVER', requests: '', record: 'Record 5 & 6' }
  const comparison = compareSeatAssignments({
    manifestTravelers: [traveler],
    ticketData: {
      flights: [{ label: 'ORD → YYZ' }, { label: 'YYZ → PRG' }, { label: 'BUD → LHR' }, { label: 'LHR → ORD' }],
      records: [{ flightIndexes: [0, 1] }, { flightIndexes: [2, 3] }],
      travelers: [
        { ticketName: traveler.ticketName, seats: ['22A', '35A'], recordIndex: 0, flightIndexes: [0, 1] },
        { ticketName: traveler.ticketName, seats: [], recordIndex: 1, flightIndexes: [2, 3] },
      ],
    },
  })
  assert.deepEqual(comparison.rows.map((row) => [row.flightIndex, row.seat, row.status]), [
    [0, '22A', 'no-request'], [1, '35A', 'no-request'], [2, '', 'unassigned'], [3, '', 'unassigned'],
  ])
  assert.equal(comparison.unmatchedTickets.length, 0)
})

test('matches a full middle name to initials across distinct airline ticket records', () => {
  const traveler = { displayName: 'Hazel Kit Marsh', ticketName: 'MARSH/HAZEL KIT', requests: '', record: 'Record 5 & 6' }
  const comparison = compareSeatAssignments({
    manifestTravelers: [traveler],
    ticketData: {
      flights: [{ label: 'ORD → YYZ' }, { label: 'BUD → LHR' }],
      records: [{ flightIndexes: [0] }, { flightIndexes: [1] }],
      travelers: [
        { ticketName: 'MARSH/HAZEL K', seats: ['22A'], recordIndex: 0, flightIndexes: [0] },
        { ticketName: 'MARSH/HAZEL K', seats: [], recordIndex: 1, flightIndexes: [1] },
      ],
    },
  })
  assert.deepEqual(comparison.rows.map((row) => [row.flightIndex, row.status]), [[0, 'no-request'], [1, 'unassigned']])
  assert.equal(comparison.unmatchedTickets.length, 0)
})

test('keeps matching when an exact outbound name gains middle names on the return ticket', () => {
  const traveler = { displayName: 'Kit Cove', ticketName: 'COVE/KIT', requests: '', record: 'Record 5 & 6' }
  const comparison = compareSeatAssignments({
    manifestTravelers: [traveler],
    ticketData: {
      flights: [{ label: 'ORD → YYZ' }, { label: 'YYZ → PRG' }, { label: 'BUD → LHR' }, { label: 'LHR → ORD' }],
      records: [{ flightIndexes: [0, 1] }, { flightIndexes: [2, 3] }],
      travelers: [
        { ticketName: 'COVE/KIT', seats: ['23F', '36H'], recordIndex: 0, flightIndexes: [0, 1] },
        { ticketName: 'COVE/KIT BROOK', seats: [], recordIndex: 1, flightIndexes: [2, 3] },
      ],
    },
  })
  assert.deepEqual(comparison.rows.map((row) => [row.flightIndex, row.status]), [
    [0, 'no-request'], [1, 'no-request'], [2, 'unassigned'], [3, 'unassigned'],
  ])
  assert.equal(comparison.unmatchedTickets.length, 0)
})
