import domesticFmgTemplateUrl from '../../assets/FMG_Domestic_Final_Names_List_Template.xlsx?url'
import internationalFmgTemplateUrl from '../../assets/FMG_International_Final_Names_List_Template.xlsx?url'
import { roommatesForMatch } from './roomingListParser'
import { buildUnfilledSeatMarkers } from './unfilledSeats'
import { selectedTourDirectorRecordNumbers } from './tourDirectorFlightRecords.js'
import { mergeTourDirectorExportAssignments } from './tourDirectorExportAssignments.js'
import { compareTravelerAssignments } from './travelerSorting.js'
import { manifestSpecialRequests } from './manifestSpecialRequests.js'
import { hasManualWorkbookCorrection, manualWorkbookNote } from './manualWorkbookReview.js'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const DOC_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const CONTENT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types'

function clean(value) { return String(value ?? '').trim() }
function normalize(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]/g, '') }
function xmlSafe(value) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
}

function safeMiddleName(match) {
  const analyzed = match?.identity?.middleName?.outputMiddleName
  if (analyzed !== undefined) return clean(analyzed)
  const raw = clean(match?.ppdt?.middleName)
  return raw.toUpperCase() === '(NMN)' ? '' : raw
}
function travelerName(match) {
  return clean(match?.ppdt?.displayName ?? match?.aevd?.travelerName ?? [match?.ppdt?.firstName ?? match?.aevd?.firstName, match?.ppdt?.middleName ?? match?.aevd?.middleName, match?.ppdt?.lastName ?? match?.aevd?.lastName].filter(Boolean).join(' ')) || 'Unknown traveler'
}
function reservationNumber(match) { return clean(match?.aevd?.reservationNumber ?? match?.ppdt?.reservationId) }
function travelerNumber(match) { return clean(match?.ppdt?.travelerNumber) }
function bestKtn(match) { return clean(match?.ppdt?.ktnRaw || match?.aevd?.ktnRaw) }
function travelerIdentityKey(match) {
  const number = travelerNumber(match)
  if (number) return `traveler:${number}`
  return `reservation:${reservationNumber(match)}|name:${normalize(travelerName(match))}`
}

function parseFlexibleDate(value) {
  const text = clean(value)
  if (!text) return null
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (m) {
    let year = Number(m[3])
    if (year < 100) year += year >= 50 ? 1900 : 2000
    return new Date(Date.UTC(year, Number(m[1]) - 1, Number(m[2])))
  }
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatMmDdYyyy(value) {
  const date = parseFlexibleDate(value)
  if (!date) return clean(value)
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${mm}/${dd}/${date.getUTCFullYear()}`
}

function contractReturnDateFromRecords(flightRecords, contractText = '') {
  const range = clean(contractText).match(
    /Travel\s+Dates\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i
  )
  if (range?.[2]) {
    const explicitReturn = parseFlexibleDate(range[2])
    if (explicitReturn) return explicitReturn
  }

  const dates = (flightRecords ?? [])
    .flatMap((record) => record.flights ?? [])
    .flatMap((flight) => [flight.arrivalDate, flight.departureDate])
    .map(parseFlexibleDate)
    .filter(Boolean)
  if (!dates.length) return null
  return new Date(Math.max(...dates.map((date) => date.getTime())))
}

function passportExpirationNeedsReview(expiration, flightRecords, tripType, contractText = '') {
  if (tripType !== 'international') return false
  const returnDate = contractReturnDateFromRecords(flightRecords, contractText)
  const expires = parseFlexibleDate(expiration)
  if (!expires) return true
  if (!returnDate) return false
  const threshold = new Date(returnDate.getTime())
  threshold.setUTCMonth(threshold.getUTCMonth() + 6)
  return expires < threshold
}

function parsedCommentSummary(match) {
  const analysis = match?.aevd?.commentAnalysis
  if (!analysis) return ''
  const parts = []
  if (analysis.flightDeviation?.roundTripAirport) parts.push(`Deviation: ${analysis.flightDeviation.roundTripAirport} round trip`)
  if (analysis.flightDeviation?.lastSegmentRemoved) parts.push('Deviation: final FMG segment removed')
  ;(analysis.frequentFlyerCandidates ?? []).forEach((item) => parts.push(`FF# candidate: ${item.carrierCode ? `${item.carrierCode} ` : ''}${item.number}`))
  ;(analysis.ownAirClues ?? []).forEach((item) => parts.push(`Own Air: ${clean(item.sourceText) || clean(item.type)}`))
  ;(analysis.groupFlightClues ?? []).forEach((item) => parts.push(`Group flight: ${clean(item.sourceText) || clean(item.type)}`))
  ;(analysis.relationshipClues ?? []).forEach((item) => parts.push(`Relationship: ${clean(item.sourceText) || clean(item.personText)}`))
  ;(analysis.seatingClues ?? []).forEach((item) => parts.push(`Seat: ${clean(item.sourceText) || clean(item.type)}`))
  ;(analysis.upgradeClues ?? []).forEach((item) => parts.push(`Upgrade: ${clean(item.sourceText) || clean(item.type)}`))
  return parts.filter(Boolean).join(' | ')
}

function assignmentMap(effectiveAssignments) {
  const map = new Map()
  ;(effectiveAssignments?.companyAssignments ?? []).forEach((assignment) => map.set(assignment.match, assignment))
  return map
}

function statusFor({ match, assignment }) {
  if (match?.reviewRequired || assignment?.reviewRequired || !assignment || (assignment.assignmentType !== 'own-air' && assignment.recordNumber == null)) return 'red'
  const analysis = match?.aevd?.commentAnalysis
  if (analysis?.commentNeedsReview || (analysis?.frequentFlyerCandidates?.length ?? 0) > 0 || (match?.frequentFlyerReview?.length ?? 0) > 0) return 'yellow'
  if (hasManualWorkbookCorrection(match)) return 'blue'
  if (analysis?.handledCompletely || analysis?.hasOperationalClues) return 'lavender'
  return ''
}

function exactSourceRows(match) {
  const air = match?.sourceAevd ?? match?.aevd ?? {}
  const pass = match?.sourcePpdt ?? match?.ppdt ?? {}
  return [
    reservationNumber(match), travelerNumber(match), clean(air.travelerName), clean(air.dateOfBirth), clean(air.airType), clean(air.arrivalCity), clean(air.arrivalDate), clean(air.arrivalTime), clean(air.departureCity), clean(air.departureDate), clean(air.departureTime), clean(air.ktnRaw), clean(air.comments),
    clean(pass.title), clean(pass.firstName), clean(pass.lastName), clean(pass.middleName), clean(pass.gender), clean(pass.passportNumber), clean(pass.passportName), clean(pass.passportIssueCity), clean(pass.passportIssueDate), clean(pass.passportExpireDate), clean(pass.citizenship), clean(pass.dateOfBirth), clean(pass.placeOfBirth), clean(pass.ktnRaw), clean(pass.passportOnFile),
  ]
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readZip(buffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const decoder = new TextDecoder()
  const files = new Map()
  let offset = 0
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength))
    const content = bytes.slice(dataStart, dataStart + compressedSize)
    if (method === 0) files.set(name, content)
    else if (method === 8) files.set(name, await inflateRaw(content))
    else throw new Error(`Bundled FMG template entry ${name} uses unsupported ZIP method ${method}.`)
    offset = dataStart + compressedSize
  }
  return files
}

function uint16(value) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]) }
function uint32(value) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]) }
function concatBytes(parts) { const length = parts.reduce((sum, part) => sum + part.length, 0); const result = new Uint8Array(length); let offset = 0; parts.forEach((part) => { result.set(part, offset); offset += part.length }); return result }
const crcTable = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0 } return table })()
function crc32(bytes) { let crc = 0xffffffff; for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0 }
async function deflateRaw(bytes) {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function zipFiles(files) {
  const encoder = new TextEncoder()
  const localParts = []
  const centralParts = []
  let offset = 0

  const now = new Date()
  const year = Math.max(1980, now.getFullYear())
  const dosDate =
    ((year - 1980) << 9) |
    ((now.getMonth() + 1) << 5) |
    now.getDate()
  const dosTime =
    (now.getHours() << 11) |
    (now.getMinutes() << 5) |
    Math.floor(now.getSeconds() / 2)

  for (const { name, content } of files) {
    const nameBytes = encoder.encode(name)
    const data = typeof content === 'string' ? encoder.encode(content) : content
    const compressed = await deflateRaw(data)
    const crc = crc32(data)
    const method = 8
    const versionNeeded = 20
    const versionMadeBy = (3 << 8) | 20
    const externalAttributes =
      name.endsWith('.xml') || name.endsWith('.rels')
        ? 0x01800000
        : 0

    const localHeader = concatBytes([
      uint32(0x04034b50),
      uint16(versionNeeded),
      uint16(0),
      uint16(method),
      uint16(dosTime),
      uint16(dosDate),
      uint32(crc),
      uint32(compressed.length),
      uint32(data.length),
      uint16(nameBytes.length),
      uint16(0),
      nameBytes,
    ])
    localParts.push(localHeader, compressed)

    const centralHeader = concatBytes([
      uint32(0x02014b50),
      uint16(versionMadeBy),
      uint16(versionNeeded),
      uint16(0),
      uint16(method),
      uint16(dosTime),
      uint16(dosDate),
      uint32(crc),
      uint32(compressed.length),
      uint32(data.length),
      uint16(nameBytes.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(externalAttributes),
      uint32(offset),
      nameBytes,
    ])
    centralParts.push(centralHeader)
    offset += localHeader.length + compressed.length
  }

  const localData = concatBytes(localParts)
  const centralData = concatBytes(centralParts)
  const end = concatBytes([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralData.length),
    uint32(localData.length),
    uint16(0),
  ])
  return concatBytes([localData, centralData, end])
}

function textFile(files, name) { const value = files.get(name); if (!value) throw new Error(`FMG template is missing ${name}`); return new TextDecoder().decode(value) }
function parseXml(text) { return new DOMParser().parseFromString(text, 'application/xml') }
function serializeXml(doc) { return new XMLSerializer().serializeToString(doc) }
function q(doc, selector) { return doc.querySelector(selector) }
function create(doc, tag) { return doc.createElementNS(NS, tag) }

function appendHighlightStyles(stylesText) {
  const doc = parseXml(stylesText)
  const fills = q(doc, 'fills'); const cellXfs = q(doc, 'cellXfs')
  const colors = { lavender: 'FFEDE7F6', blue: 'FFDDEBF7', yellow: 'FFFFF4CC', red: 'FFFCE8E6' }
  const fillIds = {}
  Object.entries(colors).forEach(([key, rgb]) => {
    const fill = create(doc, 'fill'); const pattern = create(doc, 'patternFill'); pattern.setAttribute('patternType', 'solid')
    const fg = create(doc, 'fgColor'); fg.setAttribute('rgb', rgb); const bg = create(doc, 'bgColor'); bg.setAttribute('indexed', '64')
    pattern.append(fg, bg); fill.append(pattern); fills.append(fill); fillIds[key] = fills.children.length - 1
  })
  fills.setAttribute('count', String(fills.children.length))
  const baseIds = [12, 19, 24, 25, 26, 27]
  const map = {}
  baseIds.forEach((baseId) => {
    map[baseId] = {}
    Object.entries(fillIds).forEach(([key, fillId]) => {
      const base = cellXfs.children[baseId]
      const clone = base.cloneNode(true); clone.setAttribute('fillId', String(fillId)); clone.setAttribute('applyFill', '1')
      cellXfs.append(clone); map[baseId][key] = cellXfs.children.length - 1
    })
  })

  const wrapped = {}
  baseIds.forEach((baseId) => {
    wrapped[baseId] = {}
    const styleIds = {
      base: baseId,
      ...map[baseId],
    }
    Object.entries(styleIds).forEach(([key, styleId]) => {
      const clone = cellXfs.children[styleId].cloneNode(true)
      let alignment = clone.querySelector('alignment')
      if (!alignment) {
        alignment = create(doc, 'alignment')
        clone.append(alignment)
      }
      alignment.setAttribute('wrapText', '1')
      alignment.setAttribute('vertical', 'top')
      clone.setAttribute('applyAlignment', '1')
      cellXfs.append(clone)
      wrapped[baseId][key] = cellXfs.children.length - 1
    })
  })
  cellXfs.setAttribute('count', String(cellXfs.children.length))
  return { xml: serializeXml(doc), highlight: map, wrapped }
}

function excelSerial(value) {
  const s = clean(value); if (!s) return null
  let y; let m; let d
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) { y = +match[1]; m = +match[2]; d = +match[3] }
  else { match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (!match) return null; m = +match[1]; d = +match[2]; y = +match[3] }
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}

function cellColumnNumber(ref) {
  const letters = clean(ref).match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? ''
  let value = 0
  for (const letter of letters) value = (value * 26) + (letter.charCodeAt(0) - 64)
  return value
}

function addCell(doc, row, ref, value, styleId, { date = false } = {}) {
  const c = create(doc, 'c')
  c.setAttribute('r', ref)
  if (styleId != null) c.setAttribute('s', String(styleId))

  const serial = date ? excelSerial(value) : null
  if (date && serial != null) {
    const v = create(doc, 'v')
    v.textContent = String(serial)
    c.append(v)
  } else if (value !== '' && value != null) {
    c.setAttribute('t', 'inlineStr')
    const is = create(doc, 'is')
    const t = create(doc, 't')
    t.setAttribute('xml:space', 'preserve')
    t.textContent = xmlSafe(value)
    is.append(t)
    c.append(is)
  }

  // SpreadsheetML requires cells within a row to be stored in column order.
  // This matters when Sardines replaces cells in an existing FMG template row
  // (for example the Tour Director emergency-contact cells in row 12).
  const newColumn = cellColumnNumber(ref)
  const nextCell = [...row.querySelectorAll('c')].find((existing) => {
    const existingColumn = cellColumnNumber(existing.getAttribute('r'))
    return existingColumn > newColumn
  })

  if (nextCell) row.insertBefore(c, nextCell)
  else row.append(c)

  return c
}

function fieldHighlight(match, assignment, key, specialValue, flightRecords = [], tripType = 'international', contractText = '') {
  if (key === 'middle' && match?.identity?.middleName?.reviewRequired) return 'red'
  if (key === 'first' && match?.identity?.firstName?.reviewRequired) return 'red'
  if (key === 'expire' && (match?.identity?.passportExpiration?.reviewRequired || passportExpirationNeedsReview(specialValue, flightRecords, tripType, contractText))) return 'red'
  if (key === 'gender' && clean(specialValue) && !['M','F','X'].includes(clean(specialValue).toUpperCase())) return 'red'
  if (['last','first','middle','gender','dob','nationality','passport','expire'].includes(key) && !clean(specialValue)) return 'red'
  if (key === 'ktn') {
    if ((match?.frequentFlyerReview ?? []).some((x) => /KTN|Global Entry/i.test(clean(x.reason ?? x.reviewReason)))) return 'yellow'
    if (clean(match?.ppdt?.ktnRaw) && clean(match?.aevd?.ktnRaw) && normalize(match.ppdt.ktnRaw) !== normalize(match.aevd.ktnRaw)) return 'yellow'
  }
  if (key === 'ff' && (match?.aevd?.commentAnalysis?.frequentFlyerCandidates?.length ?? 0) > 0 && !clean(match?.frequentFlyerNumber)) return 'yellow'
  if (key === 'special' && match?.aevd?.commentAnalysis?.commentNeedsReview) return 'yellow'
  if (hasManualWorkbookCorrection(match)) return 'blue'
  if (key === 'special') {
    if (clean(specialValue)) return 'lavender'
  }
  if (assignment?.reviewRequired && key === 'record') return 'red'
  return ''
}

function tourDirectorMatch(contact, flightRecords = [], tripType = 'international', contractText = '') {
  if (!contact?.present) return null
  return {
    operational: true,
    reviewRequired: false,
    aevd: {
      reservationNumber: clean(contact.reservationNumber),
      travelerName: [contact.firstName, contact.middleName, contact.lastName].filter(Boolean).join(' '),
      firstName: clean(contact.firstName),
      middleName: clean(contact.middleName),
      lastName: clean(contact.lastName),
      dateOfBirth: clean(contact.dateOfBirth),
      airType: clean(contact.airType),
      departureCity: clean(contact.departureCity),
      ktnRaw: clean(contact.ktn),
      comments: clean(contact.requests),
    },
    ppdt: {
      travelerNumber: clean(contact.travelerNumber),
      firstName: clean(contact.firstName),
      middleName: clean(contact.middleName),
      lastName: clean(contact.lastName),
      gender: clean(contact.gender),
      dateOfBirth: clean(contact.dateOfBirth),
      citizenship: clean(contact.passportNationality),
      passportNumber: clean(contact.passportNumber),
      passportExpireDate: clean(contact.passportExpiration),
      ktnRaw: clean(contact.ktn),
    },
    frequentFlyerNumber: clean(contact.frequentFlyerNumber),
    identity: {
      passportExpiration: {
        reviewRequired: passportExpirationNeedsReview(contact.passportExpiration, flightRecords, tripType, contractText),
      },
    },
  }
}

function isSameTraveler(match, contact) {
  if (!match || !contact) return false
  const tnum = clean(contact.travelerNumber)
  const res = clean(contact.reservationNumber)
  if (tnum && travelerNumber(match) && tnum === travelerNumber(match)) return true
  if (res && reservationNumber(match) && res === reservationNumber(match)) {
    const left = normalize(travelerName(match))
    const right = normalize([contact.firstName, contact.middleName, contact.lastName].filter(Boolean).join(' '))
    return Boolean(left && right && left === right)
  }
  return false
}

function addTourDirectorToAssignments(assignments, tourDirectorContact, flightRecords, tripType = 'international', contractText = '') {
  return mergeTourDirectorExportAssignments({
    assignments,
    contact: tourDirectorContact,
    flightRecords,
    fallbackMatch: tourDirectorMatch(tourDirectorContact, flightRecords, tripType, contractText),
  })
}

function buildTemplateSheet({ templateSheetXml, styles, flightRecords, effectiveAssignments, roomingData, tourFlight, tourDirectorContact, tripType, contractText = '' }) {
  const doc = parseXml(templateSheetXml); const sheetData = q(doc, 'sheetData')
  const domestic = tripType === 'domestic'
  const columnCount = domestic ? 9 : 12
  const finalColumn = domestic ? 'I' : 'L'
  ;[...sheetData.querySelectorAll('row')].forEach((row) => { if (Number(row.getAttribute('r')) >= 16) row.remove() })
  const merges = q(doc, 'mergeCells') ?? (() => { const node = create(doc, 'mergeCells'); doc.documentElement.append(node); return node })()
  ;[...merges.querySelectorAll('mergeCell')].forEach((node) => { const ref = node.getAttribute('ref'); if (ref && !ref.startsWith('B10:')) node.remove() })

  // Populate the emergency contact block from the Tour Director when available.
  if (tourDirectorContact?.present) {
    const row12 = sheetData.querySelector('row[r="12"]')
    ;[...row12.querySelectorAll('c')].forEach((c) => { const col = c.getAttribute('r')?.replace(/\d+/g, ''); if (['B','C','D','F'].includes(col)) c.remove() })
    addCell(doc, row12, 'B12', clean(tourDirectorContact.lastName), domestic ? 35 : 12)
    addCell(doc, row12, 'C12', clean(tourDirectorContact.firstName), domestic ? 35 : 12)
    addCell(doc, row12, 'D12', clean(tourDirectorContact.phone), 12)
    addCell(doc, row12, 'F12', clean(tourDirectorContact.email), domestic ? 36 : 14)
  }

  const companyAssignments = addTourDirectorToAssignments(
    effectiveAssignments?.companyAssignments ?? [],
    tourDirectorContact,
    flightRecords,
    tripType,
    contractText
  )
  const sharedRecordNumbers =
    new Set(
      (tourFlight?.recordNumbers ?? [])
        .map(Number)
        .filter(Number.isFinite)
    )
  let rowNumber = 16

  const addRecordBlock = (label, assignments) => {
    if (!assignments.length) return
    const heading = create(doc, 'row'); heading.setAttribute('r', String(rowNumber)); heading.setAttribute('ht', '18'); heading.setAttribute('customHeight', '1')
    for (let col = 0; col < columnCount; col += 1) addCell(doc, heading, `${String.fromCharCode(65 + col)}${rowNumber}`, col === 0 ? label : '', 19)
    sheetData.append(heading); const merge = create(doc, 'mergeCell'); merge.setAttribute('ref', `A${rowNumber}:${finalColumn}${rowNumber}`); merges.append(merge); rowNumber += 1
    let n = 1
    assignments.forEach((assignmentOrMatch) => {
      const match = assignmentOrMatch?.match ?? assignmentOrMatch
      const assignment = assignmentOrMatch?.match ? assignmentOrMatch : null
      const ppdt = match?.ppdt ?? {}
      const request = manifestSpecialRequests(match, roomingData)
      const values = domestic
        ? [n, clean(ppdt.lastName), clean(ppdt.firstName), safeMiddleName(match), clean(ppdt.gender), formatMmDdYyyy(ppdt.dateOfBirth), bestKtn(match), clean(match?.frequentFlyerNumber), request]
        : [n, clean(ppdt.lastName), clean(ppdt.firstName), safeMiddleName(match), clean(ppdt.gender), formatMmDdYyyy(ppdt.dateOfBirth), clean(ppdt.citizenship), clean(ppdt.passportNumber), formatMmDdYyyy(ppdt.passportExpireDate), bestKtn(match), clean(match?.frequentFlyerNumber), request]
      const keys = domestic
        ? ['num','last','first','middle','gender','dob','ktn','ff','special']
        : ['num','last','first','middle','gender','dob','nationality','passport','expire','ktn','ff','special']
      const baseStyles = domestic
        ? [23,34,34,34,0,33,0,24,20]
        : [24,12,12,12,25,26,25,25,26,27,27,27]
      const row = create(doc, 'row'); row.setAttribute('r', String(rowNumber)); row.setAttribute('ht', '15.75'); row.setAttribute('customHeight', '1')
      values.forEach((value, idx) => {
        const key = keys[idx]; const kind = fieldHighlight(match, assignment, key, value, flightRecords, tripType, contractText); const base = baseStyles[idx]; const styleId = kind ? styles[base]?.[kind] ?? base : base
        addCell(doc, row, `${String.fromCharCode(65 + idx)}${rowNumber}`, value, styleId)
      })
      sheetData.append(row); rowNumber += 1; n += 1
    })
  }

  ;(flightRecords ?? [])
    .filter(
      (record) =>
        !sharedRecordNumbers.has(
          Number(record.recordNumber)
        )
    )
    .forEach((record) => {
    const assignments = companyAssignments.filter(
      (assignment) =>
        Number(assignment.recordNumber) ===
          Number(record.recordNumber) &&
        assignment.assignmentType !== 'own-air'
    ).sort(compareTravelerAssignments)
    const recordHeading =
      clean(record.sourceHeader) ||
      `Record ${record.recordNumber}: ${clean(record.passengerCount)} Passengers / ${clean(record.routing)} ${clean(record.airlineName || record.airlineCode)}`

    addRecordBlock(
      recordHeading,
      assignments,
      record
    )
  })

  const sharedGroups =
    new Map()

  ;(flightRecords ?? [])
    .filter(
      (record) =>
        sharedRecordNumbers.has(
          Number(record.recordNumber)
        )
    )
    .forEach(
      (record) => {
        const key = [
          normalize(record.routing),
          normalize(
            record.airlineName ||
            record.airlineCode
          ),
        ].join('|')

        if (!sharedGroups.has(key)) {
          sharedGroups.set(key, [])
        }

        sharedGroups.get(key).push(record)
      }
    )

  sharedGroups.forEach(
    (records) => {
      const recordNumbers =
        new Set(
          records.map(
            (record) =>
              Number(record.recordNumber)
          )
        )
      let assignments =
        (effectiveAssignments
          ?.tourFlightAssignments ??
        []).filter(
          (assignment) =>
            recordNumbers.has(
              Number(assignment.recordNumber)
            )
        )
      const tdMatch =
        tourDirectorMatch(
          tourDirectorContact,
          flightRecords,
          tripType,
          contractText
        )

      if (tdMatch) {
        assignments =
          assignments.filter(
            (assignment) =>
              !isSameTraveler(
                assignment?.match,
                tourDirectorContact
              )
          )
        assignments.push(tdMatch)
      }

      assignments.sort(compareTravelerAssignments)

      const first = records[0]
      const label =
        `Record ${records.map((record) => record.recordNumber).join(' & ')}: ${records.reduce((total, record) => total + Number(record.passengerCount || 0), 0)} Passengers / ${clean(first.routing)} ${clean(first.airlineName || first.airlineCode)}`

      addRecordBlock(
        label,
        assignments,
        first
      )
    }
  )
  merges.setAttribute('count', String(merges.querySelectorAll('mergeCell').length))
  return serializeXml(doc)
}

function simpleSheetXml(rows, widths, highlightStyles, options = {}) {
  const doc = document.implementation.createDocument(NS, 'worksheet', null); const root = doc.documentElement
  const views = create(doc, 'sheetViews'); const view = create(doc, 'sheetView'); view.setAttribute('workbookViewId','0'); view.setAttribute('showGridLines','0')
  const frozenColumns = options.frozenColumns ?? 0
  if (rows.length > 1) {
    const pane = create(doc, 'pane'); pane.setAttribute('ySplit','1'); pane.setAttribute('topLeftCell',`${columnLetter(frozenColumns)}2`); pane.setAttribute('activePane','bottomRight'); pane.setAttribute('state','frozen')
    if (frozenColumns > 0) pane.setAttribute('xSplit',String(frozenColumns))
    view.append(pane)
  }
  views.append(view); root.append(views)
  const format = create(doc, 'sheetFormatPr'); format.setAttribute('defaultRowHeight','18'); root.append(format)
  const cols = create(doc,'cols'); widths.forEach((width,i) => { const col=create(doc,'col'); col.setAttribute('min',String(i+1)); col.setAttribute('max',String(i+1)); col.setAttribute('width',String(width)); col.setAttribute('customWidth','1'); cols.append(col) }); root.append(cols)
  const data=create(doc,'sheetData'); root.append(data)
  const wrapColumns = new Set(options.wrapColumns ?? [])
  rows.forEach((item,ridx) => { const row=create(doc,'row'); const rn=ridx+1; row.setAttribute('r',String(rn)); if(item.header){row.setAttribute('ht','34');row.setAttribute('customHeight','1')} else if(options.dataRowHeight){row.setAttribute('ht',String(options.dataRowHeight));row.setAttribute('customHeight','1')} item.values.forEach((value,cidx) => { const base = item.header ? 19 : 12; const kind = item.cellKinds?.[cidx] || ''; const useWrap = item.header || wrapColumns.has(cidx); const style = useWrap ? options.wrappedStyles?.[base]?.[kind || 'base'] ?? base : kind ? highlightStyles[base]?.[kind] ?? base : base; addCell(doc,row,`${columnLetter(cidx)}${rn}`,value,style) }); data.append(row) })
  if (rows.length > 0) { const filter=create(doc,'autoFilter'); filter.setAttribute('ref',`A1:${columnLetter(Math.max(0,widths.length-1))}${Math.max(1,rows.length)}`); root.append(filter) }
  const dim=create(doc,'dimension'); dim.setAttribute('ref',`A1:${columnLetter(Math.max(0,widths.length-1))}${Math.max(1,rows.length)}`); root.insertBefore(dim,views)
  return serializeXml(doc)
}
function columnLetter(index) { let n=index+1,s=''; while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)} return s }

function reviewRows({ reconciliation, effectiveAssignments, roomingData, tourDirectorContact, flightRecords, tourFlight }) {
  const amap = assignmentMap(effectiveAssignments)
  const headers = ['Reservation','Traveler #','Air Traveler Name','Air DOB','Air Type','Arrival City','Arrival Date','Arrival Time','Departure City','Departure Date','Departure Time','Air Global Entry/KTN','Flight Comments (EXACT)','Passport Title','Passport First Name','Passport Last Name','Passport Middle Initial','Passport Gender','Passport Number','Passport Name','Passport Issue City','Passport Issue Date','Passport Expire Date','Passport Citizen','Passport DOB','Place of Birth','Passport Global Entry/KTN','Passport on File','Roommate(s)','Assigned Record','What Sardines Parsed','Sardines Review']
  const rows=[{header:true,values:headers}]

  const allMatches=[...(reconciliation?.matches ?? [])]
  ;(reconciliation?.operationalRecords ?? []).forEach((traveler)=>{
    if (!allMatches.some((m)=>m?.aevd===traveler)) {
      allMatches.push({operational:true,aevd:traveler,ppdt:null})
    }
  })

  const tdPseudo=tourDirectorMatch(tourDirectorContact)
  if (tdPseudo && !allMatches.some((m)=>isSameTraveler(m,tourDirectorContact))) {
    allMatches.push(tdPseudo)
  }

  allMatches.forEach((match)=>{
    const relatedAssignments = [
      ...(effectiveAssignments?.companyAssignments ?? []),
      ...(effectiveAssignments?.tourFlightAssignments ?? []),
    ].filter((item) =>
      travelerIdentityKey(item.match) === travelerIdentityKey(match)
    )
    const assignment=amap.get(match) ?? relatedAssignments[0]
    const parsed=match.operational ? 'Tour Director / operational record' : parsedCommentSummary(match)
    const source=exactSourceRows(match)
    const roommates=match.operational ? '' : roommatesForMatch(roomingData,match).join(', ')
    const contactReasons = match.operational && isSameTraveler(match, tourDirectorContact)
      ? [
          !clean(tourDirectorContact?.phone) ? 'Tour Director phone is missing.' : '',
          !clean(tourDirectorContact?.email) ? 'Tour Director email is missing.' : '',
        ]
      : []
    const reasons=[
      match.reviewReason,
      assignment?.reviewReason,
      manualWorkbookNote(match),
      ...(match.ffKtnDecisionNotes ?? []),
      ...contactReasons,
      match?.identity?.firstName?.reviewRequired ? match.identity.firstName.message : '',
      match?.identity?.middleName?.reviewRequired ? match.identity.middleName.message : '',
      ...(match.frequentFlyerReview ?? []).map((x)=>x.reason ?? x.reviewReason)
    ].filter(Boolean).join(' | ')

    const assignedRecordNumbers = [...new Set(
      relatedAssignments
        .filter((item) => clean(item.recordNumber))
        .map((item) => Number(item.recordNumber))
        .filter(Number.isFinite)
    )].sort((a, b) => a - b)
    let assignedRecord = assignedRecordNumbers.length > 0
      ? `Record${assignedRecordNumbers.length === 1 ? '' : 's'} ${assignedRecordNumbers.join(' & ')}`
      : ''
    if (!assignedRecord && match.operational && selectedTourDirectorRecordNumbers(tourDirectorContact).length && isSameTraveler(match,tourDirectorContact)) assignedRecord=selectedTourDirectorRecordNumbers(tourDirectorContact).map((number) => `Record ${number}`).join(' + ')

    const values=[...source,roommates,assignedRecord,parsed,reasons]
    const kinds=values.map(()=> '')
    if(parsed) kinds[30]='lavender'
    if(reasons) kinds[31]=statusFor({match,assignment}) || 'yellow'
    if(roommates) kinds[28]='lavender'
    if(match?.identity?.firstName?.reviewRequired) kinds[14]='red'
    if(match?.identity?.middleName?.reviewRequired) kinds[16]='red'
    if(match?.aevd?.commentAnalysis?.commentNeedsReview) kinds[12]='yellow'
    if(match.operational && !assignedRecord) kinds[29]='red'
    rows.push({values,cellKinds:kinds})
  })

  buildUnfilledSeatMarkers({ flightRecords, effectiveAssignments, tourFlight }).forEach((marker) => {
    const values = Array(headers.length).fill('')
    values[2] = 'UNFILLED CONTRACTED SEAT'
    values[29] = marker.recordLabel
    values[30] = `Unfilled contracted seat ${marker.seat} of ${marker.total}`
    values[31] = 'Capacity marker only — not a passenger and not included on the airline-facing names list.'
    const cellKinds = values.map(() => '')
    cellKinds[2] = 'yellow'
    cellKinds[29] = 'yellow'
    cellKinds[30] = 'yellow'
    cellKinds[31] = 'yellow'
    rows.push({ values, cellKinds })
  })
  return rows
}

function ownAirRows({ effectiveAssignments }) {
  const rows=[{header:true,values:['Traveler','Reservation','Traveler #','Departure City','Arrival City','Flight Comments (EXACT)','Included on shared contracted flight?','Notes']}]
  const includedOwnAir = new Set(
    (effectiveAssignments?.tourFlightAssignments ?? [])
      .filter((assignment) =>
        assignment.assignmentType === 'shared-flight-own-air-exception'
      )
      .map((assignment) => travelerIdentityKey(assignment.match))
  )
  ;(effectiveAssignments?.companyAssignments ?? []).filter((a)=>a.assignmentType==='own-air').forEach((a)=>{
    const m=a.match
    const included=includedOwnAir.has(travelerIdentityKey(m))
    rows.push({values:[travelerName(m),reservationNumber(m),travelerNumber(m),clean(m?.aevd?.departureCity),clean(m?.aevd?.arrivalCity),clean(m?.aevd?.comments),included ? 'YES — explicitly added' : 'NO — default',included ? 'Included in the finalized shared contracted flight roster.' : 'Add only when the traveler was explicitly booked on the shared contracted flight.'],cellKinds:['','','','','','',included ? 'lavender' : '','']})
  })
  return rows
}

function cleanWorkbookPackage({ templateFiles, sheet1Xml, reviewXml, ownAirXml, stylesXml }) {
  // Start from the cleaned, known-good FMG workbook package instead of
  // synthesizing workbook metadata from scratch. Excel is much happier when
  // Sardines only adds the two review sheets to a package Excel already accepts.
  const files = new Map(templateFiles)
  const encoder = new TextEncoder()

  const workbookDoc = parseXml(textFile(templateFiles, 'xl/workbook.xml'))
  const sheets = q(workbookDoc, 'sheets')
  if (!sheets) throw new Error('Bundled FMG template has no sheets collection.')

  ;[...sheets.querySelectorAll('sheet')]
    .slice(1)
    .forEach((sheet) => sheet.remove())

  const addWorkbookSheet = (name, sheetId, relId) => {
    const sheet = create(workbookDoc, 'sheet')
    sheet.setAttribute('name', name)
    sheet.setAttribute('sheetId', String(sheetId))
    sheet.setAttributeNS(DOC_REL_NS, 'r:id', relId)
    sheets.append(sheet)
  }
  addWorkbookSheet('Sardines - Centaur Review', 2, 'rId4')
  addWorkbookSheet('Own Air Review', 3, 'rId5')

  const relsDoc = parseXml(textFile(templateFiles, 'xl/_rels/workbook.xml.rels'))
  const relRoot = relsDoc.documentElement
  ;[...relRoot.querySelectorAll('Relationship')]
    .filter((rel) => ['rId4', 'rId5'].includes(rel.getAttribute('Id')))
    .forEach((rel) => rel.remove())

  const addRelationship = (id, target) => {
    const rel = relsDoc.createElementNS(REL_NS, 'Relationship')
    rel.setAttribute('Id', id)
    rel.setAttribute('Type', `${DOC_REL_NS}/worksheet`)
    rel.setAttribute('Target', target)
    relRoot.append(rel)
  }
  addRelationship('rId4', 'worksheets/sheet2.xml')
  addRelationship('rId5', 'worksheets/sheet3.xml')

  // Normalize workbook relationship targets inherited from the template.
  // Excel is picky about package-root-absolute worksheet targets.
  ;[...relRoot.querySelectorAll('Relationship')].forEach((rel) => {
    const target = rel.getAttribute('Target')
    if (target?.startsWith('/xl/')) {
      rel.setAttribute('Target', target.slice('/xl/'.length))
    }
  })

  const contentDoc = parseXml(textFile(templateFiles, '[Content_Types].xml'))
  const contentRoot = contentDoc.documentElement
  ;[...contentRoot.querySelectorAll('Override')]
    .filter((node) => ['/xl/worksheets/sheet2.xml', '/xl/worksheets/sheet3.xml'].includes(node.getAttribute('PartName')))
    .forEach((node) => node.remove())

  const addOverride = (partName) => {
    const override = contentDoc.createElementNS(CONTENT_NS, 'Override')
    override.setAttribute('PartName', partName)
    override.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml')
    contentRoot.append(override)
  }
  addOverride('/xl/worksheets/sheet2.xml')
  addOverride('/xl/worksheets/sheet3.xml')

  files.set('[Content_Types].xml', encoder.encode(serializeXml(contentDoc)))
  files.set('xl/workbook.xml', encoder.encode(serializeXml(workbookDoc)))
  files.set('xl/_rels/workbook.xml.rels', encoder.encode(serializeXml(relsDoc)))
  files.set('xl/styles.xml', encoder.encode(stylesXml))
  files.set('xl/worksheets/sheet1.xml', encoder.encode(sheet1Xml))
  files.set('xl/worksheets/sheet2.xml', encoder.encode(reviewXml))
  files.set('xl/worksheets/sheet3.xml', encoder.encode(ownAirXml))
  return files
}

export async function exportFmgWorkbook({ flightRecords, reconciliation, effectiveAssignments, roomingData, tourFlight, tourDirectorContact, tripType = 'international', contractText = '' }) {
  const templateUrl = tripType === 'domestic'
    ? domesticFmgTemplateUrl
    : internationalFmgTemplateUrl
  const response=await fetch(templateUrl,{cache:'no-store'})
  if(!response.ok) throw new Error('Could not load bundled FMG template.')

  const templateFiles=await readZip(await response.arrayBuffer())
  const styleResult=appendHighlightStyles(textFile(templateFiles,'xl/styles.xml'))
  const sheet1=buildTemplateSheet({
    templateSheetXml:textFile(templateFiles,'xl/worksheets/sheet1.xml'),
    styles:styleResult.highlight,
    flightRecords,
    effectiveAssignments,
    roomingData,
    tourFlight,
    tourDirectorContact,
    tripType,
    contractText
  })
  const reviewXml=simpleSheetXml(
    reviewRows({reconciliation,effectiveAssignments,roomingData,tourDirectorContact,flightRecords,tourFlight}),
    [14,13,27,14,13,16,14,14,16,14,14,22,48,14,20,20,22,14,20,28,22,18,18,18,14,20,24,18,28,20,42,42],
    styleResult.highlight,
    { frozenColumns: 3, wrapColumns: [12, 28, 30, 31], wrappedStyles: styleResult.wrapped, dataRowHeight: 30 }
  )
  const ownXml=simpleSheetXml(
    ownAirRows({effectiveAssignments}),
    [28,14,14,16,16,48,28,40],
    styleResult.highlight,
    { frozenColumns: 1, wrapColumns: [5, 7], wrappedStyles: styleResult.wrapped, dataRowHeight: 30 }
  )

  const files=cleanWorkbookPackage({
    templateFiles,
    sheet1Xml:sheet1,
    reviewXml,
    ownAirXml:ownXml,
    stylesXml:styleResult.xml
  })

  const workbookBytes=await zipFiles([...files.entries()].map(([name,content])=>({name,content})))
  const blob=new Blob([workbookBytes],{type:XLSX_TYPE})
  const url=URL.createObjectURL(blob)
  const anchor=document.createElement('a')
  anchor.href=url
  anchor.download = tripType === 'domestic'
    ? 'FMG_Domestic_Final_Names_List.xlsx'
    : 'FMG_International_Final_Names_List.xlsx'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(()=>URL.revokeObjectURL(url),0)
}
