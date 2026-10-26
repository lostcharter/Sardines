import {
  useRef,
  useState,
} from 'react'

import {
  readPdfText,
} from './readPdfText'
import { flightRecordItineraryPath } from './flightRecordDisplay'

function isPdfFile(file) {
  return file?.name
    .toLowerCase()
    .endsWith('.pdf')
}

function assessDocument(text) {
  const normalized =
    text.toLowerCase()

  const signals = [
    normalized.includes(
      'trip details'
    ),
    normalized.includes(
      'itinerary'
    ),
    normalized.includes(
      'city pairs'
    ),
    normalized.includes(
      'departing'
    ),
    normalized.includes(
      'arriving'
    ),
    normalized.includes(
      'passenger'
    ),
  ]

  return (
    signals.filter(Boolean)
      .length >= 4
  )
}

function ContractInput({
  file,
  contractData,
  onFile,
  onContractData,
}) {
  const [
    status,
    setStatus,
  ] = useState(() => contractData
    ? `Fly My Group Air Contract or Itinerary · ${contractData.pageCount} page${contractData.pageCount === 1 ? '' : 's'} · ${(contractData.flightRecords ?? []).length} flight record${(contractData.flightRecords ?? []).length === 1 ? '' : 's'} found`
    : '')

  const [
    warning,
    setWarning,
  ] = useState('')

  const [
    error,
    setError,
  ] = useState('')

  const [
    recognized,
    setRecognized,
  ] = useState(() => contractData?.recognized === true)

  const [
    parsedContract,
    setParsedContract,
  ] = useState(() => contractData
    ? {
        ...contractData,
        tourFlight: undefined,
      }
    : null)

  const [
    hasTourFlight,
    setHasTourFlight,
  ] = useState(() => contractData?.tourFlight?.enabled === true)

  const [
    tourFlightRecordNumbers,
    setTourFlightRecordNumbers,
  ] = useState(() => [...(contractData?.tourFlight?.recordNumbers ?? [])])

  const fileInputRef =
    useRef(null)

  const lastTourRecordIndexRef =
    useRef(null)

  function publishContractData({
    contract =
      parsedContract,

    enabled =
      hasTourFlight,

    recordNumbers =
      tourFlightRecordNumbers,
  } = {}) {
    if (!contract) {
      onContractData?.(null)
      return
    }

    onContractData?.({
      ...contract,

      tourFlight: {
        enabled,
        recordNumbers,
      },
    })
  }

  function clearContract() {
    onFile(null)
    onContractData?.(null)

    setStatus('')
    setWarning('')
    setError('')
    setRecognized(false)

    setParsedContract(null)

    setHasTourFlight(
      false
    )

    setTourFlightRecordNumbers(
      []
    )
  }

  async function handleFile(
    selectedFile
  ) {
    clearContract()

    if (!selectedFile) {
      return
    }

    if (
      !isPdfFile(
        selectedFile
      )
    ) {
      setError(
        "This file isn't my type. Upload a PDF here."
      )
      return
    }

    setStatus(
      'Inspecting Air Contract or Itinerary...'
    )

    try {
      const pdf =
        await readPdfText(
          selectedFile
        )

      const looksLikeContract =
        assessDocument(
          pdf.text
        )

      const flightRecords =
        pdf.records ?? []

      const contract = {
        fileName:
          selectedFile.name,

        pageCount:
          pdf.pageCount,

        text:
          pdf.text,

        pages:
          pdf.pages,

        flightRecords,

        recognized:
          looksLikeContract,
      }

      setParsedContract(
        contract
      )

      setRecognized(
        looksLikeContract
      )

      if (
        looksLikeContract
      ) {
        setStatus(
          `Fly My Group Air Contract or Itinerary · ${
            pdf.pageCount
          } page${
            pdf.pageCount === 1
              ? ''
              : 's'
          } · ${
            flightRecords.length
          } flight record${
            flightRecords.length === 1
              ? ''
              : 's'
          } found`
        )
      } else {
        setStatus(
          `Readable PDF · ${
            pdf.pageCount
          } page${
            pdf.pageCount === 1
              ? ''
              : 's'
          } found`
        )

        setWarning(
          "I can read it, but I have no idea what it's trying to tell me. This doesn't look like an Air Contract or Itinerary."
        )
      }

      onFile(
        selectedFile
      )

      publishContractData({
        contract,
        enabled: false,
        recordNumbers: [],
      })
    } catch (err) {
      console.error(err)

      setError(
        "I tried reading that PDF and got nowhere. It may be damaged, password-protected, or unusually PDF-ish."
      )
    }
  }

  function chooseFile() {
    fileInputRef
      .current
      ?.click()
  }

  function handleTourFlightChange(
    checked
  ) {
    setHasTourFlight(
      checked
    )

    const nextRecords =
      checked
        ? tourFlightRecordNumbers
        : []

    if (!checked) {
      setTourFlightRecordNumbers(
        []
      )
    }

    publishContractData({
      enabled: checked,
      recordNumbers:
        nextRecords,
    })
  }

  function toggleTourRecord(
    recordNumber,
    checked,
    shiftKey = false
  ) {
    const number =
      Number(recordNumber)

    const clickedIndex =
      flightRecords.findIndex(
        (record) => Number(record.recordNumber) === number
      )

    let affectedNumbers = [number]
    if (
      shiftKey &&
      lastTourRecordIndexRef.current !== null &&
      clickedIndex >= 0
    ) {
      const start = Math.min(lastTourRecordIndexRef.current, clickedIndex)
      const end = Math.max(lastTourRecordIndexRef.current, clickedIndex)
      affectedNumbers = flightRecords
        .slice(start, end + 1)
        .map((record) => Number(record.recordNumber))
    }

    const nextSet = new Set(tourFlightRecordNumbers)
    affectedNumbers.forEach((item) => {
      if (checked) nextSet.add(item)
      else nextSet.delete(item)
    })
    const next = [...nextSet]

    lastTourRecordIndexRef.current = clickedIndex

    setTourFlightRecordNumbers(
      next
    )

    publishContractData({
      enabled:
        hasTourFlight,

      recordNumbers:
        next,
    })
  }

  const hasFile =
    Boolean(file)

  const flightRecords =
    parsedContract
      ?.flightRecords ?? []

  return (
    <section className="contract-input">
      <h3>
        Air Contract or Itinerary
      </h3>

      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        accept=".pdf,application/pdf"
        onChange={(
          event
        ) => {
          const selectedFile =
            event.target
              .files[0] ??
            null

          handleFile(
            selectedFile
          )

          event.target.value =
            ''
        }}
      />

      {!hasFile && (
        <div className="contract-empty">
          <p className="contract-prompt">
            Choose the current FMG PDF
          </p>

          <p className="contract-help">
            Don't have it? Go grab
            the latest copy from{' '}
            <a
              href="https://www.flymygroup.com"
              target="_blank"
              rel="noreferrer"
            >
              Fly My Group
            </a>
            . Sardines will wait.
          </p>

          <button
            type="button"
            className="file-picker"
            onClick={
              chooseFile
            }
          >
            Choose contract or
            itinerary
          </button>
        </div>
      )}

      {hasFile && (
        <>
          <div
            className={
              recognized
                ? 'contract-selected recognized'
                : 'contract-selected'
            }
          >
            <div className="contract-status">
              {recognized
                ? '✓'
                : '•'}{' '}
              {status}
            </div>

            <div className="contract-filename">
              📄 {file.name}
            </div>

            <button
              type="button"
              className="change-contract-button secondary-button"
              onClick={
                chooseFile
              }
            >
              Change contract or
              itinerary
            </button>
          </div>

          {flightRecords.length >
            0 && (
            <div className="tour-flight-option">
              <label className="tour-flight-master">
                <input
                  type="checkbox"
                  checked={
                    hasTourFlight
                  }
                  onChange={(
                    event
                  ) =>
                    handleTourFlightChange(
                      event.target
                        .checked
                    )
                  }
                />

                <span className="tour-flight-copy">
                  One or more contracted routes are flights within the tour
                  <small>
                    Select routes flown during the tour, not the main flights to or from the destination.
                  </small>
                </span>
              </label>

              {hasTourFlight && (
                <div className="tour-record-picker">
                  <div className="tour-record-picker-title">
                    Which flight
                    record(s)?
                    <small>
                      Shift-click to select a range.
                    </small>
                  </div>

                  <div className="tour-record-grid">
                    {flightRecords.map(
                      (record) => {
                        const number =
                          Number(
                            record.recordNumber
                          )

                        const selected =
                          tourFlightRecordNumbers.includes(
                            number
                          )

                        return (
                          <label
                            key={
                              record.recordNumber
                            }
                            className={
                              selected
                                ? 'tour-record-card selected'
                                : 'tour-record-card'
                            }
                          >
                            <input
                              className="tour-record-checkbox"
                              type="checkbox"
                              checked={
                                selected
                              }
                              onChange={(event) =>
                                toggleTourRecord(
                                  number,
                                  event.target.checked,
                                  event.nativeEvent.shiftKey
                                )
                              }
                            />

                            <div className="tour-record-card-top">
                              <strong>
                                R
                                {
                                  record.recordNumber
                                }
                              </strong>

                              <span className="tour-record-airline">
                                {
                                  record.airlineCode ||
                                  '—'
                                }
                              </span>

                              <span className="tour-record-pax">
                                {
                                  record.passengerCount
                                }{' '}
                                pax
                              </span>
                            </div>

                            <div className="tour-record-route">
                              {record.routing ||
                                'Routing not found'}
                            </div>

                            {flightRecordItineraryPath(record) && (
                              <small className="tour-record-itinerary">
                                {flightRecordItineraryPath(record)}
                              </small>
                            )}

                            {selected && (
                              <span className="tour-record-check">
                                ✓
                              </span>
                            )}
                          </label>
                        )
                      }
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {warning && (
        <div className="contract-warning">
          {warning}
        </div>
      )}

      {error && (
        <div className="contract-error">
          {error}
        </div>
      )}
    </section>
  )
}

export default ContractInput
