import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'vite'

test('production builds keep Turnstile and the report form out of the passenger app', async () => {
  const app = await build({ build: { write: false }, logLevel: 'silent' })
  const chunks = app.output.filter((item) => item.type === 'chunk')
  assert.ok(chunks.length)
  for (const chunk of chunks) {
    assert.doesNotMatch(chunk.code, /challenges\.cloudflare\.com|siteverify|sardines-reporter-name-v1/)
    assert.ok(Object.keys(chunk.modules).every((path) => !path.replaceAll('\\', '/').includes('/workers/problem-reporter/ui/')))
  }
  const reporter = await build({ configFile: 'vite.reporter.config.js', build: { write: false }, logLevel: 'silent' })
  const reporterChunks = reporter.output.filter((item) => item.type === 'chunk')
  assert.ok(reporterChunks.some((chunk) => chunk.code.includes('https://challenges.cloudflare.com/turnstile/')))
  for (const chunk of reporterChunks) assert.ok(Object.keys(chunk.modules).every((path) => !/final-group-ticket-list|quality-check|logo-tool|pdfjs-dist|pdf-lib|papaparse/.test(path)))
})
