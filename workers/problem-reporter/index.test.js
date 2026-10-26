import assert from 'node:assert/strict'
import test from 'node:test'
import { createHandler, issueBody } from './index.js'

const report = { name: 'River Coworker', category: 'Bug', screen: 'Quality Check', description: 'The export button stopped working.', turnstileToken: 'valid-test-token' }
function environment(overrides = {}) {
  return {
    ALLOWED_ORIGIN: 'https://example.workers.dev', GITHUB_OWNER: 'test-owner', GITHUB_REPO: 'private-feedback', GITHUB_ASSIGNEE: 'test-maintainer',
    GITHUB_TOKEN: 'test-only-github-secret', TURNSTILE_SECRET: 'test-only-turnstile-secret',
    REPORT_IP_LIMITER: { limit: async () => ({ success: true }) }, REPORT_GLOBAL_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  }
}
function request(body = report, options = {}) {
  return new Request('https://example.workers.dev/report', {
    method: 'POST', ...options,
    headers: { Origin: 'https://example.workers.dev', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...options.headers },
    body: JSON.stringify(body),
  })
}
function upstream(changes = {}) {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('siteverify')) return Response.json({ success: true, hostname: 'example.workers.dev', action: 'problem_report', ...changes.verification }, { status: changes.verificationStatus || 200 })
    if (options.method !== 'POST') return Response.json({ private: true, has_issues: true, ...changes.metadata }, { status: changes.metadataStatus || 200 })
    if (changes.throwCreate) throw new Error('sensitive upstream error')
    return Response.json({ number: 42, privateData: 'must not leak' }, { status: changes.createStatus || 201 })
  }
  return { calls, handler: createHandler(fetcher) }
}

test('creates a private issue with prominent self-reported name and fixed assignee; returns only issue number', async () => {
  const { handler, calls } = upstream()
  const response = await handler(request(), environment())
  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), { number: 42 })
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://example.workers.dev')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(calls.length, 3)
  const verification = JSON.parse(calls[0].options.body)
  assert.deepEqual(verification, { secret: 'test-only-turnstile-secret', response: 'valid-test-token' })
  const creation = calls[2]
  assert.equal(creation.url, 'https://api.github.com/repos/test-owner/private-feedback/issues')
  const payload = JSON.parse(creation.options.body)
  assert.deepEqual(payload.assignees, ['test-maintainer'])
  assert.equal(payload.title, '[Bug] Quality Check')
  assert.match(payload.body, /^# Submitted by\n\n```text\nRiver Coworker/)
  assert.match(payload.body, /not authenticated/)
  assert.match(payload.body, /The export button stopped working/)
  assert.doesNotMatch(payload.body, /192\.0\.2|test-only|valid-test-token/)
})

test('assignment can be omitted without preventing reports', async () => {
  const { handler, calls } = upstream()
  assert.equal((await handler(request(), environment({ GITHUB_ASSIGNEE: '' }))).status, 201)
  assert.equal(JSON.parse(calls[2].options.body).assignees, undefined)
})

test('CORS preflight only permits the configured origin, POST, and Content-Type', async () => {
  const { handler, calls } = upstream()
  const preflight = (headers = {}) => new Request('https://example.workers.dev/report', { method: 'OPTIONS', headers: { Origin: 'https://example.workers.dev', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type', ...headers } })
  assert.equal((await handler(preflight(), environment())).status, 204)
  assert.equal((await handler(preflight({ 'Access-Control-Request-Method': 'DELETE' }), environment())).status, 403)
  assert.equal((await handler(preflight({ 'Access-Control-Request-Headers': 'Authorization' }), environment())).status, 403)
  const blocked = await handler(preflight({ Origin: 'https://evil.example' }), environment())
  assert.equal(blocked.status, 403)
  assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), null)
  assert.equal(calls.length, 0)
})

test('rejects missing origin, incorrect origin, missing IP, wrong path and non-JSON requests', async () => {
  const { handler, calls } = upstream()
  for (const headers of [{ Origin: '' }, { Origin: 'https://evil.example' }, { 'CF-Connecting-IP': '' }]) assert.equal((await handler(request(report, { headers }), environment())).status, 403)
  assert.equal((await handler(request(report, { headers: { 'Content-Type': 'multipart/form-data' } }), environment())).status, 415)
  assert.equal((await handler(new Request('https://example.workers.dev/elsewhere', { headers: { Origin: 'https://example.workers.dev' } }), environment())).status, 404)
  assert.equal((await handler(new Request('https://example.workers.dev/report', { headers: { Origin: 'https://example.workers.dev' } }), environment())).status, 405)
  assert.equal(calls.length, 0)
})

test('fails closed when secrets, configuration, or a limiter are unavailable', async () => {
  const { handler, calls } = upstream()
  for (const overrides of [{ GITHUB_TOKEN: '' }, { TURNSTILE_SECRET: '' }, { ALLOWED_ORIGIN: 'http://example.workers.dev' }, { GITHUB_OWNER: 'owner/path' }, { GITHUB_REPO: '' }, { REPORT_IP_LIMITER: null }, { REPORT_GLOBAL_LIMITER: null }, { REPORT_IP_LIMITER: { limit: async () => { throw new Error('outage') } } }]) assert.equal((await handler(request(), environment(overrides))).status, 503)
  assert.equal(calls.length, 0)
})

test('both per-IP and aggregate rate limits stop upstream requests', async () => {
  for (const binding of ['REPORT_IP_LIMITER', 'REPORT_GLOBAL_LIMITER']) {
    const { handler, calls } = upstream()
    const response = await handler(request(), environment({ [binding]: { limit: async () => ({ success: false }) } }))
    assert.equal(response.status, 429)
    assert.equal(response.headers.get('Retry-After'), '60')
    assert.equal(calls.length, 0)
  }
})

test('rejects unknown fields, invalid forms, oversized and malformed bodies before contacting services', async () => {
  const { handler, calls } = upstream()
  for (const body of [null, [], { ...report, name: ' ' }, { ...report, name: 'a'.repeat(81) }, { ...report, name: 'Name\nInjection' }, { ...report, category: 'other' }, { ...report, screen: 'passenger name' }, { ...report, description: 'short' }, { ...report, description: 'a'.repeat(4001) }, { ...report, turnstileToken: '' }, { ...report, turnstileToken: 'a'.repeat(2049) }, { ...report, files: ['private.pdf'] }, { ...report, assignees: ['attacker'] }, { ...report, repo: 'public' }]) assert.equal((await handler(request(body), environment())).status, 400)
  assert.equal((await handler(request({ ...report, description: 'a'.repeat(21000) }), environment())).status, 413)
  const malformed = new Request('https://example.workers.dev/report', { method: 'POST', headers: request().headers, body: '{bad json' })
  assert.equal((await handler(malformed, environment())).status, 400)
  assert.equal(calls.length, 0)
})

test('rejects invalid, replayed, wrong-host and wrong-action Turnstile tokens', async () => {
  for (const verification of [{ success: false, 'error-codes': ['timeout-or-duplicate'] }, { success: false }, { hostname: 'evil.example' }, { action: 'login' }]) {
    const { handler, calls } = upstream({ verification })
    assert.equal((await handler(request(), environment())).status, 403)
    assert.equal(calls.length, 1)
  }
})

test('never files reports in a public repository or one with Issues disabled', async () => {
  for (const metadata of [{ private: false }, { has_issues: false }]) {
    const { handler, calls } = upstream({ metadata })
    assert.equal((await handler(request(), environment())).status, 503)
    assert.equal(calls.length, 2)
  }
})

test('handles provider errors without leaking bodies or automatically retrying creation', async () => {
  for (const [changes, expected] of [[{ verificationStatus: 503 }, 503], [{ metadataStatus: 401 }, 503], [{ createStatus: 422 }, 503], [{ createStatus: 429 }, 503], [{ createStatus: 500 }, 504], [{ throwCreate: true }, 504]]) {
    const { handler, calls } = upstream(changes)
    const response = await handler(request(), environment())
    assert.equal(response.status, expected)
    assert.deepEqual(await response.json(), {})
    assert.ok(calls.filter((call) => call.url.endsWith('/issues')).length <= 1)
  }
})

test('untrusted Markdown cannot escape its literal block or activate mentions', () => {
  const body = issueBody({ ...report, name: '@everyone ` name', description: '```\n@someone ![tracking](https://evil.example)\n```' }, new Date('2026-10-25T12:00:00Z'))
  assert.match(body, /```text\n@everyone ` name\n```/)
  assert.match(body, /````text\n```\n@someone/)
  assert.match(body, /Received:\*\* 2026-10-25T12:00:00.000Z/)
})

test('reporter assets are served on their own origin with no opener, referrer, or framing access', async () => {
  const { handler, calls } = upstream()
  const env = environment({ REPORTER_ASSETS: { fetch: async () => new Response('<html>Reporter only</html>', { headers: { 'Content-Type': 'text/html' } }) } })
  const response = await handler(new Request('https://example.workers.dev/?screen=Quality%20Check'), env)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin')
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer')
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY')
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/)
  assert.match(response.headers.get('Content-Security-Policy'), /connect-src 'self' https:\/\/challenges.cloudflare.com/)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
  assert.equal(calls.length, 0)
  assert.equal((await handler(new Request('https://example.workers.dev/'), environment())).status, 503)
})

test('old passenger-page origin and its Turnstile tokens are no longer authorized', async () => {
  const { handler, calls } = upstream()
  assert.equal((await handler(request(report, { headers: { Origin: 'https://lostcharter.github.io' } }), environment())).status, 403)
  assert.equal(calls.length, 0)
  const oldToken = upstream({ verification: { hostname: 'lostcharter.github.io' } })
  assert.equal((await oldToken.handler(request(), environment())).status, 403)
  assert.equal(oldToken.calls.length, 1)
})
