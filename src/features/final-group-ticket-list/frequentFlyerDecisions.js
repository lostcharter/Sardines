import { passengerKey } from './passengerOverrides.js'

const clean = (value) => String(value ?? '').trim()
const normalized = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '')

function dedupe(values) {
  const seen = new Set()
  return values.filter((value) => {
    const key = normalized(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function frequentFlyerReviewKey(match, review) {
  return [
    passengerKey(match),
    clean(review?.sourceField),
    normalized(review?.normalizedValue || review?.number),
  ].join('|')
}

export function suggestedFrequentFlyerValue(review) {
  return clean(review?.normalizedValue || review?.number).toUpperCase()
}

export function isPlausibleKtn(value) {
  return /^[A-Z0-9]{9,10}$/i.test(clean(value))
}

export function applyFrequentFlyerDecisions(reconciliation, decisions = {}) {
  if (!reconciliation) return reconciliation

  const matches = (reconciliation.matches ?? []).map((match) => {
    const reviews = match.frequentFlyerReview ?? []
    const resolved = reviews
      .map((review) => ({ review, decision: decisions[frequentFlyerReviewKey(match, review)] }))
      .filter((item) => item.decision)
    if (resolved.length === 0) return match

    let frequentFlyerNumbers = dedupe([
      ...(match.frequentFlyerNumbers ?? []),
      match.frequentFlyerNumber,
    ])
    let ppdt = match.ppdt ? { ...match.ppdt } : match.ppdt
    let aevd = match.aevd ? { ...match.aevd } : match.aevd

    resolved.forEach(({ review, decision }) => {
      const value = clean(decision.value || suggestedFrequentFlyerValue(review)).toUpperCase()
      const candidate = normalized(review.normalizedValue || review.number)
      if (decision.action === 'ff' && value) {
        frequentFlyerNumbers = dedupe([...frequentFlyerNumbers, value])
        if (ppdt && normalized(ppdt.ktnRaw) === candidate) ppdt.ktnRaw = ''
        if (aevd && normalized(aevd.ktnRaw) === candidate) aevd.ktnRaw = ''
      }
      if (decision.action === 'ktn' && value) {
        if (ppdt) ppdt.ktnRaw = value
        else if (aevd) aevd.ktnRaw = value
      }
      if (decision.action === 'ignore' && review.sourceField === 'KTN / Global Entry') {
        if (ppdt && normalized(ppdt.ktnRaw) === candidate) ppdt.ktnRaw = ''
        if (aevd && normalized(aevd.ktnRaw) === candidate) aevd.ktnRaw = ''
      }
    })

    const unresolved = reviews.filter((review) => !decisions[frequentFlyerReviewKey(match, review)])
    const edited = resolved.some(({ review, decision }) =>
      ['ff', 'ktn'].includes(decision.action) ||
      (decision.action === 'ignore' && review.sourceField === 'KTN / Global Entry')
    )
    return {
      ...match,
      sourcePpdt: match.sourcePpdt ?? match.ppdt ?? null,
      sourceAevd: match.sourceAevd ?? match.aevd ?? null,
      ppdt,
      aevd,
      frequentFlyerNumbers,
      frequentFlyerNumber: frequentFlyerNumbers.join('; '),
      frequentFlyerReview: unresolved,
      ffKtnReviewed: true,
      ffKtnEdited: edited,
      ffKtnDecisionNotes: resolved.map(({ decision }) =>
        decision.action === 'ff'
          ? `FF/KTN review: used ${clean(decision.value)} as FF#.`
          : decision.action === 'ktn'
            ? `FF/KTN review: kept ${clean(decision.value)} as KTN.`
            : `FF/KTN review: ${clean(decision.value)} was marked not needed.`
      ),
    }
  })

  return {
    ...reconciliation,
    matches,
    frequentFlyerSummary: {
      ...(reconciliation.frequentFlyerSummary ?? {}),
      reviewCount: matches.reduce((total, match) => total + (match.frequentFlyerReview?.length ?? 0), 0),
    },
  }
}
