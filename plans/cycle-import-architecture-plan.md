# Cycle Import and Female Biology Plan

Created: 2026-07-08
Review target: 2026-07-09

## Goal

Build cycle imports and richer female biology support without turning
`importedData`, Evolu, or AI context into a large raw-data warehouse.

The feature should help getbased answer:

- What reproductive state was the user in when a lab was drawn?
- Which lab markers need cycle-phase interpretation?
- Are there longitudinal patterns that change the interpretation?
- What should the AI avoid assuming because of contraception, pregnancy,
  breastfeeding, perimenopause, menopause, or absent cycles?

## Product Posture

Treat menstrual cycle data as a Body lens signal, not as a full fertility app.
Import richly, store raw data locally, derive compact cycle intelligence, and
sync/context only the compact layer.

Use language like "pattern worth discussing with a clinician" rather than
diagnosing PCOS, endometriosis, perimenopause, abnormal uterine bleeding, or
bleeding disorders.

## Existing Architecture Notes

- `importedData.menstrualCycle` is currently a single synced scalar.
- `sync-delta-surfaces.js` lists `menstrualCycle` under `DELTA_SCALARS`.
- `sync-delta-scalar-planner.js` stores one itemRow for the entire scalar.
- `lab-context.js` currently sends a concise menstrual-cycle section with:
  - profile summary
  - recent periods, currently last 6
  - blood draw cycle phase labels
  - perimenopause alert
  - iron/heavy-flow alerts
- Wearables already have the right pattern:
  - `wearables-store.js`: local IndexedDB L1 raw rows, not synced
  - `wearables-summary.js`: compact L2 summary in `importedData`
  - `lab-context-wearables.js`: prompt-safe context rendering

## Proposed Layers

### L1: Raw Local Cycle Store

New module: `js/cycle-store.js`.

Local IndexedDB, per profile, not synced by default.

Suggested database:

- DB prefix: `labcharts-cycle-`
- Store: `daily-observations`
- Key: `[source, date]` or `[source, date, importId]`
- Store: `imports`
- Store: `meta`

Example row:

```js
{
  source: 'drip',
  date: '2021-04-12',
  bleeding: { flow: 'heavy', excluded: false },
  symptoms: ['Cramps', 'Headache'],
  bbtC: 36.61,
  cervicalMucus: { quality: 'eggWhite' },
  ovulationTest: 'positive',
  note: 'raw imported note',
  importedAt: 1783500000000,
  importId: 'drip-2026-07-08'
}
```

Notes:

- Mirror wearable row encryption behavior for non-key fields.
- Keep raw free-text notes local only.
- Make source-level deletion possible.

### L2: Synced Compact Cycle Model

Keep using `importedData.menstrualCycle` for compatibility, but evolve it to
schema v2.

Example:

```js
{
  schemaVersion: 2,
  cycleStatus: 'regular',
  contraceptive: '',
  conditions: '',

  cycleLength: 29,
  periodLength: 5,
  regularity: 'mild_irregular',
  flow: 'moderate',

  coverage: {
    firstDate: '2018-01-03',
    lastDate: '2026-06-20',
    periodCount: 104,
    observationCount: 2814,
    sources: {
      drip: {
        importedAt: '2026-07-08T00:00:00.000Z',
        periods: 104,
        observations: 2814
      }
    }
  },

  periods: [
    {
      id: 'period:2026-06-20',
      startDate: '2026-06-20',
      endDate: '2026-06-24',
      flow: 'moderate',
      symptoms: ['Cramps', 'Fatigue'],
      source: 'drip',
      confidence: 'observed',
      updatedAt: '2026-07-08T00:00:00.000Z'
    }
  ],

  historySummary: {
    recent12: { avgCycle: 29, range: [26, 34], heavyRate: 0.17 },
    last12Months: { avgCycle: 30, variability: 'mild' },
    allTime: { avgCycle: 28, periodCount: 104 },
    flags: ['recent cycles slightly lengthening']
  }
}
```

Sync rule:

- Period episodes are small enough to sync, even across 8 years.
- Daily observations are not synced by default.
- If period-level concurrent editing becomes important, later split periods
  into a row-level `cyclePeriods` delta array instead of a scalar.

### L3: Context Renderer

Keep AI context compact and biologically useful.

Include:

- cycle status and contraception caveats
- coverage range and source summary
- recent 12 periods, not just 6
- recent 12-cycle stats
- last 12-month stats
- all-time stats
- blood draw phase/day for every lab date
- confidence label for phase inference
- alerts derived from cycle plus labs

Do not include by default:

- raw daily rows
- sexual activity details
- long imported notes
- full 8-year daily series

Example context:

```text
Menstrual cycle: regular active cycle, 29d avg, 5d period, moderate flow.
Coverage: 104 observed periods, Jan 2018-Jun 2026, source Drip.
Recent 12 cycles: avg 29d, range 26-34d, mild variability. Heavy flow 2/12.
Long-term: avg 28d across 104 periods. Recent trend: slight lengthening.

Recent periods: Jun 20-24 moderate [Cramps, Fatigue], May 22-26 moderate...
Blood draw cycle context:
- Mar 3 2021: day 22, luteal, based on observed period Feb 10.
- Jun 14 2026: day 24, luteal, confidence high.
```

### Optional Agent Series

Later, mirror `buildWearableSeriesSection`:

- Off by default.
- User-selectable 30/90-day local raw cycle series for agent workflows.
- Reads from `cycle-store.js`.
- Never pushed into ordinary chat context automatically.

## Biology Signals To Derive

Core:

- cycle length: start-to-start interval
- period length: start-to-end duration
- flow class: spotting/light/moderate/heavy
- regularity/variability
- cycle day and phase for lab dates
- early follicular blood draw window

Safety/interpretation signals:

- heavy-flow pattern
- prolonged bleeding pattern
- short cycles
- long cycles or skipped cycles
- cycle lengthening trend
- intermenstrual spotting if imported
- hormone-contraception caveat
- pregnancy, breastfeeding, postmenopause, absent-cycle caveats
- iron risk when heavy flow overlaps low ferritin, hemoglobin, or iron
- perimenopause-like pattern as a non-diagnostic flag

Potential later signals:

- ovulation evidence from LH tests, BBT shift, or mucus
- luteal length estimate
- anovulatory-pattern suspicion, phrased cautiously
- symptom burden trend

## Import Targets

Implemented and fixture-tested:

- Apple Health export: extend existing Apple Health file importer.
- Drip CSV: high confidence because Drip is open source and exports CSV.
- Clue JSON after extracting the password-protected export ZIP.
- Natural Cycles daily CSV and multi-CSV ZIP.

Pending a representative export before implementation:

- Flo
- Kindara

Priority 3:

- OvuView
- FEMM
- Fertility Friend
- Tempdrop

Approach:

- Build a generic cycle import adapter contract.
- Each adapter returns normalized daily observations plus import metadata.
- Deriver stitches observations into compact period episodes.

Adapter output shape:

```js
{
  source: 'drip',
  sourceFile: 'drip-data-2026-07-08.csv',
  observations: [],
  warnings: [],
  detectedRange: { firstDate: '2018-01-03', lastDate: '2026-06-20' }
}
```

## Import UX

Preview before commit:

- source and file
- detected date range
- number of daily observations
- number of derived periods
- conflicts with existing periods
- what will sync vs what remains local

Example:

```text
Found 2,814 daily observations and 104 periods from Drip.
104 period episodes will sync across devices.
Daily chart details stay on this device.
3 periods overlap existing entries.
```

Conflict options:

- Keep existing
- Replace overlapping imported periods
- Skip conflicting imported periods

Deletion:

- Remove imported raw rows by source/importId.
- Remove derived periods from a source if desired.

## Implementation Phases

### Phase 1: Data Model and Summary

- Add `cycle-store.js`.
- Add `cycle-summary.js`.
- Add migration helpers for `menstrualCycle.schemaVersion`.
- Add summary derivation from existing `periods`.
- Update `lab-context.js` from last 6 periods to last 12 plus summary.
- Keep current UI mostly unchanged.

### Phase 2: Apple Health and Drip Imports

- Extend Apple Health parser to capture menstrual flow records.
- Add Drip CSV parser.
- Normalize daily rows.
- Stitch daily bleeding rows into periods.
- Add merge preview.
- Commit raw rows to `cycle-store.js`.
- Commit compact `menstrualCycle` update to `importedData`.

### Phase 3: Richer UI

- Show coverage and source summary in the cycle editor.
- Show recent 12-cycle stats.
- Show import source tags.
- Add delete-by-source/import controls.
- Optionally surface ovulation evidence if imported.

### Phase 4: Additional Apps

- Clue and Natural Cycles adapters are implemented with committed synthetic fixtures.
- Their import previews carry a schema-review warning until an anonymized vendor-issued
  export has been validated.
- Flo and Kindara remain deferred until representative exports are available.
- Keep one compatibility fixture and parser regression per implemented adapter.

### Phase 5: Optional Agent Series

- Add local raw cycle series builder.
- Add user preference off/30/90 days.
- Keep ordinary AI context compact.

## Testing Checklist

Unit:

- period stitching from daily bleeding rows
- flow mapping
- excluded bleeding handling
- overlap/conflict resolution
- summary math for recent12, last12Months, allTime
- phase calculation for old lab dates
- migration from v1 cycle shape

Runtime/browser:

- IndexedDB raw cycle writes and reads
- encrypted raw row behavior when encryption is enabled
- encryption enable, disable, and passphrase rotation across cycle observations and import metadata
- encrypted manual/folder backup JSON round-trip
- import preview and commit flow
- source deletion
- large import fixture, e.g. 8 years of daily rows

Sync:

- compact `menstrualCycle` remains small
- Evolu scalar row does not carry raw observations
- profile export/import preserves compact cycle model

AI context:

- no raw daily rows in ordinary context
- last 12 periods included
- lab draw phases included for all lab dates
- hormone contraception suppresses natural phase assumptions
- pregnant/breastfeeding/postmenopause/absent statuses suppress ordinary cycle timing

## Decisions and Deferred Questions

Decided for this implementation:

- Period episodes remain inside scalar `menstrualCycle`; daily observations
  stay in the local cycle IndexedDB.
- Full manual, automatic, and folder backups include raw cycle observations
  and import metadata, preserving encrypted row envelopes.
- Imported daily notes remain local-only and are not added to ordinary AI
  context.
- Ovulation evidence is retained locally but does not override phase labels.
- Importing into an explicitly non-female profile requires confirmation before
  changing the profile sex used for reference ranges.

Deferred:

- Split period episodes into row deltas only if concurrent period editing
  becomes a real sync requirement.
- Revisit a fertility-intent privacy control before importing broader
  sex-life or contraception fields from vendor exports.

## Default Recommendation

For the first implementation:

- Add local raw store.
- Keep synced `menstrualCycle` compact.
- Import Apple Health and Drip first.
- Send coverage, summary, last 12 periods, and lab draw phase context to AI.
- Do not sync or prompt raw daily observations.
