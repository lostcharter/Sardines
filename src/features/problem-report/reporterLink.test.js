import assert from 'node:assert/strict'
import test from 'node:test'
import { reporterLink } from './reporterLink.js'

test('report link drops endpoint query/hash and accepts only a fixed screen label', () => {
  const url = new URL(reporterLink('https://reporter.example/report?private=sentinel#secret', 'Quality Check', 'https://app.example'))
  assert.equal(url.origin, 'https://reporter.example')
  assert.equal(url.pathname, '/')
  assert.equal(url.hash, '')
  assert.deepEqual([...url.searchParams], [['screen', 'Quality Check']])
  assert.equal(new URL(reporterLink('https://reporter.example/report', 'Passenger sentinel', 'https://app.example')).searchParams.get('screen'), 'General')
})

test('report link refuses same-origin reporting, insecure endpoints, or credentials in the URL', () => {
  for (const endpoint of ['https://app.example/report', 'http://reporter.example/report', 'javascript:alert(1)', 'https://user:password@reporter.example/report', '']) assert.equal(reporterLink(endpoint, 'General', 'https://app.example'), null)
})
