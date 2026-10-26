import assert from 'node:assert/strict'
import test from 'node:test'
import { NAME_STORAGE_KEY, readReporterName, rememberReporterName, validateReport } from './reportContract.js'
import { reportingConfigured, submitReport } from './reportClient.js'

const draft = { name: ' River Coworker ', category: 'Bug', screen: 'Quality Check', description: ' The export button stopped working. ' }
const config = { endpoint: 'https://example.workers.dev/report', siteKey: 'public-test-key' }

test('requires a name, valid category/screen, and a bounded description', () => {
  assert.equal(validateReport(draft), '')
  assert.equal(validateReport({ ...draft, name: 'Zoë 李' }), '')
  for (const invalid of [null, [], { ...draft, name: '' }, { ...draft, name: ' ' }, { ...draft, name: 'a'.repeat(81) }, { ...draft, name: 'a\nb' }, { ...draft, category: 'invented' }, { ...draft, screen: 'passenger name' }, { ...draft, description: 'short' }, { ...draft, description: 'a'.repeat(4001) }]) assert.ok(validateReport(invalid))
})

test('remembers only the editable reporter name; handles blocked browser storage', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) }
  assert.equal(readReporterName(storage), '')
  rememberReporterName(storage, 'River')
  assert.equal(readReporterName(storage), 'River')
  rememberReporterName(storage, 'Changed name')
  assert.equal(readReporterName(storage), 'Changed name')
  assert.deepEqual([...values], [[NAME_STORAGE_KEY, 'Changed name']])
  rememberReporterName(storage, '')
  assert.equal(readReporterName(storage), '')
  const blocked = { getItem() { throw Error('blocked') }, setItem() { throw Error('blocked') } }
  assert.equal(readReporterName(blocked), '')
  assert.doesNotThrow(() => rememberReporterName(blocked, 'River'))
})

test('sends only explicitly permitted fields and never cookies, filenames, app data, or logs', async () => {
  let calls = 0
  const number = await submitReport(config, { ...draft, uploadedFiles: ['private.xlsx'], passengers: ['Private Person'], logs: 'private' }, 'token', async (url, options) => {
    calls += 1
    assert.equal(url, config.endpoint)
    assert.equal(options.credentials, 'omit')
    assert.equal(options.referrerPolicy, 'no-referrer')
    assert.deepEqual(JSON.parse(options.body), { name: 'River Coworker', category: 'Bug', screen: 'Quality Check', description: 'The export button stopped working.', turnstileToken: 'token' })
    return Response.json({ number: 12 }, { status: 201 })
  })
  assert.equal(number, 12)
  assert.equal(calls, 1)
})

test('invalid fields, missing configuration, and missing spam token never make network calls', async () => {
  const fetcher = () => { assert.fail('must not send') }
  await assert.rejects(submitReport(config, { ...draft, name: ' ' }, 'token', fetcher), /name/)
  await assert.rejects(submitReport({}, draft, 'token', fetcher), /not configured/)
  await assert.rejects(submitReport(config, draft, '', fetcher), /spam check/)
  assert.equal(reportingConfigured({ ...config, endpoint: 'http://example.com' }), false)
})

test('submission failures are clear, do not expose upstream data, and do not retry', async () => {
  for (const status of [400, 403, 413, 429, 503, 504]) {
    let calls = 0
    await assert.rejects(submitReport(config, draft, 'token', async () => { calls += 1; return new Response('private upstream data', { status }) }), (error) => {
      assert.doesNotMatch(error.message, /private upstream data/)
      assert.match(error.message, status === 429 ? /Wait a minute/ : status === 504 ? /may have arrived/ : /report|check|Reporting/i)
      return true
    })
    assert.equal(calls, 1)
  }
  await assert.rejects(submitReport(config, draft, 'token', async () => { throw new Error('secret network details') }), /may have arrived/)
  await assert.rejects(submitReport(config, draft, 'token', async () => Response.json({})), /Could not confirm/)
})
