# Biology Scores AI lifecycle

Numeric scores and Biological Coherence are computed locally. AI provides optional
card summaries, explanations, and a separate profile-context review. It does not
calculate the numeric scores. Context suggestions only change flags when applied.

## Requests and costs

Opening a page, reloading, syncing, changing filters, or updating the app does not
start paid Biology Scores inference. The overview's **Update missing insights**
action fills missing/outdated assessments; current answers are reused. A card's
**Refresh explanation** explicitly regenerates only that assessment. The overview
explanation can also be refreshed individually.

A score's assessment compares the four standard date windows and two range modes.
Equivalent views share evidence and one answer. This is not eight model calls per
score. Requests contain up to four scores with a 24,000-character batching target;
an individually larger score travels alone, subject to the Companion input limit.
Complete marker facts are retained. Bounded outputs use 700 tokens per score with
low reasoning effort and no transport retry. Compatible direct providers honor
that output ceiling, including models whose ordinary chat defaults allow more
reasoning. CLI adapters receive low effort and the JSON schema; their providers
control token limits and subscription accounting.

The earlier path allowed automatic page-load inference, large output batches,
automatic answer repairs, and bulk regeneration of already completed answers.
These can multiply charges, especially after timeouts or invalid JSON. Current
parsing accepts cosmetic deviations and salvages complete entries from truncated
batch JSON. Missing entries are reported, never silently purchased again. Provider
or storage failure stops subsequent batches. Prices, provider-side billing after
a disconnection, and temporary Routstr balance reservations cannot be established
from the app response alone; no fixed dollar-saving claim is implied.

Each successful response stores model/provider, generation time and reported token
usage alongside its answers. A shared batch ID and score count identify usage for
the whole batch; do not add those token counts once per score.

## Durability and privacy

Each successful batch is checkpointed in the profile's `biologyScoreAI` map.
`biologyScoreContextAI` stores the separate context review. Concurrent writes use
the existing profile mutation queue and merge logic. Completed requests target
the original profile even if the user switches profiles; removed profiles are not
recreated. Old answers remain readable and are labelled stale when evidence or
scoring logic changes. Current records and previous material variants retain the
existing 16-record bound per score.

A failed save retains its paid response in memory and exposes **Retry saving**,
which makes no AI call. This buffer is not durable: closing/reloading the tab while
storage is failing can lose that unsaved response. Nothing marks it as saved until
the durable write succeeds. A pending context review similarly reuses the same
response when saving is retried. Unknown legacy global cache entries are not
silently erased or assigned to another profile during rendering.

Profile storage uses IndexedDB and the existing encryption-at-rest setting. With
local encryption enabled, results and full-backup profile payloads are encrypted;
a locked session must reject writes rather than write plaintext. Local encryption
is optional at the application level and is shown with the saved answer. Ordinary
client JSON export remains intentionally decrypted; use an encrypted full backup
for private archival. Encryption at rest does not hide prompts from the selected
AI provider.

Both AI fields are already registered in Evolu delta sync and included in full
backups and client export/import. They travel through the existing encrypted Evolu
transport when sync is enabled; generation does not enable sync or create a new
identity. Sync merging retains independent saved assessment variants. Full backup
round trips preserve the encrypted storage envelope, including provenance and
covered-view fingerprints, without making another inference request.

Verification uses synthetic profiles, mocked providers, focused storage/sync tests
and selected Chromium cases. It makes no paid inference calls and does not modify
clinical scoring formulas or establish clinical validity.
