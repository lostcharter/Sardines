function clean(value) {
  return String(
    value ?? ''
  ).trim()
}

function normalizeCode(value) {
  return clean(value)
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/g,
      ''
    )
}

function splitExistingValues(value) {
  const text =
    clean(value)

  if (!text) {
    return []
  }

  /*
   * Centaur/FM G data is not perfectly consistent.
   * Preserve existing values while allowing common
   * separators used when several FF#s share one field.
   */
  return text
    .split(
      /\s*(?:[;,|]|\s{2,})\s*/
    )
    .map(clean)
    .filter(Boolean)
}

function dedupe(values) {
  const seen =
    new Set()

  return values.filter(
    (value) => {
      const key =
        clean(value)
          .toUpperCase()
          .replace(
            /\s+/g,
            ''
          )

      if (
        !key ||
        seen.has(key)
      ) {
        return false
      }

      seen.add(key)
      return true
    }
  )
}

function existingFrequentFlyers(match) {
  const ppdtTraveler = match?.ppdt
  const rawValues = [
    match?.frequentFlyerNumber,
    ppdtTraveler
      ?.frequentFlyerNumber,
    ppdtTraveler
      ?.frequentFlyer,
    ppdtTraveler
      ?.ffNumber,
  ]

  return dedupe(
    rawValues.flatMap(
      splitExistingValues
    )
  )
}

function normalizeCandidate(
  candidate
) {
  const carrierCode =
    normalizeCode(
      candidate
        ?.carrierCode
    )

  const number =
    clean(
      candidate
        ?.number
    )
      .toUpperCase()

  if (
    !carrierCode ||
    !number
  ) {
    return ''
  }

  return `${carrierCode}#${number}`
}

export function mergeFrequentFlyers({
  reconciliation,
}) {
  if (!reconciliation) {
    return reconciliation
  }

  let movedCount = 0

  const matches =
    (
      reconciliation
        .matches ??
      []
    ).map(
      (match) => {
        if (
          match.operational
        ) {
          return match
        }

        const existing =
          existingFrequentFlyers(
            match
          )

        const candidates =
          match.aevd
            ?.frequentFlyerCandidates ??
          match.aevd
            ?.commentAnalysis
            ?.frequentFlyerCandidates ??
          []

        const autoAdded = []
        const review = []

        // A frequent-flyer number occasionally lands in Centaur's
        // Global Entry / KTN field. Treat obvious FF-prefixed values as
        // a review candidate only; never move them silently.
        const ktnValues = [
          match.ppdt?.ktnRaw,
          match.aevd?.ktnRaw,
        ].map(clean).filter(Boolean)

        dedupe(ktnValues).forEach((value) => {
          const carrierValue = value.match(/^([A-Z0-9]{2})\s*[:#-]\s*([A-Z0-9]{5,20})$/i)
          if (/^FF[A-Z0-9]{5,20}$/i.test(value) || carrierValue) {
            review.push({
              number: value.toUpperCase(),
              sourceField: 'KTN / Global Entry',
              normalizedValue: carrierValue
                ? `${carrierValue[1].toUpperCase()}#${carrierValue[2].toUpperCase()}`
                : '',
              reason: carrierValue
                ? `${carrierValue[1].toUpperCase()} frequent-flyer number found in KTN / Global Entry field: ${value}. Verify before moving it.`
                : `Possible frequent-flyer number found in KTN / Global Entry field: ${value}. Verify before moving it.`,
            })
          }
        })

        candidates.forEach(
          (candidate) => {
            const normalized =
              normalizeCandidate(
                candidate
              )

            /*
             * Comment-derived FF# values are evidence, not
             * permission to change the export silently.
             * Preserve the candidate and ask for human review.
             */
            review.push({
              ...candidate,

              normalizedValue:
                normalized,

              reason:
                normalized
                  ? `${candidate.carrierName || candidate.carrierCode} frequent-flyer candidate found in Flight Comments. Verify before using it.`
                  : 'Frequent-flyer number found in Flight Comments, but Sardines could not confidently identify the airline/program. Verify before using it.',
            })
          }
        )

        const frequentFlyerNumbers =
          dedupe([
            ...existing,
            ...autoAdded,
          ])

        return {
          ...match,

          frequentFlyerNumbers,

          frequentFlyerNumber:
            frequentFlyerNumbers
              .join('; '),

          frequentFlyerAutoAdded:
            autoAdded,

          frequentFlyerReview:
            review,
        }
      }
    )

  return {
    ...reconciliation,

    matches,

    frequentFlyerSummary: {
      movedCount,

      reviewCount:
        matches.reduce(
          (
            total,
            match
          ) =>
            total +
            (
              match
                .frequentFlyerReview
                ?.length ??
              0
            ),
          0
        ),
    },
  }
}
