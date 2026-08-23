# Marker unit profiles

Marker results are stored once in the canonical units declared by the marker
schema. A profile changes presentation, not storage. This keeps imports,
backups, sync payloads, calculations, and custom-marker identity independent of
the user's current display preference.

## Profiles

The persisted IDs are:

- `EU`: International (SI). The legacy ID is retained for backward-compatible
  profile storage.
- `ANZ`: common Australia and New Zealand pathology reporting units.
- `US`: US conventional units.

`js/unit-profiles.js` resolves every built-in marker. Markers without a regional
numeric difference receive an explicit identity projection; custom markers keep
their user-supplied unit. ANZ overrides follow RCPA SPIA terminology and
preferred-unit guidance, with endocrine conversions sourced separately where
the reporting convention differs. Assay-dependent conversions carry their
provenance in the registry.

## Data flow

1. Imports normalize recognized report units into the schema's canonical unit.
2. Calculated markers and per-date reference/optimal guidance are produced in
   canonical units.
3. The active-data pipeline projects marker values, static ranges, phase ranges,
   and contextual ranges through the selected profile.
4. Tables, charts, marker details, reports, and AI context consume that same
   active projection.
5. Manual entry offers compatible canonical, International, ANZ, US, and
   secondary clinical units, then converts the chosen unit back to canonical
   storage.

Do not apply a unit conversion in an individual renderer. Add or correct it in
the central profile/secondary-unit registries so all consumers remain aligned.

## Verification contract

`tests/unit-profiles.test.js` audits all 196 built-in markers in all three
profiles, validates every explicit ANZ key against the schema, and round-trips
the full ANZ catalog. The focused active-data and range-shape tests also pin:

- conversion of values and reference, optimal, phase, and contextual ranges;
- no numeric rounding for identity/label-only projections;
- no mutation or unit guessing for custom markers; and
- import/manual-entry compatibility for ANZ report units.

When adding a schema marker, the catalog count test must be deliberately updated
and the new marker must resolve in every profile. When changing imports between
runtime modules, regenerate `MODULE_MAP.md` with `npm run architecture:build`.
