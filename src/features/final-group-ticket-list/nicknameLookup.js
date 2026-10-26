import nicknameCsv
  from '../../../Data/nicknames/names.csv?raw'

function normalizeName(value) {
  return String(
    value ?? ''
  )
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      ''
    )
}

function relationshipKey(
  first,
  second
) {
  return `${first}|${second}`
}

function buildNicknameData() {
  const relationships =
    new Set()

  const knownNicknames =
    new Set()

  const lines =
    nicknameCsv
      .split(/\r?\n/)
      .filter(Boolean)

  lines
    .slice(1)
    .forEach(
      (line) => {
        const [
          rawName1,
          rawRelationship,
          rawName2,
        ] =
          line.split(',')

        if (
          String(
            rawRelationship ??
            ''
          ).trim() !==
          'has_nickname'
        ) {
          return
        }

        const canonical =
          normalizeName(
            rawName1
          )

        const nickname =
          normalizeName(
            rawName2
          )

        if (
          !canonical ||
          !nickname ||
          canonical === nickname
        ) {
          return
        }

        /*
         * Relationship lookup is
         * intentionally bidirectional:
         *
         * Robert ↔ Bob
         *
         * Sardines only uses this as a
         * review clue. It does not decide
         * which version is legally correct.
         */
        relationships.add(
          relationshipKey(
            canonical,
            nickname
          )
        )

        relationships.add(
          relationshipKey(
            nickname,
            canonical
          )
        )

        /*
         * This set answers a different
         * question:
         *
         * "Is this exact first-name string
         * used as a nickname anywhere in
         * the bundled reference data?"
         *
         * It is useful for domestic-style
         * workflows where two operational
         * reports may agree on "Bob" but
         * there is no passport-backed
         * identity evidence.
         */
        knownNicknames.add(
          nickname
        )
      }
    )

  return {
    relationships,
    knownNicknames,
  }
}

const nicknameData =
  buildNicknameData()

export function isPossibleNickname(
  firstName,
  secondName
) {
  const first =
    normalizeName(
      firstName
    )

  const second =
    normalizeName(
      secondName
    )

  if (
    !first ||
    !second ||
    first === second
  ) {
    return false
  }

  return nicknameData
    .relationships
    .has(
      relationshipKey(
        first,
        second
      )
    )
}

export function isKnownNickname(
  firstName
) {
  const normalized =
    normalizeName(
      firstName
    )

  if (!normalized) {
    return false
  }

  return nicknameData
    .knownNicknames
    .has(
      normalized
    )
}

export function nicknameDatasetSize() {
  return Math.floor(
    nicknameData
      .relationships
      .size /
    2
  )
}
