export function groupTestCaseFiles(files) {
  const groups = new Map()
  for (const file of files ?? []) {
    const relative = file.webkitRelativePath || file.name
    const parts = relative.split('/').filter(Boolean)
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Selected files'
    if (!groups.has(folder)) groups.set(folder, [])
    groups.get(folder).push(file)
  }
  return [...groups]
    .filter(([, caseFiles]) => caseFiles.some((file) => /\.(?:pdf|csv)$/i.test(file.name)))
    .map(([folder, caseFiles]) => ({ folder, files: caseFiles }))
}

export function compareExpected(actual, expected, prefix = '') {
  return Object.entries(expected ?? {}).flatMap(([key, expectedValue]) => {
    const path = prefix ? `${prefix}.${key}` : key
    const actualValue = actual?.[key]
    if (expectedValue && typeof expectedValue === 'object' && !Array.isArray(expectedValue)) {
      return compareExpected(actualValue, expectedValue, path)
    }
    return Object.is(actualValue, expectedValue)
      ? []
      : [{ path, expected: expectedValue, actual: actualValue }]
  })
}
