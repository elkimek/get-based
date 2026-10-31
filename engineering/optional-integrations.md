# Optional integrations and deployment boundaries

The core getbased app runs locally without an account or AI connection. This
guide covers the optional paths that leave the browser or require another
process. Read [SECURITY.md](../SECURITY.md) and the
[architecture contract](../ARCHITECTURE.md) for implementation ownership.

## Storage, sync and remote data

Profile data lives in localStorage and IndexedDB by default. Optional passphrase
protection encrypts browser storage. Supported provider credentials use local
device-bound encryption, or passphrase protection when configured. Maintain
backups independently of the browser.

- **Sync:** Evolu replicates end-to-end encrypted profile payloads. Pausing a
  browser retains its identity and queues edits; disconnect/reset is a separate
  Advanced action.
- **Sharing:** the browser encrypts a password-protected export. The official
  isolated Czech VPS service, hosted by SecurityNet.cz/Hukot, receives network
  metadata, the opaque envelope and expiry/deletion/abuse metadata, never the
  password or decrypted profile. Temporary copies are not backed up and may be
  lost after service failure; the source profile stays in the sender's browser.
- **Wearables:** connections are user-initiated. Official Oura, Withings, Polar
  and existing legacy Fitbit requests use a separate compatibility relay. It
  intentionally neither stores nor logs payloads, but can read forwarded
  credentials and responses. These requests do not pass through the static
  Vercel app host. WHOOP, Ultrahuman and Google Health are self-host-only and use
  the deployment operator's infrastructure and OAuth credentials. Confidential
  exchange/refresh uses that deployment's same-origin proxy; WHOOP/Google Health
  data uses it too, while Ultrahuman resource data is browser-direct through CORS.
  OAuth credentials are device-key encrypted. WHOOP/Google Health daily rows are
  device-protected and excluded from raw-data backups; WHOOP connection metadata
  and derived local values are also split into device-encrypted storage. Each
  browser connects separately; only the compact derived summary participates in
  optional encrypted sync or enabled AI/agent context.
- **Sun/UV:** official CAMS requests are rounded to a 0.1° grid in both browser
  and compatibility relay, then sent by authenticated POST to the operated
  local-grid lookup. That route does not forward/cache individual coordinates
  at Copernicus or Open-Meteo. Missing weather fields fall back browser-direct
  to Open-Meteo with the same rounded location. This is limited plaintext
  processing, not end-to-end encryption.
- **Auto-import source:** off by default. In Settings → Data → Lab report
  source a user can enter the address of a JSON feed of PDF lab reports, for
  example one published by a self-hosted document manager such as
  Paperless-ngx. Only when an address is saved does the app request the feed,
  on app open and on **Check for reports**, and then download the PDF reports it lists.
  The feed origin (and any origin hosting the listed PDFs) therefore receives
  those requests and their network metadata; no credentials are attached to
  cross-origin requests. Addresses must be HTTPS, except plain HTTP on the
  app's own origin or loopback. New reports enter the normal AI-assisted import
  and review, so they reach the configured AI provider like a manually dropped
  PDF and nothing is saved until the user confirms the review. A profile switch
  stops the batch without saving or handling its unfinished reports. Discovery
  confirmations wait behind any existing confirmation. The feed address
  and the ids of reports already imported or skipped are stored per profile in
  local browser storage. **Disconnect** removes the saved address while keeping
  imported lab data and report history for reconnecting the same address. Saving
  a different feed address starts a new handled-ID history so reports in another
  archive cannot be silently suppressed. **Reset report history** makes imported
  or skipped reports available for review again. Feed setup details are under
  **Source requirements**. Feed format:
  `{"items":[{"id":"…","title":"…","url":"…","created":"<ISO date>"}]}`, with
  `url` resolved against the feed address and serving `application/pdf`.
  Feeds may list up to 5000 reports; already handled ids are skipped and at
  most 50 new reports are offered per check, oldest first, with reports that
  failed to download or import retried after ones that have not failed. Each
  download is limited to 50 MiB (5 MiB for the feed), with a 50 MiB combined
  PDF buffer per check. Reports beyond that budget remain available next time.
  Every request must finish within its timeout; redirects to addresses outside
  the policy above are refused.
  Requests are sent with `cache: 'no-store'`. Same-origin feed and report
  requests also carry the URL fragment `#getbased-fresh=auto-import`, and only
  requests with that fragment bypass the service worker, which neither answers
  them from nor copies them into its cache. The fragment is never sent to a
  server. Other same-origin requests, including ones marked `no-store`, keep the
  worker's normal caching, so a same-origin feed should not reuse a path the
  app itself loads.
- **Hosted analytics:** cookieless pageview and outbound affiliate-click counts
  are on by default, disclosed at first use and switchable in Settings → Privacy.
  They contain no health records, identity or health context.

For a strictly local setup, disable analytics, leave network features off and
use same-device inference if needed. An external Knowledge Base or local/LAN
server is still a separate recipient of whatever is sent to it.

### Test a report source without Paperless

Use Node.js 24 and the installed project dependencies:

```bash
npm run typescript:build
node scripts/auto-import-sandbox.mjs
```

Open `http://127.0.0.1:8002/.local-notes/auto-import-sandbox/start.html`
and choose **Prepare sandbox and open getbased**. This separate browser origin
configures synthetic PDFs on port 8003 and a deterministic Custom API fixture;
it leaves the usual app on port 8000 separate. The setup refuses an origin
that already has app settings unless it was previously prepared as this sandbox.
Normal legal notices and the PDF privacy review still apply. No real API key,
AI model, Paperless installation, or paid inference is needed.

In **Settings → Data → Lab report source**, choose **Check for reports**. Try
**Later**, then **Review now**, the privacy review, and **Import 2 Markers** or
**Skip**. Reload and check again to verify handled reports stay handled. The
launcher also lists empty-feed, invalid-PDF, two-report and temporary-failure
scenarios. Stop the servers with Ctrl+C; sandbox data remains in that origin's
browser storage until you clear it. The mock endpoint accepts only prompts
containing the synthetic fixture marker and does not log or persist prompts.

The maintained browser regression exercises real HTTP, PDF extraction, privacy
review, explicit saving, reload persistence, deduplication, download retry, and
skipping:

```bash
npx playwright test tests/playwright/auto-import-feed-e2e.spec.ts --project=chromium --workers=1
```

These tests cover getbased's feed contract and import flow. They do not validate
Paperless authentication, a deployed proxy, or live-model extraction accuracy.

## AI activation and providers

Normal tracking works without AI. Select a provider in Settings:

| Path | Capabilities and setup |
|---|---|
| PPQ | Private TEE mode or regular hosted models, with in-app balance/top-up. |
| Routstr | Nostr-discovered Bitcoin AI nodes and the built-in Cashu wallet, with mint-specific balances and recoverable funding/transfers. |
| OpenRouter | Hosted model marketplace with OAuth or manual API key. |
| Venice AI | Hosted models; encrypted mode requires the attestation checks below. |
| Local AI | An OpenAI-compatible server such as Ollama, LM Studio, Jan or llama.cpp. |
| CLI agents | Supported capabilities through the local Companion; setup below. |
| Custom API | Your OpenAI-compatible endpoint or proxy. |

The first remote activation presents the provider-neutral AI notice and
recipient-specific approval together, but stores them separately. Enabled
automatic insights may request new analysis after relevant profile/data changes.
Same-device inference needs only the AI notice; a private/LAN endpoint is
confirmed by origin. Each remote provider/endpoint requires browser-local
sensitive-data approval before data-bearing AI requests.

A user-triggered connection check can run first without profile, chat, image
or voice content; a custom endpoint may receive a fixed synthetic compatibility
probe. The activation prompt identifies the recipient and links known Privacy
and Terms documents. Reviewing them does not accept terms on the provider's
behalf. Custom endpoints use their origin; personal/local endpoints need no
operator policy metadata.

Text imports can use deterministic identifier detection and an optional trusted
self-hosted model before AI submission. Detection can miss unusual layouts;
review the text. Image imports cannot be scrubbed and show a separate warning.

### Companion and CLI agents

Settings → AI → **Chat controls** lets you turn **Control getbased through chat**
on or off for this browser. It applies to direct providers and CLI agents. Turning
it off keeps ordinary chat and its enabled context, removes app tools and expires
pending reviews. Turning it back on requires fresh proposals. The assistant cannot
change this setting. CLI plain chat requires a Companion advertising `plain-chat`;
older Companions need an update. Manual editing is unaffected.

Chat app controls follow [the shared scope policy](../shared/chat-control-policy.ts).
Useful health workflows and explicit unit/model/provider/profile commands remain
available; routine layout, clock format, setup, privacy, personas and saved AI or
search preferences use the native UI. Excluded controls are absent from shared
API/CLI discovery and cannot execute through stale cards or invented calls.
The same scope policy limits data-resource exposure. Historical proposal payloads
are retained and shown read-only, with no saved-outcome claim or execution controls.

The local getbased Companion supports installed Codex, OpenCode, Hermes, Grok
and OpenClaw accounts or configured model providers on Linux, macOS and Windows.
Capabilities determine supported features; health-data changes remain reviewable
drafts. Hermes/OpenClaw can route chat through a detected personal gateway or
profile; supported Hermes gateways also provide text-only explanations.

Selecting a local agent prepares and validates its target and model catalog before
publishing a ready backend. Closing Settings does not discard the selected target's
capabilities. Photos are offered only when the adapter declares image input;
the selected model must also support vision. The current OpenClaw exec adapter
is text-only. Failed or empty agent responses produce a retryable error.
OpenCode 2.1 and newer use process-local configuration and a fresh per-turn MCP
session so application tools are present on the first prompt. Native shell, file
and general Code Mode execution remain disabled; application changes still pass
through reviewed getbased proposals.

Interactive chat through local agents and direct API providers can use
`getbased_read_context_card` and
`getbased_draft_context` to propose updates to Diet & Digestion, Sleep & Rest,
Exercise, Stress, Relationships, Environment, Light & Circadian, Medical History,
and Health Goals (all nine Insight cards). The separate Interpretive Lens and
Menstrual Cycle editors are also supported. Clear personal updates may
trigger a proposal without an explicit save request; vague statements require
clarification. Each proposal shows the current and proposed answers, the user's
supporting words, and a reason. Apply commits the reviewed fields; Discard saves
no health-data change. A changed card requires a new proposal. Disabled context
lookups disclose no card data and are not listed as provided context. Newer
overlapping proposals replace older pending cards, so an earlier answer cannot
be applied after its corrected proposal arrives. Disabled context
sources remain inaccessible. Direct API chat uses browser-owned tools without requiring a Companion.
Interactive local and direct chat also shares `getbased_app_actions`, `getbased_read_app` and `getbased_request_app` for saved display preferences: International (SI), Australia / NZ or US units, alternate units, range display. A read returns a fresh scoped snapshot; a request creates a separate review card and saves no setting. Apply uses the same native preference owner as Settings → Display, compares the reviewed values and rejects stale changes. These chat display preferences apply to the active profile; clock format is changed in native Display settings. Undo uses a private execution receipt and refuses to overwrite an intervening change. All ordinary conversations can continue while a review is pending. Unsupported settings still need their native controls; this catalog does not imply general app administration.

The same app-control tools support `assistant.selection` for the exact model and reasoning effort on the current configured connection. Read it to obtain a fresh review snapshot and a bounded catalog with declared model capabilities; cached availability is not a live availability guarantee, and undeclared tool support remains unknown. Prepare the named model and/or a supported effort, then choose Apply. The next request uses that selection. Existing conversations and prior model attribution remain intact; a changed CLI model starts a new backend session with the retained transcript. Active replies and incompatible attached photos block selection changes. Undo requires the private native receipt and the unchanged connection; a reloaded pending model review expires and must be read again. Provider/connection setup still uses its native controls. Before applying a native API/Local AI route change, getbased checks its model metadata directly with a bounded cancellable GET. A rejected credential, missing/non-chat model, unavailable endpoint or changed owner leaves the working route selected. Metadata is not a paid inference test or a guarantee of future availability. Hidden edition-owned credentials use the edition’s native controls; they are correctly reported as configured without exposing credentials or inventing a stock ownership lease. `assistant.connections` lists configured providers and paired CLI targets; `assistant.models` accepts an exact connectionId to read another catalog without selecting it. Read `assistant.connection` with that ID for a fresh snapshot, then request it with the exact connectionId, model and optional effort. Apply preserves native destination approval and takes effect for the next request. No conversation content is sent by selecting a route. Pending reviews expire on reload; Undo requires the private current receipt and unchanged recipient identities. A different CLI adapter or target starts a fresh backend session with retained history, even when model names match. Returning to a CLI after an API reply also starts a fresh session so that reply is retained.

`profiles` lists bounded saved profile names and IDs without reading their health
data. Read `profile.selection` for an exact destination ID, then prepare that
selection for native review. Duplicate names require the user's exact ID. Apply
runs after the reply is saved and rejects a changed profile directory, unsaved
profile edits, open editors, chat drafts, or attached/preparing photos. It uses
the native profile loader and keeps each profile's health data and conversation
history separate. A destination rebuild failure pauses chat and new conversation
creation until recovery, protecting its saved conversation list. Selecting the
same profile again can retry an incomplete load. Pending reviews expire on
reload; a completed historical label requires its private native receipt.
Switching back requires a fresh review or the native profile picker. Profile
selection cannot be combined with another application change in the same turn.

The next turn receives each card's current status and available review actions.
Local agent chat requires the Companion's application-context capability: the
current enabled snapshot and filtered card state are attached to every turn input,
including resumed sessions, separately from static instructions. Oversized or
malformed state fails explicitly; it is never silently cut off. Source data is
labeled as private application data rather than a new user instruction or quotation.
Personal gateways keep their baseline-only route. Direct API chats receive current
state in their per-request system context.
Ordinary conversation remains the default. Comparisons, quotations, translation,
rewriting and one-off experiences do not by themselves request saved changes.
A pending review card does not block the next message or authorize a save; the
assistant should not repeat an ignored proposal on unrelated turns or append
unrelated setup questions. Clearly reported recordable events and current health
goals still create their supported reviewable drafts. A read result is not a draft;
the assistant must receive a successful draft-tool result before claiming a card
was created.
A reviewable `getbased_read_app` snapshot reports `reviewPrepared: false` and
`nextToolForReview: getbased_request_app`. Reading settings never creates a
card. Only a successful request result with `controlId` and
`pending_user_approval` means the native review was prepared. Retired app
controls are omitted from the next turn's action state; missing or unrecognized
stored draft statuses are reported as unknown with no execution actions.
An unsupported setting request must report its limit and native UI path, without
substituting a narrower field. For example, a global US-unit preference must not
be replaced by a height-only display proposal. A one-answer conversion does not
change the saved unit profile, and comparing models does not select one.

Discarded cards stay inactive. If the user explicitly requests a discarded change
again, the assistant must read fresh data and offer a new proposal for review.
Missing or unrecognized stored proposal statuses stay inactive with an uncertain
outcome; they never become pending or regain Apply actions on import or reload.
Native tool calls are used when accepted by the selected endpoint; explicit
native-tool incompatibility falls back to a validated structured-content protocol
on the same provider/model. Venice E2EE carries this protocol inside encrypted
messages. Invalid/incomplete action responses stop without applying changes.
Personal gateways still do not have this tool bridge; unsupported context types
require their editors.

The local Hermes ACP process uses a private, process-owned managed policy. Its
native file/terminal tools, ambient MCP servers, optional plugins and external
memory are disabled; the session receives the declared getbased MCP tools.
A bounded native configuration read verifies that this policy was loaded before
Hermes is offered for chat. Unsupported runtimes fail explicitly. An existing
administrator policy is preserved and requires its own compatible setup. The
policy contains no credentials and does not edit the user's Hermes settings;
normal provider sign-in remains with Hermes. Personal gateway routes retain
their separately selected baseline behavior. This tool restriction relies on
the installed CLI honoring its verified configuration; it is not an OS sandbox.

Local interactive chat negotiates the Companion's tool-contract version,
in addition to general chat/tool capabilities. A compatible development
Companion takes precedence over an installed Companion with an older tool
catalog for this request. When no compatible Companion is available, chat
reports the required update before sending a turn. Supported goals and other
structured facts must use their dedicated context destination; general profile
notes are not a fallback for missing structured tools.

Goals, personal conditions, family-history entries and period observations support
adding, updating and removing individual records from a read snapshot. Other
records and unknown metadata survive the edit. A stated improvement intention
becomes a goal, not an inferred symptom; a relative's condition stays family
history. Age at death belongs in a note, never the age-at-onset field. Ambiguous
ages and relatives require clarification. A period start can be logged alone;
unreported end date and flow remain unknown and do not enter duration/flow
statistics as a completed one-day period. Later reports can update that same
observation. Cycle settings, diet meal times and the ordinary Light & Circadian
answers also support reviewed changes. Physical exposure assessments, provider
configuration, imports and other unsupported application data are not arbitrary
writable profile fields through these tools.

`getbased_read_data` lists the supported resources and bounded record IDs, then
reads a selected record (or a create snapshot). `getbased_draft_data` proposes
validated changes to Supplements & Medications, Nutrition Targets, dated notes,
the profile context note and current-profile details. Profile detail proposals can
edit name, sex, date of birth, height, country/postal code, tags, profile-list notes,
status and pinning. Height converts an explicit cm/in value to the ordinary stored
centimetres; its display unit remains separate. Avatars and profile creation,
switching and deletion require their existing application flows. Metadata reads
refresh from durable storage, and Apply checks the reviewed metadata inside the
serialized, cross-tab locked profile-list store. Therapy edits include pause, stop, restart and dated
dose/schedule changes; original periods and unrelated product metadata survive.
New therapies leave unreported schedules unknown. Nutrition target proposals show
the effective protein basis and all normalized settings. Apply checks the reviewed
record inside the locked save and rejects stale targets while merging unrelated
peer additions.

The `meals` resource supports meal/drink additions, corrections and removals,
nutrient fields, ingredient changes, after-meal check-ins and retaining/removing
existing photos. Drink commands distinguish plain water from other beverages.
Linked ingredient portions recalculate nutrients; unsupported estimates become
unknown, while explicit whole-meal values remain. Changing an AI-estimated meal's
identity or analysis details retains its previous analysis as history and clears
obsolete estimated ingredients/nutrients. Review and the ordinary nutrition
editor identify that invalidation. Review shows these effects.
Local and implicit meal times resolve to a fixed instant and timezone before
review, including when approval happens after a timezone change. A compact
review snapshot carries a fingerprint of the full record, so large photos remain
editable without disclosing their bytes through the text tools. Apply rechecks
the record and authorization inside the storage boundary, commits the canonical
meal and refreshes its encrypted cache and nutrition summary. A later cache
refresh failure is reported as a saved change requiring a view refresh.
Approved changes refresh the current read view, sidebar and header while keeping
chat open. An open modal or inline form defers that full view refresh so an
unrelated editor draft is preserved; its domain-specific live refresh remains
separate from the commit.
Existing device-local meals can be reviewed without migrating before approval.
New photo selection and analysis still use the application file workflow; these
tools cannot invent image content or source evidence. Other unsupported app
resources remain outside the editable catalog.

The `manualReadings` resource supports adding, correcting, moving and removing
manual weight, blood pressure, pulse and method-specific waist/hip/abdominal-depth
readings. Exact reads include units and the recorded body method. Waist/hip
methods must be reported rather than inferred; absent BP components and paired
hips remain unknown. An occupied date/method requires a correction proposal.
Notes and tags apply to every manual reading on that date, and review explains
this shared scope. A move keeps independent source-date readings and uses the
destination's context unless the proposal explicitly changes it. Reads do not
migrate older biometric/device-local data. Apply verifies the selected record,
destination and deletion clocks inside the locked canonical write, then refreshes
the ordinary manual history and summary. Vendor wearable records remain outside
this manual resource. The shared CLI/direct provider catalog uses the same domain
commands; endpoint/model compatibility still needs route-specific verification.

`markerNotes` and `markerValueNotes` read, replace and clear exact annotations.
Read an existing marker/date identity, including an empty note, before proposing
text. Dated notes apply to every result for that marker on the same date; they do
not distinguish separate same-day specimens. Changing a note preserves original
lab values and source files. Disabled lab groups are excluded from reads and
review feedback, and approval rechecks their permission. A changed note, target
definition or reviewed lab date requires a new review. Derived-only marker
results without a stored result column are not yet dated-note targets.

Actual reference and optimal limit edits use the native marker editor.
Chat can still select reference/optimal/both display through `display.preferences`;
that changes presentation and preserves the recorded limits and canonical values.
Native edits retain supported unit conversion, original provenance, guarded
restoration, opaque fields and conflict checks.

Custom marker definitions are created or removed through the native forms.
Chat does not create definitions, invent marker identities or delete custom-marker
history. Read-only marker discovery remains available, including unrecorded native
definitions for explicitly reported lab results. Native deletion keeps its human
confirmation, exact identity, effect review and concurrency safeguards.

Marker and category names, placements and ordering use native controls.
These presentation edits preserve canonical result addresses, units, calculations,
source evidence, notes and disclosure groups. Failed native edits retain typed
candidates and require a fresh human confirmation. Chat cannot prepare these
administration changes or replay old cards.

Apply is required after the reply. Native chart/status defaults remain the basis;
only explicit moves change relative positions. Measurements, samples, notes and
source links retain their canonical identities. Single-move Undo cancels exactly
that operation and retains later-arriving peer moves. Whole-scope reset and its
restoration supersede older sync generations. Every Undo checks the saved native
proof, current profile/chat, source permissions and unchanged ordering footprint.
Pending reviews expire on reload. A restored saved/undone label requires private
native completion proof; importing conversation metadata cannot grant execution
or Undo authority. Proof or repaint failure cannot turn a durable save into a
failed data-write claim. Ordinary discussion and answer-only sorting do not
request a saved ordering change. No sample-history editing button is added.
Saving presentation order schedules normal sync without republishing clinical
context to the personal gateway.

`labs.comparison` reads permitted recorded collection dates, current selections
and the latest two dates. It returns no measurements, source files or notes.
After an explicit comparison request, `getbased_navigate` accepts `view:compare`,
the fresh `snapshotId`, and `firstDate` and/or `secondDate`, or `swapDates:true`.
Swap is separate from selecting dates. A hidden current side is returned as null;
choose both permitted dates rather than guessing the hidden selection. Fewer
than two permitted dates cannot create a comparison snapshot.

These are session-only view commands, with no Apply card or saved-data change.
Snapshots expire when the originating profile/chat, source permissions, dates or
selection change, and cannot be replayed. Existing dialogs and editors block
navigation. The receipt reports opening separately from a committed selection:
optional rendering failure can leave a selected pair without a confirmed table.
The existing native table compares date-level data; selecting dates does not
merge or edit same-day specimen records. Ordinary discussion does not authorize
navigation. Opening Compare alone retains the normal native defaults.

`labs.correlations` discovers permitted recorded marker/treatment IDs, native
presets, current selections, exact pair IDs and supported view controls. Search
and pagination bound the item list. It exposes no numeric results, dose schedules,
source files or disabled selections. An unavailable snapshot requires the native
controls; the assistant must not enable sources or guess private IDs.

An explicit workspace request uses `getbased_navigate` with `view:correlations`,
the fresh `snapshotId`, and a `correlation` JSON patch containing `markers`,
`therapies`, `preset` and/or `view`. Replacing markers keeps treatments; a native
preset replaces markers and retains treatments within the combined eight-item
limit. View fields include ranges, custom dates, grouping, layout, tabs, exact
pairs, visible series, ingredient choices, analysis disclosure and inspector
pinning. These direct commands save the native workspace preferences without an
Apply card. They never edit measurements, doses, treatment periods or source
permissions. The native UI shows the existing calculation and available data.

Receipts distinguish saved preferences from a confirmed view. A rendering failure
does not undo a durable save. Guarded Undo requires a fresh read and a returned
current `undoId`, supplied instead of a patch; reload, newer workspace edits,
relevant data changes or withdrawn permissions retire that authority. Imported
IDs cannot authorize Undo. Native controls and chat share write serialization;
stale footprints and unsupported saved shapes fail before a write. Failed writes
verify rollback, and an unconfirmed persistence outcome requires checking the
native workspace. Cancellation blocks a command before its commit starts; an owner change after
a completed save preserves a redacted truthful receipt. Ordinary discussion does
not authorize workspace configuration.

The native meal-photo model preference is independent of the chat model. Both
Settings and the meal editor list configured models with confirmed image input
and share a validated, serialized preference command. Explicit API overrides use
their named provider even when chat uses another provider. An unavailable or
unfamiliar saved choice stops meal analysis rather than silently switching to a
different recipient. A human can choose a listed replacement in the native
picker. Explicit CLI choices retain their agent and target; older unbound choices
require confirmation. Automatic mode follows a capable chat assistant or the
configured fallback. Selecting a model saves no meal and starts no inference;
Analyze and any required processing approval remain separate actions.

Meal-photo and label model routing is configured in native AI settings or the
meal editor. Chat can open AI settings but cannot change the saved analysis route.
Opening settings starts no inference and grants no processing approval.

Photo analysis captures its destination before preparing images. A change to the
profile, saved route or destination configuration cancels the request; it does not
send the photo to the replacement connection. CLI requests retain their agent,
execution target and Companion endpoint while allowing private credential renewal
on that endpoint. Feature discovery does not rewrite chat connection settings.
Required processing approval still precedes image uploads, and analysis returns a
review without saving a meal.


`history.views` reads native display preferences, their scopes, supported ranges
and tabs, and permitted wearable metric IDs. It returns no measurements, dates,
source identities or notes; disabled wearable disclosure also hides metric
presence. An explicit `getbased_navigate` uses a fresh `snapshotId` and `history`
JSON. `nutritionHistory` accepts `nutritionRange` (`30d`, `3m`, `6m`, `1y`, `all`)
and `nutritionView` (`meals`, `trends`). `wearableDetail` requires an exact returned
`metricId` and optionally `wearableRange` (`90d`, `6m`, `1y`, `all`).

These display defaults are browser wide. Current Dashboard widget visibility
uses native Customize and is not a history command. Legacy strip
visibility/collapse keys are not advertised as functional dashboard controls.

Dashboard widgets, visibility, order, biometric tiles and pins are managed
through native Customize. Chat can open the Dashboard, but cannot change layout
or reset these preferences. Native storage and rollback safeguards still apply.

These explicit presentation commands save directly without an Apply card. Native
controls and chat share the same profile lock and verified storage boundary.
Receipts distinguish a saved preference from a confirmed opened Dashboard; a paint
failure does not erase a confirmed save. Undo needs a fresh read and a current
`undoId` instead of `dashboard` JSON. It restores only affected raw preferences,
including prior absence, and rejects newer effects or retired ownership. Reload
and imported IDs cannot recreate Undo authority. Clinical data, context access,
sources and account connections remain outside this command. Ordinary discussion
does not authorize saving a layout or changing pins.

These explicit presentation commands save only stated fields directly, without
an Apply card, and leave meals, readings, source access and assistant lookback
unchanged. Native handlers and chat share serialization and verified writes.
Receipts distinguish saved preferences from a successfully rendered view and
retain a confirmed save if presentation fails. Undo needs a fresh read, a current
private `undoChoices` ID and its declared destination, without a history patch.
It restores only saved fields, preserves newer unrelated preferences and rejects
changed effects or retired ownership/disclosure. Reload removes Undo authority.
Owned read-only histories can update; manual-entry forms, protected meal drafts
and other dialogs block commands. Ordinary conversation about health or meals
does not authorize presentation changes.

`labs.overlays` reads permitted chart-layer switch settings and prepares explicit
`notes`, `supplements` and/or `cycle` booleans. It returns no health content or
record-availability information. Apply saves profile-scoped display preferences
through the same durable owner as native Layers controls; it never changes source
permissions, notes, therapies, periods or samples. Layers render when matching
records exist. Cycle phase at blood draw also requires a female profile and
recorded period or draw-phase context. Disabled lab/insight/supplement context
restricts the corresponding tool fields and filters past cards/model metadata;
the assistant must not enable access to operate a layer.

Native controls and chat share preference-write locks. Storage failure rolls
back attempted keys before publishing cached modes. A pending review expires
after reload. Saved/undone labels require private native proof; guarded Undo
changes only the reviewed switches and rejects newer manual changes. An Undo
attempt is recorded before changing switches, and cannot be replayed. Proof or
repaint failure preserves truthful saved outcomes. Ordinary conversation and
chart explanations do not authorize saved overlay changes.

Context sources, lab-group restrictions and lookback windows are managed in
the native Context Hub. Chat cannot enable disclosure or apply/undo old source
reviews. Changes there preserve saved health data and messages already shared.

Native Apply is required for every disclosure change, including enabling or
extending access. It uses the Context Hub atomic profile save and checks the
originating profile, chat, saved settings and current authority inside the commit.
The next context build and tool reads follow saved preferences; records and past
messages are preserved. This cannot withdraw content already sent to a provider.
Private native proof authenticates historical saved labels after reload; pending
reviews expire. Further changes require fresh explicit review, with no reusable
Undo that could re-enable disclosure. Ordinary health discussion and a one-answer
omission do not authorize a saved preference change. Destination approvals remain
independent of source preferences.
Unsupported future source metadata or lookback values block this action before
native profile normalization can discard them; no migration is performed by a
settings read.
Legacy wearable-series preferences also use the current tab’s profile owner;
another tab changing the shared profile selection cannot change this tab’s window.
Agent Access refresh mirrors only an authoritative saved window. Its read API's
default zero for a missing synced preference must not erase a legacy local window.

`labResults` lists and reads saved results by exact sample and marker identity,
then supports numeric `update`, `remove` and `revert`. Updates require an explicit
registered unit and freeze its converted canonical amount before review; Revert
requires a known original imported value. Review includes
the selected sample/date, collection details, converted canonical value and
changed linked calculations. Removing the final result for a marker/date also
reviews clearing its shared dated note. Raw source paths and snapshot identifiers
are never sent through these tools. A locally computed revision guards private
evidence, saved values, definitions, labels and shared context; approval checks
the date and relevant metadata again inside the locked domain write. A linked
calculation requires all affected context groups to be enabled. Numeric commands
retain the existing source and original-value lifecycle. Ordinary history shows
separate same-day samples and carries the sample identity through edit/remove/
Revert. It withholds a date-wide range rating when the date has multiple samples.
These focused result operations do not import reports or manage marker/range
definitions. New results and collection-level edits use `labSamples` below.
The shared catalog is contract version 53; it is consumed by CLI and direct
provider routes alike. Controlled
protocol acceptance does not establish live inference compatibility with every
provider or model.

Persona management is intentionally excluded from chat tools. Use the native
persona picker and editor to select, create, edit, generate or delete personas.
The assistant may explain this manual workflow and adapt its conversational tone,
but cannot list private persona metadata, prepare editor drafts or queue persona
changes. Old persona requests and Undo controls are non-executable history.

`geneticVariants` lists/searches supported rsIDs and stored calls, including
unrecorded catalog calls, and prepares an exact `update` from an explicitly
reported genotype. Exact reads require the enabled Other SNP lookup inventory;
priority findings alone do not disclose all calls. The catalog resolves strand
and repeat notation. Model-supplied effects, annotations and inferred genotypes
are refused. The review shows the reported call, its catalog match, coverage and
any dependent APOE change when genome summary disclosure is enabled. Previous
calls and original source evidence remain local on correction. Explicit `remove`
with an empty patch clears only the selected saved call and its local source/
call history; the review shows any resulting APOE/coverage changes. Other SNPs,
maternal data, conversations and original files remain. An identity-only removal
clock prevents stale profile copies, rows or raw files from reviving the call.
Reading that removed identity and updating it with an explicitly reported
supported genotype restores it with a fresh clock; erased source history is not
recovered. Exact reads distinguish removed calls from unrecorded ones. File-based
import/reanalysis still requires its separate workflow.

`maternalHaplogroup` reads recordId `maternal` under genome summary disclosure.
An explicitly reported supported lineage uses `update`; `remove` with an empty
patch clears current maternal data and its local mutation/report history while
retaining SNPs and original files. Corrections retain the previous maternal
report as local evidence. Ancestry is never sufficient to infer a lineage.
These tools return bounded public effects marked unapplied. Apply rechecks the
source/catalog revision and disclosure settings in the captured profile's locked
save; native manual SNP and maternal editors share the same mutation/store
owners and do not publish unsuccessful writes.
Native maternal file imports also retain previous reports and recheck the reviewed
genetics and both removal-history maps in the save lock. Closing/replacing the pending
review or changing profiles before commit cancels the import. Storage failure
leaves the review available for retry; a source conflict requires a fresh preview.

`lightRooms` and `lightScreens` list and read exact Light Environment records,
then support reviewed add/update/remove under the separate Light & Sun context
permission. New rooms require a reported name and new screens a reported device;
other unreported details remain unknown. Read the room list before assigning an
exact room ID to a screen. Supported durations use hours in half-hour increments,
color temperature uses kelvin in steps of 100, and unknown numeric/filter facts
can be cleared explicitly. `todayActive` is a local-date override; null restores
the usual setting. Review shows the actual date and normalized values.
Room removal preserves historical measurements and original room identity/name,
unlinks saved screens and explains both effects before approval. It does not
remove measurement evidence or snapshots in audits. The native editor and chat
share staged canonical commands; stale source/link/history changes, revoked
consent and persistence failures cannot silently publish an accepted change.
Device/session and measurement/checkpoint operations use the separate resources
below. Sun, EMF, camera/import/reanalysis workflows still require their own
capabilities; room/screen changes cannot replace those workflows.

`sunSessions` supports reviewed completed-session add/update/remove and active
session note correction. List exact IDs, then read the intended record; new rows
need a create snapshot. Actual start time with a UTC offset and duration/end are
required. Exposure preset or anatomical regions, sunscreen, glass, eye mode/time,
posture, ground, notes and reported coordinates can be corrected. Missing facts in
new records stay unknown; their estimates wait for sufficient inputs. An explicitly
shorter eye interval stays shorter when only total duration changes. Saved precise
coordinates and private analysis/history are omitted from tool reads.
`useSavedLocation` explicitly selects current app coordinates or clears the session
location; new reported latitude/longitude must be supplied together. Review explains
location selection, cleared estimates, native post-approval weather/spectrum
recalculation and retained prior inputs/segments/calculations. Weather failure cannot
turn a committed input edit into a failed write or restore old estimates.
Removal explains the loss of this record and its local histories. Other sessions,
original files, backups and conversations remain. Existing active timers also
support reviewed `pause`, `resume`, `stop` and `rotateSides` with an empty patch,
`setCoverage` with anatomical `regions`, and `setSunscreen` with a reported SPF
(zero explicitly means none). These reuse native controls and require fresh
source/permission checks inside the write queue. The review states that the action
takes effect when Apply is processed, after pending writes, rather than backdating
it to the message. New live timers use `start` with a create snapshot. Its
`requirements.start` reports whether Fitzpatrick type is configured, a specific
saved location is available, and a timer is already active. Choose reported
uncovered regions/preset and an explicitly selected saved location or reported
coordinates. Country-only location and missing skin type do not meet the native
prerequisites. Start/end/duration and eye duration cannot be supplied for a live
start: its boundary is measured when Apply is processed. A known eye mode tracks
that interval; unreported SPF, glass, eye/lens, posture and ground remain unknown.
The timer records elapsed time while estimates wait for sufficient inputs. Native
start dialogs recheck their originating profile, setup and location before saving.
Other active inputs retain their native flows. A recorded-input correction cannot
silently stop an active timer.
All native lifecycle writes and periodic slices stage their changes and publish
only after canonical storage accepts them. Live changes retain prior input history
and close the old timed slice first; changing inputs while paused adds no exposure.
When no live rate was available, a saved interval retains the old inputs and model
settings for native weather/spectrum replay. Missing weather leaves estimates
unavailable; retry calculates each interval with its own inputs. Paused time is
excluded and a side change never multiplies dose. A permission change after durable
acceptance suppresses later runtime effects without falsely reporting no save.

`sunSetup` is a singleton: read it without a record ID and use `update` for
explicitly reported Fitzpatrick type, photosensitivity warning tier, home-light
choice, eyewear and individual habit answers. It uses Light & Sun disclosure;
skin-type changes also require Insight cards so the mirrored Light & Circadian
value can be reviewed. Missing habits remain unknown and do not establish a full
survey score. Partial changes do not complete onboarding. The review explains
future estimate inputs, preserved saved session calculations and private retained
setup history. Previous setup interpretation is cleared from the current view.
Stop an active Sun session before changing safety defaults. Exact reads omit
precise coordinates, private analysis/history and unrelated Insight fields.
Location, advanced overrides, new interpretation and live Sun actions require
their dedicated application flows. A storage failure leaves Apply retryable.

`lightMeasurements` and `lightAudits` use the same independent Light & Sun
permission. Exact reading corrections and new reported readings require supported
units and actual timestamps with a UTC offset. Reported meter entries, camera
percentages, banding scores, approximate color temperatures, classifications and
relative window ratios retain their acquisition meaning. Missing confidence stays
unknown. A new acquisition method creates a new reading; the model cannot alter
calibration, confidence, frames or arbitrary source metadata. New current
room/tool readings review replaced rows and retain their source history privately;
an older report cannot silently displace a newer reading. Frozen checkpoints
retain their original evidence when live readings are corrected or removed.
Checkpoint add copies the current rooms, screens and mapped readings today.
Existing date/label/notes corrections retain metadata history; removal reviews the
checkpoint/source/history being erased. The live environment is independent.
Saved checkpoints remain visible after the final live room is removed. Native
camera walkthrough saving is atomic across evidence, room creation and mapped
relative readings, with retry after storage failure. Native and chat saves publish
only after canonical acceptance and guard stale/retired owners. Selected camera,
file/import/reanalysis and comprehensive source erasure flows remain separate.

`lightDevices` and `lightDeviceSessions` list and read exact saved device and
completed-session records under Light & Sun disclosure. They support reviewed
add/update/remove. Custom device adds require a reported brand/model and retain
unreported specifications as unknown. Corrections validate wavelength/share
pairing, group/mode identities and coupling; no invalid requested mode silently
becomes the device default. Device specification corrections review recalculated
linked sessions and retain previous inputs/calculations. An explicit unknown
reference distance retains the reported intensity but withholds reference-based
numerical estimates. Device removal is blocked by active timers and preserves
recorded sessions with their saved specifications; review also states which
device-only prior-spec history is removed. Session removal clears only that
session and its local history.
New completed sessions require the actual start time with an explicit UTC offset,
duration, distance, body area and eye-protection fact, plus a saved device and its
reported valid mode when applicable. A date alone never supplies a clock time.
Chat creation and timing corrections reject a completed session ending in the
future. Session corrections recompute ending time and derived values through the
same owner as the native editor. The model cannot patch derived doses, safety flags,
source snapshots or AI output. Catalog preset selection, chosen URL/photo
extraction and live-timer workflows still need their dedicated application flow.
Staged commits preserve unrelated drafts and reject revoked, stale or retired
owners. Source metadata and raw history stay local.

`genome` reads recordId `genome` for an explicit request to remove all saved genome
data. It supports only `remove` with an empty patch, and requires both genome
summary and full SNP-inventory sources for a complete review. The bounded summary
counts calls and histories without exposing source files; unknown legacy layouts
are identified rather than interpreted as supported calls. Apply clears all saved
SNPs, maternal records, derived summaries, genome metadata and local source/history.
Original files, conversations and identity-only removal guards remain. Use the
individual resources for one SNP or only maternal data.

Whole-genome and maternal removal generations are independent of individual SNP
guards. Newly reported facts and explicit native file-restoration previews create
new generation-bound records; erased reports and call history are not recovered.
Older profile/row values cannot rejoin an observed restored generation even with
a later timestamp. Maternal corrections also retain their own assignment times.
Transport tombstones alone cannot erase a newer assignment or lifecycle carrier.
Lost transport registers and mixed-client/device convergence still need separate
sync qualification. Raw paths and stored source labels stay out of model context;
ordinary UI and local source evidence retain them.

`labReports` supplies permitted saved report metadata for identifying the exact
collection and source. It is read-only in chat. Report removal, re-review and
source replacement use native import/history controls; whole-sample deletion is
also native-only. Individual numeric corrections still use `labResults`, and
explicit single-sample collection/date/cycle facts use `labSamples`. Native source
removal retains its scoped restoration, provenance, note, range and deletion-clock
checks, without erasing unrelated samples or diagnostic history.

`labSamples` supports adding a deliberately separate sample, adding missing
results to an exact existing sample, correcting collection date/specimen/time/
fasting and removing the whole sample. A new sample requires `newSample: true`,
an explicit date and reported numeric results with explicit units. Unreported
collection facts remain unknown. To find a marker never saved before, call
`getbased_search_markers` with `includeUnrecorded: true`; this returns enabled
marker definitions and input units, without personal result values. Default
search still returns recorded biomarkers. Existing numeric corrections and
Revert use `labResults`.

Marker history does not expose a whole-sample editing button. Collection changes
remain available through explicit chat proposals and their native review/Apply.
Browser tests open the internal sample form through a test-owned helper; no test
control or testing mode is added to production history.

Sample collection and date changes affect every result on that sample. Review
shows exact facts and changed results, note writes and changes to which dated
notes apply. A date correction carries a note only when its source-date result
is unshared; notes still owned by a sibling remain there. A conflicting
destination note rejects preparation rather than overwriting it. Source links,
numeric originals and opaque extensions survive; collection corrections retain
their first original facts and source references privately. The locked commit
checks source/destination dates, global sample identity, deletion clocks, shared
metadata and definition/labels. A removed sample stays removed when an old row
arrives. The internal sample form exercised by browser tests uses the same owner.

Explicitly reported HOMA values remain explicit results during later input
corrections. Automatic calculations retain their derived-source metadata and
require known numeric inputs. An explicit marker removal is not immediately
recreated by a subsequent calculation refresh. Legacy unmarked imports still
need source-aware import qualification. Active whole-date removals require a
separate restoration workflow before a sample can be added/moved there; the
sample tool does not clear whole-date history implicitly. Explicit cycle day,
phase and matching phase detail can be corrected on one sample through the same
review and ordinary editor. A reported phase/detail becomes recorded; a day-only
change preserves its existing phase source. Clearing a phase clears its detail
and permits profile predictions again, without changing observed periods. These
facts require enabled Insight disclosure in addition to the sample's lab groups;
revocation excludes old reviews from model context and prevents Apply. Prior collection facts/source
references remain private originals. Older version 1 sample reviews require a
fresh read against version 2. Chosen-file imports/review/source removal, custom
marker/range management and per-sample chart/score/range selection remain outside this
sample operation. Date-wide transport and full remote/mixed-client convergence
still require broader qualification.

Outgoing lab context, marker lookups, automatic Focus insights and Biology Score
context use native marker-source permissions. Renaming or moving a marker does
not enable its disabled source group. Notes and collection facts from withheld
results are omitted, including indirect automatic calculations from private
inputs. Explicitly reported ratios retain their own source scope; historical
unmarked HOMA is conservatively withheld when a possible input group is private.
Separate same-day samples keep independent collection facts and values in chat
context. Ambiguous date-wide readings are withheld from trajectories and score
inputs; chat uses exact sample tools for changes. The ordinary chart/score view
still needs its separate sample-selection workflow. Enabled-context scores can
therefore differ from the full local view. Deleted samples and marker removals
cannot reappear through a stale context projection. These protections do not
establish complete acceptance of all other AI features or external providers.

The older note, meal, biometric and therapy draft tool names are compatibility
shortcuts to the same exact review pipeline. They no longer save through separate
legacy handlers. They read matching current records, freeze an append/time before
review and preserve unreported schedules. Explicit BP plus pulse can be approved
and saved together. A saved older card offers Refresh review; that action changes
only the pending proposal, and the refreshed card needs a separate Apply. Older
cards with missing dates/units or unavailable original user evidence need a new
proposal. Existing applied/discarded/uncertain outcomes remain readable.
Repeated refreshes of one old addition retain stable card and new-record
identities across tabs. Exact context reads also preserve older text-only medical,
diet, exercise and sleep cards using their ordinary migration, with no pre-approval
storage change. The raw stored card remains the conflict baseline.

Settings supplies an OS-specific bootstrap command for temporary use. It downloads
the auditable single-file `getbased-companion.mjs` emitted by the production
build. Temporary mode stops with its Terminal/PowerShell session. Once connected,
Settings can register automatic startup, pause/resume AI work, restart Codex,
update the installed bundle or uninstall it. A recovery start command remains
available if the process has stopped completely.

Installed mode uses a systemd user service, macOS LaunchAgent or current-user
Windows scheduled task, without root/administrator access. The browser does not
expose a port or pairing token. Sources for the entry point, host, installers,
protocol and bundle are in [`bin/`](../bin/), [`server/`](../server/),
[`lib/`](../lib/), [`shared/`](../shared/) and [`scripts/`](../scripts/).

The Companion reports failed Codex turns as errors, with specific messages for
recognized schema, reasoning-effort, authentication, rate, usage and context-limit
failures. Raw CLI messages and additional details stay private because they may
contain credentials, paths or health data. Recoverable app-server errors keep
streaming while Codex retries; failed or interrupted responses never count as
successful feature results, including with an older Companion.

The dormant Claude adapter is not advertised or detected in normal builds.
Consumer claude.ai Free/Pro/Max credentials are not permitted for this path
without Anthropic's prior approval. Operators using Anthropic Console/API billing
may expose **Claude Agent** by starting/installing the Companion with
`GETBASED_ENABLE_CLAUDE_AGENT=api-console`, then signing in with
`claude auth login --console`. This does not authorize consumer-subscription use.

### Operator and provider metadata

Independent operators identify their own deployment in `index.html`:

```html
<meta name="getbased-operator-name" content="Example Health Cooperative">
<meta name="getbased-operator-privacy-url" content="https://example.org/privacy">
<meta name="getbased-operator-terms-url" content="https://example.org/terms">
```

Empty values do not fall back to getbased policies. Official hosts supply their
own supplementary operator links; the selected AI recipient's policies remain
primary. Additional provider metadata can be set before the main module loads
through `GETBASED_DEPLOYMENT_CONFIG.aiProviders[providerId]`, using `label`,
`privacyUrl` and `termsUrl`. See the [environment example](../.env.local.example),
[compatibility relay](../deploy/compat-proxy/README.md) and
[profile-share service](../deploy/profile-share/README.md) for service configuration.

### Venice encrypted-mode verification

Encrypted mode fails closed unless the Intel TDX quote and NVIDIA GPU evidence
both verify. The fixed NVIDIA NRAS request uses `integrations.getbased.health`
on official hosts and the deployment's same-origin `/api/proxy` elsewhere,
because NRAS does not allow browser POSTs. The policy permits only NVIDIA's
exact attestation endpoint for this operation and receives no encrypted inference
messages. Signed NRAS tokens are verified in-browser against NVIDIA's published
keys. Evidence contains no message content; a shared nonce does not prove GPU
and TDX workload co-location.

## Voice and Knowledge Base

Settings → Voice uses one service by default; an advanced toggle can select
separate dictation and reply services.

- **Automatic** reuses a connected OpenRouter, PPQ or Venice account if it
  supports the operation, otherwise browser-local models. During CLI chat it
  stays on-device unless another voice service is explicitly selected; the CLI
  agent receives transcribed text, not recordings.
- **On this device** uses quantized multilingual Whisper Small by default,
  with Medium and Large v3 Turbo options, plus Kokoro speech. CPU/WASM and
  validated WebGPU run in dedicated workers. Automatic processing tries WebGPU
  first on capable mobile browsers, CPU elsewhere, falls back safely and uses
  normalized timings to select the fastest tested backend. Each required CPU/GPU
  model variant downloads only with confirmation. Slow transcription shows
  elapsed time and can be cancelled; stalled processing stops after three
  minutes. Kokoro buffers opening segments; built-in voices are English US/UK,
  and Markdown tables are skipped with a spoken notice.
- **Local server** uses compatible `/v1/audio/transcriptions` and
  `/v1/audio/speech` endpoints, including configured LocalAI/Speaches servers.
- **Cloud voice** sends only the selected recording or reply text to the chosen
  OpenRouter, PPQ, Venice, xAI or ElevenLabs endpoint. The first three reuse AI
  settings credentials; xAI/ElevenLabs require a user API key, without delegated
  account sign-in. Keys remain device-key encrypted without passphrase protection.
  Private chat mode does not automatically extend to voice.

Microphone audio is retained only for active transcription. Dictation inserts
text at the composer cursor without sending a message. Listen controls play
assistant replies; recording/playback stops when chat closes or switches.

The Knowledge Base indexes documents locally or queries an external knowledge
server, adding relevant cited passages to chat and Current Focus. An interpretive
lens changes analysis framing; it is distinct from the document source.

Retrieval preferences, connection settings and library/document administration
use the native Knowledge Base UI. Chat cannot change these settings or use older
proposals to Apply or Check saved change. The native owners retain scoped storage
locks, exact source identities, atomic persistence and honest uncertain outcomes.

Chat uses `getbased_search_knowledge` for relevant excerpts from enabled sources,
with the saved rewriting and excerpt preferences. Sources accompany search
results. Library/document inventory, imports (including pasted text and chosen
files), replacement, renaming, removal, indexing, cache clearing and connection
settings stay in the native Knowledge Base UI. These actions are absent from
both provider catalogs and the generic data tool resources. Historical management
proposals remain inactive: they cannot choose files, Apply or check a saved change
through chat, and do not advertise executable actions in model context.

Native file selection, indexing, source identity checks, recovery generations and
manual management remain available. Personal gateways without local tools,
discussion and Current Focus keep their existing retrieval behavior. Removing
chat management does not remove saved documents, libraries or source files.

## Agent Access

Agent Access gives external MCP-compatible tools only the context you enable,
through an encrypted relay and a local decryption key. Enable Cross-device Sync,
then Settings → Agent Access, choose a target client and copy its private setup
command into that agent's terminal.

The public Linux installer sets up the local agent stack:

```bash
curl -fsSL https://getbased.health/install.sh | bash
```

It does not grant private profile access. Use the app's private setup command:

```bash
curl -fsSL https://getbased.health/install.sh | bash -s -- connect <target> --setup 'gbsetup_v1_...'
```

The payload contains a read-only relay token and local Agent Context key.
**Never paste real setup values into logs, issues or public documentation.**
The systemd installer does not configure macOS, Windows or WSL1; use the
[manual setup guide](https://docs.getbased.health/guides/agent-access) there.
Agent Access and the AI Companion are separate integration paths.

#### EMF assessment changes

For general self-reported exposure or mitigation, `getbased_read_context_card`
with `environment` reports its EMF mode. `selfReport` exposes the ordinary quick
choices, including existing custom answers; `assessments` directs the model to
exact assessment/room resources instead. `reviewRequired` needs the existing
editor to resolve malformed saved data. The quick-choice review identifies the
self-report destination and creates no measured assessment. Apply rechecks mode,
private assessment ownership and native drafts at the canonical write boundary.
Native Environment saves also reject assessments added since their form opened.
Clean open lifestyle forms refresh after chat Apply; unsaved forms retain their
draft and require review before Apply.

The shared direct/Companion tool catalog exposes `emfAssessments`, `emfRooms`
and `emfMeasurements` under Insight disclosure. List exact IDs before reading
and proposing an update/removal; additions use a create snapshot. Assessment
metadata and notes, room details/use/source/mitigation tags, readings/instruments
and removal of existing photos use the same review and explicit Apply controls.
A new assessment requires its actual date and first room, with explicitly
reported sleeping/daytime use. Reading corrections require value and canonical
unit together; unsupported units need clarification rather than reinterpretation.
A reported instrument can be saved with a null reading when its value is unknown.

Raw photos, report metadata and prior source history are not disclosed by these
reads. Corrections retain private assessment history and invalidate saved
assessment/comparison interpretation. Removing current photos/readings/rooms
retains their originals in that history. Removing an assessment also removes its
own local rooms, readings, photos and edit history; original files, conversations,
exports and backups remain. Apply checks the complete private EMF revision,
consent and profile ownership again at the canonical storage boundary. A stale
proposal or an unsaved ordinary EMF edit requires a fresh review.

Chosen file/photo acquisition, import review, interpretation generation,
environment quick choices and full erasure beyond the selected record still use
their separate application workflows. The ordinary editor displays the accepted
records and preserves custom tags/source extensions. Its native changes share
the acknowledged canonical save queue, retain failed drafts and reject retired
profile/view/source owners. Clean open editors refresh after chat Apply; unsaved
native drafts block it. Interpretation save failure offers Retry saving without
repeating generation. Import unit conversion, unknown room use and remote or
mixed-client sync still require separate qualification.

AI pause/resume and saved app web-search preferences use their native controls.
Chat cannot save these flags through an app-control proposal. A request to search
once is distinct from changing the saved search preference.


Native deletion keeps its exact guarded catalog/tombstone transaction. A selected
persona's fallback uses the guarded native selection owner, after confirmed
deletion, without rewriting conversation bodies or historical attribution.
Deletion and fallback have separate outcomes: a foreign preference/index, retired
owner or failed fallback save preserves that newer state and tells the user to
choose a persona in the native picker. A saved deletion cannot be reported as
failed solely because presentation or sync notification failed. Opening a review
creates no reusable Undo or persisted approval authority.

Native persona creation/edit/deletion reviews expire when the protection mode or
session key changes, even if the stored records still match. A fresh native
review is required after locking, rekeying or changing the protection mode.

A stale persona deletion that loses its data snapshot before any own data write
retains the newer record and discards only its own exact unused journal. It
reports that nothing was deleted by that request. An unknown or foreign recovery
owner remains unresolved for native review; no competing journal is erased.


Saving an edited selected persona through its native review also waits for a
guarded conversation-label update. A private verified definition receipt, fresh
originating metadata lease and current index/selection/protection identity are
required. Concurrent selections and foreign indexes/preferences are preserved;
newer same-view conversation metadata is merged. Definition and label saves
remain distinct, and an unavailable label update does not undo the saved persona.
The user is told if a label outcome or view refresh is unconfirmed. Historical
messages and attribution are never rewritten. A human may save the definition
during an active reply; only the separate conversation-label publication needs
an idle reply boundary, and its unconfirmed outcome is reported.

Ordinary message-body persistence cannot restore an old persona over a newer
selection or rename. Established and partial historical persona fields are
preserved; only a wholly absent legacy projection may be initialized. The
existing source-message attribution remains attached to its original request.

The user may explicitly reselect the current persona to refresh an unconfirmed
conversation label through the normal guarded selection path. Current labels
remain a true no-op; repaired old labels do not offer a resurrection Undo.

Chat can open native handoffs for health-file selection, report review, active-profile sharing and measurement tools. It can suggest a native report template and supported date window. Opening does not import, analyse, export, upload, share or capture a reading. The native interface retains file/permission choice, inclusion and final actions; existing record editors and Data settings handle selected photos, meal analysis and export/backup downloads.

For an existing meal, the native Photo tab offers **Add reference photos**. This keeps its current photos and estimate and sends no AI request. Review and Save completes attachment; the existing four-photo limit applies. Choosing photos for a new analysis replaces the estimate and photo set only after native review and Save. Native saves use the exact current record and refuse stale/deleted targets; if persistence succeeds but local refresh fails, the form reports Saved and requires reload instead of inviting a duplicate save.

For a requested source freshness check, chat can read the limited `wearables.sources` metadata projection. A matching source ID and fresh snapshot can open that configured source's native Update now control. The user starts refresh there and native progress, completion or failure supplies the actual outcome. Opening the control performs no refresh, and reading freshness does not verify live availability. Disabled wearable context blocks this metadata read; chat cannot enable it, reconnect sources or start a bulk backfill. Entirely failed vendor fetches do not advance the recorded successful sync time.

When explicitly asked about an earlier conversation, chat can use `getbased_read_app` with `conversations.search` and a literal phrase. It searches a bounded page of prior conversations in the current profile and returns short historical quotes with native source links. These quotes are sent to the assistant selected for the current question, so earlier conversation content can reach that selected provider; they are not new health observations or instructions. No result in a bounded page proves that a topic was never discussed. Hidden/automatic/system/tool messages and attachments are excluded. Clicking a source after the reply opens and highlights the unchanged native quote without another inference. Source links survive reloads in the same profile; locked, edited, removed or foreign-profile sources require native history access or a new search. Search does not edit health records, projects, pins, saved summaries or discussions.
