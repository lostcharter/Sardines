import { ticketDataFromDocuments } from './ticketDocumentParser.js'

const clean = (value) => String(value ?? '').trim()

// Line-only compatibility helpers. PDF ingestion below uses positioned evidence.
function normalizeSpacedLabels(value) {
  return clean(value)
    .replace(/D\s*E\s*P\s*A\s*R\s*T\s*I\s*N\s*G/gi, 'DEPARTING')
    .replace(/A\s*R\s*R\s*I\s*V\s*I\s*N\s*G/gi, 'ARRIVING')
}

export function ticketFlightsFromLines(lines) {
  const flights = []
  let pending = null
  lines.map(normalizeSpacedLabels).forEach((line) => {
    const departure = line.match(/^(.+?)\s+(\d{1,4})\s+DEPARTING\s+\(([^)]+)\)/i)
    if (departure) {
      pending = {
        airline: clean(departure[1]),
        flightNumber: clean(departure[2]),
        departureAirport: clean(departure[3]).toUpperCase(),
      }
      return
    }
    const arrival = line.match(/ARRIVING\s+\(([^)]+)\)/i)
    if (arrival && pending) {
      flights.push({
        ...pending,
        arrivalAirport: clean(arrival[1]).toUpperCase(),
        label: `${pending.departureAirport} → ${clean(arrival[1]).toUpperCase()}`,
      })
      pending = null
    }
  })
  return flights
}

const passengerLineMatch = (line) => clean(line).match(/^(.+?\/[A-Z][A-Z .'-]+?)\s+(\d{3}-?\d{8,12}(?:-\d{2})?)$/i)

export function ticketTravelersFromColumnLines(lines) {
  const travelers = []
  let current = null
  lines.forEach((line) => {
    const passenger = passengerLineMatch(line)
    if (passenger) {
      current = {
        ticketName: clean(passenger[1]).toUpperCase(),
        ticketNumber: clean(passenger[2]),
        seats: [],
      }
      travelers.push(current)
      return
    }
    const seats = clean(line).match(/^Seats?:\s*(.+)$/i)
    if (seats && current) {
      current.seats = seats[1].split(/\s*,\s*/).map((seat) => clean(seat).toUpperCase()).filter(Boolean)
    }
  })
  return travelers
}

export function ticketDataFromPositionedPages(pages, options = {}) {
  return ticketDataFromDocuments([{ pages, name: options.sourceDocument }])
}

async function readTicketDocument(file) {
  const [pdfjsLib, workerModule] = await Promise.all([
    import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default
  const task = pdfjsLib.getDocument({ data: await file.arrayBuffer() })
  try {
    const pdf = await task.promise
    const pages = []
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number)
      pages.push({ width: page.getViewport({ scale: 1 }).width, items: (await page.getTextContent()).items })
    }
    return { name: file.name, pages }
  } finally {
    await task.destroy()
  }
}

export async function parseTicketPdfs(files) {
  const inputs = [...files]
  const results = await Promise.allSettled(inputs.map(readTicketDocument))
  const data = ticketDataFromDocuments(results.filter((result) => result.status === 'fulfilled').map((result) => result.value))
  results.forEach((result, index) => {
    if (result.status === 'rejected') data.issues.push({ code: 'unreadable-document', severity: 'review',
      message: `${inputs[index].name}: the PDF could not be read. ${result.reason instanceof Error ? result.reason.message : 'Review the original document.'}`, sources: [] })
  })
  return data
}

export async function parseTicketPdf(file) {
  return parseTicketPdfs([file])
}
