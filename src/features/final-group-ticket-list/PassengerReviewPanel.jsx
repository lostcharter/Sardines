import { useMemo, useState } from 'react'

import { passengerKey, passengerOverrideFromMatch } from './passengerOverrides'
import { flightRecordDisplayLabel } from './flightRecordDisplay'
import { groupUnmatchedSourceRows } from './unmatchedSourceRecords'
import { compareTravelerMatches } from './travelerSorting'

function clean(value) {
  return String(value ?? '').trim()
}

function name(match) {
  return clean(
    match?.ppdt?.displayName ??
    match?.aevd?.travelerName
  ) || 'Unknown traveler'
}

function isOwnAir(match) {
  return /\bOWN\s*AIR\b/i.test(clean(match?.aevd?.airType))
}

function sameUnmatchedName(left, right) {
  return clean(left?.firstName).toLowerCase() === clean(right?.firstName).toLowerCase() &&
    clean(left?.lastName).toLowerCase() === clean(right?.lastName).toLowerCase()
}

function unmatchedTravelerValues(row) {
  const traveler = row.unmatchedTraveler ?? {}
  return {
    firstName: traveler.firstName,
    middleName: traveler.middleName,
    lastName: traveler.lastName,
    dateOfBirth: traveler.dateOfBirth,
    gender: traveler.gender,
    citizenship: traveler.citizenship,
    passportNumber: traveler.passportNumber,
    passportExpireDate: traveler.passportExpireDate,
    ktnRaw: traveler.ktnRaw,
    frequentFlyerNumber: traveler.frequentFlyerNumber,
    airType: traveler.airType,
    departureCity: traveler.departureCity,
    travelerNumber: traveler.travelerNumber,
    reservationNumber: traveler.reservationNumber ?? traveler.reservationId,
    sourceUnmatchedType: row.sourceUnmatchedType,
    sourceUnmatchedTravelerNumber: traveler.travelerNumber,
    sourceUnmatchedReservation: traveler.reservationNumber ?? traveler.reservationId,
    sourceUnmatchedFirstName: traveler.firstName,
    sourceUnmatchedMiddleName: traveler.middleName,
    sourceUnmatchedLastName: traveler.lastName,
    sourceUnmatchedDateOfBirth: traveler.dateOfBirth,
    sourceAevd: row.unmatchedAevd,
    sourcePpdt: row.unmatchedPpdt,
  }
}

function linkedTravelerValues(airRow, passportRow) {
  const air = airRow.unmatchedTraveler ?? {}
  const passport = passportRow.unmatchedTraveler ?? {}
  return {
    ...unmatchedTravelerValues(airRow),
    firstName: passport.firstName || air.firstName,
    middleName: passport.middleName || air.middleName,
    lastName: passport.lastName || air.lastName,
    dateOfBirth: passport.dateOfBirth || air.dateOfBirth,
    gender: passport.gender,
    citizenship: passport.citizenship,
    passportNumber: passport.passportNumber,
    passportExpireDate: passport.passportExpireDate,
    ktnRaw: passport.ktnRaw || air.ktnRaw,
    travelerNumber: passport.travelerNumber,
    reservationNumber: air.reservationNumber,
    sourceUnmatchedType: 'both',
    sourceUnmatchedTravelerNumber: passport.travelerNumber,
    sourceUnmatchedReservation: air.reservationNumber,
    sourceUnmatchedFirstName: air.firstName,
    sourceUnmatchedMiddleName: air.middleName,
    sourceUnmatchedLastName: air.lastName,
    sourceUnmatchedDateOfBirth: air.dateOfBirth,
    sourceAevd: air,
    sourcePpdt: passport,
  }
}

function PassengerEditor({ source, initialDraft, flightRecords, warnings, saved, previousTraveler, nextTraveler, onNavigate, onSave, onBack, onRemove }) {
  const [draft, setDraft] = useState(initialDraft)
  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }))
  const navigate = (traveler) => {
    const savedDraft = { ...draft }
    delete savedDraft._isDraft
    const startingDraft = { ...initialDraft }
    delete startingDraft._isDraft
    if (JSON.stringify(savedDraft) !== JSON.stringify(startingDraft)) onSave(savedDraft)
    onNavigate(traveler)
  }

  return (
    <section className="tour-director-panel passenger-editor">
      <div className="tour-director-heading">
        <div>
          <h3>{name(source)}</h3>
          <p>Edit locally, then save once. Uploaded source files are never changed.</p>
        </div>
        {saved && !source?.manuallyAdded && <span className="tour-director-found">Manual correction</span>}
      </div>
      <div className="passenger-source-strip">
        {source?.manuallyAdded ? 'Added in Sardines' : `Source: ${name(source)}`} · Departure {clean(source?.aevd?.departureCity) || '—'} · {clean(source?.aevd?.airType) || 'Air type missing'}
      </div>
      {(previousTraveler || nextTraveler) && (
        <nav className="passenger-editor-navigation" aria-label="Move between travelers">
          <button type="button" disabled={!previousTraveler} onClick={() => navigate(previousTraveler)}>
            {previousTraveler ? `← ${name(previousTraveler)}` : '← Previous'}
          </button>
          <button type="button" disabled={!nextTraveler} onClick={() => navigate(nextTraveler)}>
            {nextTraveler ? `${name(nextTraveler)} →` : 'Next →'}
          </button>
        </nav>
      )}
      {warnings.length > 0 && (
        <div className="passenger-editor-warnings" role="status">
          <strong>Needs review</strong>
          <ul>
            {warnings.map((warning) => (
              <li key={warning.id}>{warning.issue}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="passenger-role-choice">
        <span>Role</span>
        <label><input type="radio" checked={draft.role !== 'tour-director'} onChange={() => update('role', 'passenger')} /> Passenger</label>
        <label><input type="radio" checked={draft.role === 'tour-director'} onChange={() => update('role', 'tour-director')} /> Additional Tour Director</label>
      </div>
      <div className="tour-director-name-grid">
        {[['firstName', 'First Name'], ['middleName', 'Middle Name'], ['lastName', 'Last Name']].map(([field, label]) => (
          <label key={field}><span>{label}</span><input value={draft[field]} onChange={(event) => update(field, event.target.value)} /></label>
        ))}
      </div>
      <div className="tour-director-compact-grid">
        <label><span>Air Type</span><select value={draft.airType} onChange={(event) => update('airType', event.target.value)}><option value="">Select</option><option value="Company Air">Company Air</option><option value="Own Air">Own Air</option></select></label>
        <label><span>Departure City</span><input value={draft.departureCity} maxLength="3" onChange={(event) => update('departureCity', event.target.value.toUpperCase())} /></label>
        <label><span>Date of Birth</span><input value={draft.dateOfBirth} placeholder="MM/DD/YYYY" onChange={(event) => update('dateOfBirth', event.target.value)} /></label>
        <label><span>Gender</span><select value={draft.gender} onChange={(event) => update('gender', event.target.value)}><option value="">Select</option><option value="M">M</option><option value="F">F</option><option value="X">X</option></select></label>
        <label><span>KTN / TSA</span><input value={draft.ktnRaw} onChange={(event) => update('ktnRaw', event.target.value)} /></label>
        <label><span>Frequent Flyer #</span><input value={draft.frequentFlyerNumber} onChange={(event) => update('frequentFlyerNumber', event.target.value)} /></label>
        <label><span>Nationality</span><input value={draft.citizenship} onChange={(event) => update('citizenship', event.target.value)} /></label>
        <label><span>Passport Number</span><input value={draft.passportNumber} onChange={(event) => update('passportNumber', event.target.value)} /></label>
        <label><span>Passport Expiration</span><input value={draft.passportExpireDate} placeholder="MM/DD/YYYY" onChange={(event) => update('passportExpireDate', event.target.value)} /></label>
        {draft.role === 'tour-director' && <label><span>Emergency Phone</span><input value={draft.phone ?? ''} onChange={(event) => update('phone', event.target.value)} /></label>}
        {draft.role === 'tour-director' && <label><span>Emergency Email</span><input value={draft.email ?? ''} onChange={(event) => update('email', event.target.value)} /></label>}
      </div>
      <label className="passenger-comments-field">
        <span>Comments / Requests</span>
        <textarea value={draft.comments ?? ''} rows="3" onChange={(event) => update('comments', event.target.value)} />
      </label>
      <fieldset className="passenger-flight-choice">
        <legend>Flights this person is on</legend>
        <p>Select every applicable record. Leave all unchecked only for Own Air.</p>
        <div>{flightRecords.map((record) => {
          const value = String(record.recordNumber)
          const selectedRecords = draft.recordNumbers ?? []
          const checked = selectedRecords.includes(value)
          return <label key={value}><input type="checkbox" checked={checked} onChange={() => update('recordNumbers', checked ? selectedRecords.filter((item) => item !== value) : [...selectedRecords, value])} /> {flightRecordDisplayLabel(record)}</label>
        })}</div>
      </fieldset>
      <div className="passenger-editor-actions">
        <button type="button" className="tour-director-link-button" onClick={() => onBack(false)}>Cancel</button>
        {source?.manuallyAdded && <button type="button" className="tour-director-link-button danger" onClick={onRemove}>Remove</button>}
        <button type="button" className="tin-button passenger-save" onClick={() => {
          const savedDraft = { ...draft }
          delete savedDraft._isDraft
          onSave(savedDraft)
          onBack(true)
        }}>Save person</button>
      </div>
    </section>
  )
}

export default function PassengerReviewPanel({
  travelers,
  flightRecords,
  flightAssignments,
  overrides,
  onChange,
  onAdd,
  onRemove,
  onDismissUnmatched,
  exceptionRows = [],
  initialAirFilter = 'all',
}) {
  const [query, setQuery] = useState('')
  const [airFilter, setAirFilter] = useState(initialAirFilter)
  const [selectedKey, setSelectedKey] = useState('')

  const assignments = useMemo(
    () => (flightAssignments?.companyAssignments ?? []).reduce((map, assignment) => {
      const key = passengerKey(assignment.match)
      map.set(key, [...(map.get(key) ?? []), assignment])
      return map
    }, new Map()),
    [flightAssignments]
  )

  const orderedTravelers = [...travelers].sort(compareTravelerMatches)

  const visible = orderedTravelers.filter((match) => {
    if (airFilter === 'own' && !isOwnAir(match)) return false
    if (airFilter === 'company' && isOwnAir(match)) return false
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return [
      name(match),
      match?.aevd?.reservationNumber,
      match?.ppdt?.travelerNumber,
    ].some((value) =>
      clean(value).toLowerCase().includes(needle)
    )
  })

  const ownAirCount = travelers.filter(isOwnAir).length
  const companyAirCount = travelers.length - ownAirCount

  function warningsForMatch(match) {
    const reservation = clean(
      match?.aevd?.reservationNumber ?? match?.ppdt?.reservationId
    )
    const travelerNumber = clean(match?.ppdt?.travelerNumber)
    return exceptionRows.filter((row) => {
      const rowTravelerNumber = clean(row.travelerNumber)
      if (
        travelerNumber &&
        rowTravelerNumber &&
        !['—', 'Not provided'].includes(rowTravelerNumber)
      ) {
        return rowTravelerNumber === travelerNumber
      }
      const rowFirst = clean(row.unmatchedTraveler?.firstName).toLowerCase()
      const rowLast = clean(row.unmatchedTraveler?.lastName).toLowerCase()
      if (rowFirst || rowLast) {
        const matchFirst = clean(
          match?.ppdt?.firstName ?? match?.aevd?.firstName
        ).toLowerCase()
        const matchLast = clean(
          match?.ppdt?.lastName ?? match?.aevd?.lastName
        ).toLowerCase()
        return rowFirst === matchFirst && rowLast === matchLast
      }
      return Boolean(reservation && clean(row.reservation) === reservation)
    })
  }

  const matchedWarningRows = new Set(
    travelers.flatMap((match) => warningsForMatch(match))
  )
  const unmatchedWarnings = exceptionRows.filter(
    (row) => !matchedWarningRows.has(row)
  )
  const unmatchedGroups = groupUnmatchedSourceRows(unmatchedWarnings)

  const selected = travelers.find(
    (match) => passengerKey(match) === selectedKey
  )
  const saved = selected ? overrides[selectedKey] : null
  const draft = selected
    ? saved ?? passengerOverrideFromMatch(selected, assignments.get(selectedKey))
    : null
  const selectedIndex = orderedTravelers.findIndex((match) => passengerKey(match) === selectedKey)
  const previousTraveler = selectedIndex > 0 ? orderedTravelers[selectedIndex - 1] : null
  const nextTraveler = selectedIndex >= 0 && selectedIndex < orderedTravelers.length - 1
    ? orderedTravelers[selectedIndex + 1]
    : null

  function addPerson(role, values) {
    const key = onAdd(role, values)
    if (key) setSelectedKey(key)
  }

  if (!selected) {
    return (
      <div className="passenger-review-panel">
        <div className="passenger-review-tools">
          <div><strong>Everyone on one roster</strong><span>Add anyone missing from the source files, including additional Tour Directors.</span></div>
          <div className="add-person-actions">
            <button type="button" onClick={() => addPerson('passenger')}>+ Add traveler</button>
            <button type="button" onClick={() => addPerson('tour-director')}>+ Add another TD</button>
          </div>
        </div>
        <input
          type="search"
          value={query}
          placeholder="Find by name, reservation, or traveler number..."
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="passenger-air-filters" aria-label="Filter travelers by air type">
          <button type="button" className={airFilter === 'all' ? 'active' : ''} onClick={() => setAirFilter('all')}>All {travelers.length}</button>
          <button type="button" className={airFilter === 'company' ? 'active' : ''} onClick={() => setAirFilter('company')}>Company Air {companyAirCount}</button>
          <button type="button" className={airFilter === 'own' ? 'active' : ''} onClick={() => setAirFilter('own')}>Own Air {ownAirCount}</button>
        </div>
        <div className="passenger-review-list">
          {visible.map((match) => {
            const key = passengerKey(match)
            const warnings = warningsForMatch(match)
            const isTourDirector =
              match?.manualRole === 'tour-director' ||
              match?.operational
            const currentOverride = overrides[key]
            const ownAir = isOwnAir(match)
            const workingDraft = currentOverride ?? passengerOverrideFromMatch(match, assignments.get(key))
            return (
              <div className={`passenger-review-card${warnings.length > 0 ? ' needs-review' : ''}`} key={key}>
              <button className="passenger-review-edit" type="button" onClick={() => setSelectedKey(key)}>
                <span className="passenger-review-title">
                  <strong>{name(match)}</strong>
                  <b>{match?.manualRole === 'tour-director' || match?.operational ? 'TD · Edit' : 'Edit'}</b>
                </span>
                <span>
                  {clean(match?.aevd?.reservationNumber) && `Res ${match.aevd.reservationNumber}`}
                  {clean(match?.aevd?.reservationNumber) && clean(match?.ppdt?.travelerNumber) && ' · '}
                  {clean(match?.ppdt?.travelerNumber) && `Traveler #${match.ppdt.travelerNumber}`}
                </span>
                <span className={`passenger-air-badge ${ownAir ? 'own' : 'company'}`}>
                  {ownAir ? 'Own Air' : 'Company Air'}
                </span>
                {warnings.length > 0 && (
                  <small>{warnings.map((row) => row.issue).join(' ')}</small>
                )}
                {currentOverride && <em>Manual correction</em>}
              </button>
              {!isTourDirector && (
                <button
                  className="passenger-make-td"
                  type="button"
                  onClick={() => onChange(
                    key,
                    {
                      ...(currentOverride ?? passengerOverrideFromMatch(match, assignments.get(key))),
                      role: 'tour-director',
                    },
                    match
                  )}
                >
                  Make TD
                </button>
              )}
              <button
                className="passenger-toggle-air"
                type="button"
                onClick={() => {
                  const nextDraft = {
                    ...workingDraft,
                    airType: ownAir ? 'Company Air' : 'Own Air',
                  }
                  if (ownAir) delete nextDraft.recordNumbers
                  else nextDraft.recordNumbers = []
                  onChange(key, nextDraft, match)
                }}
              >
                {ownAir ? 'Make Company Air' : 'Make Own Air'}
              </button>
              </div>
            )
          })}
        </div>
        {unmatchedWarnings.length > 0 && (
          <div className="passenger-unmatched-review">
            <h4>Unmatched source records</h4>
            <p>Link records that belong to the same traveler. Add only a verified person who exists in one source report.</p>
            {unmatchedGroups.map((row) => {
              const passportCandidates = row.sourceUnmatchedType === 'air'
                ? unmatchedGroups.filter((candidate) =>
                  candidate.sourceUnmatchedType === 'passport' &&
                  sameUnmatchedName(row.unmatchedTraveler, candidate.unmatchedTraveler)
                )
                : []
              const hasAirCandidate = row.sourceUnmatchedType === 'passport' &&
                unmatchedGroups.some((candidate) =>
                  candidate.sourceUnmatchedType === 'air' &&
                  sameUnmatchedName(row.unmatchedTraveler, candidate.unmatchedTraveler)
                )
              return <article key={row.id}>
                <strong>{row.name}</strong>
                <span>{row.source} · Res {row.reservation}</span>
                <small>{row.issue}</small>
                {passportCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className="unmatched-add-button"
                    onClick={() => addPerson('passenger', linkedTravelerValues(row, candidate))}
                  >
                    Link to Passport #{clean(candidate.unmatchedTraveler?.passportNumber) || clean(candidate.unmatchedTraveler?.travelerNumber) || candidate.reservation}
                  </button>
                ))}
                {hasAirCandidate && (
                  <small>Choose this Passport record from the matching Air traveler above.</small>
                )}
                {row.unmatchedTraveler && passportCandidates.length === 0 && !hasAirCandidate && (
                  <div className="unmatched-record-actions">
                    <button
                      type="button"
                      className="unmatched-add-button"
                      onClick={() => addPerson('passenger', unmatchedTravelerValues(row))}
                    >
                      Review and add traveler
                    </button>
                    <button
                      type="button"
                      className="tour-director-link-button danger"
                      title="Remove this record from this job. Uploaded files are unchanged."
                      aria-label={`Bad fish—throw out ${row.name} from this job`}
                      onClick={() => onDismissUnmatched(row)}
                    >
                      Bad fish—throw it out
                    </button>
                  </div>
                )}
              </article>
            })}
          </div>
        )}
      </div>
    )
  }

  return <PassengerEditor
    key={selectedKey}
    source={selected}
    initialDraft={draft}
    flightRecords={flightRecords}
    warnings={warningsForMatch(selected)}
    saved={saved}
    previousTraveler={previousTraveler}
    nextTraveler={nextTraveler}
    onNavigate={(match) => setSelectedKey(passengerKey(match))}
    onSave={(next) => onChange(selectedKey, next, selected)}
    onBack={(didSave) => {
      if (!didSave && selected?.manuallyAdded && saved?._isDraft) onRemove(selected.manualId)
      setSelectedKey('')
    }}
    onRemove={() => { onRemove(selected.manualId); setSelectedKey('') }}
  />
}
