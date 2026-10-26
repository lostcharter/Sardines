import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseExplicitContractRecord,
  parseFareBreakdown,
} from './contractRecordParser.js'

test('parses an FMG open-jaw contract record', () => {
  const record = parseExplicitContractRecord(
    'Record 1: 16 Passengers / LAX-HNL/OGG-LAX Hawaiian'
  )

  assert.deepEqual(record, {
    recordNumber: 1,
    passengerCount: 16,
    routing: 'LAX-HNL/OGG-LAX',
    airlineName: 'Hawaiian',
    airlineCode: '',
    references: [],
    reference: '',
    sourceFormat: 'numbered-contract-record',
    sourceHeader: 'Record 1: 16 Passengers / LAX-HNL/OGG-LAX Hawaiian',
  })
})

test('parses per-passenger prices from an FMG fare table', () => {
  const fares = parseFareBreakdown([
    '1. ORD-YYC / YVR-ORD United',
    '15 $417.00 $96.61 $513.61 $7,704.15',
    '2. ORD-YYC / YVR-ORD United',
    '21 $517.00 $96.61 $613.61 $12,885.81',
  ])
  assert.equal(fares[1].totalPerPassenger, 513.61)
  assert.equal(fares[2].totalPerPassenger, 613.61)
})

test('parses prices when FMG puts the record heading and fare on one line', () => {
  const fares = parseFareBreakdown([
    '4. STL-FRA / MXP-STL Delta 44 $663.00 $584.33 $1,247.33 $54,882.52',
    '7. STL-FRA / MXP-STL United 20 $624.00 $633.93 $1,257.93 $25,158.60',
  ])

  assert.equal(fares[4].totalPerPassenger, 1247.33)
  assert.equal(fares[7].totalPerPassenger, 1257.93)
})

test('continues to parse standard hyphenated routes', () => {
  const record = parseExplicitContractRecord(
    'Record 2: 18 Passengers / HNL-KOA-OGG Hawaiian'
  )

  assert.equal(record?.recordNumber, 2)
  assert.equal(record?.routing, 'HNL-KOA-OGG')
})

test('normalizes spaces around an open-jaw separator', () => {
  const record = parseExplicitContractRecord(
    'Record 4: 23 Passengers / STL-PRG / BUD-STL American'
  )

  assert.equal(record?.recordNumber, 4)
  assert.equal(record?.routing, 'STL-PRG/BUD-STL')
  assert.equal(record?.airlineName, 'American')
})
