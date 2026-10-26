import { normalizeSeatLabel } from './seatLayout.js'
import { layoutSectionsForSeats, sectionForSeat } from './layoutSections.js'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const clean = (value) => String(value ?? '').trim()
const xml = (value) => [...clean(value)].filter((letter) => letter.charCodeAt(0) >= 32 || '\t\r\n'.includes(letter)).join('').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function columnName(number) {
  let value = number
  let result = ''
  while (value > 0) { value -= 1; result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26) }
  return result
}

function travelerStatus(rows) {
  const order = ['conflict', 'unresolved', 'unmatched', 'unassigned', 'request-unmet', 'verify', 'unable-to-verify', 'request-satisfied', 'no-request']
  return order.find((status) => rows.some((row) => row.status === status)) ?? 'no-request'
}

export function compactSeatMapRows(firstRow, lastRow, occupiedRows) {
  if (!Number.isFinite(firstRow) || !Number.isFinite(lastRow)) return []
  const occupied = new Set(occupiedRows)
  const display = []
  let rowNumber = firstRow
  while (rowNumber <= lastRow) {
    if (occupied.has(rowNumber)) {
      display.push({ type: 'row', rowNumber })
      rowNumber += 1
      continue
    }
    const gapStart = rowNumber
    while (rowNumber <= lastRow && !occupied.has(rowNumber)) rowNumber += 1
    const gapEnd = rowNumber - 1
    if (gapEnd - gapStart + 1 < 5) {
      for (let emptyRow = gapStart; emptyRow <= gapEnd; emptyRow += 1) display.push({ type: 'row', rowNumber: emptyRow })
    } else {
      display.push({ type: 'row', rowNumber: gapStart })
      display.push({ type: 'gap', firstRow: gapStart + 1, lastRow: gapEnd - 1 })
      display.push({ type: 'row', rowNumber: gapEnd })
    }
  }
  return display
}

function returnedOnlyMapRows(result, flightIndex) {
  return result.unmatchedTickets.flatMap((ticket) => {
    const localIndex = ticket.flightIndexes?.indexOf(flightIndex) ?? -1
    if (localIndex < 0 || ticket.associationStatus === 'unresolved') return []
    const ticketName = clean(ticket.ticketName)
    const [lastName = ticketName, given = ''] = ticketName.split('/', 2)
    const displayName = [given, lastName].filter(Boolean).join(' ')
    const assignments = ticket.assignments?.filter((assignment) => assignment.flightIndex === flightIndex) || [{ seat: ticket.seats?.[localIndex] }]
    return assignments.filter((assignment) => assignment.seat).map((assignment) => {
      const critical = (result.issues || []).find((issue) => issue.severity === 'critical' && ((issue.flightIndex === flightIndex && (issue.seat === normalizeSeatLabel(assignment.seat) || issue.ticketName === ticket.ticketName)) || issue.ticketNames?.includes(ticket.ticketName)))
      return {
        traveler: { displayName, lastName, requests: '' }, ticket,
        flight: result.flights[flightIndex], flightIndex,
        seat: normalizeSeatLabel(assignment.seat), status: critical ? 'conflict' : 'unmatched',
        sources: assignment.sources || ticket.sources || [],
        message: critical?.message || 'Returned ticket was not found on the submitted manifest.', returnedOnly: true,
      }
    })
  })
}

const statusText = {
  conflict: 'CRITICAL — conflicting ticket assignments', unresolved: 'REVIEW — assignment not interpreted', unmatched: 'REVIEW — ticket not matched', unassigned: 'REVIEW — seat not assigned',
  'request-unmet': 'REVIEW — request not satisfied', verify: 'REVIEW — verify request', 'unable-to-verify': 'REVIEW — not verifiable from seat',
  'request-satisfied': 'OK', 'no-request': 'NO SEAT REQUEST',
}

export function qualityCheckWorkbookModel(result) {
  const maps = result.flights.map((flight, flightIndex) => {
    const rows = [...result.rows.filter((row) => row.flightIndex === flightIndex), ...returnedOnlyMapRows(result, flightIndex)]
    const assigned = rows.filter((row) => row.seat)
    const sections = layoutSectionsForSeats(assigned.map((row) => row.seat), result.layoutSections?.[flightIndex] || [])
    const layout = sections[0].layout
    const ownersBySeat = new Map()
    assigned.forEach((row) => ownersBySeat.set(row.seat, [...(ownersBySeat.get(row.seat) || []), row]))
    const bySeat = new Map([...ownersBySeat].map(([seat, owners]) => [seat, owners.length === 1 ? owners[0] : {
      ...owners[0], owners, status: 'conflict',
      traveler: { ...owners[0].traveler, displayName: owners.map((owner) => owner.traveler.displayName).join(' / '), lastName: owners.map((owner) => owner.traveler.lastName).join(' / ') },
      message: `CRITICAL: ${seat} has multiple owners: ${owners.map((owner) => owner.traveler.displayName).join('; ')}. Verify with the ticket provider.`,
    }]))
    const outsideDiagram = assigned.filter((row) => !sectionForSeat(sections, row.seat)?.layout.flat().includes(row.seat.match(/[A-Z]+$/i)?.[0]))
    const rowNumbers = assigned.map((row) => Number.parseInt(row.seat, 10)).filter(Number.isFinite)
    const firstRow = Math.min(...rowNumbers)
    const lastRow = Math.max(...rowNumbers)
    const hasAssignedSeats = assigned.length > 0
    const displayRows = hasAssignedSeats ? compactSeatMapRows(firstRow, lastRow, rowNumbers) : [1, 2, 3].map((rowNumber) => ({ type: 'row', rowNumber }))
    sections.forEach((section) => { section.displayRows = compactSeatMapRows(section.firstRow, section.lastRow, rowNumbers) })
    return { flight, flightIndex, rows, layout, sections, bySeat, outsideDiagram, firstRow, lastRow, hasAssignedSeats, displayRows, geometryIsInferred: sections.some((section) => !section.confirmed) }
  })
  const travelers = [...new Set(result.rows.map((row) => row.traveler))]
  const review = travelers.map((traveler) => {
    const rows = result.rows.filter((row) => row.traveler === traveler)
    return {
      traveler: `${traveler.lastName}, ${[traveler.firstName, traveler.middleName].filter(Boolean).join(' ')}`,
      seats: result.flights.map((_, index) => [...new Set(rows.filter((row) => row.flightIndex === index).map((row) => row.seat))].join(' / ')),
      request: traveler.requests,
      status: statusText[travelerStatus(rows)],
      notes: [...new Set(rows.map((row) => row.message).filter(Boolean))].join(' '),
    }
  })
  const missedRequests = result.rows.filter((row) => row.status === 'request-unmet').map((row) => ({
    traveler: row.traveler.displayName,
    flight: `${row.flight.departureAirport} → ${row.flight.arrivalAirport}`,
    seat: row.seat,
    request: row.traveler.requests,
    reason: row.message,
  }))
  const issues = result.rows.filter((row) => ['conflict', 'unresolved', 'unmatched', 'unassigned'].includes(row.status))
  const unplacedRows = result.rows.filter((row) => row.flightIndex === null)
  return { maps, review, missedRequests, issues, unplacedRows, diagnostics: result.issues || [], unmatchedTickets: result.unmatchedTickets }
}

function cell(ref, value, style = 0) {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
}

function sheetXml(rows, widths, merges = [], freeze = '', hasNotes = false) {
  const maxColumn = Math.max(1, ...rows.flatMap((row) => row.cells.map((item) => item.column)))
  const maxRow = Math.max(1, ...rows.map((row) => row.number))
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')
  const data = rows.map((row) => `<row r="${row.number}"${row.height ? ` ht="${row.height}" customHeight="1"` : ''}>${row.cells.sort((a, b) => a.column - b.column).map((item) => cell(`${columnName(item.column)}${row.number}`, item.value, item.style)).join('')}</row>`).join('')
  const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : ''
  const pane = freeze ? `<pane ySplit="1" topLeftCell="${freeze}" activePane="bottomLeft" state="frozen"/>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${columnName(maxColumn)}${maxRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${cols}</cols><sheetData>${data}</sheetData>${mergeXml}${hasNotes ? '<legacyDrawing r:id="rId2"/>' : ''}</worksheet>`
}

function mapSheet(map) {
  const title = `${map.flight.departureAirport} → ${map.flight.arrivalAirport} · ${map.flight.airline} ${map.flight.flightNumber} · ${map.flight.departureDate || 'Date unconfirmed'}`
  const columnsFor = (layout) => {
    let column = 2
    return layout.flatMap((group, index) => {
      if (index) column += 1
      return group.map((letter) => { const seat = { letter, column }; column += 3; return seat })
    })
  }
  const maxWidth = Math.max(...map.sections.map((section) => columnsFor(section.layout).at(-1).column + 2))
  const notes = []
  const rows = [
    { number: 1, height: 28, cells: [{ column: 1, value: `${map.geometryIsInferred ? 'INFERRED / PARTLY REVIEWED' : 'REVIEWED'} SEAT MAP · ${title}`, style: 1 }] },
    { number: 2, height: 36, cells: [{ column: 1, value: 'Ticketed assignments are factual. Section layouts are marked reviewed or inferred. Blank seats show no group assignment, not availability.', style: 2 }] },
  ]
  const merges = [`A1:${columnName(maxWidth)}1`, `A2:${columnName(maxWidth)}2`]
  const append = (cells, height = 42) => { const number = rows.at(-1).number + 1; rows.push({ number, height, cells }); return number }
  for (const section of map.sections) {
    append([], 12)
    const heading = append([{ column: 1, value: `${section.label || 'Section'} · Rows ${section.firstRow}–${section.lastRow} · ${section.pattern} · ${section.confirmed ? 'REVIEWED' : 'INFERRED — REVIEW'} · ${section.letters}`, style: section.confirmed ? 3 : 7 }], 30)
    merges.push(`A${heading}:${columnName(maxWidth)}${heading}`)
    const columns = columnsFor(section.layout)
    const lettersRow = append([{ column: 1, value: 'Row', style: 3 }, ...columns.map(({ letter, column }) => ({ column, value: letter, style: 3 }))], 24)
    columns.forEach(({ column }) => merges.push(`${columnName(column)}${lettersRow}:${columnName(column + 2)}${lettersRow}`))
    for (const displayRow of section.displayRows) {
      if (displayRow.type === 'gap') {
        const number = append([{ column: 1, value: `Rows ${displayRow.firstRow}–${displayRow.lastRow} not shown · no group assignments`, style: 2 }], 24)
        merges.push(`A${number}:${columnName(maxWidth)}${number}`)
        continue
      }
      const cells = [{ column: 1, value: displayRow.rowNumber, style: 3 }]
      let height = 50
      const number = rows.at(-1).number + 1
      columns.forEach(({ letter, column }) => {
        const assignment = map.bySeat.get(`${displayRow.rowNumber}${letter}`)
        if (assignment?.owners) height = Math.max(height, 28 + assignment.owners.length * 28)
        const problem = assignment && ['conflict', 'unmatched', 'unassigned', 'request-unmet'].includes(assignment.status)
        const style = !assignment ? 4 : assignment.status === 'conflict' ? 9 : problem ? 6 : ['no-request', 'request-satisfied'].includes(assignment.status) ? 5 : 7
        cells.push({ column, value: assignment ? `${assignment.seat}\n${assignment.traveler.displayName}${assignment.status === 'conflict' ? '\nCRITICAL CONFLICT' : ''}` : '', style })
        merges.push(`${columnName(column)}${number}:${columnName(column + 2)}${number}`)
        if (assignment) notes.push({ ref: `${columnName(column)}${number}`, text: `${assignment.traveler.displayName}\n${assignment.traveler.requests || 'No submitted seat request'}\n${assignment.message}` })
      })
      append(cells, height)
    }
  }
  if (!map.hasAssignedSeats) append([{ column: 1, value: 'Seats not yet assigned', style: 7 }])
  const missed = [...map.bySeat.values()].filter((row) => row.status === 'request-unmet')
  if (missed.length) {
    append([{ column: 1, value: 'Requests that missed the mark', style: 1 }])
    missed.forEach((row) => {
      const number = append([{ column: 1, value: `${row.traveler.displayName} · ${row.seat} — ${row.message}`, style: 6 }])
      merges.push(`A${number}:${columnName(maxWidth)}${number}`)
    })
  }
  if (map.outsideDiagram.length) {
    const heading = append([{ column: 1, value: 'Ticketed seats outside the inferred diagram / reviewed sections — assignments retained; review layout', style: 1 }])
    merges.push(`A${heading}:${columnName(maxWidth)}${heading}`)
    map.outsideDiagram.forEach((row) => {
      const number = append([{ column: 1, value: `${row.seat} · ${row.traveler.displayName} — ${row.message}`, style: row.status === 'conflict' ? 9 : 7 }])
      merges.push(`A${number}:${columnName(maxWidth)}${number}`)
    })
  }
  // Three narrow columns per seat, one per aisle: sections can have different
  // patterns while keeping every aisle visibly narrower than its seat blocks.
  return { xml: sheetXml(rows, [7, ...Array(maxWidth - 1).fill(5)], merges, '', notes.length > 0), notes }
}

function commentsXml(notes) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>Sardines</author></authors><commentList>${notes.map((note) => `<comment ref="${note.ref}" authorId="0"><text><r><rPr><b/><sz val="10"/></rPr><t>${xml(note.text)}</t></r></text></comment>`).join('')}</commentList></comments>`
}

function vmlXml(notes) {
  const shapes = notes.map((note, index) => {
    const match = note.ref.match(/^([A-Z]+)(\d+)$/)
    let column = 0
    for (const letter of match[1]) column = column * 26 + letter.charCodeAt(0) - 64
    const row = Number(match[2]) - 1
    return `<v:shape id="_x0000_s${1025 + index}" type="#_x0000_t202" style="position:absolute;visibility:hidden;width:240pt;height:90pt" fillcolor="#fff4cf" o:insetmode="auto"><v:fill color2="#fff4cf"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"/></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${column - 1}, 15, ${row}, 2, ${column + 2}, 15, ${row + 4}, 4</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${row}</x:Row><x:Column>${column - 1}</x:Column></x:ClientData></v:shape>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>${shapes}</xml>`
}

function summarySheet(model, result) {
  const totalAssignments = result.rows.length
  const satisfied = result.rows.filter((row) => row.status === 'request-satisfied').length
  const critical = model.diagnostics.filter((issue) => issue.severity === 'critical').length
  const pending = model.issues.length || model.diagnostics.length
  const summaryMessage = critical ? `${critical} CRITICAL ticket conflicts require review.` : pending ? 'Unresolved ticket or seat evidence requires review; results are not cleared.' : model.missedRequests.length ? `${model.missedRequests.length} seat requests missed the mark.` : 'No definite missed requests detected; check layout-dependent requests in Review.'
  const rows = [
    { number: 1, height: 34, cells: [{ column: 1, value: 'Sardines Quality Check', style: 1 }] },
    { number: 2, height: 28, cells: [{ column: 1, value: summaryMessage, style: critical ? 9 : pending || model.missedRequests.length ? 6 : 7 }] },
    { number: 4, cells: [{ column: 1, value: 'Travelers submitted', style: 3 }, { column: 2, value: result.summary?.submitted ?? new Set(result.rows.map((row) => row.traveler)).size, style: 8 }] },
    { number: 5, cells: [{ column: 1, value: 'Actual flights checked', style: 3 }, { column: 2, value: result.flights.length, style: 8 }] },
    { number: 6, cells: [{ column: 1, value: 'Traveler-flight assignments', style: 3 }, { column: 2, value: totalAssignments, style: 8 }] },
    { number: 7, cells: [{ column: 1, value: 'Requests confirmed satisfied', style: 3 }, { column: 2, value: satisfied, style: 5 }] },
    { number: 8, cells: [{ column: 1, value: 'Requests not satisfied', style: 3 }, { column: 2, value: model.missedRequests.length, style: model.missedRequests.length ? 6 : 5 }] },
    { number: 10, cells: [{ column: 1, value: 'Traveler', style: 3 }, { column: 2, value: 'Flight', style: 3 }, { column: 3, value: 'Seat', style: 3 }, { column: 4, value: 'Submitted request', style: 3 }, { column: 5, value: 'What missed', style: 3 }] },
  ]
  if (!model.missedRequests.length) rows.push({ number: 11, cells: [{ column: 1, value: 'No missed requests found by the current checks.', style: 5 }] })
  model.missedRequests.forEach((item, index) => rows.push({ number: index + 11, height: 46, cells: [item.traveler, item.flight, item.seat, item.request, item.reason].map((value, column) => ({ column: column + 1, value, style: 6 })) }))
  return sheetXml(rows, [30, 18, 10, 58, 52], ['A1:E1', 'A2:E2'], 'A11')
}

export function combinedReviewSheet(model) {
  const flightHeaders = model.maps.map((map) => `${map.flight.departureAirport} → ${map.flight.arrivalAirport}`)
  const headers = ['Passenger', 'Submitted request', ...flightHeaders, 'Overall review']
  const rows = [{ number: 1, height: 32, cells: headers.map((value, index) => ({ column: index + 1, value, style: 3 })) }]
  const notes = []
  const reviewPeople = [...new Map([...model.maps.flatMap((map) => map.rows), ...(model.unplacedRows || [])].map((item) => [item.returnedOnly ? item.ticket : item.traveler, item.traveler])).entries()]
    .sort((left, right) => clean(left[1].lastName).localeCompare(clean(right[1].lastName)) || clean(left[1].firstName).localeCompare(clean(right[1].firstName)) || clean(left[1].displayName).localeCompare(clean(right[1].displayName)))
  reviewPeople.forEach(([personKey, traveler], index) => {
    const sheetRow = index + 2
    const travelerRows = model.maps.map((map) => map.rows.find((item) => (item.returnedOnly ? item.ticket : item.traveler) === personKey))
    const availableRows = [...travelerRows.filter(Boolean), ...(model.unplacedRows || []).filter((item) => item.traveler === traveler)]
    const overallStatus = travelerStatus(availableRows)
    const overallStyle = ['conflict', 'unmatched', 'unassigned', 'request-unmet'].includes(overallStatus) ? 6 : ['request-satisfied', 'no-request'].includes(overallStatus) ? 5 : 7
    const cells = [{ column: 1, value: traveler.displayName, style: 8 }, { column: 2, value: traveler.requests, style: 8 }]
    travelerRows.forEach((item, flightIndex) => {
      const column = flightIndex + 3
      if (!item) {
        cells.push({ column, value: '—', style: 4 })
        return
      }
      const style = ['conflict', 'unmatched', 'unassigned', 'request-unmet'].includes(item.status) ? 6 : ['request-satisfied', 'no-request'].includes(item.status) ? 5 : 7
      const allItems = model.maps[flightIndex].rows.filter((row) => (row.returnedOnly ? row.ticket : row.traveler) === personKey)
      cells.push({ column, value: [...new Set(allItems.map((row) => row.seat || (row.status === 'unresolved' ? 'Not interpreted' : 'No seat')))].join(' / '), style })
      if (!['request-satisfied', 'no-request'].includes(item.status)) notes.push({ ref: `${columnName(column)}${sheetRow}`, text: `${traveler.displayName}\n${flightHeaders[flightIndex]}\n${item.message}` })
    })
    cells.push({ column: headers.length, value: statusText[overallStatus] ?? overallStatus, style: overallStyle })
    rows.push({ number: sheetRow, height: 42, cells })
  })
  return { xml: sheetXml(rows, [30, 58, ...model.maps.map(() => 16), 28], [], 'A2', notes.length > 0), notes }
}

function legendSheet() {
  return sheetXml([
    { number: 1, height: 28, cells: [{ column: 1, value: 'Quality Check Legend', style: 1 }] },
    { number: 3, cells: [{ column: 1, value: 'Green', style: 5 }, { column: 2, value: 'No seat issue detected by the current checks.', style: 8 }] },
    { number: 4, cells: [{ column: 1, value: 'Red', style: 6 }, { column: 2, value: 'Ticket, seat, or duplicate assignment needs review.', style: 8 }] },
    { number: 5, cells: [{ column: 1, value: 'Yellow', style: 7 }, { column: 2, value: 'Placement differs from the literal request but may be operationally acceptable; reviewer decides.', style: 8 }] },
    { number: 7, cells: [{ column: 1, value: 'Current limits', style: 3 }, { column: 2, value: 'Aircraft-specific geometry and less-structured proximity requests still require human review.', style: 8 }] },
  ], [18, 100], ['A1:B1'])
}

function evidenceSheet(model, result) {
  const headers = ['Severity / kind', 'Passenger', 'Flight', 'Seat', 'Finding', 'Source document', 'Page', 'Position (PDF coordinates)', 'Source text']
  const rows = [{ number: 1, height: 30, cells: headers.map((value, index) => ({ column: index + 1, value, style: 3 })) }]
  const append = (values, style) => rows.push({ number: rows.length + 1, height: 48, cells: values.map((value, index) => ({ column: index + 1, value, style })) })
  for (const issue of model.diagnostics) {
    const flight = result.flights[issue.flightIndex]
    for (const source of issue.sources?.length ? issue.sources : [{}]) append([
      issue.severity === 'critical' ? 'CRITICAL' : 'REVIEW', issue.ticketName || '',
      flight ? `${flight.departureDate || 'Date unknown'} · ${flight.airline} ${flight.flightNumber} · ${flight.label}` : '', issue.seat || '', issue.message,
      source.document || '', source.page || '', source.x === undefined ? '' : `${Math.round(source.x)}, ${Math.round(source.y)}`, source.text || '',
    ], issue.severity === 'critical' ? 9 : 7)
  }
  for (const row of result.rows) {
    for (const source of row.sources?.length ? row.sources : [{}]) append([
      row.status === 'conflict' ? 'CRITICAL' : row.status === 'unresolved' ? 'REVIEW' : 'Assignment evidence', row.traveler.displayName,
      row.flightIndex === null ? 'Not established' : `${row.flight.departureDate || 'Date unknown'} · ${row.flight.airline || ''} ${row.flight.flightNumber || ''} · ${row.flight.label || ''}`,
      row.seat || '', row.message, source.document || '', source.page || '', source.x === undefined ? '' : `${Math.round(source.x)}, ${Math.round(source.y)}`, source.text || '',
    ], row.status === 'conflict' ? 9 : 8)
  }
  for (const ticket of model.unmatchedTickets) {
    for (const source of ticket.sources || []) append(['REVIEW', ticket.ticketName, '', ticket.seats.join(', '), 'Returned ticket not uniquely matched to the submitted manifest.', source.document, source.page, `${Math.round(source.x)}, ${Math.round(source.y)}`, source.text], 7)
  }
  return sheetXml(rows, [22, 30, 42, 12, 62, 45, 8, 25, 70], [], 'A2')
}

const uint16 = (v) => new Uint8Array([v & 255, (v >>> 8) & 255])
const uint32 = (v) => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255])
function concat(parts) { const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; parts.forEach((part) => { out.set(part, offset); offset += part.length }); return out }
const crcTable = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0 } return table })()
function crc32(bytes) { let crc = 0xffffffff; bytes.forEach((byte) => { crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8) }); return (crc ^ 0xffffffff) >>> 0 }
async function zip(files) {
  const encoder = new TextEncoder(); const locals = []; const centrals = []; let offset = 0
  for (const [name, text] of files) {
    const nameBytes = encoder.encode(name); const data = encoder.encode(text); const compressed = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); const crc = crc32(data)
    const local = concat([uint32(0x04034b50), uint16(20), uint16(0), uint16(8), uint16(0), uint16(0), uint32(crc), uint32(compressed.length), uint32(data.length), uint16(nameBytes.length), uint16(0), nameBytes])
    locals.push(local, compressed)
    centrals.push(concat([uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(8), uint16(0), uint16(0), uint32(crc), uint32(compressed.length), uint32(data.length), uint16(nameBytes.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), nameBytes]))
    offset += local.length + compressed.length
  }
  const central = concat(centrals); return concat([...locals, central, uint32(0x06054b50), uint16(0), uint16(0), uint16(files.length), uint16(files.length), uint32(central.length), uint32(offset), uint16(0)])
}

export async function buildQualityCheckWorkbook(result) {
  const model = qualityCheckWorkbookModel(result)
  const mapSheets = model.maps.map((map) => mapSheet(map))
  const mapNames = model.maps.map((map, index) => `${map.flight.departureAirport}-${map.flight.arrivalAirport}-${index + 1} Map`)
  const sheets = [{ xml: summarySheet(model, result), notes: [] }, ...mapSheets, combinedReviewSheet(model), { xml: legendSheet(), notes: [] }, { xml: evidenceSheet(model, result), notes: [] }]
  const names = ['Summary', ...mapNames, 'Review', 'Legend', 'Evidence']
  const workbookSheets = names.map((name, index) => `<sheet name="${xml(name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')
  const relationships = names.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')
  const overrides = names.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  const commentOverrides = sheets.map((sheet, index) => sheet.notes.length ? `<Override PartName="/xl/comments${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>` : '').join('')
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="16"/><color rgb="FF9E2D29"/><name val="Aptos Display"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF9E2D29"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBD9"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8DAD5"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4CF"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="10"><xf/><xf fontId="1" applyFont="1"/><xf applyAlignment="1"><alignment wrapText="1"/></xf><xf fontId="2" fillId="2" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf borderId="1" applyBorder="1"/><xf fillId="3" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf fillId="4" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf fillId="5" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf borderId="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf fontId="2" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
  const noteFiles = sheets.flatMap((sheet, index) => sheet.notes.length ? [
    [`xl/comments${index + 1}.xml`, commentsXml(sheet.notes)],
    [`xl/drawings/vmlDrawing${index + 1}.vml`, vmlXml(sheet.notes)],
    [`xl/worksheets/_rels/sheet${index + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments${index + 1}.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawing${index + 1}.vml"/></Relationships>`],
  ] : [])
  const files = [['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}${commentOverrides}</Types>`], ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`], ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`], ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`], ['xl/styles.xml', styles], ...sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, sheet.xml]), ...noteFiles]
  return new Blob([await zip(files)], { type: XLSX_TYPE })
}

export async function downloadQualityCheckWorkbook(result, filename = 'Sardines_Seat_Map_Review.xlsx') {
  const url = URL.createObjectURL(await buildQualityCheckWorkbook(result)); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
