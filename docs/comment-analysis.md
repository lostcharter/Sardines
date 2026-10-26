# Comment Analysis

Sardines keeps the original Centaur Flight Comments unchanged and creates a separate structured analysis for operational use.

This parser is intentionally conservative.

## Current first-pass extraction

- known passport/form boilerplate is removed from the cleaned operational view
- explicit round-trip flight deviations such as `Deviation Flying To/From MSP`
- explicit removal of the final FMG segment
- possible frequent-flyer numbers and any airline/program clue stated in the comment
- explicit `seat near`, `seat next to`, `travel with`, and `roommate` clues
- common seating requests such as aisle/window requests
- cabin/upgrade requests

## Safety rules

- `rawComment` is always preserved
- cleanup never modifies the source CSV
- a parsed clue is evidence, not authority
- free text does not silently alter passenger identity
- frequent-flyer candidates are not silently moved into an FF# field
- a direct carrier match may be identified, but non-direct carrier/program matches remain human review until Sardines has an explicit partner table
- relationship and seating clues remain distinguishable from future rooming-report inference

The parser should grow from observed real-world comment patterns rather than attempting to understand arbitrary prose.
