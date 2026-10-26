import assert from 'node:assert/strict'
import test from 'node:test'
import { manifestTravelersFromRows } from './manifestWorkbookParser.js'

test('reads travelers and requests from an FMG international manifest table', () => {
  const rows = [
    ['#', 'Passport Last Name', 'Passport First Name', 'Passport Middle Name (Leave Blank if None)', 'Gender', 'Date of Birth', 'Passport Nationality', 'Passport Number', 'Passport Expiration', 'TSA Number', 'Frequent Flyer Number', 'Special Requests'],
    ['1', 'SNOW', 'Maeve', 'Iris', 'F', '', '', '', '', '', '', 'Window seat'],
  ]
  assert.deepEqual(manifestTravelersFromRows(rows), [{
    id: 'manifest-1', firstName: 'Maeve', middleName: 'Iris', lastName: 'SNOW', displayName: 'Maeve Iris SNOW', ticketName: 'SNOW/MAEVE IRIS', requests: 'Window seat', record: 'Manifest',
  }])
})

test('reads travelers and record membership from an FMG domestic manifest table', () => {
  const rows = [
    ['', 'Last Name', 'First Name', 'Mobile Number'],
    ['#', 'Last Name', 'First Name', 'Middle Name (Leave Blank if None)', 'Gender', 'Date of Birth', 'TSA Number', 'Frequent Flyer Number', 'Special Requests'],
    ['Record 1: 18 Passengers / LAX-HNL/OGG-LAX Hawaiian'],
    ['1', 'REEF', 'Test', 'Marie', 'F', '', '', '', 'Aisle seat'],
    ['Record 2: 20 Passengers / HNL-KOA-OGG Hawaiian'],
    ['1', 'REEF', 'Test', 'Marie', 'F', '', '', '', 'Aisle seat'],
  ]
  const travelers = manifestTravelersFromRows(rows)
  assert.deepEqual(travelers.map((traveler) => [traveler.ticketName, traveler.record]), [
    ['REEF/TEST MARIE', 'Record 1: 18 Passengers / LAX-HNL/OGG-LAX Hawaiian'],
    ['REEF/TEST MARIE', 'Record 2: 20 Passengers / HNL-KOA-OGG Hawaiian'],
  ])
  assert.equal(travelers[0].requests, 'Aisle seat')
})

test('reads a generic passenger workbook without a Special Requests column', () => {
  const rows = [
    ['Passenger Number', 'First Name', 'Middle Name', 'Last Name'],
    ['1', 'Ada', 'Marie', 'Lovelace'],
  ]

  assert.deepEqual(manifestTravelersFromRows(rows), [{
    id: 'manifest-1', firstName: 'Ada', middleName: 'Marie', lastName: 'Lovelace', displayName: 'Ada Marie Lovelace', ticketName: 'LOVELACE/ADA MARIE', requests: '', record: 'Manifest',
  }])
})
