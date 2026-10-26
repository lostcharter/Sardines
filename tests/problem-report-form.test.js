import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { act, createElement } from 'react'
import { NAME_STORAGE_KEY } from '../src/features/problem-report/reportContract.js'

let server, ReportForm, ProblemReporter, createRoot, dom
const config = { endpoint: 'https://example.workers.dev/report', siteKey: 'public-test-key' }
const originalFetch = globalThis.fetch
const previousGlobals = new Map(['window', 'document', 'HTMLElement', 'Event', 'IS_REACT_ACT_ENVIRONMENT'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))

before(async () => {
  dom = new JSDOM('<!doctype html><body></body>', { url: 'https://example.workers.dev/' })
  for (const key of ['window', 'document', 'HTMLElement', 'Event']) globalThis[key] = key === 'window' ? dom.window : dom.window[key]
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  ;({ createRoot } = await import('react-dom/client'))
  server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' })
  ;({ default: ReportForm } = await server.ssrLoadModule('/workers/problem-reporter/ui/ReportForm.jsx'))
  ;({ default: ProblemReporter } = await server.ssrLoadModule('/src/features/problem-report/ProblemReporter.jsx'))
})

after(async () => {
  globalThis.fetch = originalFetch
  await server?.close()
  dom?.window.close()
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
})

async function mount(options = {}) {
  document.body.innerHTML = '<div id="root"></div><input id="work-in-progress" value="unsaved work">'
  const callbacks = []
  let resets = 0
  let removals = 0
  window.turnstile = {
    render: (_container, values) => { callbacks.push(values); return 'widget' },
    reset: () => { resets += 1 }, remove: () => { removals += 1 },
  }
  const root = createRoot(document.getElementById('root'))
  await act(async () => root.render(createElement(ReportForm, { screen: 'Quality Check', config, ...options })))
  const click = async (element) => act(async () => element.click())
  const change = async (element, value) => act(async () => {
    const prototype = element instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
    element.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  const verify = async () => act(async () => callbacks.at(-1).callback('test-token'))
  const submit = async () => act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })))
  const dispose = async () => act(async () => root.unmount())
  return { click, change, verify, submit, dispose, callbacks, resets: () => resets, removals: () => removals }
}

test('form requires an editable name, remembers it across remounts, and sends only the form fields', async () => {
  window.localStorage.clear()
  let received
  globalThis.fetch = async (_url, options) => { received = JSON.parse(options.body); return Response.json({ number: 7 }, { status: 201 }) }
  let form = await mount()
  try {
    const name = document.querySelector('input[autocomplete="name"]')
    assert.equal(name.required, true)
    assert.equal(name.checkValidity(), false)
    assert.equal(document.querySelectorAll('select')[1].value, 'Quality Check')
    await form.verify()
    await form.change(document.querySelector('textarea'), 'The export button stopped working.')
    await form.submit()
    assert.match(document.querySelector('[role="alert"]').textContent, /name/)
    assert.equal(received, undefined)
    await form.change(name, 'River Coworker')
    assert.equal(window.localStorage.getItem(NAME_STORAGE_KEY), 'River Coworker')
    await form.submit()
    assert.deepEqual(received, { name: 'River Coworker', category: 'Bug', description: 'The export button stopped working.', screen: 'Quality Check', turnstileToken: 'test-token' })
    assert.match(document.querySelector('[role="status"]').textContent, /Report #7 sent/)
    assert.equal(document.querySelector('textarea').value, '')
    assert.equal(document.getElementById('work-in-progress').value, 'unsaved work')
    assert.deepEqual(Object.keys(window.localStorage), [NAME_STORAGE_KEY])
  } finally { await form.dispose() }
  form = await mount()
  try {
    assert.equal(document.querySelector('input[autocomplete="name"]').value, 'River Coworker')
    await form.change(document.querySelector('input[autocomplete="name"]'), 'New name')
    assert.equal(window.localStorage.getItem(NAME_STORAGE_KEY), 'New name')
  } finally { await form.dispose() }
})

test('submission failures preserve text, refresh the token, and leave other work usable', async () => {
  globalThis.fetch = async () => new Response(null, { status: 503 })
  const form = await mount()
  try {
    await form.change(document.querySelector('input[autocomplete="name"]'), 'River')
    await form.change(document.querySelector('textarea'), 'Description to preserve after failure.')
    await form.verify()
    await form.submit()
    assert.match(document.querySelector('[role="alert"]').textContent, /temporarily unavailable/)
    assert.equal(document.querySelector('textarea').value, 'Description to preserve after failure.')
    assert.equal(document.querySelector('button[type="submit"]').disabled, true)
    assert.equal(form.resets(), 1)
    assert.equal(document.getElementById('work-in-progress').value, 'unsaved work')
    assert.equal(document.querySelector('textarea').value, 'Description to preserve after failure.')
  } finally { await form.dispose() }
})

test('missing configuration never loads a spam widget or sends a request', async () => {
  globalThis.fetch = async () => assert.fail('must not send')
  const form = await mount({ config: { endpoint: '', siteKey: '' } })
  try {
    assert.match(document.querySelector('[role="status"]').textContent, /not configured/)
    assert.equal(document.querySelector('button[type="submit"]').disabled, true)
    assert.equal(form.callbacks.length, 0)
  } finally { await form.dispose() }
})

test('pending submission disables edits and the close button, and does not submit twice', async () => {
  let finish
  let calls = 0
  globalThis.fetch = () => { calls += 1; return new Promise((resolve) => { finish = resolve }) }
  const form = await mount()
  try {
    await form.change(document.querySelector('input[autocomplete="name"]'), 'River')
    await form.change(document.querySelector('textarea'), 'A harmless test report description.')
    await form.verify()
    await act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })))
    assert.equal(calls, 1)
    assert.equal(document.querySelector('textarea').disabled, true)
    assert.equal(document.querySelector('.problem-report-actions button').disabled, true)
    await form.submit()
    assert.equal(calls, 1)
    await act(async () => finish(Response.json({ number: 8 }, { status: 201 })))
    assert.equal(document.querySelector('textarea').disabled, false)
    assert.match(document.querySelector('[role="status"]').textContent, /Report #8 sent/)
  } finally { await form.dispose() }
})

test('expired or failed spam checks disable sending without losing text', async () => {
  const form = await mount()
  try {
    await form.change(document.querySelector('textarea'), 'Keep this unsent test description.')
    await form.verify()
    assert.equal(document.querySelector('button[type="submit"]').disabled, false)
    await act(async () => form.callbacks.at(-1)['expired-callback']())
    assert.equal(document.querySelector('button[type="submit"]').disabled, true)
    await form.verify()
    await act(async () => form.callbacks.at(-1)['error-callback']())
    assert.equal(document.querySelector('button[type="submit"]').disabled, true)
    assert.match(document.querySelector('[role="alert"]').textContent, /Spam check failed/)
    assert.equal(document.querySelector('textarea').value, 'Keep this unsent test description.')
  } finally { await form.dispose() }
})

test('operational page exposes only an isolated link; never reads storage, loads Turnstile, or sends app data', async () => {
  dom.reconfigure({ url: 'https://lostcharter.github.io/Sardines/?private=sentinel' })
  document.body.innerHTML = '<div id="root"></div><input id="work-in-progress" value="private sentinel">'
  const storageRead = window.Storage.prototype.getItem
  const turnstile = Object.getOwnPropertyDescriptor(window, 'turnstile')
  window.Storage.prototype.getItem = () => assert.fail('operational launcher must not read reporter storage')
  Object.defineProperty(window, 'turnstile', { configurable: true, get() { throw new Error('operational page must not access Turnstile') } })
  globalThis.fetch = async () => assert.fail('operational launcher must not fetch anything')
  const root = createRoot(document.getElementById('root'))
  try {
    await act(async () => root.render(createElement(ProblemReporter, { screen: 'Quality Check', passengers: ['private sentinel'] })))
    const link = document.querySelector('a.problem-report-trigger')
    const url = new URL(link.href)
    assert.equal(url.origin, 'https://sardines-problem-reporter.lostcharter-studio.workers.dev')
    assert.deepEqual([...url.searchParams], [['screen', 'Quality Check']])
    assert.equal(url.hash, '')
    assert.equal(link.target, '_blank')
    assert.ok(link.relList.contains('noopener'))
    assert.ok(link.relList.contains('noreferrer'))
    assert.equal(link.getAttribute('referrerpolicy'), 'no-referrer')
    assert.equal(document.querySelector('iframe, script, dialog'), null)
    assert.equal(document.getElementById('work-in-progress').value, 'private sentinel')
  } finally {
    await act(async () => root.unmount())
    window.Storage.prototype.getItem = storageRead
    if (turnstile) Object.defineProperty(window, 'turnstile', turnstile)
    else delete window.turnstile
    dom.reconfigure({ url: 'https://example.workers.dev/' })
  }
})
