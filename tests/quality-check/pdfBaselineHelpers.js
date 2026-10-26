import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { ticketDataFromPositionedPages } from '../../src/features/quality-check/ticketPdfParser.js'

// Real PDF generation/extraction, without writing documents or traveler data to disk.
export async function parsePdfBytes(bytes, options = {}) {
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 })
  try {
    const pdf = await task.promise
    const pages = []
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number)
      pages.push({ width: page.getViewport({ scale: 1 }).width, items: (await page.getTextContent()).items })
    }
    return { pageCount: pdf.numPages, pages, data: ticketDataFromPositionedPages(pages, options) }
  } finally {
    await task.destroy()
  }
}

export async function syntheticPdf(pages, { fontSize = 9 } = {}) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (const lines of pages) {
    const page = pdf.addPage([600, 800])
    for (const [text, x, y] of lines) page.drawText(text, { x, y, size: fontSize, font })
  }
  return pdf.save()
}

export const heading = ['ABC123 ZZ · 4 Passengers', 25, 750]
export const flights = [
  ['Sample Air 101 DEPARTING (SEA)', 25, 710], ['ARRIVING (JFK)', 25, 695],
  ['Sample Air 102 DEPARTING (JFK)', 25, 670], ['ARRIVING (SEA)', 25, 655],
]
export const passengers = [
  ['REEF/ADA IRIS 001-1234567890', 25, 550], ['Seats: 12A, 14C', 25, 535],
  ['SHOAL/BEN LEE 001-1234567891', 25, 500], ['Seats: 12B, 14D', 25, 485],
  ['CORAL/CORA MAY 001-1234567892', 325, 550], ['Seats: 12C, 14E', 325, 535],
  ['TIDE/DAN RAY 001-1234567893', 325, 500], ['Seats: 12D, 14F', 325, 485],
]

export function assignments(data) {
  return data.travelers.map((traveler) => ({
    name: traveler.ticketName,
    ticket: traveler.ticketNumber,
    record: traveler.recordIndex,
    flights: traveler.flightIndexes.map((index) => data.flights[index].label),
    seats: traveler.seats,
  })).sort((a, b) => a.name.localeCompare(b.name))
}
