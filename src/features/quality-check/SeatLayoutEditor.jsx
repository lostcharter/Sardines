import { useId, useState } from 'react'
import { lettersForPattern, validateLayoutSections } from './layoutSections.js'

export default function SeatLayoutEditor({ map, onApply }) {
  const patternOptionsId = useId()
  const [draftsByFlight, setDraftsByFlight] = useState({})
  const [feedback, setFeedback] = useState({})
  const drafts = draftsByFlight[map.flightIndex] ?? map.sections.filter((section) => section.confirmed)
  const message = feedback[map.flightIndex]
  function update(next) {
    setDraftsByFlight((current) => ({ ...current, [map.flightIndex]: next }))
    setFeedback((current) => ({ ...current, [map.flightIndex]: null }))
  }
  function change(index, field, value) {
    const next = drafts.map((section, i) => i === index ? { ...section, [field]: value } : section)
    if (field === 'pattern') {
      try {
        const section = next[index]
        section.letters = lettersForPattern(value, map.rows.filter((row) => Number.parseInt(row.seat, 10) >= Number(section.firstRow) && Number.parseInt(row.seat, 10) <= Number(section.lastRow)).map((row) => row.seat).filter(Boolean))
      } catch { /* Keep the last letters until a complete pattern is entered. */ }
    }
    update(next)
  }
  function apply() {
    try {
      const sections = validateLayoutSections(drafts)
      onApply(sections)
      setDraftsByFlight((current) => ({ ...current, [map.flightIndex]: sections }))
      setFeedback((current) => ({ ...current, [map.flightIndex]: { text: 'Layouts applied to this flight and its Excel map. Ticket assignments are unchanged.' } }))
    } catch (error) {
      setFeedback((current) => ({ ...current, [map.flightIndex]: { error: true, text: error.message } }))
    }
  }
  return <details className="quality-check-layout-editor">
    <summary>Review layout sections <span>Choose a common layout or type your own</span></summary>
    <datalist id={patternOptionsId}>{['1-1', '1-2', '2-1', '2-2', '1-2-1', '2-2-2', '2-3', '3-2', '3-3', '2-3-2', '2-4-2', '3-3-3', '3-4-3'].map((pattern) => <option key={pattern} value={pattern} />)}</datalist>
    <p>Each section covers a row range. Cabin names are optional; two Economy sections can use different layouts. Numbers are seat groups, hyphens are aisles. Confirm the letters as well as the pattern.</p>
    {drafts.map((section, index) => <fieldset key={index}>
      <legend>Section {index + 1}</legend>
      <label>Cabin / section<input value={section.label} placeholder="Economy · forward" maxLength={80} onChange={(event) => change(index, 'label', event.target.value)} /></label>
      <label>First row<input type="number" min="1" max="999" value={section.firstRow} onChange={(event) => change(index, 'firstRow', event.target.value)} /></label>
      <label>Last row<input type="number" min="1" max="999" value={section.lastRow} onChange={(event) => change(index, 'lastRow', event.target.value)} /></label>
      <label>Pattern<input list={patternOptionsId} autoComplete="off" value={section.pattern} placeholder="Choose or type" onChange={(event) => change(index, 'pattern', event.target.value)} /></label>
      <label>Seat letters<input value={section.letters} placeholder="AB-CDEG-HJ" onChange={(event) => change(index, 'letters', event.target.value)} /></label>
      <button type="button" onClick={() => update(drafts.filter((_, i) => i !== index))}>Remove section {index + 1}</button>
      <small className="quality-check-layout-preview">Preview: {section.letters.split('-').map((group, i) => <span key={i}>{i > 0 && <em>aisle</em>}{[...group].map((letter, j) => <b key={j}>{letter}</b>)}</span>)}</small>
    </fieldset>)}
    <div className="quality-check-layout-actions">
      <button type="button" onClick={() => {
        const inferred = map.sections.find((section) => !section.confirmed && !drafts.some((draft) => Number(draft.firstRow) <= section.lastRow && Number(draft.lastRow) >= section.firstRow))
        const firstRow = drafts.length ? Number(drafts.at(-1).lastRow) + 1 : map.sections[0].firstRow
        update([...drafts, { label: '', firstRow: inferred?.firstRow ?? firstRow, lastRow: inferred?.lastRow ?? firstRow, pattern: inferred?.pattern ?? '3-3', letters: inferred?.letters ?? 'ABC-DEF' }])
      }}>Add section</button>
      <button type="button" onClick={apply}>Apply layouts to this flight</button>
    </div>
    {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'quality-check-error' : ''}>{message.text}</p>}
    <small>Rows outside confirmed sections remain inferred. Changes stay in this Quality Check session; export the workbook to keep the reviewed maps.</small>
  </details>
}
