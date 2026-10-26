# Sardines

**Group air reconciliation and review, without the spreadsheet archaeology.**

Sardines is a Lost Charter Studio tool for reconciling group-air traveler data, reviewing exceptions, and preparing final airline/vendor submission files.

It is being built from real group-air operational workflows: multiple source reports, contract records, passport data, flight assignments, deviations, Own Air travelers, Tour Directors, frequent-flyer numbers, seating requests, and all the other little exceptions that make a "simple name list" considerably less simple.

The name is intentional.

We're putting people on airplanes.

## Current Status

**Report a Problem:** The application link opens a compact form in a separate tab
on the reporter Worker's origin. Only an allowlisted screen label is passed; the
tab has no opener access or referrer. Turnstile and the form never load in the
passenger-processing page. The original workflow stays open. Only your editable
name is remembered on the reporter origin; enter it once again after this migration.
Reports go through the Cloudflare Worker to private GitHub Issues; no login is needed.
No passenger data, files, filenames, workflow state, or logs are attached
automatically. Do not type sensitive traveler information into reports.
Unsent descriptions stay in memory and are lost on reload; errors preserve them
while the reporting tab remains open. There are no screenshots, ZIP exports, report archive,
or sounds. Sardines remains silent.

The reporting Worker is deployed and the public frontend settings are configured
for private `lostcharter/Sardines-feedback` intake. See the
[free reporting setup and deployment status](docs/problem-reporting-setup.md).
A real report and GitHub notification email still need verification. Only Workers
Free and Turnstile Free are permitted; no billing enrollment or paid service is
required. GitHub Pages deployment is unchanged.

**Active development — not production-ready.**

Sardines currently has a working end-to-end workflow for its first supported group-air process:

1. Import air and traveler/passport source reports.
2. Import contract and itinerary information.
3. Reconcile travelers across sources.
4. Identify Company Air, Own Air, Tour Director, deviations, and in-tour flight participation.
5. Review and correct passenger identity and assignment exceptions in one passenger workspace.
6. Parse operational reservation comments.
7. Review frequent-flyer / KTN information.
8. Assign travelers to contract records.
9. Correct source-report mistakes through reversible passenger overrides.
10. Confirm shared-flight rosters and known contract-capacity differences.
11. Generate the appropriate FMG Domestic or International Final Names List workbook.
12. Generate Sardines review worksheets alongside the submission sheet.

After processing, file setup condenses to a single status bar so completed inputs do not lengthen the browser page. Review work stays in a tabbed workspace. Compact traveler forms are designed to fit a standard laptop screen, while long flight-record lists use natural page scrolling so their controls are not squeezed into a shallow internal pane.

The generated XLSX now opens cleanly in Microsoft Excel without requiring workbook repair.

Trip type has no silent default. The operator must choose Domestic or International before export so Sardines applies the correct passport-review rules and FMG workbook layout. Domestic output omits the International manifest's nationality, passport-number, and passport-expiration columns.
Downloaded filenames identify the selected output as `FMG_Domestic_Final_Names_List.xlsx` or `FMG_International_Final_Names_List.xlsx` so repeated exports cannot be confused with an already-open generic workbook.

Pack the Tin is exercised against a six-tour synthetic regression pack. **Quality Check** has passed alpha validation against real operational manifests and returned ticket documents; its inferred seat maps remain decision-support tools rather than authoritative aircraft diagrams.

## Pack the Tin

The current primary Sardines workflow is called **Pack the Tin**.

It takes the source information used for group-air final names work and turns it into a reviewable set of traveler and flight assignments.

Sardines is intended to handle the repetitive reconciliation work while leaving consequential judgment calls visible to the human operator.

### Current inputs

The first implemented workflow currently works with source material such as:

- Centaur Domestic Air exports
- Centaur passport / traveler exports
- FMG contract and itinerary information
- Rooming / roommate information where available
- Ticket PDF branding in the **Relabel the Tin** workflow

These are the first supported adapters, not the intended limits of Sardines.

Changing the contract clears the previously loaded AEVD, PPDT, rooming list, analysis, and manual decisions. This prevents reports from one tour remaining active under another tour's contract.

The single Centaur upload control accepts the Domestic Air, Passport, and optional Rooming List CSVs together or individually. Report types are detected from their column headers rather than their filenames; uploading one type again replaces that type.

When ordinary contract records serve the same normalized route, Sardines fills the lower fare first and leaves unused capacity on the more expensive record—even when the carrier or schedule differs. An itinerary without usable pricing falls back to contract record order. Named records, confirmed cabins, and other explicit traveler evidence take precedence; shared reservations, rooming-list roommates, and explicitly comment-linked companions remain together when capacity permits.

When several records share a route but the contract names travelers in a record title, those travelers are assigned to the named record. Other travelers fall to a single ordinary group record when one exists; cabin upgrades and other special records still require explicit traveler evidence or review.

Affirmative cabin wording such as confirmed, accepted, agreed, approved, booked, ticketed, or “took the upgrade” may select matching special-cabin inventory. When several otherwise equivalent cabin records exist, confirmed travelers are distributed across their available seats in deterministic fare order. If confirmed demand exceeds the matching cabin capacity, every competing traveler remains for an explicit operator choice. Requests, quotes, pending decisions, waitlists, and declined or cancelled upgrades do not move a traveler automatically.

An explicit return-airport comment such as “returning to DTW instead of ORD” selects the unique contract record ending at that alternate airport and leaves the assignment flagged for confirmation.

When a Company Air departure airport appears only as an intermediate stop on a contract record, Sardines does not assign that traveler to the record. Missing the ticket's originating flight may cancel its remaining segments, so the traveler stays unassigned until a separately ticketed itinerary is verified.

A return-via deviation is not assigned to a group record merely because that airport appears as a connection in the record. Without a separate named deviation record, the traveler is shown as **Unaccounted for** and export remains blocked until the correct record is supplied or the traveler is marked **Separately ticketed**.

A Tour Director is a traveler with an additional role. Marking a traveler as the Tour Director in Passenger Review also supplies the FMG emergency-contact details, and the same traveler may be assigned to multiple flight records, including separate outbound and return records on different airlines. Sardines counts the person once in traveler summaries and places one assignment on each selected flight leg. Export stays blocked until the Tour Director has a first name, last name, and at least one flight record, or the user explicitly confirms that the group has no Tour Director. Every contract record over 10 passengers must be covered by a Tour Director or explicitly confirmed as having no Tour Director.

Missing Tour Director phone or email information is a visible, non-blocking warning. The blank contact fields are highlighted, the collapsed Tour Director card remains prominent, and **Open the Can** presents an in-app confirmation to add the contact information or deliberately export anyway. Missing details are also carried into the Sardines review worksheet.

Tour Director detection requires an explicit Tour Director name or comment. A Tour Director named in the Passport Report header is linked to the unique traveler with the same first and last name, even when the header omits that traveler's middle name. A generic sanitizer placeholder is not role evidence, and a shared reservation number alone never merges a named Tour Director with a differently named passport traveler.

Test Can reads reviewed expectations from a local `expected.json` or `test-can.json` in each selected case folder. Cases without expectations remain unverified; no real-trip baseline is bundled with the application.

The longer-term architecture should allow other reservation systems, airline vendors, and output formats to be supported without making the core Sardines workflow dependent on any one vendor.

### Current output

Sardines can generate:

- the appropriate FMG Domestic or International Final Names List
- a **Sardines - Centaur Review** worksheet
- an **Own Air Review** worksheet

The FMG worksheet remains the primary operational review surface.

The additional Sardines worksheets are intended to show where information came from, what Sardines interpreted, and what still requires human attention.

The review worksheets use frozen headers and identity columns, column filters, wrapped long-form notes, and restrained highlighting to make the combined source information easier to inspect. Saved passenger corrections are labeled **Manually edited in Sardines** and use a distinct blue fill in both the airline-facing manifest and Sardines review sheet; unresolved red errors and yellow review items continue to take visual priority.

## Human Review Comes First

Sardines is not intended to silently guess its way through passenger data.

Passenger identity information, flight assignments, and other consequential data should remain reviewable.

Examples:

- A real middle name is exported normally.
- `(NMN)` confirms that no middle name exists and is exported as a blank middle-name field where required.
- A truly missing or unconfirmed middle name should be surfaced for review.
- Traveler matching uses first name, last name, and date of birth; middle-name differences are evaluated separately so a Domestic Air report that omits a passport-backed middle name does not create a false match warning.
- Possible nicknames may be flagged when source first names differ, but a matching name is not suspicious merely because it appears somewhere in the nickname dataset.
- Questionable flight assignments should be reviewed rather than forced.
- A likely frequent-flyer number found in a KTN / Global Entry field is proposed for review rather than silently moved. The FF# / KTN workspace lets the operator correct the proposed value, use it as FF#, keep it as KTN, or mark it unnecessary. The decision clears the review count, remains reversible, and flows into the corresponding workbook column.
- Company Air travelers are included on a selected shared contracted flight by default.
- Own Air travelers are excluded from a shared contracted flight by default and must be explicitly added by the operator.
- Passenger Review is the single editable traveler roster. Travelers are ordered by last name, named previous/next controls support sequential review, and source comments can be corrected locally alongside identity fields. **Add missing person** can be used repeatedly for passengers or additional Tour Directors, and each added person can be placed on one or more flight records without changing the uploaded source reports.
- An unmatched Domestic Air traveler can be added directly from the unmatched-source card. Sardines prefills the available air details, then requires the operator to complete and save the traveler before treating the source mismatch as resolved.
- Any existing traveler can be tagged directly from the roster with **Make TD**; the full Edit view remains available for emergency-contact details and multi-record flight placement.
- Passenger Review includes All, Company Air, and Own Air roster filters with visible counts and air-type badges. **Make Own Air** removes the traveler from ordinary contracted-flight records, while **Make Company Air** returns the traveler to automatic Company Air assignment; both corrections are available without opening the full editor.
- An unresolved Company Air traveler can be marked **Separately ticketed** directly from Flight Records. This records the traveler as Own Air, clears the missing-record warning, retains them in Sardines review data, and excludes them from the FMG group-ticket manifest.
- Expanded flight records and traveler pickers are ordered by last name. Exported FMG traveler rows are also sorted by last name independently within each record; the source-review sheet retains its audit-oriented order.
- Traveler Reconciliation displays the current Own Air traveler count, including manual roster corrections.
- Flight record labels preserve contract headings so cabin names such as Economy/Premium and named-passenger records remain visible when routings are otherwise identical. FMG itinerary-only records instead receive readable route-and-airline headings derived from their actual flight segments, including open-jaw routing.
- The detected Tour Director form is collapsed into a compact summary when its required details are complete; additional Tour Directors belong in the unified traveler roster.
- Incomplete Tour Director work automatically opens in a red required-action panel and remains visually prominent until identity, flight coverage, or the explicit no-TD confirmation is complete.
- The Centaur metro code `NYC` matches contract records using `JFK`, `LGA`, or `EWR`; multiple possible New York records remain a human-review decision.
- Known capacity differences and finalized shared-flight rosters must be acknowledged before export. An unaccounted-for Company Air traveler cannot be cleared by acknowledging open seats on a record.
- Open contracted seats are shown as `unfilled` in the flight review and as `UNFILLED CONTRACTED SEAT` markers on the Sardines review worksheet. They are never inserted into the airline-facing passenger list.
- An underfilled flight record provides an immediately visible Company Air roster: click travelers to toggle them individually or Shift-click to add a range. Search remains an optional filter, and several travelers can be moved in one action while the card continues to show resulting capacity and overfill warnings.

Sardines should make the boring work faster without pretending the weird cases do not exist.

## Contract Records

Contract information is authoritative for the contract itself.

Record headers, record numbers, contracted passenger quantities, routing, and airline information should be preserved from the source contract rather than recalculated from the number of traveler rows Sardines happens to assign.

FMG open-jaw routing notation is supported, including routes such as `LAX-HNL/OGG-LAX`.

Separate contract records should remain identifiable even when they share the same physical flight. When the operator selects records representing one identical physical movement, Sardines may review and export them as a combined movement while retaining all contributing record numbers and summing their authoritative contracted capacities.

When multiple records have the same normalized route/carrier heading and differ only by record number or capacity, Sardines treats their seats as interchangeable inventory. Company Air parties are filled across those records in deterministic record order. Travelers on the same reservation or linked as roommates by RLDR stay together; Sardines leaves a party for review rather than splitting it when no remaining record can hold the entire group. Records with meaningful title differences such as Economy, Premium, or a named passenger are not auto-combined.

When a Company Air traveler's departure city does not match the contract but there is only one contract record, Sardines proposes that sole record and requires confirmation. This keeps positioning/deviation travelers visible in capacity totals without silently claiming the route match is proven.

For example, identical source Records 5 and 6 may export as `Record 5 & 6`, but Sardines must not discard either source record or reconstruct the combined capacity from assigned traveler rows.

## In-Tour Contracted Flights

Some contracts include a route flown within the tour rather than as the group's main travel to or from the destination. Those in-tour flights may also contain multiple records for the same physical movement, including cases where the only contractual difference is cost. Sardines allows the operator to select one or several records for that shared in-tour movement.

If that selection was missed or needs correction after processing, **Review files & routes** reopens the parsed contract with the current route choices and traveler reports intact. Update the shared-route selection and rerun Sardines; the source files do not need to be uploaded again.

For a selected shared movement:

- Company Air travelers are included automatically.
- Own Air travelers are available through an explicit multi-select roster.
- Shared-flight review keeps every Own Air traveler visible with an explicit included/excluded count so a missing decision cannot hide inside a collapsed control.
- Selected Own Air travelers are recorded as explicitly included on the **Own Air Review** worksheet.
- The operator must confirm the finalized roster before opening the can.
- A shared-flight roster auto-confirms when its Company Air and explicitly included Own Air travelers exactly match the contracted capacity; differing headcounts still require acknowledgement.
- Identical selected records may be combined in the FMG worksheet using their source record numbers and total contracted capacity.

## Review Philosophy

Differences between Sardines output and a manually prepared workbook are not automatically errors.

They should generally fall into one of four categories:

- **Expected / source-limited** — Sardines was never supplied the information.
- **Intentional improvement** — Sardines applies a later-defined business rule consistently.
- **Actual bug** — Sardines had the necessary information and produced the wrong result.
- **Needs human judgment** — the available evidence does not justify an automatic decision.

This distinction is important because a human-created final workbook may contain information that was known operationally but was never present in the files supplied to Sardines.

## Current Development Priorities

### Final Names workflow

Current refinement work includes:

- validating additional domestic and international examples
- confirming shared-flight and Own Air behavior across additional contracts
- refining and validating Tour Director input/output
- ensuring a linked Tour Director's selected flight record overrides their original traveler assignment without duplicating them
- making reviewed FF# / KTN decisions flow into the correct final columns
- restoring and validating all required FMG columns
- refining Special Requests wording
- improving source-vs-Sardines review presentation
- testing additional sanitized tours and FMG template variants

### Returned tickets and Quality Check

Quality Check is a before-and-after comparison. It accepts an `.xlsx` passenger workbook submitted before ticketing and one or more returned ticket PDFs. FMG Domestic and International manifests are supported directly, including their different name headings and optional `Record N` grouping rows. A generic workbook needs recognizable first-name and last-name headings; middle name and Special Requests are optional. Zero-padded seat rows such as `02A` and `09B` are normalized to `2A` and `9B`. Passenger matching uses names and compatible middle-name evidence, not the assumption that manifest record numbers and ticket booking order agree. Unmatched passengers remain listed for review without inventing an itinerary across every flight.

The ticket reader discovers passenger columns from neighboring name positions rather than a fixed page midpoint. It supports full-width rows, wrapped names and seat lists, offset ticket-number baselines, record continuations across pages, labeled FMG record headings, and individual passenger itinerary pages. Hyphenated, unhyphenated, and coupon-suffixed ticket numbers remain supported. Loading the same tickets in multiple documents does not multiply passengers or assignments. Public regressions use synthetic documents; optional private checks keep filenames and review metadata outside the repository.

Shared flight segments merge across PNRs and documents using departure date, carrier, flight number, origin, and destination. An explicitly reported operating carrier/flight number takes precedence for codeshares. Incomplete identities remain separate and flagged rather than guessed. Passenger seat lists retain their own booking's itinerary order, including separate outbound and return records. A conflicting seat for the same ticket is retained alongside the earlier assignment. **Two passengers ticketed in the same seat on the same physical flight produce a critical conflict**, with both owners visible and source evidence available; Sardines does not correct the provider's ticket data.

Unreadable PDFs, orphan ticket or seat fields, conflicting ticket numbers, count discrepancies, and ambiguous seat-to-flight associations are visible review findings. They are not treated as proof of missing travelers or unassigned seats. Readable files remain usable when another selected PDF cannot be read. Each extracted assignment retains its source document, page, position, and text; originals stay local and unchanged. Replacing an input clears the old results so they cannot be exported under new filenames.

Seat maps have **layout sections defined by row range**, with an optional cabin/section name. Open **Review layout sections**, add a section, choose a common pattern from the Pattern dropdown or type your own, such as `3-3` or `2-4-2` (hyphens are aisles), and review its seat letters before applying it to that flight. Two sections can both be Economy and use different patterns. Letters are editable separately, for example `AB-CDEG-HJ`; typing a pattern suggests the observed letters when their count matches, otherwise conventional letters are a starting point to review. A small preview shows the seat blocks while editing. Overlapping ranges, invalid patterns, and repeated or mismatched letters are rejected without replacing the applied map.

Sections begin **inferred**, not confirmed aircraft geometry. Eight observed letters suggest a `2-4-2` candidate; sparse evidence does not establish a class, aisle, or complete aircraft layout. Uncovered row ranges remain inferred. Once a manual section is applied, the map banner says **Manually applied layout**; individual unconfirmed sections and any seats that do not fit retain their own review indicators. Applying sections recalculates window/aisle/middle and companion checks only where the relevant seats fit a reviewed section. Furthest-forward checks remain uncertain because group assignments do not establish all available seats. Seat letters outside a section's layout stay visible beside the diagram and below its exported map; assignments are never dropped or moved. Duplicate-seat cells retain both owners and prominent critical highlighting. Blank cells mean no group assignment, not an available or even physically established seat. Long empty stretches collapse with context rows.

Layout drafts survive switching flight tabs. Apply changes to update the map and export; unapplied drafts are not exported. Layouts stay in the current Quality Check session and reset with new input, a new check, navigation away from Quality Check, or a reload. Export the workbook to retain the reviewed maps; importing saved layouts is not yet supported. The Hawaii sample reconciles to 34 travelers, 84 assignments, and five flights; the supplied `2-4-2` confirmation applies to its LAX–HNL legs, not every class or interisland flight.

Quality Check exports an `.xlsx` workbook with Summary, one map per flight, combined traveler-flight Review, Legend, and source **Evidence** sheets. Flight maps carry the applied section labels, row ranges, patterns, seat letters, and reviewed/inferred indicators, with narrow aisle spacing. Critical findings remain prominent in the workbook, including conflicts involving returned-only travelers. Source notes, unresolved evidence, and alternative seat assignments remain available for review. Automatic aircraft-specific layouts, less-structured proximity requests, manual ambiguous-name resolution, and reassignment recommendations remain future work.

The **unmet requests** and **seat conflicts** summary counts open lists of the matching findings across all flights. Selecting a finding opens its flight and focuses the affected passenger row. Conflict navigation includes returned-only passengers; zero counts are disabled. Closing the findings list returns keyboard focus to its summary button.

The exported Review sheet keeps one row per traveler, places each actual flight in its own seat/status column, and stores the reason for a yellow or red result as an Excel note on that flight cell. This keeps multi-flight tours compact without discarding flight-specific findings. Same-row companion seats separated only by a skipped letter are yellow when adjacency depends on the aircraft's actual cabin layout; companions in different rows remain a red miss. A named companion who cannot be uniquely matched on that flight keeps the request yellow for review, even when a window or aisle preference is satisfied. The flight's Excel note explains whether the companion is missing or ambiguous.

The workflow will:

- reconcile ticket numbers back to travelers
- reconcile seats
- match ticketed flights to Sardines contract / flight records
- identify unmatched or ambiguous tickets
- compare assigned seats against traveler seating requests
- group seat-map review
- duplicate / impossible seat detection
- unmet seating-request flags
- ambiguous-request review
- aircraft-layout inference
- seat reassignment recommendations

Each traveler and flight should distinguish **request satisfied**, **request not satisfied**, **seat not assigned yet**, **no seat requested**, **unable to verify**, and **data conflict**. A missing advance assignment is not automatically a failure: some airlines leave a seat pending until check-in or boarding, while others explicitly close advance seating. Sardines should preserve that distinction and keep unassigned travelers beside the map rather than inventing seats.

The review output is expected to provide a concise issues summary, a passenger-by-flight comparison, and a visual map for each actual flight. Requests such as wheelchair service or meals may be carried into the review but cannot be verified from a seat assignment alone.

The initial goal is decision support, not automatic airline or GDS seat changes.

## Quality Check regression baseline

The [Quality Check baseline](docs/quality-check-baseline.md) preserves the pre-change measurements and records the current correctness checks. Former known-failure cases now assert preserved ownership, including layout variations and exported-seat integrity. Private originals remain outside Git and their checks run only when `SARDINES_QC_INPUT_DIR` is set.

## Test Can

A developer regression screen is available at the app's `/test` path (currently `/Sardines/test` in the configured development/deployment base). Choose one parent folder containing sanitized test-case subfolders, then select **Run All Tests**. Each case folder contains:

- one contract or itinerary PDF
- one Centaur AEVD / Domestic Air CSV
- one Centaur PPDT / Passport CSV
- an optional RLDR / Rooming List CSV
- an optional `expected.json`

Sardines detects the files by their contents rather than their filenames and ignores documentation-only folders in the selected parent. A case without `expected.json` is explicitly **Unverified**: a completed pipeline run is not presented as proof of correctness. After checking the totals and workbook manually, the result can download a candidate `expected.json` for placement in the case folder. Only a run that matches reviewed expectations receives **Pass** status. Later runs compare only the values declared in that file and show metric changes from the previous browser run.

The local synthetic regression pack currently contains six fictional fixtures: a clean international baseline, messy international data, Domestic plus Own Air, multi-segment/codeshare travel, roster chaos, and premium-cabin/air-add-on data. Pack the Tin fixtures contain pre-ticketing requests and air arrangements; returned ticket numbers and assigned seats belong to the separate Quality Check workflow. Each fixture's `EXPECTED_RESULTS.md` describes the intended human-verified behavior; a completed pipeline run is not automatically a correctness pass.

The Test Can snapshot format still reserves a `qualityCheck` section for future automated seating assertions. Quality Check itself is implemented and separately covered by parser, reconciliation, seat-map, request-evaluation, and workbook-export tests.

### Next-session repository cleanup

The next maintenance session should complete this short checklist before returning to feature work:

- **Commit the synthetic regression pack safely.** The six fictional Test Can fixtures are currently local and their CSV/PDF inputs are blocked by the protective blanket rules in `.gitignore`. Add narrowly scoped exceptions for this reviewed synthetic pack so a fresh clone can reproduce the regression workflow without weakening the rule that real traveler files must never be committed.
- **Remove stale duplicate notes.** Confirm `README.md` remains canonical, then remove the untracked `README_Sardines_Clean.md` and `SARDINES_DEMO_PATCH_NOTES.txt`. They describe older states of the product and could mislead future work; the manual-flight-override follow-up in the patch notes appears to have already been superseded by parent-level effective assignment state.
- **Add an explicit proprietary license.** Sardines is a private Lost Charter tool, so repository permissions should be stated deliberately rather than relying on the absence of a license. Do not adopt an open-source license without a separate decision.
- **Validate and checkpoint the cleanup.** Run the full test suite, ESLint, and production build; inspect the staged fixture list for anything non-synthetic; then commit the coherent maintenance change.

Do **not** perform a broad size-driven refactor of `FinalGroupTicketList.jsx`, `flightRecordAssignment.js`, or `LogoTool.jsx` as part of this cleanup. Their size is worth watching, but working logic should be split only around a concrete responsibility with focused tests. Shorter files alone are not a sufficient reason to risk the reconciliation pipeline.

## Planned features

The [Sardines to-do list](docs/TODO.md) records future feature requirements, including the **In-App Issue Reporter**: local issue capture, user-provided screenshots, issue management, and ZIP export for review. This feature is planned and is not yet available.

## Vendor-Neutral Direction

Sardines began around a specific real-world Centaur + Fly My Group workflow because that is the problem available to solve.

The project itself should remain more general than those vendors.

Where practical:

- parsing should be adapter-based
- reconciliation rules should be independent of source vendor
- review concepts should remain reusable
- output formats should be replaceable
- vendor-specific logic should be isolated

A future **Import Profiles** feature may allow a user to map unfamiliar report columns into Sardines' internal traveler fields and save that mapping for later files. This is a roadmap direction, not a currently supported workflow.

Current built-in support remains intentionally specific: Centaur AEVD/PPDT-style reports, FMG contracts and final-name workbooks, and ticket PDF parsing across varying document layouts.

The goal is not to hide where Sardines came from.

The goal is to avoid making that origin an architectural prison.

## Privacy and Test Data

**Do not commit real traveler data to this repository.**

Group-air source files can contain personally identifiable and sensitive traveler information, including:

- full legal names
- dates of birth
- passport information
- Known Traveler Numbers
- frequent-flyer numbers
- reservation information
- contact information
- travel plans

Development fixtures should be sanitized or synthetic.

Before committing changes, verify that `.gitignore` continues to exclude traveler/source files, generated exports, and other data that should not be stored in Git.

## Development History

Sardines is being developed iteratively from a real operational workflow.

Sanitized historical notes, screenshots, UI iterations, milestone documentation, and selected project lore are preserved under:

`docs/history/`

Historical material documents how Sardines evolved and should not necessarily be treated as current product documentation.

## A Note About Excel

Sardines generates real XLSX packages rather than simply exporting flat CSV data.

During development, Microsoft Excel exposed an XML ordering bug that more permissive spreadsheet readers tolerated.

The issue was traced to replacement cells being written out of column order inside an existing worksheet row. The exporter now inserts cells in proper spreadsheet order, allowing generated workbooks to open in Excel without repair.

This is exactly the kind of deeply glamorous problem Sardines exists to attract.

## What Sardines Is Not

Sardines is not currently intended to be:

- a reservation system
- a replacement for Manifest
- a GDS
- an airline booking engine
- an automatic passenger-identity decision maker
- an automatic seat-changing system
- the future airfare quote tool

Those may overlap with the same operational world, but they are separate problems.

## Lost Charter Studio

Sardines is a project of **Lost Charter Studio**.

> An Artist's Studio filled with questionable ideas.

---

**Sardines is under active development.**

The fish are not yet certified for unsupervised aviation.
