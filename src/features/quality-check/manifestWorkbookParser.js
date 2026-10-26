const clean = (value) => String(value ?? '').trim()

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readZipFiles(buffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const decoder = new TextDecoder()
  let end = bytes.length - 22
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1
  if (end < 0) throw new Error('This file is not a readable XLSX workbook.')

  const entryCount = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  const files = new Map()
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('The XLSX directory is damaged.')
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength))
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = bytes.slice(dataStart, dataStart + compressedSize)
    if (method === 0) files.set(name, compressed)
    else if (method === 8) files.set(name, await inflateRaw(compressed))
    offset += 46 + nameLength + extraLength + commentLength
  }
  return files
}

function columnIndex(reference) {
  const letters = clean(reference).match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? ''
  let value = 0
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64
  return value - 1
}

function sharedStrings(files, parser) {
  const bytes = files.get('xl/sharedStrings.xml')
  if (!bytes) return []
  const doc = parser.parseFromString(new TextDecoder().decode(bytes), 'application/xml')
  return [...doc.querySelectorAll('si')].map((item) =>
    [...item.querySelectorAll('t')].map((node) => node.textContent ?? '').join('')
  )
}

function worksheetRows(files) {
  const parser = new DOMParser()
  const sheetBytes = files.get('xl/worksheets/sheet1.xml')
  if (!sheetBytes) throw new Error('The workbook does not contain its primary manifest sheet.')
  const strings = sharedStrings(files, parser)
  const doc = parser.parseFromString(new TextDecoder().decode(sheetBytes), 'application/xml')
  return [...doc.querySelectorAll('sheetData > row')].map((row) => {
    const values = []
    ;[...row.querySelectorAll(':scope > c')].forEach((cell) => {
      const index = columnIndex(cell.getAttribute('r'))
      const type = cell.getAttribute('t')
      if (type === 's') values[index] = strings[Number(cell.querySelector('v')?.textContent)] ?? ''
      else if (type === 'inlineStr') values[index] = [...cell.querySelectorAll('t')].map((node) => node.textContent ?? '').join('')
      else values[index] = cell.querySelector('v')?.textContent ?? ''
    })
    return values
  })
}

const normalizedHeader = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '')

export function manifestTravelersFromRows(rows) {
  const headerCandidates = rows.map((row, index) => {
    const headers = row.map(normalizedHeader)
    const hasLastName = headers.includes('passportlastname') || headers.includes('lastname')
    const hasFirstName = headers.includes('passportfirstname') || headers.includes('firstname')
    const recognizedColumns = headers.filter((header) => [
      'number', 'passportlastname', 'lastname', 'passportfirstname', 'firstname',
      'passportmiddlenameleaveblankifnone', 'passportmiddlename',
      'middlenameleaveblankifnone', 'middlename', 'specialrequests',
    ].includes(header)).length
    return { index, isCandidate: hasLastName && hasFirstName, recognizedColumns }
  }).filter(({ isCandidate }) => isCandidate)
  const headerIndex = headerCandidates.reduce((best, candidate) =>
    candidate.recognizedColumns > best.recognizedColumns ? candidate : best,
  { index: -1, recognizedColumns: -1 }).index
  if (headerIndex < 0) throw new Error('Sardines could not find first-name and last-name passenger headings in this workbook.')
  const headers = rows[headerIndex].map(normalizedHeader)
  const indexOf = (...names) => headers.findIndex((value) => names.includes(value))
  const columns = {
    number: indexOf('number'),
    last: indexOf('passportlastname', 'lastname'),
    first: indexOf('passportfirstname', 'firstname'),
    middle: indexOf('passportmiddlenameleaveblankifnone', 'passportmiddlename', 'middlenameleaveblankifnone', 'middlename'),
    requests: indexOf('specialrequests'),
  }
  if (columns.number < 0) columns.number = 0

  let record = 'Manifest'
  const travelers = []
  rows.slice(headerIndex + 1).forEach((row) => {
    const firstText = clean(row.find((value) => clean(value)))
    if (/^records?\s+\d+/i.test(firstText)) record = firstText
    const rowNumber = clean(row[columns.number])
    const firstName = clean(row[columns.first])
    const lastName = clean(row[columns.last])
    if (!/^\d+$/.test(rowNumber) || !firstName || !lastName) return
    const middleName = clean(row[columns.middle])
    travelers.push({
      id: `manifest-${travelers.length + 1}`,
      firstName,
      middleName,
      lastName,
      displayName: [firstName, middleName, lastName].filter(Boolean).join(' '),
      ticketName: `${lastName}/${[firstName, middleName].filter(Boolean).join(' ')}`.toUpperCase(),
      requests: clean(row[columns.requests]),
      record,
    })
  })
  if (travelers.length === 0) throw new Error('The worksheet did not contain any passenger rows beneath the detected headings.')
  return travelers
}

export async function parseManifestWorkbook(file) {
  const files = await readZipFiles(await file.arrayBuffer())
  return manifestTravelersFromRows(worksheetRows(files))
}
