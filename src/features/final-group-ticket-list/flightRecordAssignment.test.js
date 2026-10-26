import assert from 'node:assert/strict'
import test from 'node:test'

import { assignFlightRecords, rebalanceEquivalentRecordAssignments } from './flightRecordAssignment.js'
import { analyzeFlightComment } from './commentAnalysis.js'

test('assigns a traveler to unique separate outbound and return records', () => {
  const match = {
    aevd: {
      travelerName: 'Test Traveler',
      airType: 'Company Air',
      departureCity: 'ORD',
    },
    ppdt: { travelerNumber: 'TEST-1' },
  }
  const result = assignFlightRecords({
    reconciliation: { matches: [match] },
    flightRecords: [
      { recordNumber: 5, passengerCount: 13, routing: 'ORD-PRG' },
      { recordNumber: 6, passengerCount: 13, routing: 'BUD-ORD' },
    ],
    tourFlight: { enabled: false },
  })

  assert.deepEqual(
    result.companyAssignments.map((item) => item.recordNumber),
    [5, 6]
  )
  assert.equal(result.summary.companyAssigned, 1)
})

test('fills interchangeable same-flight records without splitting roommates', () => {
  const makeMatch = (name, reservation, travelerNumber) => ({
    aevd: { travelerName: name, airType: 'Company Air', departureCity: 'ORD', reservationNumber: reservation },
    ppdt: { displayName: name, travelerNumber },
  })
  const matches = [
    makeMatch('Alpha One', 'A', '1'),
    makeMatch('Bravo Two', 'B', '2'),
    makeMatch('Charlie Three', 'C', '3'),
    makeMatch('Delta Four', 'D', '4'),
  ]
  const result = assignFlightRecords({
    reconciliation: { matches },
    flightRecords: [
      { recordNumber: 1, passengerCount: 2, routing: 'ORD-YYC/YVR-ORD', airlineName: 'United', sourceHeader: 'Record 1: 2 Passengers / ORD-YYC / YVR-ORD United' },
      { recordNumber: 2, passengerCount: 2, routing: 'ORD-YYC/YVR-ORD', airlineName: 'United', sourceHeader: 'Record 2: 2 Passengers / ORD-YYC / YVR-ORD United' },
    ],
    tourFlight: { enabled: false },
    roomingData: { roommateMap: new Map([['A', ['Bravo Two']], ['B', ['Alpha One']]]) },
  })

  assert.equal(result.companyAssignments[0].recordNumber, result.companyAssignments[1].recordNumber)
  assert.deepEqual(result.companyAssignments.map((item) => item.recordNumber), [1, 1, 2, 2])
  assert.equal(result.summary.companyNeedsReview, 0)
})

test('fills the cheaper interchangeable record before a more expensive record', () => {
  const matches = Array.from({ length: 4 }, (_, index) => ({
    aevd: { travelerName: `Traveler ${index}`, airType: 'Company Air', departureCity: 'ORD' },
    ppdt: { travelerNumber: String(index) },
  }))
  const result = assignFlightRecords({
    reconciliation: { matches },
    flightRecords: [
      { recordNumber: 1, passengerCount: 3, routing: 'ORD-YYC/YVR-ORD', totalPerPassenger: 600, sourceHeader: 'Record 1: 3 Passengers / ORD-YYC / YVR-ORD United' },
      { recordNumber: 2, passengerCount: 3, routing: 'ORD-YYC/YVR-ORD', totalPerPassenger: 500, sourceHeader: 'Record 2: 3 Passengers / ORD-YYC / YVR-ORD United' },
    ],
    tourFlight: { enabled: false },
  })
  assert.deepEqual(result.companyAssignments.map((item) => item.recordNumber), [2, 2, 2, 1])
})

test('rebalances interchangeable records around a fixed Tour Director', () => {
  const records = [
    { recordNumber: 1, passengerCount: 15, routing: 'ORD-YYC/YVR-ORD', totalPerPassenger: 513.61, sourceHeader: 'Record 1: 15 Passengers / ORD-YYC / YVR-ORD United' },
    { recordNumber: 2, passengerCount: 21, routing: 'ORD-YYC/YVR-ORD', totalPerPassenger: 513.61, sourceHeader: 'Record 2: 21 Passengers / ORD-YYC / YVR-ORD United' },
  ]
  const candidates = [1, 2]
  const movable = Array.from({ length: 33 }, (_, index) => ({
    match: { aevd: { travelerName: `Traveler ${index}`, reservationNumber: String(index) } },
    recordNumber: index < 15 ? 1 : 2,
    record: index < 15 ? records[0] : records[1],
    assignmentType: 'company-air',
    assignmentSource: 'equivalent-record-capacity',
    reviewRequired: false,
    candidates,
  }))
  const director = {
    match: { operational: true, aevd: { travelerName: 'Tour Director' } },
    recordNumber: 1,
    record: records[0],
    assignmentType: 'tour-director',
    assignmentSource: 'tour-director-panel',
    candidates: [1],
  }
  const balanced = rebalanceEquivalentRecordAssignments([...movable, director], records, null)
  assert.equal(balanced.filter((item) => item.recordNumber === 1).length, 15)
  assert.equal(balanced.filter((item) => item.recordNumber === 2).length, 19)
})

test('does not combine records whose contract titles distinguish cabins', () => {
  const match = { aevd: { travelerName: 'Test Traveler', airType: 'Company Air', departureCity: 'ORD' } }
  const result = assignFlightRecords({
    reconciliation: { matches: [match] },
    flightRecords: [
      { recordNumber: 1, passengerCount: 10, routing: 'ORD-LHR/AMS-ORD', sourceHeader: 'Record 1: 10 Passengers / ORD-LHR / AMS-ORD Economy' },
      { recordNumber: 2, passengerCount: 2, routing: 'ORD-LHR/AMS-ORD', sourceHeader: 'Record 2: 2 Passengers / ORD-LHR / AMS-ORD Premium' },
    ],
    tourFlight: { enabled: false },
  })
  assert.equal(result.companyAssignments[0].recordNumber, null)
  assert.equal(result.companyAssignments[0].assignmentType, 'ambiguous')
})

test('uses named contract records and sends remaining travelers to the ordinary record', () => {
  const makeMatch = (name, number) => ({
    aevd: { travelerName: name, lastName: name.split(' ').at(-1), airType: 'Company Air', departureCity: 'STL' },
    ppdt: { displayName: name, lastName: name.split(' ').at(-1), travelerNumber: String(number) },
  })
  const records = [
    { recordNumber: 1, passengerCount: 2, routing: 'STL-PRG/BUD-STL', sourceHeader: 'Record 1: 2 Passengers / STL-PRG / BUD-STL American: Premium Economy (Coral/Sandbar)' },
    { recordNumber: 2, passengerCount: 2, routing: 'STL-PRG/BUD-STL', sourceHeader: 'Record 2: 2 Passengers / STL-PRG / BUD-STL American: First/Business Class' },
    { recordNumber: 3, passengerCount: 2, routing: 'STL-PRG/BUD-STL', sourceHeader: 'Record 3: 2 Passengers / STL-PRG / BUD-STL American: Premium Economy (Finch/Spray)' },
    { recordNumber: 4, passengerCount: 34, routing: 'STL-PRG/BUD-STL', sourceHeader: 'Record 4: 34 Passengers / STL-PRG / BUD-STL American' },
  ]
  const result = assignFlightRecords({
    reconciliation: { matches: [makeMatch('Alex Coral', 1), makeMatch('Jamie Finch', 2), makeMatch('Pat Ordinary', 3)] },
    flightRecords: records,
    tourFlight: { enabled: false },
  })
  assert.deepEqual(result.companyAssignments.map((item) => item.recordNumber), [1, 3, 4])
  assert.deepEqual(result.companyAssignments.map((item) => item.assignmentSource), [
    'named-contract-record',
    'named-contract-record',
    'ordinary-contract-record',
  ])
})

test('uses an explicit confirmed cabin comment to select a special record', () => {
  const match = {
    aevd: {
      travelerName: 'Test Traveler',
      airType: 'Company Air',
      departureCity: 'STL',
      comments: 'Confirmed on 1/6 with FMG - First Class for the domestic legs and Business Class for long haul.',
    },
  }
  const result = assignFlightRecords({
    reconciliation: { matches: [match] },
    flightRecords: [
      { recordNumber: 2, passengerCount: 2, routing: 'STL-PRG/BUD-STL', sourceHeader: 'Record 2: 2 Passengers / STL-PRG / BUD-STL American: First/Business Class' },
      { recordNumber: 4, passengerCount: 34, routing: 'STL-PRG/BUD-STL', sourceHeader: 'Record 4: 34 Passengers / STL-PRG / BUD-STL American' },
    ],
    tourFlight: { enabled: false },
  })
  assert.equal(result.companyAssignments[0].recordNumber, 2)
  assert.equal(result.companyAssignments[0].assignmentSource, 'confirmed-cabin-comment')
})

test('treats an affirmative Business Class upgrade as a confirmed cabin assignment', () => {
  const match = {
    aevd: {
      travelerName: 'Maeve Iris Snow',
      airType: 'Company Air',
      departureCity: 'STL',
      comments: 'Business Class upgrade | Ticket 006999000006 | Seat 3A',
    },
  }
  const result = assignFlightRecords({
    reconciliation: { matches: [match] },
    flightRecords: [
      { recordNumber: 1, passengerCount: 1, routing: 'STL-FRA/MXP-STL', sourceHeader: 'Record 1: 1 Passenger / STL-FRA / MXP-STL Delta (Business Class)' },
      { recordNumber: 2, passengerCount: 8, routing: 'STL-FRA/MXP-STL', sourceHeader: 'Record 2: 8 Passengers / STL-FRA / MXP-STL United' },
    ],
    tourFlight: { enabled: false },
  })

  assert.equal(result.companyAssignments[0].recordNumber, 1)
  assert.equal(result.companyAssignments[0].assignmentSource, 'confirmed-cabin-comment')
})

test('holds all competing confirmed upgrades when cabin demand exceeds capacity', () => {
  const makeUpgrade = (travelerName) => ({
    aevd: {
      travelerName,
      airType: 'Company Air',
      departureCity: 'STL',
      comments: 'Business Class upgrade',
    },
  })
  const result = assignFlightRecords({
    reconciliation: { matches: [makeUpgrade('First Traveler'), makeUpgrade('Second Traveler')] },
    flightRecords: [
      { recordNumber: 1, passengerCount: 1, routing: 'STL-FRA/MXP-STL', sourceHeader: 'Record 1: 1 Passenger / STL-FRA / MXP-STL Delta (Business Class)' },
      { recordNumber: 2, passengerCount: 8, routing: 'STL-FRA/MXP-STL', sourceHeader: 'Record 2: 8 Passengers / STL-FRA / MXP-STL United' },
    ],
    tourFlight: { enabled: false },
  })

  assert.deepEqual(result.companyAssignments.map((item) => item.recordNumber), [null, null])
  assert.equal(result.summary.companyNeedsReview, 2)
  assert.match(result.companyAssignments[0].reviewReason, /2 confirmed Business Class travelers.*1 available Business Class seat/)
  assert.deepEqual(result.companyAssignments[0].candidates, [1, 2])
})

test('recognizes common affirmative cabin wording without treating tentative wording as booked', () => {
  const records = [
    { recordNumber: 1, passengerCount: 10, routing: 'STL-FRA/MXP-STL', sourceHeader: 'Record 1: 10 Passengers / STL-FRA / MXP-STL Delta (Business Class)' },
    { recordNumber: 2, passengerCount: 10, routing: 'STL-FRA/MXP-STL', sourceHeader: 'Record 2: 10 Passengers / STL-FRA / MXP-STL United' },
  ]
  const assign = (comments) => assignFlightRecords({
    reconciliation: { matches: [{ aevd: { travelerName: comments, airType: 'Company Air', departureCity: 'STL', comments } }] },
    flightRecords: records,
    tourFlight: { enabled: false },
  }).companyAssignments[0]

  for (const wording of [
    'Accepted Business Class upgrade',
    'Agreed to Business Class',
    'Business Class approved',
    'Business Class okayed',
    'Booked Business Class',
    'Ticketed in Business Class',
    'Took the Business Class upgrade',
  ]) {
    assert.equal(assign(wording).recordNumber, 1, wording)
  }
  for (const wording of [
    'Requested Business Class upgrade',
    'Business Class quote pending',
    'Declined Business Class upgrade',
    'Not confirmed in Business Class',
  ]) {
    assert.notEqual(assign(wording).recordNumber, 1, wording)
  }
})

test('distributes confirmed upgrades across equivalent one-seat cabin records', () => {
  const makeUpgrade = (travelerNumber, confirmedDate) => ({
    aevd: {
      travelerName: `Upgrade ${travelerNumber}`,
      reservationNumber: travelerNumber,
      airType: 'Company Air',
      departureCity: 'STL',
      comments: `Confirmed Business Class Upgrade ${confirmedDate} With FMG`,
    },
    ppdt: { travelerNumber },
  })
  const commonFlights = [
    { flight: 'Delta 1400', departureAirport: 'STL', departureText: 'Dec 6 12:36 PM', arrivalAirport: 'ATL', arrivalText: 'Dec 6 3:12 PM' },
    { flight: 'Delta 14', departureAirport: 'ATL', departureText: 'Dec 6 5:10 PM', arrivalAirport: 'FRA', arrivalText: 'Dec 7 7:50 AM' },
  ]
  const result = assignFlightRecords({
    reconciliation: { matches: [makeUpgrade('1', '5/6'), makeUpgrade('2', '8/4')] },
    flightRecords: [
      { recordNumber: 1, passengerCount: 1, totalPerPassenger: 9399.93, routing: 'STL-FRA/MXP-STL', sourceHeader: 'Record 1: 1 Passenger / STL-FRA / MXP-STL Delta (Business Class)', flights: commonFlights },
      { recordNumber: 2, passengerCount: 1, totalPerPassenger: 9320.63, routing: 'STL-FRA/MXP-STL', sourceHeader: 'Record 2: 1 Passenger / STL-FRA / MXP-STL Delta (Business Class)', flights: commonFlights },
      { recordNumber: 4, passengerCount: 44, totalPerPassenger: 1247.33, routing: 'STL-FRA/MXP-STL', sourceHeader: 'Record 4: 44 Passengers / STL-FRA / MXP-STL Delta', flights: commonFlights },
    ],
    tourFlight: { enabled: false },
  })

  assert.deepEqual(result.companyAssignments.map((item) => item.recordNumber), [2, 1])
  assert.equal(result.summary.companyNeedsReview, 0)
})

test('does not assign a requested but unconfirmed cabin quote', () => {
  const match = {
    aevd: { travelerName: 'Test Traveler', airType: 'Company Air', departureCity: 'STL', comments: 'Would like a Business Class quote.' },
  }
  const result = assignFlightRecords({
    reconciliation: { matches: [match] },
    flightRecords: [
      { recordNumber: 2, passengerCount: 2, routing: 'STL-PRG/BUD-STL', sourceHeader: 'Record 2: 2 Passengers / STL-PRG / BUD-STL American: First/Business Class' },
      { recordNumber: 4, passengerCount: 34, routing: 'STL-PRG/BUD-STL', sourceHeader: 'Record 4: 34 Passengers / STL-PRG / BUD-STL American' },
    ],
    tourFlight: { enabled: false },
  })
  assert.equal(result.companyAssignments[0].recordNumber, 4)
  assert.equal(result.companyAssignments[0].assignmentSource, 'ordinary-contract-record')
})

test('fills the same unpriced route in record order when flight times differ', () => {
  const match = { aevd: { travelerName: 'Test Traveler', airType: 'Company Air', departureCity: 'ORD' } }
  const common = { passengerCount: 10, routing: 'ORD-LAX-ORD', sourceHeader: 'Record 1: 10 Passengers / ORD-LAX-ORD United' }
  const result = assignFlightRecords({
    reconciliation: { matches: [match] },
    flightRecords: [
      { ...common, recordNumber: 1, flights: [{ flight: 'United 100', departureAirport: 'ORD', departureText: '8:00 AM', arrivalAirport: 'LAX', arrivalText: '10:00 AM' }] },
      { ...common, recordNumber: 2, sourceHeader: 'Record 2: 10 Passengers / ORD-LAX-ORD United', flights: [{ flight: 'United 200', departureAirport: 'ORD', departureText: '1:00 PM', arrivalAirport: 'LAX', arrivalText: '3:00 PM' }] },
    ],
    tourFlight: { enabled: false },
  })
  assert.equal(result.companyAssignments[0].recordNumber, 1)
  assert.equal(result.companyAssignments[0].assignmentSource, 'route-price-capacity')
})

test('fills different carriers on the same route by price when fares are available', () => {
  const makeMatch = (index, reservationNumber = String(index)) => ({
    aevd: { travelerName: `Traveler ${index}`, reservationNumber, airType: 'Company Air', departureCity: 'STL' },
    ppdt: { travelerNumber: String(index) },
  })
  const records = [
    { recordNumber: 4, passengerCount: 3, totalPerPassenger: 1247.33, routing: 'STL-FRA/MXP-STL', airlineName: 'Delta', sourceHeader: 'Record 4: 3 Passengers / STL-FRA / MXP-STL Delta' },
    { recordNumber: 7, passengerCount: 3, totalPerPassenger: 1257.93, routing: 'STL-FRA/MXP-STL', airlineName: 'United', sourceHeader: 'Record 7: 3 Passengers / STL-FRA / MXP-STL United' },
  ]
  const result = assignFlightRecords({
    reconciliation: { matches: [makeMatch(1, 'A'), makeMatch(2, 'A'), makeMatch(3), makeMatch(4)] },
    flightRecords: records,
    roomingData: null,
    tourFlight: { enabled: false },
  })

  assert.deepEqual(result.companyAssignments.map((item) => item.recordNumber), [4, 4, 4, 7])
  assert.equal(result.summary.companyNeedsReview, 0)
})

test('honors an explicit carrier preference before route price filling', () => {
  const result = assignFlightRecords({
    reconciliation: { matches: [{
      aevd: {
        travelerName: 'United Preference',
        airType: 'Company Air',
        departureCity: 'STL',
        comments: 'They prefer to be on United.',
      },
    }] },
    flightRecords: [
      { recordNumber: 4, passengerCount: 44, totalPerPassenger: 1247.33, routing: 'STL-FRA/MXP-STL', airlineName: 'Delta', sourceHeader: 'Record 4: 44 Passengers / STL-FRA / MXP-STL Delta' },
      { recordNumber: 7, passengerCount: 20, totalPerPassenger: 1257.93, routing: 'STL-FRA/MXP-STL', airlineName: 'United', sourceHeader: 'Record 7: 20 Passengers / STL-FRA / MXP-STL United' },
    ],
    tourFlight: { enabled: false },
  })

  assert.equal(result.companyAssignments[0].recordNumber, 7)
  assert.equal(result.companyAssignments[0].assignmentSource, 'carrier-preference-comment')
})

test('assigns a return-airport deviation to its matching open-jaw record', () => {
  const comments = 'Returning To Dtw Instead Of Ord'
  const makeMatch = (name) => ({
    aevd: {
      travelerName: name,
      airType: 'Company Air',
      departureCity: 'ORD',
      comments,
      commentAnalysis: analyzeFlightComment(comments),
    },
  })
  const result = assignFlightRecords({
    reconciliation: {
      matches: [makeMatch('Kristina Storm'), makeMatch('Jon Loesche')],
    },
    flightRecords: [
      { recordNumber: 5, passengerCount: 48, routing: 'ORD-FRA/MXP-ORD' },
      { recordNumber: 6, passengerCount: 2, routing: 'ORD-FRA/MXP-DTW' },
    ],
    tourFlight: { enabled: false },
  })

  assert.deepEqual(
    result.companyAssignments.map((item) => item.recordNumber),
    [6, 6]
  )
  assert.equal(result.companyAssignments[0].assignmentSource, 'flight-comment')
  assert.match(result.companyAssignments[0].reviewReason, /returns to DTW instead of ORD/)
})

test('does not assign a return-via deviation to a group record that merely connects there', () => {
  const comments = 'Deviation return via EWR | Ticket 016999000007'
  const result = assignFlightRecords({
    reconciliation: { matches: [{
      aevd: {
        travelerName: 'Ronan Ash Pine',
        airType: 'Company Air',
        departureCity: 'STL',
        comments,
        commentAnalysis: analyzeFlightComment(comments),
      },
      ppdt: { travelerNumber: '950107', displayName: 'Ronan Ash Pine' },
    }] },
    flightRecords: [{
      recordNumber: 2,
      passengerCount: 8,
      routing: 'STL-FRA/MXP-STL',
      flights: [
        { departureAirport: 'STL', arrivalAirport: 'ORD' },
        { departureAirport: 'ORD', arrivalAirport: 'FRA' },
        { departureAirport: 'MXP', arrivalAirport: 'EWR' },
        { departureAirport: 'EWR', arrivalAirport: 'STL' },
      ],
    }],
    tourFlight: { enabled: false },
  })

  const assignment = result.companyAssignments[0]
  assert.equal(assignment.recordNumber, null)
  assert.equal(assignment.assignmentSource, 'missing-deviation-record')
  assert.equal(assignment.reviewRequired, true)
  assert.match(assignment.reviewReason, /returns via EWR/)
  assert.match(assignment.reviewReason, /no separate deviation record/i)
  assert.match(assignment.reviewReason, /merely because it connects through EWR/i)
})

test('keeps explicitly comment-linked travelers together during fare filling', () => {
  const makeMatch = (travelerNumber, name, relationshipClues = []) => ({
    aevd: {
      travelerName: name,
      reservationNumber: travelerNumber,
      airType: 'Company Air',
      departureCity: 'STL',
      commentAnalysis: { relationshipClues },
    },
    ppdt: { travelerNumber, displayName: name },
  })
  const linked = [{ strength: 'explicit', personText: 'Dana Companion' }]
  const result = assignFlightRecords({
    reconciliation: { matches: [
      makeMatch('1', 'Alex Lead', linked),
      makeMatch('2', 'Blake Solo'),
      makeMatch('3', 'Dana Companion'),
    ] },
    flightRecords: [
      { recordNumber: 4, passengerCount: 1, totalPerPassenger: 100, routing: 'STL-FRA/MXP-STL', sourceHeader: 'Record 4: 1 Passenger / STL-FRA / MXP-STL Delta' },
      { recordNumber: 7, passengerCount: 3, totalPerPassenger: 200, routing: 'STL-FRA/MXP-STL', sourceHeader: 'Record 7: 3 Passengers / STL-FRA / MXP-STL United' },
    ],
    tourFlight: { enabled: false },
  })

  assert.deepEqual(result.companyAssignments.map((item) => item.recordNumber), [7, 4, 7])
})

test('does not count Own Air verification as a Company Air assignment review', () => {
  const result = assignFlightRecords({
    reconciliation: {
      matches: [{ aevd: { travelerName: 'Own Air Traveler', airType: 'Own Air', departureCity: 'YVR' } }],
    },
    flightRecords: [{ recordNumber: 1, passengerCount: 10, routing: 'ORD-YYC/YVR-ORD' }],
    tourFlight: { enabled: false },
  })
  assert.equal(result.companyAssignments[0].reviewRequired, true)
  assert.equal(result.summary.companyNeedsReview, 0)
})

test('proposes the sole contract record for a Company Air positioning traveler', () => {
  const match = {
    aevd: { travelerName: 'Positioning Traveler', airType: 'Company Air', departureCity: 'ORD' },
  }
  const result = assignFlightRecords({
    reconciliation: { matches: [match] },
    flightRecords: [{ recordNumber: 1, passengerCount: 29, routing: 'JFK-CMN-JFK' }],
    tourFlight: { enabled: false },
  })
  assert.equal(result.companyAssignments[0].recordNumber, 1)
  assert.equal(result.companyAssignments[0].assignmentType, 'company-air-deviation')
  assert.equal(result.companyAssignments[0].reviewRequired, true)
  assert.equal(result.summary.companyAssigned, 1)
  assert.equal(result.summary.companyNeedsReview, 1)
})

test('does not assign a traveler at an intermediate airport after the ticket origin', () => {
  const match = {
    aevd: { travelerName: 'Elsie Rose Starling', airType: 'Company Air', departureCity: 'ORD' },
  }
  const result = assignFlightRecords({
    reconciliation: { matches: [match] },
    flightRecords: [
      {
        recordNumber: 1,
        passengerCount: 1,
        routing: 'STL-FRA/MXP-STL',
        flights: [{ departureAirport: 'STL', arrivalAirport: 'ATL' }, { departureAirport: 'ATL', arrivalAirport: 'FRA' }],
      },
      {
        recordNumber: 2,
        passengerCount: 8,
        routing: 'STL-FRA/MXP-STL',
        flights: [{ departureAirport: 'STL', arrivalAirport: 'ORD' }, { departureAirport: 'ORD', arrivalAirport: 'FRA' }],
      },
    ],
    tourFlight: { enabled: false },
  })

  assert.equal(result.companyAssignments[0].recordNumber, null)
  assert.equal(result.companyAssignments[0].assignmentSource, 'intermediate-airport-conflict')
  assert.equal(result.companyAssignments[0].reviewRequired, true)
  assert.match(result.companyAssignments[0].reviewReason, /Departure gateway: ORD/)
  assert.match(result.companyAssignments[0].reviewReason, /R2 starts in STL/)
  assert.match(result.companyAssignments[0].reviewReason, /separate ORD-origin ticket record is required/i)
})

test('uses the Company Air gateway even when Centaur includes a separate arrival add-on', () => {
  const result = assignFlightRecords({
    reconciliation: { matches: [{
      aevd: {
        travelerName: 'Regional Add-On Traveler',
        airType: 'Company Air',
        arrivalCity: 'STL',
        arrivalAirline: 'AA',
        arrivalFlightNumber: '1234',
        arrivalDate: '12/06/2026',
        arrivalTime: '7:45AM',
        departureCity: 'STL',
      },
    }] },
    flightRecords: [{ recordNumber: 2, passengerCount: 8, routing: 'STL-FRA/MXP-STL' }],
    tourFlight: { enabled: false },
  })

  assert.equal(result.companyAssignments[0].recordNumber, 2)
  assert.equal(result.companyAssignments[0].assignmentType, 'company-air')
  assert.equal(result.companyAssignments[0].reviewRequired, false)
})

test('handles mixed air arrangements without treating Own Air as contracted', () => {
  const makeMatch = (departureCity, airType = 'Company Air', index = 0) => ({
    aevd: { travelerName: `Traveler ${index}`, departureCity, airType },
    ppdt: { travelerNumber: String(index) },
  })
  const matches = [
    ...Array.from({ length: 18 }, (_, index) => makeMatch('JFK', 'Company Air', index)),
    ...Array.from({ length: 7 }, (_, index) => makeMatch('NYC', 'Company Air', 18 + index)),
    makeMatch('ORD', 'Company Air', 25),
    makeMatch('OWN', 'Own Air', 26),
  ]
  const result = assignFlightRecords({
    reconciliation: { matches },
    flightRecords: [{ recordNumber: 1, passengerCount: 29, routing: 'JFK-CMN-JFK' }],
    tourFlight: { enabled: false },
  })
  assert.equal(result.summary.companyAssigned, 26)
  assert.equal(result.summary.ownAir, 1)
  assert.equal(result.summary.companyNeedsReview, 1)
  assert.equal(result.companyRecordStatus[0].openSeats, 3)
})
