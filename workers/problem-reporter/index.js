import { validateReport } from '../../src/features/problem-report/reportContract.js'

const MAX_BYTES = 20000
const fields = new Set(['name', 'category', 'screen', 'description', 'turnstileToken'])
const repoPart = /^[A-Za-z0-9_.-]+$/

const reporterPolicy = "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; img-src 'self' data:; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'"

async function reporterAsset(request, env) {
  try {
    if (!env.REPORTER_ASSETS) return new Response('Reporting is unavailable.', { status: 503 })
    const asset = await env.REPORTER_ASSETS.fetch(request)
    const response = new Response(asset.body, asset)
    response.headers.set('Content-Security-Policy', reporterPolicy)
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    response.headers.set('Referrer-Policy', 'no-referrer')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch { return new Response('Reporting is unavailable.', { status: 503 }) }
}

function configurationValid(env) {
  try {
    const origin = new URL(env.ALLOWED_ORIGIN)
    return origin.protocol === 'https:' && origin.origin === env.ALLOWED_ORIGIN &&
      repoPart.test(env.GITHUB_OWNER || '') && repoPart.test(env.GITHUB_REPO || '') &&
      Boolean(env.GITHUB_TOKEN && env.TURNSTILE_SECRET && env.REPORT_IP_LIMITER && env.REPORT_GLOBAL_LIMITER) &&
      (!env.GITHUB_ASSIGNEE || /^[A-Za-z0-9-]+$/.test(env.GITHUB_ASSIGNEE))
  } catch { return false }
}

async function readBoundedJson(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) throw new Error('size')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('json')
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_BYTES) { await reader.cancel(); throw new Error('size') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

function literal(text) {
  // Fences prevent supplied Markdown, links, or @mentions becoming active.
  const longest = Math.max(2, ...(text.match(/`+/g) || []).map((run) => run.length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}text\n${text}\n${fence}`
}

export function issueBody(report, now = new Date()) {
  return [
    '# Submitted by', literal(report.name.trim()),
    '_Self-reported name for follow-up; not authenticated._',
    `**Category:** ${report.category}`, `**Application screen:** ${report.screen}`,
    `**Received:** ${now.toISOString()}`,
    '## Description', literal(report.description.trim()),
    'Submitted through Sardines. No files, passenger data, application state, or logs are automatically attached.',
  ].join('\n\n')
}

export function createHandler(fetcher = fetch) {
  return async function handle(request, env) {
    const path = new URL(request.url).pathname
    if ((request.method === 'GET' || request.method === 'HEAD') && (path === '/' || path.startsWith('/assets/'))) return reporterAsset(request, env)
    const origin = request.headers.get('Origin')
    const allowed = configurationValid(env) && origin === env.ALLOWED_ORIGIN
    function reply(status, body = {}) {
      const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' }
      if (allowed) headers['Access-Control-Allow-Origin'] = origin
      if (status === 429) headers['Retry-After'] = '60'
      return new Response(status === 204 ? null : JSON.stringify(body), { status, headers })
    }
    if (!configurationValid(env)) return reply(503)
    if (!allowed) return reply(403)
    if (new URL(request.url).pathname !== '/report') return reply(404)
    if (request.method === 'OPTIONS') {
      if (request.headers.get('Access-Control-Request-Method') !== 'POST' ||
        (request.headers.get('Access-Control-Request-Headers') || '').split(',').some((header) => header.trim() && header.trim().toLowerCase() !== 'content-type')) return reply(403)
      const response = reply(204)
      response.headers.set('Access-Control-Allow-Methods', 'POST')
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
      response.headers.set('Access-Control-Max-Age', '600')
      return response
    }
    if (request.method !== 'POST') return reply(405)
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415)

    try {
      // CF supplies this header in production. No IP is stored in the issue or sent to GitHub.
      const ip = request.headers.get('CF-Connecting-IP')
      if (!ip) return reply(403)
      if (!(await env.REPORT_IP_LIMITER.limit({ key: ip })).success) return reply(429)
      if (!(await env.REPORT_GLOBAL_LIMITER.limit({ key: 'reports' })).success) return reply(429)
      let report
      try { report = await readBoundedJson(request) } catch (error) { return reply(error.message === 'size' ? 413 : 400) }
      if (validateReport(report) || Object.keys(report).some((key) => !fields.has(key)) ||
        typeof report.turnstileToken !== 'string' || !report.turnstileToken.trim() || report.turnstileToken.length > 2048) return reply(400)

      const verification = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: report.turnstileToken }),
      })
      if (!verification.ok) return reply(503)
      const verified = await verification.json()
      if (verified.success !== true || verified.hostname !== new URL(env.ALLOWED_ORIGIN).hostname || verified.action !== 'problem_report') return reply(403)

      const repoUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`
      const headers = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'Sardines-Problem-Reporter', 'Content-Type': 'application/json' }
      // Fail closed if someone points the Worker at a public repository or makes intake public.
      const metadataResponse = await fetcher(repoUrl, { headers, signal: AbortSignal.timeout(8000) })
      if (!metadataResponse.ok) return reply(503)
      const metadata = await metadataResponse.json()
      if (metadata.private !== true || metadata.has_issues !== true) return reply(503)
      const payload = {
        title: `[${report.category}] ${report.screen}`,
        body: issueBody(report),
        ...(env.GITHUB_ASSIGNEE ? { assignees: [env.GITHUB_ASSIGNEE] } : {}),
      }
      let created
      try {
        created = await fetcher(`${repoUrl}/issues`, { method: 'POST', headers, signal: AbortSignal.timeout(8000), body: JSON.stringify(payload) })
      } catch { return reply(504) } // GitHub may have accepted it; do not retry automatically.
      if (created.status === 429 || created.status === 403) return reply(503)
      if (created.status !== 201) return reply(created.status >= 500 ? 504 : 503)
      let issue
      try { issue = await created.json() } catch { return reply(504) }
      if (!Number.isSafeInteger(issue.number) || issue.number < 1) return reply(504)
      return reply(201, { number: issue.number })
    } catch {
      // No upstream errors, submitted content, or tokens are logged or returned.
      return reply(503)
    }
  }
}

export default { fetch: createHandler() }
