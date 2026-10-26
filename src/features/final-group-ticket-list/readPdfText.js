import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import {
  parseFareBreakdown,
  parseExplicitContractRecord,
} from './contractRecordParser.js'
import {
  itineraryRouting,
  normalizeItineraryArrivalLine,
  primaryAirlineName,
} from './itineraryHeading.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

function clean(value) {
  return String(value ?? '').trim()
}

function groupTextItemsIntoLines(items) {
  const positionedItems = items
    .map((item) => {
      const transform = item.transform

      return {
        text: clean(item.str),
        x: transform?.[4] ?? 0,
        y: transform?.[5] ?? 0,
      }
    })
    .filter((item) => item.text)

  const lines = []

  for (const item of positionedItems) {
    let line = lines.find(
      (candidate) =>
        Math.abs(candidate.y - item.y) < 3
    )

    if (!line) {
      line = {
        y: item.y,
        items: [],
      }

      lines.push(line)
    }

    line.items.push(item)
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(' ')
        .trim()
    )
    .filter(Boolean)
}

function normalizeSpacedWord(value) {
  return clean(value)
    .replace(
      /D\s*E\s*P\s*A\s*R\s*T\s*I\s*N\s*G/gi,
      'DEPARTING'
    )
    .replace(
      /A\s*R\s*R\s*I\s*V\s*I\s*N\s*G/gi,
      'ARRIVING'
    )
}

function parseItineraryRecord(line) {
  const text = clean(line)

  const match = text.match(
    /^(.+?)\s+([A-Z]{2})\s*[·•]\s*(\d+)\s+Passengers?$/i
  )

  if (!match) {
    return null
  }

  const references = match[1]
    .split(/[·•]/)
    .map((value) => value.trim())
    .filter(Boolean)

  return {
    recordNumber: null,

    passengerCount:
      Number(match[3]),

    routing: '',

    airlineCode:
      match[2].toUpperCase(),

    airlineName: '',

    references,

    reference:
      references.join(' · '),

    sourceFormat:
      'itinerary-record',

    sourceHeader: text,
  }
}

function parseRecordHeader(line) {
  return (
    parseExplicitContractRecord(line) ??
    parseItineraryRecord(line)
  )
}

function parseDepartureLine(line) {
  const text =
    normalizeSpacedWord(line)

  const match = text.match(
    /^(.+?)\s+(\d+)\s+DEPARTING\s+\(([^)]+)\)\s+(.+)$/i
  )

  if (!match) {
    return null
  }

  return {
    airlineAndFlight:
      `${clean(match[1])} ${clean(match[2])}`,

    departureAirport:
      clean(match[3]),

    departureText:
      clean(match[4]),
  }
}

function parseArrivalLine(line) {
  const text =
    normalizeItineraryArrivalLine(normalizeSpacedWord(line))

  const match = text.match(
    /^ARRIVING\s+\(([^)]+)\)\s+(.+)$/i
  )

  if (!match) {
    return null
  }

  return {
    arrivalAirport:
      clean(match[1]),

    arrivalText:
      clean(match[2]),
  }
}

function extractContractRecords(pages) {
  const records = []
  const fares = parseFareBreakdown(pages.flatMap((page) => page.lines))

  let currentRecord = null
  let pendingDeparture = null

  function finishCurrentRecord() {
    if (!currentRecord) {
      return
    }

    records.push(currentRecord)

    currentRecord = null
    pendingDeparture = null
  }

  pages.forEach((page) => {
    page.lines.forEach((line) => {
      const recordHeader =
        parseRecordHeader(line)

      if (recordHeader) {
        finishCurrentRecord()

        currentRecord = {
          ...recordHeader,
          flights: [],
        }

        return
      }

      if (!currentRecord) {
        return
      }

      const departure =
        parseDepartureLine(line)

      if (departure) {
        pendingDeparture =
          departure

        return
      }

      const arrival =
        parseArrivalLine(line)

      if (
        arrival &&
        pendingDeparture
      ) {
        currentRecord.flights.push({
          flight:
            pendingDeparture
              .airlineAndFlight,

          departureAirport:
            pendingDeparture
              .departureAirport,

          departureText:
            pendingDeparture
              .departureText,

          arrivalAirport:
            arrival.arrivalAirport,

          arrivalText:
            arrival.arrivalText,
        })

        pendingDeparture = null
      }
    })
  })

  finishCurrentRecord()

  return records.map(
    (record, index) => {
      const firstFlight =
        record.flights[0]

      const lastFlight =
        record.flights[
          record.flights.length - 1
        ]

      const inferredRouting = itineraryRouting(record.flights)

      return {
        ...record,

        ...(fares[record.recordNumber ?? index + 1] ?? {}),

        recordNumber:
          record.recordNumber ??
          index + 1,

        routing:
          record.routing ||
          inferredRouting,

        airlineName:
          record.airlineName ||
          primaryAirlineName(record.flights),

        departureAirport:
          firstFlight
            ?.departureAirport ??
          '',

        arrivalAirport:
          lastFlight
            ?.arrivalAirport ??
          '',

        reviewRequired: false,

        reviewReason: '',
      }
    }
  )
}

export async function readPdfText(
  file
) {
  const arrayBuffer =
    await file.arrayBuffer()

  const pdf =
    await pdfjsLib.getDocument({
      data: arrayBuffer,
    }).promise

  const pages = []

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber += 1
  ) {
    const page =
      await pdf.getPage(pageNumber)

    const textContent =
      await page.getTextContent()

    const lines =
      groupTextItemsIntoLines(
        textContent.items
      )

    pages.push({
      lines,
      text: lines.join('\n'),
    })
  }

  const text = pages
    .map((page) => page.text)
    .join('\n')

  return {
    pageCount: pdf.numPages,
    pages,
    text,
    records:
      extractContractRecords(pages),
  }
}
