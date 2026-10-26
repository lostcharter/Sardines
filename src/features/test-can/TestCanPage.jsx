import { useMemo, useState } from 'react'

import { runTestCase } from './testCanRunner'
import { groupTestCaseFiles } from './testCanUtils'
import './testCan.css'

const STORAGE_KEY = 'sardines-test-can-last-run-v1'

function readPrevious() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }
  catch { return {} }
}

function changes(previous, current) {
  if (!previous) return null
  const keys = ['flightRecords', 'travelers', 'unmatchedAir', 'unmatchedPassport', 'reviews', 'companyAssigned', 'ownAir', 'assignmentReviews', 'unassignedTravelers', 'rooms']
  return keys.flatMap((key) => previous[key] === current[key] ? [] : [`${key}: ${previous[key] ?? '—'} → ${current[key]}`])
}

export default function TestCanPage() {
  const [files, setFiles] = useState([])
  const [results, setResults] = useState([])
  const [running, setRunning] = useState(false)
  const cases = useMemo(() => groupTestCaseFiles(files), [files])

  async function runAll() {
    setRunning(true)
    const previous = readPrevious()
    const next = []
    for (const testCase of cases) {
      try {
        const result = await runTestCase(testCase)
        next.push({ ...result, changes: changes(previous[result.id], result.snapshot) })
      } catch (error) {
        next.push({ id: testCase.folder, name: testCase.folder.split('/').at(-1), status: 'error', error: error.message, changes: [] })
      }
      setResults([...next])
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(next.filter((item) => item.snapshot).map((item) => [item.id, item.snapshot]))))
    setRunning(false)
  }

  function downloadExpected(result) {
    const body = JSON.stringify({ name: result.name, expected: result.snapshot }, null, 2)
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'expected.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="test-can-page">
      <header>
        <a href="/">← Sardines</a>
        <p>Developer test mode</p>
        <h1>Test Can</h1>
        <span>Run sanitized tours through the real parsing and assignment pipeline.</span>
      </header>
      <section className="test-can-controls">
        <label className="test-can-folder">Choose sample-set folder<input type="file" multiple webkitdirectory="" onChange={(event) => { setFiles([...event.target.files]); setResults([]) }} /></label>
        <div><strong>{cases.length}</strong><span>test case{cases.length === 1 ? '' : 's'} found</span></div>
        <button type="button" disabled={!cases.length || running} onClick={runAll}>{running ? 'RUNNING…' : 'RUN ALL TESTS'}</button>
      </section>
      <p className="test-can-help">Each subfolder needs one PDF, an AEVD CSV, a PPDT CSV, and optionally an RLDR CSV plus <code>expected.json</code>.</p>
      <aside className="test-can-trust"><strong>What the statuses mean:</strong> PASS means the result matched a reviewed <code>expected.json</code>. UNVERIFIED means the pipeline ran, but nobody has certified the numbers yet. A successful run alone is not a correctness test.</aside>
      <section className="test-can-results">
        {results.map((result) => (
          <details key={result.id} className={`test-can-result ${result.status}`}>
            <summary><b>{result.status === 'pass' ? '✓' : result.status === 'unverified' ? '?' : '✕'} {result.name}</b><span>{result.status === 'unverified' ? 'RUN OK · UNVERIFIED' : result.status.toUpperCase()}</span></summary>
            {result.error ? <p className="test-can-error">{result.error}</p> : <>
              {result.hasExpectations && <p><strong>Checked against:</strong> {result.expectationSource}.{result.expectationNote ? ` ${result.expectationNote}` : ''}</p>}
              <div className="test-can-metrics">{Object.entries(result.snapshot).filter(([, value]) => typeof value !== 'object').map(([key, value]) => <span key={key}><b>{value}</b>{key}</span>)}</div>
              {result.failures.length > 0 && <div><h3>Expectation failures</h3>{result.failures.map((failure) => <p key={failure.path}><code>{failure.path}</code>: expected {JSON.stringify(failure.expected)}, got {JSON.stringify(failure.actual)}</p>)}</div>}
              {!result.hasExpectations && <div className="test-can-unverified"><strong>Not a pass yet.</strong><span>Inspect these totals in Sardines and the exported workbook. Only then download and adopt the expectation file.</span><button type="button" className="test-can-baseline" onClick={() => downloadExpected(result)}>Download candidate expected.json</button></div>}
              <div><h3>Changed since last run</h3>{result.changes === null ? <p>First recorded run.</p> : result.changes.length ? result.changes.map((change) => <p key={change}>{change}</p>) : <p>No changes.</p>}</div>
              <div><h3>Quality Check</h3><p>Seating assertions are reserved here and will activate with the seating feature.</p></div>
              <pre>{JSON.stringify(result.snapshot, null, 2)}</pre>
            </>}
          </details>
        ))}
      </section>
    </main>
  )
}
