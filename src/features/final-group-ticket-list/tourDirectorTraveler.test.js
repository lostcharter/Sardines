import assert from 'node:assert/strict'
import test from 'node:test'

import { tourDirectorContactFromTraveler } from './tourDirectorTraveler.js'

test('uses one traveler as the Tour Director, emergency contact, and multi-record passenger', () => {
  const contact = tourDirectorContactFromTraveler({
    aevd: { reservationNumber: '123', phone: '555-0100', email: 'td@example.test' },
    ppdt: { travelerNumber: '456' },
  }, {
    role: 'tour-director',
    firstName: 'Hannah',
    middleName: 'M',
    lastName: 'Example',
    recordNumbers: ['5', '6'],
  })

  assert.equal(contact.firstName, 'Hannah')
  assert.equal(contact.phone, '555-0100')
  assert.equal(contact.reservationNumber, '123')
  assert.deepEqual(contact.flightRecordNumbers, ['5', '6'])
})
