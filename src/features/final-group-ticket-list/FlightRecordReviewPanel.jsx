import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { flightRecordDisplayLabel, flightRecordItineraryPath } from './flightRecordDisplay'
import { assignTravelersToRecord, companyTravelerRoster, updateBulkSelection } from './bulkFlightAssignments'
import { compareTravelerAssignments, compareTravelerMatches } from './travelerSorting'

function travelerName(match) {
  const traveler =
    match?.ppdt ??
    match?.aevd ??
    {}

  return (
    traveler.displayName ||
    traveler.travelerName ||
    [
      traveler.firstName,
      traveler.middleName,
      traveler.lastName,
    ]
      .filter(Boolean)
      .join(' ') ||
    'Unknown traveler'
  )
}

function travelerNumber(match) {
  return (
    match?.ppdt
      ?.travelerNumber ||
    ''
  )
}

function reservationNumber(match) {
  return (
    match?.aevd
      ?.reservationNumber ||
    match?.ppdt
      ?.reservationNumber ||
    match?.ppdt
      ?.reservationId ||
    ''
  )
}

function travelerKey(match) {
  return (
    travelerNumber(match) ||
    [
      travelerName(match),
      reservationNumber(match),
      match?.ppdt
        ?.dateOfBirth ||
        match?.aevd
          ?.dateOfBirth ||
        '',
    ].join('|')
  )
}

function recordNumber(record) {
  return Number(
    record?.recordNumber
  )
}

function recordLabel(record) {
  return flightRecordDisplayLabel(record)
}

function recordCapacity(record) {
  const value =
    Number(
      record?.passengerCount
    )

  return Number.isFinite(
    value
  )
    ? value
    : 0
}

function sharedGroupIsBalanced(
  group,
  groupIndex,
  selections
) {
  const record = group.defaultRecord
  const key = `${groupIndex}-${record.recordNumber}`
  const selectedOwnAir = selections[key] ?? []
  const contractedSeats = (group.records ?? [record])
    .reduce(
      (total, item) => total + recordCapacity(item),
      0
    )
  return (
    (group.travelers ?? []).length + selectedOwnAir.length ===
    contractedSeats
  )
}

function BulkTravelerSelector({ travelers, excludedKeys, openSeats, onAssign }) {
  const [query, setQuery] = useState('')
  const [selectedKeys, setSelectedKeys] = useState([])
  const [anchorKey, setAnchorKey] = useState('')
  const excluded = new Set(excludedKeys)
  const selected = new Set(selectedKeys)
  const normalized = query.trim().toLowerCase()
  const available = travelers.filter((match) => !excluded.has(travelerKey(match))).sort(compareTravelerMatches)
  const visible = available.filter((match) =>
    !normalized ||
    travelerName(match).toLowerCase().includes(normalized) ||
    reservationNumber(match).toLowerCase().includes(normalized) ||
    travelerNumber(match).toLowerCase().includes(normalized)
  )
  const chosen = available.filter((match) => selected.has(travelerKey(match)))

  function select(match, event) {
    const key = travelerKey(match)
    const next = updateBulkSelection({
      currentKeys: selectedKeys,
      visibleKeys: visible.map(travelerKey),
      clickedKey: key,
      anchorKey,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey || event.metaKey,
    })
    setSelectedKeys(next.selectedKeys)
    setAnchorKey(next.anchorKey)
  }

  return (
    <div className="own-air-traveler-selector open bulk-traveler-selector">
      <div className="own-air-traveler-selector-heading">
        <span>Choose travelers <small>Click to toggle · Shift-click for a range</small></span>
        <strong>{chosen.length} selected · {openSeats} open</strong>
      </div>
      <div className="own-air-traveler-selector-body">
        <input type="search" value={query} placeholder="Optional: filter by name, reservation, or traveler number..." onChange={(event) => setQuery(event.target.value)} />
        <div className="bulk-traveler-actions">
          <button type="button" onClick={() => setSelectedKeys(visible.map(travelerKey))}>Select filtered</button>
          <button type="button" onClick={() => setSelectedKeys([])}>Clear</button>
          <button
            type="button"
            className="tin-button"
            disabled={chosen.length === 0}
            onClick={() => { onAssign(chosen); setSelectedKeys([]) }}
          >
            Assign {chosen.length || ''} selected traveler{chosen.length === 1 ? '' : 's'}
          </button>
        </div>
        <div className="own-air-traveler-grid">
          {visible.map((match) => {
            const isSelected = selected.has(travelerKey(match))
            return (
              <button key={travelerKey(match)} type="button" className={isSelected ? 'selected' : ''} aria-pressed={isSelected} onClick={(event) => select(match, event)}>
                <span className="record-traveler-identity">
                  <span>{travelerName(match)}</span>
                  <small>{reservationNumber(match) && `Res ${reservationNumber(match)}`}</small>
                </span>
                <span className="own-air-selection-mark" aria-hidden="true">{isSelected ? '✓ Selected' : '+ Select'}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TravelerChip({
  match,
  onRemove,
}) {
  return (
    <div className="record-traveler-chip">
      <div className="record-traveler-identity">
        <span>
          {
            travelerName(
              match
            )
          }
        </span>

        {(reservationNumber(match) ||
          travelerNumber(match)) && (
          <small>
            {reservationNumber(match) &&
              `Res ${reservationNumber(match)}`}
            {reservationNumber(match) &&
              travelerNumber(match) &&
              ' · '}
            {travelerNumber(match) &&
              `Traveler #${travelerNumber(match)}`}
          </small>
        )}
      </div>

      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${travelerName(
            match
          )}`}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  )
}

function OwnAirTravelerSelector({
  travelers,
  selected,
  onToggle,
}) {
  const [query, setQuery] = useState('')
  const selectedKeys = new Set(selected.map((match) => travelerKey(match)))
  const normalized = query.trim().toLowerCase()
  const visibleTravelers = travelers
    .filter((match) =>
      normalized.length === 0 ||
      travelerName(match).toLowerCase().includes(normalized) ||
      reservationNumber(match).toLowerCase().includes(normalized) ||
      travelerNumber(match).toLowerCase().includes(normalized)
    )
    .sort(compareTravelerMatches)

  return (
    <div className="own-air-traveler-selector open">
      <div className="own-air-traveler-selector-heading">
        <span>Decide for each Own Air traveler</span>
        <strong>{selected.length}/{travelers.length} included</strong>
      </div>
      <div className="own-air-traveler-selector-body">
        <input
          type="search"
          value={query}
          placeholder="Filter by name, reservation, or traveler number..."
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="own-air-traveler-grid">
          {visibleTravelers.map((match) => {
            const selectedTraveler = selectedKeys.has(travelerKey(match))

            return (
              <button
                key={travelerKey(match)}
                type="button"
                className={selectedTraveler ? 'selected' : ''}
                aria-pressed={selectedTraveler}
                onClick={() => onToggle(match, !selectedTraveler)}
              >
                <span className="record-traveler-identity">
                  <span>{travelerName(match)}</span>
                  <small>
                    {reservationNumber(match) && `Res ${reservationNumber(match)}`}
                    {reservationNumber(match) && travelerNumber(match) && ' · '}
                    {travelerNumber(match) && `Traveler #${travelerNumber(match)}`}
                  </small>
                </span>
                <span className="own-air-selection-mark" aria-hidden="true">
                  {selectedTraveler ? '✓ Included' : '+ Include'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FlightRecordReviewPanel({
  flightAssignments,
  onEffectiveAssignmentsChange,
  focusedRecord,
  onMarkSeparatelyTicketed,
}) {
  const [
    companyOverrides,
    setCompanyOverrides,
  ] = useState({})

  const [
    sharedOwnAirSelections,
    setSharedOwnAirSelections,
  ] = useState({})

  const [
    sharedRosterConfirmations,
    setSharedRosterConfirmations,
  ] = useState({})

  const [
    recordWarningAcknowledgements,
    setRecordWarningAcknowledgements,
  ] = useState({})

  const {
    companyAssignments = [],
    companyRecordStatus = [],
    tourFlightReviewGroups = [],
  } = flightAssignments ?? {}

  const ownAirTravelers =
    companyAssignments
      .filter(
        (assignment) =>
          assignment.assignmentType ===
            'own-air'
      )
      .map(
        (assignment) =>
          assignment.match
      )

  const companyTravelers = companyTravelerRoster(companyAssignments)
  const travelersNeedingRecord = companyAssignments.filter((assignment) =>
    assignment.recordNumber == null &&
    assignment.reviewRequired &&
    !['own-air'].includes(assignment.assignmentType)
  )

  const effectiveCompanyAssignments =
    useMemo(
      () =>
        companyAssignments.map(
          (assignment) => {
            const key =
              travelerKey(
                assignment.match
              )

            const override =
              companyOverrides[
                key
              ]

            if (!override) {
              return assignment
            }

            return {
              ...assignment,

              recordNumber:
                override.recordNumber,

              record:
                override.record,

              assignmentType:
                'manual',

              reviewRequired:
                false,

              reviewReason:
                'Manually assigned.',
            }
          }
        ),
      [
        companyAssignments,
        companyOverrides,
      ]
    )

  const effectiveTourFlightAssignments =
    useMemo(
      () => {
        const resolved = [
          ...(flightAssignments
            .tourFlightAssignments ??
          []),
        ]

        tourFlightReviewGroups.forEach(
          (group, groupIndex) => {
            ;(group.travelers ?? []).forEach(
              (match) => {
                resolved.push({
                  match,
                  recordNumber:
                    group.defaultRecord.recordNumber,
                  record:
                    group.defaultRecord,
                  assignmentType:
                    'shared-flight-default',
                  reviewRequired:
                    false,
                  reviewReason:
                    'Included on the shared contracted flight as a Company Air traveler.',
                })
              }
            )

            const record =
              group.defaultRecord
            const key =
              `${groupIndex}-${record.recordNumber}`

            ;(sharedOwnAirSelections[key] ?? [])
              .forEach(
                (match) => {
                  resolved.push({
                    match,
                    recordNumber:
                      record.recordNumber,
                    record,
                    assignmentType:
                      'shared-flight-own-air-exception',
                    reviewRequired:
                      false,
                    reviewReason:
                      'Own Air traveler explicitly added to shared contracted flight.',
                  })
                }
              )
          }
        )

        return resolved
      },
      [
        flightAssignments,
        tourFlightReviewGroups,
        sharedOwnAirSelections,
      ]
    )

  const sharedFlightConfirmed =
    tourFlightReviewGroups.length === 0 ||
    tourFlightReviewGroups.every(
      (group, groupIndex) =>
        sharedGroupIsBalanced(group, groupIndex, sharedOwnAirSelections) ||
        sharedRosterConfirmations[groupIndex] ===
          true
    )

  const unresolvedCompanyTravelers = useMemo(
    () => effectiveCompanyAssignments.filter(
      (assignment) =>
        assignment.recordNumber == null &&
        assignment.reviewRequired &&
        assignment.assignmentType !== 'own-air'
    ),
    [effectiveCompanyAssignments]
  )

  const flightWarningsConfirmed =
    unresolvedCompanyTravelers.length === 0 &&
    companyRecordStatus.every(
      (status) => {
        const assignedCount =
          effectiveCompanyAssignments.filter(
            (assignment) =>
              Number(assignment.recordNumber) ===
                recordNumber(status.record)
          ).length
        const balanced =
          assignedCount ===
            recordCapacity(status.record)

        return balanced ||
          recordWarningAcknowledgements[
            status.record.recordNumber
          ] === true
      }
    )

  useEffect(
    () => {
      onEffectiveAssignmentsChange?.({
        companyAssignments:
          effectiveCompanyAssignments,
        tourFlightAssignments:
          effectiveTourFlightAssignments,
        sharedFlightConfirmed,
        flightWarningsConfirmed,
        pendingConfirmations: [
          ...unresolvedCompanyTravelers.map((assignment) => ({
            id: `flight-traveler-${travelerKey(assignment.match)}`,
            label: `Resolve flight record for ${travelerName(assignment.match)}`,
          })),
          ...companyRecordStatus.flatMap((status) => {
            const assignedCount =
              effectiveCompanyAssignments.filter(
                (assignment) =>
                  Number(assignment.recordNumber) ===
                    recordNumber(status.record)
              ).length
            const balanced =
              assignedCount === recordCapacity(status.record)
            const confirmed =
              recordWarningAcknowledgements[
                status.record.recordNumber
              ] === true

            return balanced || confirmed
              ? []
              : [{
                id: `flight-confirm-record-${status.record.recordNumber}`,
                label: `Confirm Record ${status.record.recordNumber} (${assignedCount}/${recordCapacity(status.record)})`,
              }]
          }),
          ...tourFlightReviewGroups.flatMap((group, groupIndex) =>
            sharedGroupIsBalanced(group, groupIndex, sharedOwnAirSelections) ||
            sharedRosterConfirmations[groupIndex] === true
              ? []
              : [{
                id: `shared-flight-confirm-${groupIndex}`,
                label: `Confirm shared Records ${(group.records ?? [group.defaultRecord]).map((record) => record.recordNumber).join(' & ')}`,
              }]
          ),
        ],
      })
    },
    [
      effectiveCompanyAssignments,
      effectiveTourFlightAssignments,
      sharedFlightConfirmed,
      flightWarningsConfirmed,
      unresolvedCompanyTravelers,
      companyRecordStatus,
      recordWarningAcknowledgements,
      sharedOwnAirSelections,
      sharedRosterConfirmations,
      tourFlightReviewGroups,
      onEffectiveAssignmentsChange,
    ]
  )

  useEffect(() => {
    if (!focusedRecord?.recordNumber) return
    const target = document.getElementById(`flight-record-${focusedRecord.recordNumber}`)
    if (!target) return
    target.open = true
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    target.classList.add('record-navigation-target')
    const timeout = window.setTimeout(() => target.classList.remove('record-navigation-target'), 1600)
    return () => window.clearTimeout(timeout)
  }, [focusedRecord])

  if (!flightAssignments) {
    return null
  }

  const companyCards =
    companyRecordStatus.map(
      (status) => {
        const assigned =
          effectiveCompanyAssignments
            .filter(
              (assignment) =>
                Number(
                  assignment
                    .recordNumber
                ) ===
                recordNumber(
                  status.record
                )
            )
            .sort(compareTravelerAssignments)

        const capacity =
          recordCapacity(
            status.record
          )

        const remaining =
          capacity -
          assigned.length

        return {
          ...status,

          assigned,
          capacity,
          remaining,

          balanced:
            remaining === 0,

          overfilled:
            remaining < 0,

          underfilled:
            remaining > 0,
        }
      }
    )

  function assignSeveralCompanyTravelers(matches, targetRecord) {
    setCompanyOverrides((current) =>
      assignTravelersToRecord(current, matches, targetRecord)
    )
    setRecordWarningAcknowledgements({})
  }

  function removeCompanyOverride(
    match
  ) {
    const key =
      travelerKey(
        match
      )

    setCompanyOverrides(
      (current) => {
        const next = {
          ...current,
        }

        delete next[key]

        return next
      }
    )

    setRecordWarningAcknowledgements({})
  }

  function setOwnAirOnSharedRecord(
    groupIndex,
    record,
    match,
    include
  ) {
    const key =
      `${groupIndex}-${record.recordNumber}`
    const matchKey =
      travelerKey(match)

    setSharedOwnAirSelections(
      (current) => {
        const existing =
          current[key] ?? []
        const next = include
          ? existing.some(
              (item) =>
                travelerKey(item) ===
                  matchKey
            )
            ? existing
            : [...existing, match]
          : existing.filter(
              (item) =>
                travelerKey(item) !==
                  matchKey
            )

        return {
          ...current,
          [key]: next,
        }
      }
    )

    setSharedRosterConfirmations(
      (current) => ({
        ...current,
        [groupIndex]: false,
      })
    )
  }

  return (
    <section className="flight-record-review-panel">
      <div className="flight-record-review-heading">
        <div>
          <h3>
            Flight Records
          </h3>

          <p>
            Sardines made the
            obvious assignments.
            Check anything that
            doesn't fit neatly in
            the tin.
          </p>
        </div>
      </div>

      {travelersNeedingRecord.length > 0 && (
        <section className="traveler-record-decisions">
          <h4>Unaccounted for</h4>
          <p className="traveler-record-decisions-intro">
            These Company Air travelers do not have a valid contract record. Resolve each traveler before export.
          </p>
          {travelersNeedingRecord.map((assignment) => (
            <article
              key={travelerKey(assignment.match)}
              id={`flight-traveler-${travelerKey(assignment.match)}`}
            >
              <div>
                <strong>
                  <span className="unaccounted-status">Unaccounted for</span>
                  {travelerName(assignment.match)}
                </strong>
                <p>{assignment.reviewReason}</p>
              </div>
              <button
                type="button"
                className="tin-button"
                title="Mark as Own Air in Sardines and exclude from the FMG group-ticket manifest."
                onClick={() => onMarkSeparatelyTicketed?.(assignment.match)}
              >
                Separately ticketed
              </button>
            </article>
          ))}
        </section>
      )}

      <div className="flight-record-review-grid">
        {companyCards.map(
          (card) => {
            const statusText =
              card.balanced
                ? 'Complete'
                : card.overfilled
                  ? `${Math.abs(
                    card.remaining
                  )} over`
                  : `${card.remaining} open`

            return (
              <details
                id={`flight-record-${card.record.recordNumber}`}
                key={
                  card.record
                    .recordNumber
                }
                className={
                  card.balanced
                    ? 'flight-record-card complete'
                    : 'flight-record-card review'
                }
              >
                <summary>
                  <div className="flight-record-summary-main">
                    <div className="flight-record-summary-copy">
                      <strong>
                        {
                          recordLabel(
                            card.record
                          )
                        }
                      </strong>
                      {flightRecordItineraryPath(card.record) && (
                        <small>Actual flights: {flightRecordItineraryPath(card.record)}</small>
                      )}
                    </div>

                    <span>
                      {card.underfilled
                        ? `${card.assigned.length} travelers + ${card.remaining} unfilled = ${card.capacity} seats`
                        : `${card.assigned.length}/${card.capacity} travelers`}
                    </span>
                  </div>

                  <span
                    className={
                      card.balanced
                        ? 'flight-record-status complete'
                        : 'flight-record-status review'
                    }
                  >
                    {card.balanced
                      ? '✓ Complete'
                      : `⚠ Action required · ${statusText}`}
                  </span>

                  {!card.balanced && (
                    <label
                      id={`flight-confirm-record-${card.record.recordNumber}`}
                      className={`record-summary-confirmation${
                        recordWarningAcknowledgements[
                          card.record.recordNumber
                        ] === true
                          ? ' confirmed'
                          : ''
                      }`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={
                          recordWarningAcknowledgements[
                            card.record.recordNumber
                          ] === true
                        }
                        onChange={(event) =>
                          setRecordWarningAcknowledgements(
                            (current) => ({
                              ...current,
                              [card.record.recordNumber]:
                                event.target.checked,
                            })
                          )
                        }
                      />

                      <span
                        className="confirmation-dial"
                        aria-hidden="true"
                      />

                      <span className="confirmation-copy">
                        {recordWarningAcknowledgements[
                          card.record.recordNumber
                        ] === true
                          ? 'Difference approved'
                          : 'I reviewed this difference'}
                      </span>
                    </label>
                  )}
                </summary>

                <div className="flight-record-card-body">
                  {card.assigned.length >
                    0 && (
                    <div className="record-traveler-list">
                      {card.assigned.map(
                        (
                          assignment
                        ) => {
                          const key =
                            travelerKey(
                              assignment
                                .match
                            )

                          const manuallyMoved =
                            Boolean(
                              companyOverrides[
                                key
                              ]
                            )

                          return (
                            <TravelerChip
                              key={key}
                              match={
                                assignment
                                  .match
                              }
                              onRemove={
                                manuallyMoved
                                  ? () =>
                                    removeCompanyOverride(
                                      assignment
                                        .match
                                    )
                                  : null
                              }
                            />
                          )
                        }
                      )}
                    </div>
                  )}

                  {card.underfilled && (
                    <div className="record-capacity-warning">
                      <strong>
                        ⚠ Seats without names
                      </strong>

                      <p>
                        {
                          card.remaining
                        }{' '}
                        contracted seat
                        {card.remaining === 1
                          ? ''
                          : 's'}{' '}
                        {card.remaining === 1
                          ? 'does'
                          : 'do'}{' '}
                        not currently have a
                        traveler assigned.
                      </p>

                      <p>
                        Confirm whether the
                        seat
                        {card.remaining === 1
                          ? ''
                          : 's'}{' '}
                        will be released,
                        intentionally held, or
                        otherwise handled before
                        final names are submitted.
                      </p>

                      <details>
                        <summary>
                          Assign travelers to this record
                        </summary>

                        <BulkTravelerSelector
                          travelers={companyTravelers}
                          excludedKeys={
                            card.assigned.map(
                              (
                                assignment
                              ) =>
                                travelerKey(
                                  assignment
                                    .match
                                )
                            )
                          }
                          openSeats={card.remaining}
                          onAssign={(matches) => assignSeveralCompanyTravelers(matches, card.record)}
                        />
                      </details>

                    </div>
                  )}

                  {card.overfilled && (
                    <div className="record-overfill-note">
                      <strong>
                        Something
                        doesn't fit.
                      </strong>

                      <p>
                        This record has{' '}
                        {
                          Math.abs(
                            card.remaining
                          )
                        }{' '}
                        more traveler
                        {Math.abs(
                          card.remaining
                        ) === 1
                          ? ''
                          : 's'}{' '}
                        than contracted
                        seats. Confirm
                        additional inventory
                        or move travelers to
                        the correct record.
                      </p>

                    </div>
                  )}
                </div>
              </details>
            )
          }
        )}
      </div>

      {tourFlightReviewGroups.length >
        0 && (
        <div className="tour-flight-review-section">
          <h4>
            Shared Contracted Flight Review
          </h4>

          {tourFlightReviewGroups.map(
            (group, groupIndex) => {
              const record =
                group.defaultRecord
              const ownAirKey =
                `${groupIndex}-${record.recordNumber}`
              const selectedOwnAir =
                sharedOwnAirSelections[ownAirKey] ?? []
              const companyTravelers =
                group.travelers ?? []
              const contractedSeats =
                (group.records ?? [record])
                  .reduce(
                    (total, item) =>
                      total + recordCapacity(item),
                    0
                  )
              const recordNumbers =
                (group.records ?? [record])
                  .map(
                    (item) =>
                      item.recordNumber
                  )
                  .join(' & ')
              const confirmed =
                sharedGroupIsBalanced(group, groupIndex, sharedOwnAirSelections) ||
                sharedRosterConfirmations[groupIndex] ===
                  true
              const automaticallyConfirmed =
                sharedGroupIsBalanced(group, groupIndex, sharedOwnAirSelections)

              return (
                <div
                  className="tour-flight-split-card"
                  key={group.routeKey}
                >
                  <div className="tour-flight-split-heading">
                    <div>
                      <strong>
                        Records {recordNumbers} · {group.routeKey}
                      </strong>

                      <p>
                        One physical flight movement,
                        {contractedSeats} contracted seats.
                        Company Air is included by default;
                        Own Air requires confirmation below.
                      </p>
                    </div>

                    <span className={
                      confirmed
                        ? 'flight-record-status complete'
                        : 'flight-record-status review'
                    }>
                      {confirmed
                        ? '✓ Confirmed'
                        : '⚠ Required'}
                    </span>
                  </div>

                  <details>
                    <summary>
                      Review {companyTravelers.length} Company Air travelers
                    </summary>

                    <div className="record-traveler-list">
                      {companyTravelers.map(
                        (match) => (
                          <TravelerChip
                            key={travelerKey(match)}
                            match={match}
                          />
                        )
                      )}
                    </div>
                  </details>

                  <div className="tour-flight-own-air-review">
                    <div className={`own-air-decision-alert${selectedOwnAir.length === ownAirTravelers.length ? ' complete' : ''}`}>
                      <strong>
                        {selectedOwnAir.length === ownAirTravelers.length
                          ? '✓ All travelers are accounted for on this flight.'
                          : `⚠ ${ownAirTravelers.length - selectedOwnAir.length} Own Air traveler${ownAirTravelers.length - selectedOwnAir.length === 1 ? '' : 's'} currently excluded from Records ${recordNumbers}`}
                      </strong>
                      <p>
                        Own Air describes their main air arrangement. If everyone travels on this shared in-tour flight, include the traveler{ownAirTravelers.length === 1 ? '' : 's'} below.
                      </p>
                    </div>

                    <OwnAirTravelerSelector
                      travelers={ownAirTravelers}
                      selected={selectedOwnAir}
                      onToggle={(match, included) =>
                        setOwnAirOnSharedRecord(
                          groupIndex,
                          record,
                          match,
                          included
                        )
                      }
                    />
                  </div>

                  <div className="shared-roster-confirmation-wrap">
                    <label
                      id={`shared-flight-confirm-${groupIndex}`}
                      className={`shared-roster-confirmation${
                        confirmed ? ' confirmed' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={confirmed}
                        disabled={automaticallyConfirmed}
                        onChange={(event) =>
                          setSharedRosterConfirmations(
                            (current) => ({
                              ...current,
                              [groupIndex]:
                                event.target.checked,
                            })
                          )
                        }
                      />

                      <span
                        className="confirmation-dial"
                        aria-hidden="true"
                      />

                      <span className="confirmation-copy">
                        <strong>
                          {automaticallyConfirmed
                            ? 'Roster complete'
                            : confirmed
                              ? 'Roster confirmed'
                              : 'Confirmation required'}
                        </strong>
                        <small>
                          {automaticallyConfirmed
                            ? `${companyTravelers.length + selectedOwnAir.length}/${contractedSeats} travelers accounted for; no additional confirmation needed.`
                            : 'I reviewed the Company Air and Own Air travelers on this shared flight.'}
                        </small>
                      </span>
                    </label>
                  </div>
                </div>
              )
            }
          )}
        </div>
      )}
    </section>
  )
}

export default FlightRecordReviewPanel
