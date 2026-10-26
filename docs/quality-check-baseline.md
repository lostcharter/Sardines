# Quality Check regression coverage

Public regressions use independently authored fictional identities and ticket
values. Synthetic PDFs are generated in memory, extracted with PDF.js, and passed
through the application's parser. Preserve name, ticket, record, flight, and seat
ownership assertions when changing fixtures; passing counts alone are insufficient.

Coverage includes shifted columns, reversed drawing order, wrapped names, page
breaks, multiple records, repeated passengers, companion requests, duplicate seats,
uncertain associations, reviewed seat sections, and the actual exported XLSX.
Parsing uncertainty must remain visible rather than inventing an assignment.
PDF parsing supports varying layouts but does not guarantee every possible layout;
image-only/scanned documents require a text layer.

## Optional local-document checks

Keep real documents and their review metadata outside the repository. Public tests
no longer embed original filenames, trip details, document hashes, or ownership
fingerprints. Existing local tests need manifests before they can run again.
Review baseline values independently; do not generate expected results blindly
from the parser being tested.

For the three-layout ownership checks, put `baseline.private.json` beside your
local documents. Its `files` array has exactly three entries, each with `name`
(local filename), `sha256`, `pages`, and `records`. Its `expected` object contains
`travelers`, `flights`, `assignments`, `duplicateSeats` (an array of seat labels),
and `ownershipSha256`. The three layouts must describe the same passengers and
assignments. Tests also load them together to check deduplication.

```powershell
$env:SARDINES_QC_INPUT_DIR = 'C:\private\reviewed-documents'
node --test tests/quality-check/originalPdfs.test.js
Remove-Item Env:SARDINES_QC_INPUT_DIR
```

For the reviewed 2-4-2 layout check, put `layout.private.json` beside the local PDF.
It contains `file`, `sha256`, `reviewedRoutes` (departure/arrival pairs formatted
as `AAA:BBB`), and `expected`: `pages`, `travelers`, `flights`, `assignments`, and
`ownershipSha256`. This check expects no source conflicts and verifies that
confirmed sections preserve every seat and passenger assignment.

```powershell
$env:SARDINES_QC_LAYOUT_INPUT_DIR = 'C:\private\reviewed-layout'
node --test tests/quality-check/reviewedLayout.test.js
Remove-Item Env:SARDINES_QC_LAYOUT_INPUT_DIR
```

Without the environment variables, the five private checks are explicitly skipped.
When enabled, missing documents/manifests and mismatched hashes fail. Manifests
ending in `.private.json` are ignored as an additional safeguard, not permission
to place private records in the repository. Private test failures can expose
operational details in local assertion output; do not publish those logs.

## Data hygiene

Use fictional names, clearly synthetic identifiers, and reserved example email
domains in tests and examples. Rewrite real request prose while preserving the
behavior under test. Do not copy passenger records into fixtures, documentation,
issue reports, screenshots, generated workbooks, or commit messages. The nickname
dictionary is a third-party vocabulary dataset, not a passenger roster.

Current-file cleanup does not erase earlier commits, forks, clones, or downloaded
assets. Removing previously published private material from Git history requires
a separate coordinated cleanup; an ordinary deletion commit does not erase it.
