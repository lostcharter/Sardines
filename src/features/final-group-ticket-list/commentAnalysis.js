function clean(value) {
  return String(
    value ?? ''
  )
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalize(value) {
  return clean(value)
    .toUpperCase()
}

function uniqueByKey(
  items,
  keyBuilder
) {
  const seen =
    new Set()

  return items.filter(
    (item) => {
      const key =
        keyBuilder(item)

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

/*
 * --------------------------------------------------
 * KNOWN CENTAUR / FORM BOILERPLATE
 * --------------------------------------------------
 *
 * These patterns are deliberately narrow.
 *
 * Sardines never destroys the raw comment.
 * It only removes recognized boilerplate from
 * cleanedComment so the operational information
 * is easier to inspect.
 */

const boilerplatePatterns = [
  /*
   * Centaur passport-form answers are not operational air comments.
   * Match from the Passport(...) form label forward instead of relying
   * on whatever traveler-name prefix Centaur happened to prepend.
   */
  /(?:[^:]{0,100}:\s*)?PASSPORT\s*\(\s*INTERNATIONAL TOURS ONLY\s*\)\s*::\s*I\s+WILL\s+RETURN\s+A\s+COPY\s+OF\s+MY\s+PASSPORT\s+TITLE\s+PAGE(?:\s+NO\s+LATER\s+THAN\s+\d+\s+DAYS\s+PRIOR\s+TO\s+THE\s+DEPARTURE\s+DATE)?/gi,

  /(?:[^:]{0,100}:\s*)?PASSPORT\s*\(\s*INTERNATIONAL TOURS ONLY\s*\)\s*::\s*I\s+AM\s+ENCLOSING\s+A\s+PHOTOCOPY\s+OF\s+MY\s+PASSPORT\s+TITLE\s+PAGE/gi,

  /(?:[A-Z][A-Z .,'()-]{0,90}:\s*)?INTERNATIONAL TRAVELERS ENTRY REQUIREMENT\s*::\s*I\s+WILL\s+SEND\s+A\s+COPY\s+OF\s+MY\s+PASSPORT\s+TITLE\s+PAGE(?:\s+NO\s+LATER\s+THAN\s+\d+\s+DAYS\s+BEFORE\s+THE\s+DEPARTURE\s+DATE)?/gi,
  /(?:[^:]{0,100}:\s*)?PASSPORT\s*\(\s*INTERNATIONAL TOURS ONLY\s*\)\s*::\s*(?:I\s+AM\s+ENCLOSING\s+A\s+PHOTOCOPY\s+OF\s+MY\s+PASSPORT\s+TITLE\s+PAGE|I\s+WILL\s+RETURN\s+A\s+COPY\s+OF\s+MY\s+PASSPORT\s+TITLE\s+PAGE(?:\s+NO\s+LATER\s+THAN\s+\d+\s+DAYS\s+PRIOR\s+TO\s+THE\s+DEPARTURE\s+DATE)?)/gi,
]

function removeKnownBoilerplate(
  rawComment
) {
  let cleaned =
    clean(rawComment)

  const removed = []

  boilerplatePatterns.forEach(
    (pattern) => {
      cleaned =
        cleaned.replace(
          pattern,
          (match) => {
            removed.push(
              clean(match)
            )

            return ' '
          }
        )
    }
  )

  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/^[\s.,;:-]+|[\s.,;:-]+$/g, '')
    .trim()

  return {
    cleanedComment:
      cleaned === '-'
        ? ''
        : cleaned,

    removedBoilerplate:
      removed,

    boilerplateRemoved:
      removed.length > 0,
  }
}


function stripBoilerplateAgain(value) {
  return removeKnownBoilerplate(value).cleanedComment
}

/*
 * --------------------------------------------------
 * FLIGHT-DEVIATION CLUES
 * --------------------------------------------------
 */

function findRoundTripDeviationAirport(
  text
) {
  const normalized =
    normalize(text)

  if (
    !normalized.includes(
      'DEVIATION'
    )
  ) {
    return ''
  }

  const patterns = [
    /FLYING\s+TO\s*\/\s*FROM\s+([A-Z]{3})/,
    /TO\s*\/\s*FROM\s+([A-Z]{3})/,
    /FLYING\s+TO\s+AND\s+FROM\s+([A-Z]{3})/,
    /TO\s+AND\s+FROM\s+([A-Z]{3})/,
  ]

  for (
    const pattern
    of patterns
  ) {
    const match =
      normalized.match(
        pattern
      )

    if (match?.[1]) {
      return match[1]
    }
  }

  return ''
}

function findReturnDeviationAirport(
  text
) {
  const normalized =
    normalize(text)

  const patterns = [
    /\bRETURN(?:ING)?\s+TO\s+([A-Z]{3})(?:\s+INSTEAD\s+OF\s+[A-Z]{3})?/,
    /\bDEVIATION\s+RETURN\s+TO\s+([A-Z]{3})/,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) return match[1]
  }

  return ''
}

function findReturnViaAirport(text) {
  const normalized = normalize(text)
  const match = normalized.match(
    /\b(?:DEVIATION\s+)?RETURN(?:ING)?\s+VIA\s+([A-Z]{3})\b/
  )
  return match?.[1] ?? ''
}

function saysLastSegmentRemoved(
  text
) {
  const normalized =
    normalize(text)

  const removed =
    normalized.includes(
      'REMOVED THE LAST SEGMENT'
    ) ||
    normalized.includes(
      'REMOVE THE LAST SEGMENT'
    ) ||
    normalized.includes(
      'LAST SEGMENT REMOVED'
    ) ||
    (
      normalized.includes(
        'REMOVED'
      ) &&
      normalized.includes(
        'LAST SEGMENT'
      )
    )

  const supplierContext =
    normalized.includes(
      'FMG'
    ) ||
    normalized.includes(
      'FLY MY GROUP'
    )

  return (
    removed &&
    supplierContext
  )
}

function saysOwnArrangementAfterChange(
  text
) {
  const normalized =
    normalize(text)

  return (
    normalized.includes(
      'MAKE OWN ARRANGEMENTS'
    ) ||
    normalized.includes(
      'OWN ARRANGEMENTS'
    ) ||
    normalized.includes(
      'ARRANGE ON OWN'
    )
  )
}

/*
 * --------------------------------------------------
 * FREQUENT-FLYER CLUES
 * --------------------------------------------------
 *
 * This pass extracts candidates only.
 *
 * It does NOT silently move a value into an FF#
 * field and it does NOT claim an airline/program
 * relationship unless the comment itself says one.
 */

const carrierHints = [
  {
    code: 'UA',
    name: 'United',
    patterns: [
      /\bUNITED\b/i,
      /\bMILEAGEPLUS\b/i,
    ],
  },
  {
    code: 'AA',
    name: 'American',
    patterns: [
      /\bAMERICAN\b/i,
      /\bAADVANTAGE\b/i,
    ],
  },
  {
    code: 'DL',
    name: 'Delta',
    patterns: [
      /\bDELTA\b/i,
      /\bSKYMILES\b/i,
    ],
  },
  {
    code: 'B6',
    name: 'JetBlue',
    patterns: [
      /\bJETBLUE\b/i,
      /\bTRUEBLUE\b/i,
    ],
  },
  {
    code: 'WN',
    name: 'Southwest',
    patterns: [
      /\bSOUTHWEST\b/i,
      /\bRAPID REWARDS\b/i,
    ],
  },
  {
    code: 'AZ',
    name: 'ITA Airways',
    patterns: [
      /\bITA AIRWAYS\b/i,
      /\bVOLARE\b/i,
    ],
  },
  {
    code: 'LH',
    name: 'Lufthansa',
    patterns: [
      /\bLUFTHANSA\b/i,
      /\bMILES\s*&\s*MORE\b/i,
    ],
  },
  {
    code: 'AC',
    name: 'Air Canada',
    patterns: [/\bAIR CANADA\b/i, /\bAEROPLAN\b/i],
  },
  {
    code: 'AS',
    name: 'Alaska',
    patterns: [/\bALASKA(?: AIRLINES)?\b/i, /\bMILEAGE PLAN\b/i],
  },
  {
    code: 'BA',
    name: 'British Airways',
    patterns: [/\bBRITISH AIRWAYS\b/i, /\bEXECUTIVE CLUB\b/i],
  },
]

function carrierHintForText(
  text
) {
  return (
    carrierHints.find(
      (carrier) =>
        carrier.patterns.some(
          (pattern) =>
            pattern.test(text)
        )
    ) ?? null
  )
}

function extractFrequentFlyerCandidates(
  text
) {
  const source =
    clean(text)

  if (!source) {
    return []
  }

  const candidates = []

  /*
   * Carrier/program explicitly precedes FF#.
   * Example:
   *   Kael's United FF# Bkj43614
   */
  carrierHints.forEach(
    (carrier) => {
      const carrierName =
        carrier.name.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        )

      const pattern =
        new RegExp(
          `(?:\\b[A-Z][A-Z .'-]{0,45}'S\\s+)?\\b${carrierName}\\b\\s+(?:FF|FFR|FREQUENT\\s*FLYER(?:\\s*NUMBER)?)\\s*#?\\s*[:\\-]?\\s*([A-Z0-9]{5,20})\\b`,
          'gi'
        )

      let match

      while (
        (
          match =
            pattern.exec(source)
        ) !== null
      ) {
        const number =
          clean(
            match[1]
          ).toUpperCase()

        if (
          !/[0-9]/.test(
            number
          )
        ) {
          continue
        }

        candidates.push({
          number,

          carrierCode:
            carrier.code,

          carrierName:
            carrier.name,

          normalizedValue:
            `${carrier.code}#${number}`,

          sourceText:
            clean(
              match[0]
            ),

          reviewRequired:
            true,

          reviewReason:
            `${carrier.name} frequent-flyer number found in Flight Comments. Verify before export.`,
        })
      }
    }
  )

  /*
   * Generic FF/program wording when the carrier isn't captured
   * by the explicit-carrier pass.
   */
  const genericPatterns = [
    /\b(?:FF|FFR|FREQUENT\s*FLYER(?:\s*NUMBER)?)\s*#?\s*[:-]?\s*([A-Z0-9]{5,20})\b/gi,
    /\b(?:MILEAGEPLUS|AADVANTAGE|SKYMILES|TRUEBLUE|RAPID\s*REWARDS|VOLARE)\s*(?:#|NO\.?|NUMBER)?\s*[:-]?\s*([A-Z0-9]{5,20})\b/gi,
  ]

  genericPatterns.forEach(
    (pattern) => {
      let match

      while (
        (
          match =
            pattern.exec(source)
        ) !== null
      ) {
        const number =
          clean(
            match[1]
          ).toUpperCase()

        if (
          !/[0-9]/.test(
            number
          )
        ) {
          continue
        }

        /*
         * Don't duplicate a number already captured
         * with a stronger carrier-aware match.
         */
        if (
          candidates.some(
            (item) =>
              item.number ===
              number
          )
        ) {
          continue
        }

        const nearby =
          source.slice(
            Math.max(
              0,
              match.index - 45
            ),
            Math.min(
              source.length,
              pattern.lastIndex + 25
            )
          )

        const carrier =
          carrierHintForText(
            nearby
          ) ??
          carrierHintForText(
            source
          )

        candidates.push({
          number,

          carrierCode:
            carrier?.code ?? '',

          carrierName:
            carrier?.name ?? '',

          normalizedValue:
            carrier
              ? `${carrier.code}#${number}`
              : number,

          sourceText:
            clean(
              match[0]
            ),

          reviewRequired:
            true,

          reviewReason:
            carrier
              ? `${carrier.name} frequent-flyer number found in Flight Comments. Verify before export.`
              : 'Possible frequent-flyer number found in Flight Comments. Airline/program is not clear; verify before export.',
        })
      }
    }
  )

  return uniqueByKey(
    candidates,
    (item) =>
      `${item.carrierCode}|${item.number}`
  )
}

function removeFrequentFlyerText(
  text,
  candidates
) {
  let cleaned =
    clean(text)

  candidates.forEach(
    (candidate) => {
      if (
        !candidate.sourceText
      ) {
        return
      }

      const escaped =
        candidate.sourceText.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        )

      cleaned =
        cleaned.replace(
          new RegExp(
            escaped,
            'gi'
          ),
          ' '
        )
    }
  )

  /*
   * If an FF comment was just "Kael's [FF text]",
   * don't leave the orphaned possessive behind.
   */
  if (
    candidates.length > 0 &&
    /^[A-Z][A-Z .'-]{0,60}'S$/i.test(
      clean(cleaned)
    )
  ) {
    cleaned = ''
  }

  return clean(
    cleaned
      .replace(
        /^[,;:\-\s]+|[,;:\-\s]+$/g,
        ''
      )
  )
}

function extractOwnAirClues(
  text
) {
  const source =
    clean(text)

  if (!source) {
    return []
  }

  const clues = []

  const ownWith =
    source.match(
      /\bAIR\s+ON\s+OWN(?:\s*\/\s*WITH\s+([^.;]+))?/i
    )

  if (ownWith) {
    clues.push({
      type: 'own-air',

      withPersonText:
        clean(
          ownWith[1] ?? ''
        ),

      sourceText:
        clean(
          ownWith[0]
        ),

      source:
        'flight-comment',

      reviewRequired:
        false,
    })
  }

  const bookedOwn =
    source.match(
      /\bBOOKED\s+OWN\s+AIR\b/i
    )

  if (bookedOwn) {
    clues.push({
      type: 'own-air',

      withPersonText: '',

      sourceText:
        clean(
          bookedOwn[0]
        ),

      source:
        'flight-comment',

      reviewRequired:
        false,
    })
  }

  return uniqueByKey(
    clues,
    (item) =>
      `${item.type}|${item.sourceText}`
  )
}

function extractGroupFlightClues(
  text
) {
  const source =
    clean(text)

  if (!source) {
    return []
  }

  const match =
    source.match(
      /\bBOOKED\s+OWN\s+AIR\.\s*ON\s+SAME\s+FLIGHT\s+AS\s+GROUP\s*:\s*([\s\S]*?)(?=(?:\b\d+\s+AISLE\s+SEATS\b|\bAISLE\s+SEAT\b|\bWINDOW\s+SEAT\b|\bIF\s+FLIGHTS?\s+CONNECT\b|$))/i
    )

  if (!match) {
    return []
  }

  return [
    {
      type:
        'own-air-same-as-group',

      text:
        clean(
          match[0]
        ),

      itineraryText:
        clean(
          match[1]
        ),

      source:
        'flight-comment',
    },
  ]
}

function removeClueSourceText(
  text,
  clues
) {
  let cleaned =
    clean(text)

  clues.forEach(
    (clue) => {
      const sourceText =
        clue.sourceText ||
        clue.text

      if (!sourceText) {
        return
      }

      const escaped =
        sourceText.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        )

      cleaned =
        cleaned.replace(
          new RegExp(
            escaped,
            'gi'
          ),
          ' '
        )
    }
  )

  return clean(
    cleaned
      .replace(
        /^[,;:\-\s]+|[,;:\-\s]+$/g,
        ''
      )
  )
}


/*
 * --------------------------------------------------
 * SEATING / RELATIONSHIP / UPGRADE CLUES
 * --------------------------------------------------
 */

function extractRelationshipClues(
  text
) {
  const source =
    clean(text)

  if (!source) {
    return []
  }

  const clues = []

  /*
   * Explicit person/group relationship language.
   * "Seat Near X" is intentionally handled as one
   * seating relationship rather than a separate generic
   * seating clue plus relationship clue.
   */
  const seatNear =
    source.match(
      /\bSEAT\s+(?:NEAR|NEXT\s+TO)\s+([^.;]+)/i
    )

  if (seatNear?.[1]) {
    clues.push({
      type: 'seat-near',

      personText:
        clean(
          seatNear[1]
        ),

      sourceText:
        clean(
          seatNear[0]
        ),

      strength:
        'explicit',
    })
  }

  const withMatch =
    source.match(
      /\b(?:AIR\s+ON\s+OWN\s*\/\s*WITH|TRAVEL(?:ING)?\s+WITH|FLY(?:ING)?\s+WITH)\s+([^.;]+)/i
    )

  if (withMatch?.[1]) {
    clues.push({
      type:
        'travel-with',

      personText:
        clean(
          withMatch[1]
        ),

      sourceText:
        clean(
          withMatch[0]
        ),

      strength:
        'explicit',
    })
  }

  const roommateMatch =
    source.match(
      /\bROOMMATE(?:\s+IS|\s*[:-])?\s+([^.;]+)/i
    )

  if (roommateMatch?.[1]) {
    clues.push({
      type: 'roommate',

      personText:
        clean(
          roommateMatch[1]
        ),

      sourceText:
        clean(
          roommateMatch[0]
        ),

      strength:
        'explicit',
    })
  }

  return clues
}

function extractSeatingClues(
  text
) {
  const source =
    clean(text)

  if (!source) {
    return []
  }

  const wholeCommentPatterns = [
    /^WOULD\s+LIKE\s+AN\s+AISLE\s+SEAT\s+AND\s+THE\s+MIDDLE\s+SEAT\s+NEXT\s+TO\s+IT(?:\s+.*)?$/i,

    /^1ST\s+CHOICE\s*-\s*2\s+AISLE\s+SEATS\s+ACROSS\s+FROM\s+EACH\s+OTHER\.\s*2ND\s+CHOICE\s*-\s*1\s+AISLE\s+SEAT\s+PLUS\s+THE\s+SEAT\s+NEXT\s+TO\s+IT(?:\s+.*)?$/i,

    /^[A-Z][A-Z .'-]{1,45}\s+WOULD\s+LIKE\s+WINDOW\s+AND\s+[A-Z][A-Z .'-]{1,45}\s+IN\s+SEAT\s+NEXT\s+TO\s+(?:HIM|HER)(?:\s+.*)?$/i,

    /^PREFERS\s+AN\s+AISLE\s+SEAT\s*(?:--|—|-)\s*SECOND\s+CHOICE\s+IS\s+WINDOW(?:\s+.*)?$/i,

    /^\d+\s+AISLE\s+SEATS\s+ACROSS\s+FROM\s+EACH\s+OTHER\s+IF\s+POSSIBLE(?:\s+.*)?$/i,


  ]

  for (
    const pattern
    of wholeCommentPatterns
  ) {
    if (
      pattern.test(
        source
      )
    ) {
      return [
        {
          type:
            'seating-request',

          text:
            source,

          sourceText:
            source,

          source:
            'flight-comment',
        },
      ]
    }
  }

  /*
   * Otherwise extract only the clearly-understood seating phrase,
   * leaving genuinely unrelated prose for review.
   */
  const partialPatterns = [
    /\bAISLE\s+SEAT\s+REQUEST(?:ED)?\b/i,
    /\bSEAT\s+NEAR\s+[^.;]+/i,
  ]

  for (
    const pattern
    of partialPatterns
  ) {
    const match =
      source.match(
        pattern
      )

    if (match?.[0]) {
      return [
        {
          type:
            'seating-request',

          text:
            clean(
              match[0]
            ),

          sourceText:
            clean(
              match[0]
            ),

          source:
            'flight-comment',
        },
      ]
    }
  }

  return []
}

function extractUpgradeClues(
  text
) {
  const source =
    clean(text)

  if (!source) {
    return []
  }

  const match =
    source.match(
      /\b(?:(?:FIRST|BUSINESS)\s+CLASS|PREMIUM(?:\s+ECONOMY)?)\s+UPGRADE\b[^.;|]*/i
    ) ??
    source.match(
      /\bWANTS?\s+UPGRADE,\s*COMFORT\s+PLUS\s+OR\s+PREMIUM\s+UPGRADE\b/i
    ) ??
    source.match(
      /\b(?:UPGRADE|COMFORT\s+PLUS|COMFORT\+|PREMIUM\s+UPGRADE)[^.;]*/i
    )

  if (!match?.[0]) {
    return []
  }

  return [
    {
      type:
        'cabin-upgrade',

      text:
        clean(
          match[0]
        ),

      sourceText:
        clean(
          match[0]
        ),

      source:
        'flight-comment',

      reviewRequired:
        true,
    },
  ]
}


function removeKnownHandledPhoneNotes(
  value,
  flightDeviation
) {
  let text =
    clean(value)

  if (
    flightDeviation
      ?.lastSegmentRemoved
  ) {
    /*
     * This is a known operational note pattern we've already
     * converted into flight-assignment evidence.
     *
     * Once Sardines understands that the final contracted segment
     * was removed, the duplicated narrative about the traveler
     * calling to remove that Dallas -> ORD piece does not need to
     * remain in Comments.
     */
    const knownFinalSegmentNote =
      /\bTRAVELER\s+CALLED\s+AS\s+THEY\s+DO\s+NOT\s+WANT\s+THE\s+DALLAS\s+TO\s+ORD(?:\s+FLIGHT|\s+SEGMENT)?[^.;]*(?:[.;]|$)/ig

    text =
      text.replace(
        knownFinalSegmentNote,
        ' '
      )
  }

  return clean(text)
}

function normalizeRemainder(
  value
) {
  let remainder =
    clean(value)

  /*
   * Remove orphaned punctuation and conjunction scraps
   * left behind after recognized instructions are consumed.
   */
  remainder = remainder
    .replace(/^[\s.,;:\-–—]+|[\s.,;:\-–—]+$/g, '')
    .replace(/^(?:AND|OR)\b[\s.,;:\-–—]*/i, '')
    .replace(/[\s.,;:\-–—]+$/g, '')
    .trim()

  if (
    /^[.,;:\-–—\s]*$/.test(
      remainder
    )
  ) {
    return ''
  }

  return remainder
}

function containsComplexTransitInstruction(
  value
) {
  const normalized =
    normalize(value)

  return (
    normalized.includes(
      'CONNECT THRU LONDON'
    ) ||
    normalized.includes(
      'CONNECT THROUGH LONDON'
    ) ||
    normalized.includes(
      'TRANSIT'
    )
  )
}

/*
 * --------------------------------------------------
 * PUBLIC ANALYZER
 * --------------------------------------------------
 */

export function analyzeFlightComment(
  value
) {
  const rawComment =
    clean(value)

  if (
    !rawComment ||
    rawComment === '-'
  ) {
    return {
      rawComment:
        rawComment === '-'
          ? ''
          : rawComment,

      cleanedComment: '',

      commentNeedsReview:
        false,

      handledCompletely:
        true,

      groupFlightClues: [],

      removedBoilerplate: [],
      boilerplateRemoved:
        false,

      flightDeviation: {
        roundTripAirport: '',
        returnAirport: '',
        returnViaAirport: '',
        lastSegmentRemoved:
          false,
        ownArrangementAfterChange:
          false,
      },

      frequentFlyerCandidates:
        [],

      ownAirClues: [],
      relationshipClues: [],
      seatingClues: [],
      upgradeClues: [],

      hasOperationalClues:
        false,
    }
  }

  const cleanup =
    removeKnownBoilerplate(
      rawComment
    )

  /*
   * Operational extraction uses the cleaned
   * comment first. Raw remains available for
   * auditing and future parser improvements.
   */
  const operationalText =
    cleanup.cleanedComment ||
    rawComment

  const flightDeviation = {
    roundTripAirport:
      findRoundTripDeviationAirport(
        operationalText
      ),

    returnAirport:
      findReturnDeviationAirport(
        operationalText
      ),

    returnViaAirport:
      findReturnViaAirport(
        operationalText
      ),

    lastSegmentRemoved:
      saysLastSegmentRemoved(
        operationalText
      ),

    ownArrangementAfterChange:
      saysOwnArrangementAfterChange(
        operationalText
      ),
  }

  const frequentFlyerCandidates =
    extractFrequentFlyerCandidates(
      operationalText
    )

  let remainingComment =
    removeFrequentFlyerText(
      operationalText,
      frequentFlyerCandidates
    )

  remainingComment =
    stripBoilerplateAgain(
      remainingComment
    )

  /*
   * Whole seating instructions go before relationship parsing.
   * Otherwise "Diane in seat next to him" and paired-seat prose
   * gets chopped before the seating parser can understand it.
   */
  const seatingClues =
    extractSeatingClues(
      remainingComment
    )

  remainingComment =
    removeClueSourceText(
      remainingComment,
      seatingClues
    )

  remainingComment =
    stripBoilerplateAgain(
      remainingComment
    )

  const ownAirClues =
    extractOwnAirClues(
      remainingComment
    )

  remainingComment =
    removeClueSourceText(
      remainingComment,
      ownAirClues
    )

  const relationshipClues =
    extractRelationshipClues(
      remainingComment
    )

  remainingComment =
    removeClueSourceText(
      remainingComment,
      relationshipClues
    )

  const groupFlightClues =
    extractGroupFlightClues(
      remainingComment
    )

  remainingComment =
    removeClueSourceText(
      remainingComment,
      groupFlightClues
    )

  remainingComment =
    stripBoilerplateAgain(
      remainingComment
    )

  const upgradeClues =
    extractUpgradeClues(
      remainingComment
    )

  remainingComment =
    removeClueSourceText(
      remainingComment,
      upgradeClues
    )

  if (
    flightDeviation
      .roundTripAirport
  ) {
    remainingComment =
      remainingComment.replace(
        /\bDEVIATION\s+FLYING\s+TO\s*\/\s*FROM\s+[A-Z]{3}\b/ig,
        ' '
      )
  }

  if (
    flightDeviation
      .returnAirport
  ) {
    remainingComment =
      remainingComment.replace(
        /\b(?:DEVIATION\s+)?RETURN(?:ING)?\s+TO\s+[A-Z]{3}(?:\s+INSTEAD\s+OF\s+[A-Z]{3})?\b/ig,
        ' '
      )
  }

  if (
    flightDeviation
      .returnViaAirport
  ) {
    remainingComment =
      remainingComment.replace(
        /\b(?:DEVIATION\s+)?RETURN(?:ING)?\s+VIA\s+[A-Z]{3}\b/ig,
        ' '
      )
  }

  if (
    flightDeviation
      .lastSegmentRemoved
  ) {
    remainingComment =
      remainingComment.replace(
        /\bI\s+HAVE\s+REMOVED\s+THE\s+LAST\s+SEGMENT\s+WITH\s+(?:FMG|FLY\s+MY\s+GROUP)\b/ig,
        ' '
      )

    /*
     * Known Centaur audit prose after the already-understood
     * segment change. Keep unknown prose; remove this recurring
     * audit wrapper.
     */
    remainingComment =
      remainingComment.replace(
        /\bAFTER\s+[A-Z][A-Z .'-]{1,50}\s+PHONED\s+ON\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+AT\s+\d{1,2}(?::\d{2})?(?:\s*(?:AM|PM))?[^.;]*(?:[.;]|$)/ig,
        ' '
      )
  }

  remainingComment =
    removeKnownHandledPhoneNotes(
      remainingComment,
      flightDeviation
    )

  remainingComment =
    stripBoilerplateAgain(
      remainingComment
    )

  remainingComment =
    normalizeRemainder(
      remainingComment
    )

  /*
   * Some structured clues remain human-review items even after
   * Sardines successfully extracts them from the prose.
   *
   * Cabin / paid-upgrade requests are intentionally reviewable:
   * recognizing "Comfort Plus" or "Premium" does not mean
   * Sardines should decide what to buy, which segment it applies
   * to, or whether the request was fully specified.
   *
   * This restores comments like Vivienne's to Analyze & Repair
   * without undoing the successful seating extraction.
   */
  const structuredReviewRequired =
    upgradeClues.some(
      (clue) =>
        clue.reviewRequired ===
        true
    )

  const commentNeedsReview =
    Boolean(
      remainingComment ||
      structuredReviewRequired
    )

  const hasOperationalClues =
    Boolean(
      flightDeviation
        .roundTripAirport ||
      flightDeviation
        .returnAirport ||
      flightDeviation
        .returnViaAirport ||
      flightDeviation
        .lastSegmentRemoved ||
      frequentFlyerCandidates
        .length ||
      ownAirClues
        .length ||
      groupFlightClues
        .length ||
      relationshipClues
        .length ||
      seatingClues
        .length ||
      upgradeClues
        .length ||
      commentNeedsReview
    )

  return {
    rawComment,

    cleanedComment:
      remainingComment,

    commentNeedsReview,

    complexTransitReview:
      containsComplexTransitInstruction(
        remainingComment
      ),

    handledCompletely:
      !commentNeedsReview &&
      hasOperationalClues,

    removedBoilerplate:
      cleanup.removedBoilerplate,

    boilerplateRemoved:
      cleanup.boilerplateRemoved,

    flightDeviation,

    frequentFlyerCandidates,
    ownAirClues,
    groupFlightClues,
    relationshipClues,
    seatingClues,
    upgradeClues,

    hasOperationalClues,
  }
}
