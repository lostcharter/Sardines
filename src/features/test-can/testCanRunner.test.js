import assert from 'node:assert/strict'
import test from 'node:test'

import { compareExpected, groupTestCaseFiles } from './testCanUtils.js'

test('groups selected files by their case folder', () => {
  const cases = groupTestCaseFiles([
    { name: 'contract.pdf', webkitRelativePath: 'samples/Italy/contract.pdf' },
    { name: 'air.csv', webkitRelativePath: 'samples/Italy/air.csv' },
    { name: 'contract.pdf', webkitRelativePath: 'samples/Domestic/contract.pdf' },
  ])
  assert.deepEqual(cases.map((item) => item.folder), ['samples/Italy', 'samples/Domestic'])
})

test('ignores documentation-only folders in a selected test pack', () => {
  const cases = groupTestCaseFiles([
    { name: 'README.md', webkitRelativePath: 'pack/README.md' },
    { name: 'EXPECTED_RESULTS.md', webkitRelativePath: 'pack/01_Clean/EXPECTED_RESULTS.md' },
    { name: 'contract.pdf', webkitRelativePath: 'pack/01_Clean/contract.pdf' },
    { name: 'air.csv', webkitRelativePath: 'pack/01_Clean/air.csv' },
  ])

  assert.equal(cases.length, 1)
  assert.equal(cases[0].folder, 'pack/01_Clean')
  assert.equal(cases[0].files.length, 3)
})

test('compares only declared expected values, including nested record counts', () => {
  const failures = compareExpected(
    { travelers: 12, recordAssignments: { 1: 8, 2: 4 }, extra: true },
    { travelers: 12, recordAssignments: { 1: 7 } }
  )
  assert.deepEqual(failures, [{ path: 'recordAssignments.1', expected: 7, actual: 8 }])
})

test('does not invent expected results for an unreviewed test case', () => {
  assert.deepEqual(compareExpected({ travelers: 12, ownAir: 1 }, {}), [])
})
