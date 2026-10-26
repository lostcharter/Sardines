# Nickname Reference Data

Sardines uses the `nicknames` dataset maintained by Carlton Northern as an offline reference for possible given-name/nickname relationships.

## Source

Repository: `carltonnorthern/nicknames`

Bundled source file:

- `names.csv`

The source CSV is retained unchanged from the downloaded dataset.

## License

The bundled dataset is distributed under the Apache License 2.0.

The accompanying `License.txt` is retained with the dataset.

## How Sardines Uses This Data

Sardines uses these relationships only as review clues. The dataset is not an authority on legal identity.

Sardines can use the data in two ways:

1. If two source reports contain different first names for an otherwise strongly matched traveler, a known relationship such as `Robert` ↔ `Bob` can be highlighted as **Possible nickname**.
2. If operational reports agree on a first name such as `Bob`, but there is no passport-backed identity evidence, Sardines may still highlight the name as **Possible nickname** when that exact string appears as a nickname in the bundled reference.

When a parsed Passport Report row contains an actual passport number and its structured First / Middle / Last fields agree with the other source, Sardines does not create a nickname warning merely because the first name can sometimes be used as a nickname.

Sardines does **not** use Centaur's unused/freeform "Complete Name" field as identity authority for this check.

A nickname relationship does **not** establish a traveler's legal identity.

Sardines:

- does not automatically replace either name
- does not treat the dataset as an authority on legal names
- does not learn new nickname relationships from traveler data
- does not modify this dataset based on operator decisions
- continues to require human verification when a nickname warning is shown

Absence from the dataset does not mean two names cannot be related. It only means Sardines does not have a known relationship to suggest.
