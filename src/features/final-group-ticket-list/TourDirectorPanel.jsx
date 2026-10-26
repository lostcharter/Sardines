/* eslint-disable react-refresh/only-export-components */
import {
  useMemo,
  useState,
} from 'react'
import { selectedTourDirectorRecordNumbers, withTourDirectorRecordNumbers } from './tourDirectorFlightRecords.js'
import { requiredTourDirectorRecordNumbers } from './tourDirectorReadiness.js'

function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function formatDateMmDdYyyy(value) {
  const text = clean(value)
  if (!text) return ''

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  let month
  let day
  let year

  if (match) {
    year = Number(match[1])
    month = Number(match[2])
    day = Number(match[3])
  } else {
    match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
    if (!match) return text
    month = Number(match[1])
    day = Number(match[2])
    year = Number(match[3])
    if (year < 100) year += year >= 50 ? 1900 : 2000
  }

  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return text
  }

  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`
}

function firstValue(...values) {
  for (const value of values) {
    const cleaned = clean(value)

    if (cleaned) {
      return cleaned
    }
  }

  return ''
}

function isGenericTourDirectorName(value) {
  const normalized = clean(value)
    .toLowerCase()
    .replace(/[^a-z]/g, '')

  return (
    normalized === 'tourdirector' ||
    normalized === 'tourleader' ||
    normalized === 'td'
  )
}

function ensureTourDirectorRequest(value) {
  const request = clean(value)

  if (!request) {
    return 'Tour Director'
  }

  if (
    request
      .toLowerCase()
      .includes('tour director')
  ) {
    return request
  }

  return `Tour Director; ${request}`
}

function makeNames(aevd, ppdt) {
  const aevdCombined =
    firstValue(
      aevd?.displayName,
      aevd?.travelerName
    )

  const generic =
    isGenericTourDirectorName(
      aevdCombined
    )

  return {
    firstName: firstValue(
      ppdt?.firstName,
      generic
        ? ''
        : aevd?.firstName
    ),

    middleName: firstValue(
      ppdt?.middleName,
      generic
        ? ''
        : aevd?.middleName
    ),

    lastName: firstValue(
      ppdt?.lastName,
      generic
        ? ''
        : aevd?.lastName
    ),
  }
}

function buildContact({
  source,
  aevd = null,
  ppdt = null,
}) {
  const names =
    makeNames(
      aevd,
      ppdt
    )

  const existingRequests =
    firstValue(
      ppdt?.specialRequests,
      ppdt?.requests,
      aevd?.comments
    )

  return {
    present: true,
    source,

    linkedTraveler:
      source ===
      'linked-traveler',

    firstName:
      names.firstName,

    middleName:
      names.middleName,

    lastName:
      names.lastName,

    dateOfBirth:
      formatDateMmDdYyyy(
        firstValue(
          ppdt?.dateOfBirth,
          aevd?.dateOfBirth
        )
      ),

    gender:
      firstValue(
        ppdt?.gender,
        ppdt?.sex
      ),

    passportNationality:
      firstValue(
        ppdt?.passportNationality,
        ppdt?.nationality,
        ppdt?.citizenship
      ),

    passportNumber:
      firstValue(
        ppdt?.passportNumber,
        ppdt?.passportNo
      ),

    passportExpiration:
      formatDateMmDdYyyy(
        firstValue(
          ppdt?.passportExpireDate,
          ppdt?.passportExpiration,
          ppdt?.passportExpirationDate,
          ppdt?.passportExpiry
        )
      ),

    ktn:
      firstValue(
        ppdt?.ktnRaw,
        ppdt?.ktn,
        aevd?.ktnRaw
      ),

    frequentFlyerNumber:
      firstValue(
        ppdt?.frequentFlyerNumber,
        ppdt?.frequentFlyer,
        ppdt?.ffNumber
      ),

    requests:
      ensureTourDirectorRequest(
        existingRequests
      ),

    phone:
      firstValue(
        ppdt?.phone,
        ppdt?.mobileNumber,
        ppdt?.mobile
      ),

    email:
      firstValue(
        ppdt?.email,
        ppdt?.emailAddress
      ),

    reservationNumber:
      firstValue(
        aevd?.reservationNumber,
        ppdt?.reservationNumber,
        ppdt?.reservationId
      ),

    travelerNumber:
      firstValue(
        ppdt?.travelerNumber
      ),

    airType:
      firstValue(
        aevd?.airType
      ),

    departureCity:
      firstValue(
        aevd?.departureCity
      ),

    flightRecordNumber: '',
    flightRecordNumbers: [],
  }
}

function travelerCandidate(match) {
  const aevd =
    match?.aevd ?? null

  const ppdt =
    match?.ppdt ?? null

  const contact =
    buildContact({
      source:
        'linked-traveler',
      aevd,
      ppdt,
    })

  const fullName = [
    contact.firstName,
    contact.middleName,
    contact.lastName,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    match,
    contact,
    fullName,
  }
}

function matchesTypedName(
  candidate,
  typed
) {
  const first =
    normalize(
      typed.firstName
    )

  const middle =
    normalize(
      typed.middleName
    )

  const last =
    normalize(
      typed.lastName
    )

  if (
    !first &&
    !middle &&
    !last
  ) {
    return false
  }

  if (
    first &&
    !normalize(
      candidate.contact
        .firstName
    ).startsWith(first)
  ) {
    return false
  }

  if (
    middle &&
    !normalize(
      candidate.contact
        .middleName
    ).startsWith(middle)
  ) {
    return false
  }

  if (
    last &&
    !normalize(
      candidate.contact
        .lastName
    ).startsWith(last)
  ) {
    return false
  }

  return true
}

export function emptyTourDirectorContact() {
  return {
    present: null,
    source: 'not-detected',

    linkedTraveler: false,

    firstName: '',
    middleName: '',
    lastName: '',

    dateOfBirth: '',
    gender: '',

    passportNationality: '',
    passportNumber: '',
    passportExpiration: '',

    ktn: '',
    frequentFlyerNumber: '',

    requests:
      'Tour Director',

    phone: '',
    email: '',

    reservationNumber: '',
    travelerNumber: '',

    airType: '',
    departureCity: '',
    flightRecordNumber: '',
    flightRecordNumbers: [],
  }
}

export function createTourDirectorContact(
  reconciliation
) {
  const linkedMatch =
    reconciliation
      ?.matches
      ?.find(
        (match) =>
          match.operational
      )

  if (linkedMatch) {
    return buildContact({
      source: 'detected',

      aevd:
        linkedMatch.aevd,

      ppdt:
        linkedMatch.ppdt,
    })
  }

  const operationalRecord =
    reconciliation
      ?.operationalRecords
    ?.[0]

  if (operationalRecord) {
    return buildContact({
      source: 'detected',

      aevd:
        operationalRecord,

      ppdt: null,
    })
  }

  return emptyTourDirectorContact()
}

function TourDirectorPanel({
  value,
  onChange,
  travelers = [],
  flightRecords = [],
  additionalTourDirectorRecordNumbers = [],
}) {
  const [
    preview,
    setPreview,
  ] = useState(null)

  const [
    activeNameField,
    setActiveNameField,
  ] = useState(null)

  const shown =
    preview ?? value

  const candidates =
    useMemo(() => {
      if (
        value.present !== true
      ) {
        return []
      }

      return travelers
        .map(
          travelerCandidate
        )
        .filter(
          (candidate) =>
            matchesTypedName(
              candidate,
              value
            )
        )
        .slice(0, 8)
    }, [
      travelers,
      value,
    ])

  const showAutocomplete =
    Boolean(
      activeNameField
    ) &&
    candidates.length > 0 &&
    !value.linkedTraveler

  function update(
    field,
    nextValue
  ) {
    setPreview(null)

    const next = {
      ...value,
      [field]:
        nextValue,
    }

    /*
     * If somebody edits the name after
     * linking an existing traveler,
     * the TD is no longer safely linked
     * to that traveler.
     */
    if (
      value.linkedTraveler &&
      [
        'firstName',
        'middleName',
        'lastName',
      ].includes(field)
    ) {
      next.linkedTraveler =
        false

      next.source =
        'manual'

      next.travelerNumber =
        ''

      next.reservationNumber =
        ''
    }

    onChange(next)
  }

  function choosePresent(
    present
  ) {
    setPreview(null)

    if (present) {
      onChange({
        ...emptyTourDirectorContact(),

        present: true,
        source: 'manual',

        requests:
          'Tour Director',
      })

      return
    }

    onChange({
      ...emptyTourDirectorContact(),

      present: false,
      source: 'manual',
      noTourDirectorRecordNumbers:
        requiredTourDirectorRecordNumbers(flightRecords).map(String),
    })
  }

  function previewCandidate(
    candidate
  ) {
    setPreview({
      ...value,

      firstName:
        candidate.contact.firstName,

      middleName:
        candidate.contact.middleName,

      lastName:
        candidate.contact.lastName,

      dateOfBirth:
        candidate.contact.dateOfBirth,

      gender:
        candidate.contact.gender,

      passportNationality:
        candidate.contact.passportNationality,

      passportNumber:
        candidate.contact.passportNumber,

      passportExpiration:
        candidate.contact.passportExpiration,

      ktn:
        candidate.contact.ktn,

      frequentFlyerNumber:
        candidate.contact.frequentFlyerNumber,

      requests:
        ensureTourDirectorRequest(
          firstValue(
            candidate.contact.requests,
            value.requests
          )
        ),

      phone:
        firstValue(
          candidate.contact.phone,
          value.phone
        ),

      email:
        firstValue(
          candidate.contact.email,
          value.email
        ),

      /*
       * Hover is only a preview.
       * Do not preview identity linkage.
       */
      reservationNumber:
        value.reservationNumber,

      travelerNumber:
        value.travelerNumber,

      linkedTraveler:
        value.linkedTraveler,

      source:
        value.source,

      flightRecordNumber:
        value.flightRecordNumber,
      flightRecordNumbers:
        value.flightRecordNumbers,
    })
  }

  function commitCandidate(
    candidate
  ) {
    const linked = {
      ...candidate.contact,

      phone:
        firstValue(
          candidate.contact.phone,
          value.phone
        ),

      email:
        firstValue(
          candidate.contact.email,
          value.email
        ),

      requests:
        ensureTourDirectorRequest(
          firstValue(
            candidate.contact.requests,
            value.requests
          )
        ),

      present: true,
      source:
        'linked-traveler',

      linkedTraveler:
        true,

      flightRecordNumber:
        value.flightRecordNumber,
      flightRecordNumbers:
        value.flightRecordNumbers,
    }

    setPreview(null)
    setActiveNameField(null)

    onChange(linked)
  }

  if (
    value.present === null
  ) {
    return (
      <section className="tour-director-panel">
        <div className="tour-director-heading">
          <div>
            <h3>
              Tour Director
            </h3>

            <p>
              No Tour Director was identified in
              the uploaded reports.
            </p>
          </div>
        </div>

        <div className="tour-director-question">
          <strong>
            Is there a Tour Director traveling
            with this group?
          </strong>

          <div className="tour-director-choice-row">
            <button
              type="button"
              className="tour-director-choice"
              onClick={() =>
                choosePresent(
                  true
                )
              }
            >
              Yes
            </button>

            <button
              type="button"
              className="tour-director-choice secondary"
              onClick={() =>
                choosePresent(
                  false
                )
              }
            >
              No
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (
    value.present === false
  ) {
    return (
      <section className="tour-director-panel compact">
        <div className="tour-director-no">
          <div>
            <strong>
              No Tour Director
            </strong>

            <span>
              Confirmed: no Tour Director will be
              added to these flights.
            </span>
          </div>

          <button
            type="button"
            className="tour-director-link-button"
            onClick={() =>
              onChange(
                emptyTourDirectorContact()
              )
            }
          >
            Change
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="tour-director-panel">
      <div className="tour-director-heading">
        <div>
          <h3>
            Tour Director
          </h3>

          <p>
            {value.linkedTraveler
              ? 'Linked to an existing traveler.'
              : value.source ===
                'detected'
                ? 'Sardines found a Tour Director. Confirm or complete their information.'
                : 'Enter the Tour Director. Existing travelers will autocomplete as you type.'}
          </p>
        </div>

        {(value.source ===
          'detected' ||
          value.linkedTraveler) && (
            <span className="tour-director-found">
              ✓{' '}
              {value.linkedTraveler
                ? 'Linked'
                : 'Found'}
            </span>
          )}
      </div>

      {(shown.reservationNumber ||
        shown.travelerNumber) && (
          <div className="tour-director-source-info">
            {shown.reservationNumber && (
              <span>
                Reservation{' '}
                <strong>
                  {shown.reservationNumber}
                </strong>
              </span>
            )}

            {shown.reservationNumber &&
              shown.travelerNumber && (
                <span className="tour-director-meta-dot">
                  ·
                </span>
              )}

            {shown.travelerNumber && (
              <span>
                Traveler #{' '}
                <strong>
                  {shown.travelerNumber}
                </strong>
              </span>
            )}
          </div>
        )}

      <div className="tour-director-name-area">
        <div className="tour-director-name-grid">
          <label>
            <span>
              First Name
            </span>

            <input
              type="text"
              value={
                shown.firstName
              }
              placeholder="First"
              autoComplete="off"
              onFocus={() =>
                setActiveNameField(
                  'firstName'
                )
              }
              onChange={(
                event
              ) =>
                update(
                  'firstName',
                  event.target.value
                )
              }
            />
          </label>

          <label>
            <span>
              Middle Name
            </span>

            <input
              type="text"
              value={
                shown.middleName
              }
              placeholder="Middle"
              autoComplete="off"
              onFocus={() =>
                setActiveNameField(
                  'middleName'
                )
              }
              onChange={(
                event
              ) =>
                update(
                  'middleName',
                  event.target.value
                )
              }
            />
          </label>

          <label>
            <span>
              Last Name
            </span>

            <input
              type="text"
              value={
                shown.lastName
              }
              placeholder="Last"
              autoComplete="off"
              onFocus={() =>
                setActiveNameField(
                  'lastName'
                )
              }
              onChange={(
                event
              ) =>
                update(
                  'lastName',
                  event.target.value
                )
              }
            />
          </label>
        </div>

        {showAutocomplete && (
          <div
            className="tour-director-autocomplete"
            onMouseLeave={() =>
              setPreview(null)
            }
          >
            {candidates.map(
              (candidate) => (
                <button
                  key={
                    candidate.contact
                      .travelerNumber ||
                    `${candidate.fullName}-${candidate.contact.reservationNumber}`
                  }
                  type="button"
                  className="tour-director-autocomplete-option"
                  onMouseEnter={() =>
                    previewCandidate(
                      candidate
                    )
                  }
                  onFocus={() =>
                    previewCandidate(
                      candidate
                    )
                  }
                  onClick={() =>
                    commitCandidate(
                      candidate
                    )
                  }
                >
                  <strong>
                    {candidate.fullName}
                  </strong>

                  {candidate.contact
                    .travelerNumber && (
                      <span>
                        Traveler #{' '}
                        {
                          candidate
                            .contact
                            .travelerNumber
                        }
                      </span>
                    )}
                </button>
              )
            )}
          </div>
        )}
      </div>

      <div className="tour-director-compact-grid">
        <fieldset className="tour-director-record-picker">
          <legend>Flight Records</legend>
          <span className="tour-director-record-help">Select every flight record the Tour Director will use.</span>
          {flightRecords.map((record) => {
            const selected = selectedTourDirectorRecordNumbers(shown)
            const number = Number(record.recordNumber)
            const needsCoverage = Number(record.passengerCount) > 10
            const coveredByAnother = additionalTourDirectorRecordNumbers.map(Number).includes(number)
            const confirmedWithout = (value.noTourDirectorRecordNumbers ?? []).map(Number).includes(number)
            return (
              <div className="tour-director-record-row" key={record.recordNumber}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(number)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...selected, number]
                      : selected.filter((item) => item !== number)
                    setPreview(null)
                    const noDirector = (value.noTourDirectorRecordNumbers ?? [])
                      .map(Number).filter((item) => item !== number).map(String)
                    onChange({
                      ...withTourDirectorRecordNumbers(value, next),
                      noTourDirectorRecordNumbers: noDirector,
                    })
                  }}
                />
                <span>R{record.recordNumber} · {record.routing || 'Routing unavailable'} · {record.passengerCount} pax</span>
              </label>
              {needsCoverage && !selected.includes(number) && !coveredByAnother && (
                <label className="tour-director-none-choice">
                  <input
                    type="checkbox"
                    checked={confirmedWithout}
                    onChange={(event) => {
                      const current = (value.noTourDirectorRecordNumbers ?? []).map(Number)
                      const next = event.target.checked
                        ? [...new Set([...current, number])]
                        : current.filter((item) => item !== number)
                      onChange({ ...value, noTourDirectorRecordNumbers: next.map(String) })
                    }}
                  />
                  No TD on R{record.recordNumber}
                </label>
              )}
              {needsCoverage && coveredByAnother && !selected.includes(number) && (
                <small>Covered by another TD</small>
              )}
              </div>
            )
          })}
        </fieldset>

        <label>
          <span>
            Date of Birth
          </span>

          <input
            type="text"
            inputMode="numeric"
            pattern="\d{2}/\d{2}/\d{4}"
            value={
              shown.dateOfBirth
            }
            placeholder="MM/DD/YYYY"
            onChange={(
              event
            ) =>
              update(
                'dateOfBirth',
                event.target.value
              )
            }
            onBlur={(event) =>
              update(
                'dateOfBirth',
                formatDateMmDdYyyy(event.target.value)
              )
            }
          />
        </label>

        <label>
          <span>
            Gender
          </span>

          <select
            value={
              String(shown.gender || '').toUpperCase()
            }
            onChange={(
              event
            ) =>
              update(
                'gender',
                event.target.value
              )
            }
          >
            <option value="">Select</option>
            <option value="M">M</option>
            <option value="F">F</option>
            <option value="X">X</option>
          </select>
        </label>

        <label>
          <span>
            KTN / TSA
          </span>

          <input
            type="text"
            value={
              shown.ktn
            }
            placeholder="Optional"
            onChange={(
              event
            ) =>
              update(
                'ktn',
                event.target.value
              )
            }
          />
        </label>

        <label>
          <span>
            Frequent Flyer #
          </span>

          <input
            type="text"
            value={
              shown.frequentFlyerNumber
            }
            placeholder="Optional"
            onChange={(
              event
            ) =>
              update(
                'frequentFlyerNumber',
                event.target.value
              )
            }
          />
        </label>
      </div>

      <div className="tour-director-lower-grid">
        <div>
          <label className="tour-director-wide-field">
            <span>
              Requests / Preferences
            </span>

            <textarea
              className="tour-director-requests"
              value={
                shown.requests
              }
              rows="2"
              onChange={(
                event
              ) =>
                update(
                  'requests',
                  event.target.value
                )
              }
            />
          </label>
        </div>

        <div className="tour-director-contact-block">
          <div className="tour-director-section-title">
            Contact Information
          </div>

          <div className="tour-director-contact-grid">
            <label>
              <span>
                Phone
              </span>

              <input
                type="tel"
                className={!shown.phone ? 'tour-director-contact-missing' : ''}
                value={
                  shown.phone
                }
                placeholder="Mobile"
                onChange={(
                  event
                ) =>
                  update(
                    'phone',
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              <span>
                Email
              </span>

              <input
                type="email"
                className={!shown.email ? 'tour-director-contact-missing' : ''}
                value={
                  shown.email
                }
                placeholder="Email"
                onChange={(
                  event
                ) =>
                  update(
                    'email',
                    event.target.value
                  )
                }
              />
            </label>
          </div>
        </div>
      </div>

      <p className="tour-director-note">
        The Tour Director's name, phone
        number, and email will also populate
        the FMG emergency contact.
      </p>

      <div className="tour-director-passport">
        <div className="tour-director-passport-title">
          Passport Information
        </div>

        <div className="tour-director-passport-grid">
          <label>
            <span>
              Nationality
            </span>

            <input
              type="text"
              value={
                shown.passportNationality
              }
              placeholder="USA"
              onChange={(
                event
              ) =>
                update(
                  'passportNationality',
                  event.target.value
                )
              }
            />
          </label>

          <label>
            <span>
              Passport Number
            </span>

            <input
              type="text"
              value={
                shown.passportNumber
              }
              placeholder="Passport number"
              onChange={(
                event
              ) =>
                update(
                  'passportNumber',
                  event.target.value
                )
              }
            />
          </label>

          <label>
            <span>
              Expiration
            </span>

            <input
              type="text"
              inputMode="numeric"
              pattern="\d{2}/\d{2}/\d{4}"
              value={
                shown.passportExpiration
              }
              placeholder="MM/DD/YYYY"
              onChange={(
                event
              ) =>
                update(
                  'passportExpiration',
                  event.target.value
                )
              }
              onBlur={(event) =>
                update(
                  'passportExpiration',
                  formatDateMmDdYyyy(event.target.value)
                )
              }
            />
          </label>
        </div>
      </div>

      <button
        type="button"
        className="tour-director-link-button"
        onClick={() => choosePresent(false)}
      >
        Actually, there isn't a Tour Director
      </button>
    </section>
  )
}

export default TourDirectorPanel
