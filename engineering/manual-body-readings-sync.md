# Manual body reading Sync

Explicitly entered weight, systolic/diastolic blood pressure and pulse readings
use the encrypted profile Sync surface `manualBodyReadings`. Raw vendor and
file-imported wearable histories stay device-local. Connection credentials and
restricted provider data do not enter this map.

Waist, paired hip circumference and sagittal abdominal diameter use the same
numeric field mirror. Waist/hip keys encode position (`standing`, `seated`,
`supine`) and tape location (`midpoint`, `iliac`, `navel`), for example
`waist_seated_midpoint.2026-10-22`. `sad_supine_iliac` is a separate caliper
measurement. Values are stored in centimetres; the UI also accepts inches.
One reading per date and method can be edited, while different methods on the
same date coexist. Waist and optional hips share a write clock; clearing the
optional hip value clears the previous pair. Ratios require matching pair clocks.
Deleting a waist measurement commits deletion intent for both waist and hips.
These fields participate in the existing full manual-data deletion flow too.
Corrections retain the original date/method identity: moving it publishes the
new pair and old deletion in one profile commit and refuses an occupied target.
Untouched measurements retain full centimetre precision across edits and unit
switches; only display values are rounded. Deleting or moving the last reading
on a date clears its shared notes and tags in that same portable commit.

The Waist and Abdominal depth tiles project the validated portable mirror, so
their display survives local Reading-store catch-up. History comparisons and
charts include only the same position and location. The editor remembers the
method from the most recently saved measurement, supports raw ratios without
health-risk categories, and retains its draft when a write fails. No wearable
baseline, pooled trend, diagnostic threshold or Biology score is inferred from
measurements taken with different methods.

Waist-to-height ratio divides the recorded waist in centimetres by the current
profile height, which is already stored in centimetres regardless of its display
unit. It appears in the Waist tile, the draft and latest-reading summaries, and
history. History labels this as the current profile height: changing height
recalculates these displayed ratios without rewriting measurements or claiming
that height was recorded at each historical measurement. Missing or invalid
height gets a short profile-height prompt instead of a ratio. This calculation
does not apply to SAD and does not add diagnostic categories or insulin-resistance
claims. [NICE guidance](https://www.nice.org.uk/guidance/ng246/chapter/Rationale-and-impact)
supports waist-to-height ratio for assessing central adiposity and related health
risk; it is not an insulin-resistance diagnosis.

Cycle tracking adds display-only context to Waist and Abdominal depth. Cycle days
come from the last logged period on or before the measurement date; phase labels
are estimates and are recalculated when period history changes. They are not
stored as confirmed ovulation or used to correct a measurement. Inactive cycle
profiles show no timing note. Dates beyond the expected cycle length show elapsed
time since the last logged period rather than asserting a current cycle day.
Irregular cycles, perimenopause and hormonal
contraception receive general consistency guidance without a dated phase forecast.

For a first baseline, mid-follicular timing after bleeding and bloating settle is
a practical suggestion inferred from [prospective bloating diaries](https://pmc.ncbi.nlm.nih.gov/articles/PMC3154522/),
not a validated optimal day for waist or SAD. The dated heuristic centres a
three-day window between the later of usual/logged bleeding end and two days
before calendar-estimated ovulation (cycle length minus 14). It requires a regular
natural cycle, a 21–40-day numeric cycle length, a 1–10-day period length and a
logged period start. The window rolls forward to the current or next forecast
cycle even when the last logged period is older. These dates remain labelled
estimated, with a brief request to update the period date when history is old or
contradictory; projected periods are never saved as observed bleeding. With a
dated baseline, the next comparison repeats its cycle day for the same method,
including an estimated calendar day when that baseline fell in an unlogged cycle.
The Cycle card uses the most recently saved method. Missing cycle inputs get an
explicit explanation rather than a fabricated date. Any date remains eligible
for logging. Blood-draw timing remains a separate recommendation.

Each key is `<field>.<YYYY-MM-DD>`, so same-day weight, BP and pulse compose rather
than replacing a date-wide row. Values carry `value` and `updatedAt`; the known
fields are the manual metrics, the method-specific body measurements, and the existing shared date-level tags and
note. Values must have their expected primitive type and a real calendar date.
Unknown incoming fields are retained in profile data but are not written into
the local Reading store. Updates preserve opaque existing row fields.

The Reading store remains the display source of truth. Explicit log/edit actions
write the narrow mirror alongside the existing guarded profile mutation. Pull
reconciliation applies validated fields to source `manual`, honors per-metric
and delete-all intent, and establishes the local manual connection when needed.
A newer local field edit cannot be replaced by an older blob or row overlay.
Inside the manual row-write boundary, reconciliation rereads canonical persisted
field clocks and deletion intent, including peer commits newer than its draft.
A surviving row clock or missing row cannot revive a deleted value or its private
context; a genuinely newer explicit re-add remains eligible.
User deletions clear values and private field metadata, retain their clocks and
use the existing `manualMetricTombstones` protocol; an explicit re-add clears its
delete marker. An empty local store never produces deletion intent.

Ordinary page startup and profile switching share lazy catch-up. A one-time,
add-only upgrade copies pre-existing manual rows after applying incoming values.
It never scans vendor histories, overwrites an existing mirror key, infers a
remote deletion or marks an empty/locked read as successfully upgraded. The
completion flag follows successful profile persistence. The upgrade commits only
if its canonical stored snapshot still matches inside the profile write lock; a
concurrent edit or deletion triggers a bounded retry from current data. Profile/data/Sync-owner
changes retire asynchronous reconciliation work. The module is requested only
when manual history or a manual mirror exists.

Single-profile portable exports include the mirror even when a profile has no
lab entries or a nutrition archive. The presence gate requires a validated
explicit measurement or deletion, not an unknown field or context-only payload.
Both JSON restore paths retain the map. A manual client restore first drains the
profile facade's existing wearable-refresh promise before copying fields, so an
older load task cannot publish an incomplete projection after the import. After a client restore saves successfully,
its still-current profile catches up Reading rows and refreshes their summary
before the import shell publishes success. Its scoped summary refresh preserves
non-manual source projections and preferences, and its locked snapshot guard
retires a stale summary rather than replacing a concurrent edit. It does not depend on a startup task
that may already have finished against the empty profile. Normal startup/profile
catch-up continues to materialize restored database bundles. Raw vendor histories remain outside
this portable profile surface.

Verification combines [real store and row-codec tests](../tests/manual-body-readings-sync.test.ts),
[ownership/failure checks](../tests/manual-body-readings-ownership.test.ts),
[existing deletion tests](../tests/manual-heart-rate-deletion.test.ts),
[existing manual browser workflows](../tests/playwright/manual-profile-persistence.spec.ts)
and [ordinary-startup/detail acceptance](../tests/playwright/manual-readings-sync.spec.ts).
These do not establish physical device, vendor API or external-relay acceptance.
