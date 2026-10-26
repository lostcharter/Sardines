# Sardines

**Passenger Packing Protocol.**

Sardines is a Lost Charter Studio tool for taking messy group-air traveler data and turning it into usable operational air files.

Its job is basically:

> Take the air contract or itinerary plus reservation-system reports, figure out who belongs where, flag anything suspicious, and pack the travelers into the correct flight records.

No sardines were harmed in the reconciliation of these travelers.

---

## ELI5: What Does Sardines Do?

Sardines currently works from three main sources:

1. A Fly My Group air contract or itinerary
2. A Centaur Domestic Air report
3. A Centaur Passport report

Each source knows different things.

The contract or itinerary knows things such as:

- flight records
- contracted seat counts
- routing
- airline
- trip dates
- flights that may occur during the tour

The Domestic Air report knows things such as:

- Company Air vs. Own Air
- reservation numbers
- arrival and departure information
- KTN information
- flight comments
- Tour Director records

The Passport report knows things such as:

- traveler number
- structured passport name fields
- date of birth
- gender
- nationality
- passport number
- passport expiration
- KTN
- frequent-flyer number

Sardines combines those sources and tries to answer:

> “Which human is this, and which flight record should they go into?”

Anything Sardines cannot determine safely should be flagged for human review.

Sardines should **never** quietly change somebody’s identity information just because it thinks it knows better.

---

## Current Goal

The first useful version of Sardines should be able to:

1. Upload a Fly My Group contract or itinerary PDF.
2. Find the flight records in the PDF.
3. Upload a Centaur Domestic Air report.
4. Upload a Centaur Passport report.
5. Reconcile travelers between the two reports.
6. Detect or create the Tour Director record.
7. Assign travelers to the correct flight records.
8. Identify flights that are part of the tour.
9. Review passport and identity requirements when appropriate.
10. Highlight anything that needs human review.
11. Export a working Fly My Group Final Names List XLSX.

The XLSX export is the main milestone.

For now:

> Make a working file first.

---

## Running Sardines

Open a terminal in the Sardines project folder.

Install dependencies if needed:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Use the local address shown by the development server in the terminal.

The project can live anywhere on the local machine; no personal computer path is required.

---

## Relabel the Tin

**Relabel the Tin** is Sardines' PDF branding tool.

It is designed for supported operational PDFs that already contain one configured brand and need to be rebranded or dual-branded without manually rebuilding the document.

### Saved Labels

Sardines currently maintains two configurable local brand profiles:

- **Brand A**
- **Brand B**

Each profile can store:

- logo image
- address line 1
- address line 2
- phone number

The saved profiles persist in browser local storage. Once a logo or address has been configured, it does not need to be selected again for every PDF.

The two profiles are configurable brand slots. Their logo files and contact information can be replaced without changing the PDF-processing code.

Supported logo uploads currently include PNG and JPEG images.

### Relabeling a PDF

The user:

1. Selects a PDF.
2. Identifies the brand currently on the PDF.
3. Chooses **Relabel** or **Add Label**.
4. Reviews the generated header preview.
5. Creates the new PDF.

Sardines does not currently attempt to visually guess which supported logo is on an arbitrary source PDF. The user identifies the current label.

### Relabel

**Relabel** replaces the current brand's header with the other saved brand.

For example:

`Brand A → Brand B`

Sardines clears the existing logo and address areas, then draws the replacement logo and its saved contact information.

The underlying PDF content is otherwise preserved.

### Add Label

**Add Label** creates a dual-branded PDF.

For example:

`Brand A → Brand A + Brand B`

Unlike Relabel, Add Label does **not** erase the existing logo. Sardines keeps the current logo in place, adds the missing brand beside it, and rebuilds the address area to contain both brands' contact information.

### Final Header Preview

Relabel the Tin provides one **Final Header Preview** before creating the output PDF.

The preview uses the same PDF branding operation as the final file:

1. Create a temporary copy of the PDF.
2. Apply the branding operation.
3. Render the first page.
4. Crop the header for display.

This keeps preview and output on the same rendering path.

### Output Files

Generated PDFs retain the original filename and receive a branding suffix.

Examples:

- `OriginalFile_BRAND_A.pdf`
- `OriginalFile_BRAND_B.pdf`
- `OriginalFile_BRAND_A_BRAND_B.pdf`

Sardines also writes branding state into PDF metadata so generated documents can carry whether the result is single- or dual-branded.

### Current Scope

Relabel the Tin is designed around supported operational PDF header layouts.

It is **not** intended to be a universal PDF logo-replacement system.

If future source documents use substantially different header layouts, they should receive their own layout profile rather than stretching one coordinate system until it becomes unreliable.

---

## Pack the Tin

**Pack the Tin** is Sardines' Final Group Ticket List workflow.

Its job is to combine a Fly My Group contract or itinerary with Centaur Domestic Air and Passport reports, reconcile travelers, review operational exceptions, assign travelers to the appropriate records, and eventually generate an FMG-compatible Final Names List workbook.

### Current Capabilities

Pack the Tin currently includes:

- FMG contract/itinerary PDF parsing
- Centaur Domestic Air report detection and parsing
- Centaur Passport report detection and parsing
- traveler reconciliation
- identity-review exceptions
- Company Air vs. Own Air handling
- flight-record assignment
- In-Tour flight designation
- Tour Director identification
- manual Tour Director flight-record assignment
- record-capacity review
- static offline nickname detection
- structured Flight Comment analysis

---

## Flight Record Assignment Principles

Sardines uses structured data as the default source of truth.

For Company Air, the normal rule is:

`Company Air + Departure City → group record beginning and ending at that airport`

For example, a traveler marked `Company Air` with departure city `ORD` normally belongs on the contracted record that begins at ORD and returns to ORD.

Sardines should not silently assign a traveler to an unusual routing simply because another record has empty seats.

Known deviations and special records require stronger evidence.

### Flight Comments as Evidence

Flight Comments can provide operational evidence when the structured data does not tell the whole story.

Sardines currently recognizes a limited set of strong comment patterns, including:

- explicit round-trip deviations such as `Deviation Flying To/From MSP`
- explicit removal of the final FMG segment
- own-arrangement language after a contracted segment is removed

These comment-derived assignments remain reviewable. Free text should never casually override structured passenger data.

---

## Record Capacity

Contracted seat count is inventory, not proof that the same number of traveler names must exist.

Sardines distinguishes:

- **Complete** — assigned names equal contracted seats
- **Seats Unassigned** — contracted seats exceed assigned traveler names
- **Over Capacity** — assigned traveler names exceed contracted seats

Unused contracted seats still require operational attention. They may need to be released, intentionally held, or otherwise handled according to the applicable supplier or carrier process.

Sardines must not invent travelers or placeholder names.

Over-capacity records require resolution because one or more travelers do not currently have corresponding contracted inventory.

The long-form record review UI is currently useful as development and exception-handling scaffolding. The intended normal view can eventually be reduced to a compact `X/Y travelers` status with High/Low/Complete warnings.

---

## In-Tour Flights

Records can be explicitly designated as **In-Tour Flights**.

The intended default is that an In-Tour flight applies to the relevant tour roster regardless of whether a traveler used Company Air or arranged their own primary air.

Real-world exceptions exist. A traveler may independently arrange transportation that already covers an otherwise In-Tour segment.

When multiple flight records represent the same In-Tour movement, Sardines should allow the limited or special record to be assigned first and place the remaining applicable travelers on the standard record.

---

## Tour Director Handling

Sardines can detect Tour Director records from Centaur and can also allow the operator to complete or create a Tour Director manually.

The Tour Director panel currently supports manual flight-record assignment.

A Tour Director record should not be assigned to a flight merely because a record has open seats. If Centaur provides a usable Departure City, the same structured Company Air rule may be used as a clue. Otherwise the record remains a human decision.

The Tour Director's name, phone, and email can also populate the FMG emergency contact.

---

## Identity Safety

Passenger identity data is never silently corrected.

Sardines may identify discrepancies and suggest that something needs review, but the operator remains authoritative.

Current identity-review rules include:

- missing middle-name information
- confirmed `(NMN)` / no-middle-name cases
- first-name discrepancies
- possible nicknames
- conflicting traveler information between source reports

### Middle Names

`(NMN)` is positive confirmation that the traveler has no middle name and should export as a blank middle-name field where the supplier requires blank.

A truly blank middle-name field with no confirmation remains a review item.

### Nickname Detection

Sardines uses a bundled static nickname dataset maintained by Carlton Northern.

The data is stored locally and used only as a review clue.

Examples:

- `Bob` / `Robert` may be highlighted as **Possible nickname**.
- `Bob` may also be highlighted in a domestic-style workflow when multiple operational sources agree on `Bob` but no passport-backed identity evidence is present.

Sardines does **not**:

- automatically replace either name
- treat a nickname relationship as proof of legal identity
- learn new nickname relationships from traveler data
- update the dataset based on operator decisions

When structured passport fields agree and an actual passport number is present, Sardines does not create a nickname warning merely because that first name can sometimes be used as a nickname.

The unused/freeform Centaur **Complete Name** field is not treated as identity authority for this workflow.

See:

`Data/nicknames/README.md`

for dataset source and licensing details.

---

## Flight Comment Analysis

Sardines preserves the original Centaur Flight Comment and creates a separate structured analysis for operational use.

The parser is intentionally conservative.

### Current Extraction

The first comment-analysis pass can identify:

- known passport/form boilerplate
- explicit flight deviations
- final-segment removal
- possible frequent-flyer numbers
- airline/program clues stated in the comment
- explicit `seat near` / `seat next to` requests
- `travel with` / `flying with` clues
- explicit roommate language
- common aisle/window seating requests
- cabin or upgrade language

### Comment Cleanup

Known boilerplate can be removed from the **cleaned operational view**, but the untouched raw comment remains available for audit and future parser improvements.

Sardines does not delete or rewrite the source CSV.

Examples of removable boilerplate include repetitive passport-return acknowledgments generated by Centaur forms.

### Frequent-Flyer Candidates

Comment-derived FF# values are **candidates only**.

Sardines does not silently move a number into the FF# field.

When the comment itself identifies an airline or loyalty program, Sardines can compare that clue with the contracted carrier:

- direct carrier match → useful clue, still reviewable
- different carrier/program → partner or other review
- no clear carrier/program → manual review

Sardines does not yet maintain a complete airline-partner table, so non-direct matches are not automatically accepted or rejected.

See:

`docs/comment-analysis.md`

for implementation notes.

---

## Optional Rooming Data — Planned

A Centaur rooming/room-list report may later be accepted as an **optional third report**.

Sardines must still run without it.

The purpose is to add relationships that AEVD and PPDT cannot reliably provide, especially when travelers are on separate reservations but are rooming together.

Roommate data is **not** equivalent to a hard seating requirement.

For future seating logic, relationship priority is expected to be:

1. explicit seating/travel-with comment
2. same reservation
3. roommate relationship from rooming data

Guarshare history may not always be preserved in the final room type, so absence of a Guarshare label must not be treated as proof that roommates selected each other.

Roommate-based seating should therefore remain an inferred preference unless explicit comments say otherwise.

---

## Planned Air Movement Report

A separate operational workbook is planned in addition to the FMG Final Names List.

Its purpose is to answer:

**How is everybody actually traveling?**

The current concept uses separate workbook sheets for:

- **Outbound**
- **Inner Flights**
- **Return**

Company/group-air details can come from the FMG contract or itinerary.

Own Air information should preferably come from Centaur's Air Events report when available. Sardines should also allow manual entry of missing Own Air details because Air Events data is not always complete in practice.

Manually entered information must remain distinguishable from information sourced from Centaur or FMG.

The workbook should use intentional, consistent color coding and be produced as a Lost Charter Studio / Sardines operational document.

---

## Data and Third-Party Reference Files

Static reference data should be bundled locally and documented with its source and license.

Current example:

```text
Data/
└── nicknames/
    ├── names.csv
    ├── License.txt
    └── README.md
```

Third-party data should remain distinguishable from Lost Charter Studio code and documentation.

---

## Privacy and Public Documentation

Public documentation, examples, fixtures, and screenshots should not contain:

- real traveler names or identity data
- employer or client company names
- private company logos or contact information
- personal usernames, email addresses, or local computer paths
- unsanitized reservation, passport, ticketing, or traveler data

Development fixtures intended for sharing should use synthetic or sanitized data.

Operational source files may contain sensitive traveler information. Sardines should preserve source values for review and should not silently alter passenger identity data.

---

## Near-Term Milestone

The next major milestone is a **prototype Fly My Group Final Names List XLSX export**.

Before that export is considered production-ready, Sardines still needs to finish validating the current comment/FF# handling and define how unresolved warnings are represented in the generated workbook.

The first prototype export does not need every future seating, rooming, or air-tracker feature implemented. It needs to prove that Sardines can reliably turn the current source files into a recognizable, reviewable FMG output.
