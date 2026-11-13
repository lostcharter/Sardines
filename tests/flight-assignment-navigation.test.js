import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { act, createElement } from 'react'

let server, Panel, createRoot, dom
const globals = new Map(['window', 'document', 'HTMLElement', 'Event', 'IS_REACT_ACT_ENVIRONMENT'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
before(async () => {
  dom = new JSDOM('<body><div id="root"></div></body>')
  for (const key of ['window', 'document', 'HTMLElement', 'Event']) globalThis[key] = key === 'window' ? dom.window : dom.window[key]
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  ;({ createRoot } = await import('react-dom/client'))
  server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' })
  ;({ default: Panel } = await server.ssrLoadModule('/src/features/final-group-ticket-list/FlightRecordReviewPanel.jsx'))
})
after(async () => {
  await server?.close()
  dom?.window.close()
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
})
test('confirming an unassigned traveler clears the warning and survives hidden review navigation', async () => {
  const match = { ppdt: { travelerNumber: '101', displayName: 'Synthetic Fish' } }
  const record = { recordNumber: 1, passengerCount: 1, routing: 'ORD-FRA' }
  const flightAssignments = { companyAssignments: [{ match, recordNumber: null, reviewRequired: true, assignmentType: 'unassigned', reviewReason: 'Needs record' }], companyRecordStatus: [{ record, recordNumber: 1 }] }
  let effective
  const onEffectiveAssignmentsChange = (value) => { effective = value }
  const root = createRoot(document.getElementById('root'))
  const render = (hidden) => root.render(createElement('div', { hidden }, createElement(Panel, { flightAssignments, onEffectiveAssignmentsChange })))
  try {
    await act(async () => render(false))
    assert.ok(document.querySelector('.traveler-record-decisions'))
    const choose = [...document.querySelectorAll('.bulk-traveler-selector button')].find((button) => button.textContent.includes('Synthetic Fish'))
    await act(async () => choose.click())
    const confirm = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Confirm assignment of'))
    assert.equal(confirm.disabled, false)
    await act(async () => confirm.click())
    assert.equal(effective.companyAssignments[0].recordNumber, 1)
    assert.equal(effective.companyAssignments[0].reviewRequired, false)
    assert.equal(document.querySelector('.traveler-record-decisions'), null)
    await act(async () => render(true))
    await act(async () => render(false))
    assert.equal(effective.companyAssignments[0].recordNumber, 1)
    assert.equal(document.querySelector('.traveler-record-decisions'), null)
    assert.ok(document.querySelector('.record-traveler-chip').textContent.includes('Synthetic Fish'))
  } finally { await act(async () => root.unmount()) }
})
