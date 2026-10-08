# Static SvelteKit build and acceptance

The static bridge supports incremental Svelte UI migration without a rendering
backend. It uses SvelteKit 3, Svelte 5 and `adapter-static`; Display settings
and the Settings shell use scoped Tailwind 4. Application compilation and diagnostics use
TypeScript 7. Supporting Kit/checker peers use TypeScript 6 in `tooling/svelte`.

## Build locally

```bash
npm run sveltekit:build
npm run test:sveltekit
```

The build writes the complete public artifact to ignored
`.local-notes/sveltekit-build`. `test:sveltekit` builds it first and runs focused
scenarios in Chromium, Firefox, desktop WebKit and mobile WebKit.
All launches are explicitly headless and disconnected from desktop display,
compositor, session-bus and activation credentials. WebKit's headless Linux port
is WPE; a custom executable must not substitute the GTK windowed binary.

The artifact runs on a static file host. Retain the existing `/app` rewrite to
`/index.html`, MIME types and CSP. It contains public app assets and one worker;
server/API implementations and development sources are not copied. Existing
optional provider/companion integrations retain their existing requirements.
The native `production:build` command and deployment configuration remain separate
while this bridge is evaluated; building locally does not publish it.

## Preserved contracts

- Native shell services initialize once; Kit owns its route DOM and Svelte shares
  the same runtime with the component adapters.
- Synchronous compatibility HTML builds resolve Svelte's server lifecycle
  exports, including destruction callbacks during rendering. Client components
  keep browser lifecycle exports; both outputs are reproducible and covered.
- Chat's initial shell and composer are authored once as shared Svelte
  components. Kit owns them in its `/app` route; the native document contains
  their deterministic build-generated snapshot, hydrated without replacing
  controls or live transcript hosts. The shared composer owns its model/reasoning
  picker as well, using the same provider and CLI services in both builds.
  `svelte:check` verifies that snapshot.
- Settings CSS, worker entry points, computed vendor URLs and delegated preference
  mutations keep their contracts.
- Manifest `id`, `start_url` and `scope` remain `/app`; `/`, `/index.html` and
  `/app/` remain document aliases.
- The existing root service worker owns offline precaching and atomic updates.
  Kit neither registers a second worker nor polls for independent updates.
- First feature use and cold launch work offline. Failed updates retain the
  active app. Later defers activation and explicit Reload preserves stored data.
- Old tabs can load their previous content-hashed modules after a new worker
  activates. Live clients report their document build, and unused version caches
  retire after old documents leave or reload; unknown pre-protocol clients keep
  their assets until they leave. Cleanup only considers versions present at
  activation, preserving caches prepared by a waiting worker. After a worker
  restart, old caches stay safe until the next activation census. Mutable assets
  and API traffic never use the
  old immutable-asset fallback.
- Kit's bootstrap runs as an external classic script under the existing CSP.

The focused browser scenarios live in [sveltekit.spec.ts](../tests/pwa/sveltekit.spec.ts).
The shell scenario verifies all core Settings sections, responsive orientation,
keyboard selection, retained preference actions and WCAG checks for the shell.
The [protection scenario](../tests/pwa/sveltekit-protection.spec.ts) covers
Security and Backup keyboard actions, themes, exported backups and encrypted
offline cold launch. [Native dialog checks](../tests/playwright/passphrase-dialog.spec.ts)
cover all six dialog modes, theme contrast, responsive containment, short
viewports and erasure failure recovery. Mocked erasure checks do not replace
real IndexedDB deletion verification or installed-PWA acceptance.
Build, desktop-isolation and [client cache retention](../tests/service-worker-client-cache.test.ts)
contracts have separate unit tests. These checks do
not constitute complete application regression, hardware/provider acceptance,
or a fresh combined function-coverage measurement. Owned Kit component emissions
remain in the existing coverage inventory; no source or compiler safety is waived.

## Size measurements

`build-metrics.json` records JavaScript output, precache resources and decoded
bytes, input build identity, and deltas against the historical cache limits.
Browser reports attach the actual cold startup JavaScript requests and decoded
bytes separately. Output totals and startup requests measure different things.

Focused readiness reports measure host monotonic elapsed time from navigation
through app-ready, service-worker readiness and controller confirmation. Browser
`performance.now()` under Playwright's fixed clock is shared across pages and
includes prior workflow time; older reports using that value are not per-launch
durations. The [clock-offset regression](../tests/pwa/sveltekit-readiness-clock.spec.ts)
keeps a synthetic hour of browser-clock age out of the readiness measurement.
These local automation timings include observer overhead and are not broad
performance acceptance.

Historical size/cache ceilings are measurements during local Kit evaluation.
The native build still enforces its committed budgets; its limits and the
quality/coverage floors are unchanged. Evaluate cold loads and offline cache
cost before setting budgets for the consolidated build or promoting it.

The shared Chat personality picker and editor retain custom instructions through
cached first use, offline cold launch and encryption unlock. Their focused
[static scenario](../tests/pwa/sveltekit-chat-personality.spec.ts) uses real saved
personas and the assembled artifact, then edits those instructions while the
origin is unavailable. Native [persona workflows](../tests/playwright/custom-personality-dom.spec.ts)
cover hosted-use assent, generation and encrypted cross-device application.
These focused checks do not replace the final whole-application release matrix.

The shared `ChatHeader.svelte` consumes the existing shell layout and a typed
presentation port in both entries. Its controls and context chip retain runtime
selectors and workflow contracts without native presentation writers. The
[header cold-launch scenario](../tests/pwa/sveltekit-chat-header.spec.ts) verifies
stored perspectives/summaries, persisted attestation receipts and their stated
limits, web-search preference, fullscreen restoration and menu focus using the assembled artifact after its origin becomes unavailable.
Attestation badges share authored Svelte markup with transcript HTML callers;
verification remains in provider services and display retains its stated limits.

The shared attachment controls, previews, drop feedback and lightbox use Svelte
and scoped Tailwind in both entries. The
[attachment cold-launch scenario](../tests/pwa/sveltekit-chat-attachments.spec.ts)
checks retained history thumbnails and fresh local image selection with the
assembled artifact while its origin is unavailable. Queued originals remain
in memory and disappear on reload; attachment selection does not rewrite the
stored transcript. The [native attachment scenarios](../tests/playwright/chat-attachments-owned.spec.ts)
exercise overlapping reads, draft retirement, original bytes, keyboard removal,
capability-aware paste, six themes and narrow layouts. Reviewed health-file
imports and OS portal-drop snapshot timing retain their existing contracts.

Chat microphone/status and per-message speech controls share authored Svelte
components across the native and static Kit entries. The
[voice cold-launch scenario](../tests/pwa/sveltekit-chat-voice.spec.ts) checks
stored reply hydration, Listen/Stop and draft dictation with the assembled
artifact after the application origin becomes unavailable. Its deterministic
microphone and compatible-server responses test UI orchestration and cached
application code; they do not establish real microphone permissions, recognition
accuracy, model performance or remote-provider availability. The
[native voice scenarios](../tests/playwright/chat-voice-owned.spec.ts) cover
late permission/transcription replies, origin retirement, speech cancellation,
background playback, narrow layouts, themes and reduced motion.

Discussion selection and continuation controls share `ChatDiscussion.svelte`
across native and static entries. The [static discussion scenario](../tests/pwa/sveltekit-chat-discussion.spec.ts)
checks restored pending participants, participant locking, a resumed response,
explicit ending and retained transcript/ended state through cold launches while
the application origin is unavailable. Its synthetic local-provider response
verifies orchestration and cached application assets; it does not establish
model accuracy or actual provider availability. The [native discussion scenarios](../tests/playwright/chat-discussion-owned.spec.ts)
check additional-perspective and subsequent sequential requests, stale controls,
literal imported names, keyboard focus, six themes and narrow layouts.
Live and restored discussion replies share `ChatLiveMessage.svelte`,
`ChatMessage.svelte` and `ChatPersonaLabel.svelte`. The
[reply lifetime scenarios](../tests/playwright/chat-discussion-live-owned.spec.ts)
check live-node reconnection, retirement on profile/history/thread replacement,
newer-request controller isolation, sequential background participant prompts,
origin-only persistence and public element facades. Both normal and background
saves use the same transactional encrypted history writer; these checks do not
establish remote transport availability or OS-installed PWA acceptance.

Provider onboarding and its shared progress strip use the same authored Svelte
components in native and static entries. The
[offline provider scenario](../tests/pwa/sveltekit-chat-onboarding-provider.spec.ts)
checks first-use setup after a cached cold launch, literal profile names,
keyboard branch navigation, actual Settings handoff, connected progress and
unchanged profile records while the origin is unavailable. The
[native ownership scenarios](../tests/playwright/chat-onboarding-provider-owned.spec.ts)
also check OAuth callback dispatch, manual-key/Bitcoin/CLI entry, edition
extension slots/actions, stale controls and delayed settings replies, six themes
and three widths. Callback checks do not establish successful remote OAuth,
paid provider availability, Companion installation or OS-installed acceptance.

Stored citations and image previews use the same authored Svelte components in
native transcript HTML and the static Kit artifact. The
[message-content cold-launch scenario](../tests/pwa/sveltekit-chat-message-content.spec.ts)
checks literal stored excerpts, keyboard disclosure, a delayed pre-response view
and a completed fresh response after the application origin becomes unavailable.
The [stored-image scenario](../tests/pwa/sveltekit-chat-attachments.spec.ts) checks
safe persisted thumbnails, keyboard-capable lightbox actions and fresh original
file processing after cold launch. Restored history must be visible before
processing files so tests do not submit into a conversation being replaced.
The response transport is a deterministic local-provider fixture; these checks
establish cached presentation and orchestration, not real-provider availability
or installed-PWA acceptance.

Message actions, context disclosure, proposed-change review and inline editing
share Svelte views across native and static entries. The
[offline action scenario](../tests/pwa/sveltekit-chat-message-actions.spec.ts)
checks stored context and copy, application of a reviewed proposal, cancelled
editing with a separate composer draft, and a revised response retained through
two cold launches while the application origin is unavailable. It uses the
existing services and a synthetic local-provider response; it does not establish
live-provider availability or installed-PWA acceptance. The
[headless action and editor scenarios](../tests/playwright/chat-message-actions-owned.spec.ts)
check literal text, stale clipboard replies, keyboard/focus behavior, mobile
menus, coarse controls and six themes at desktop and narrow widths.

Profile onboarding uses the same authored `ChatProfileSetup.svelte` in native
and static entries. The [offline profile scenario](../tests/pwa/sveltekit-chat-onboarding-profile.spec.ts)
opens the form for the first time after the origin is unavailable, saves all
basic and optional fields, closes the page and verifies the restored form after
a cached cold launch. A backup exported through Settings verifies the weight
stored in the IndexedDB-backed profile blob and its correctly normalized manual
wearable row. Startup maintenance may advance `lastUpdated`; every other profile
field remains identical, and that timestamp cannot move backward. It also checks page errors and the
deployed Content Security Policy; no source-module imports substitute for the
static bundle or real form actions.

Optional onboarding uses `ChatOptionalSetup.svelte` in both native and static
entries. The [offline add-ons scenario](../tests/pwa/sveltekit-chat-onboarding-optional.spec.ts)
opens the tasks for the first time after the origin is disabled, imports actual
SNP and mtDNA files through their file choosers and confirmation dialogs, then
cold-launches the cached application and verifies both genomes through a real
backup export. The [native ownership scenarios](../tests/playwright/chat-onboarding-optional-owned.spec.ts)
also cover disconnected/connected continuation, retired controls, profile changes
during parsing and pending confirmation, and theme/layout/accessibility checks.

The shared health-context catalog uses the same authored Svelte HTML and scoped
Tailwind styles in dashboard, Insight and Chat. Its existing public string-render
contract and service delegates remain available. Optional-onboarding acceptance
opens all nine cards after an offline cold launch, expands an explanation and
persists literal additional-context notes alongside imported DNA/mtDNA in the
exported backup. The shared assessment/tips slots use independently hydrated authored boundaries,
profile/data tickets and unique IDs. Simultaneous catalogs receive the same typed
updates; removed or replaced profile views cannot receive new assessments or open
late tips dialogs. Tips dialogs share typed `context-card-tips-presentation.ts`
projection and authored `ContextCardTips.svelte` markup with escaped catalog/genetics
text, safe study links and keyboard close/EMF controls. Their lazy stylesheet keeps
its original URL and ordering. Card editors and nutrition views retain separate
presentation and persistence owners. Notes edits
retain their originating profile through debounced scoped persistence, expose
confirmed commit status through the shared authored `ContextNotes.svelte` component.
Independent notes boundaries hydrate in place, retain textarea focus, use unique
label/hint relationships and dispose subscriptions on removal/profile changes.
Failed drafts survive fresh profile reloads
with an explicit retry. The storage queue checks the previously observed notes
inside the locked read/merge/write. If saved notes have changed, the UI presents
the saved text alongside the draft and offers an explicit choice; keeping saved
notes does not write or discard unrelated edits.

The authored Diet, Environment, Light/Circadian, Sleep, Exercise, Stress and
Relationships editors use the same live Svelte form and typed model/session services in native and static builds. Their
stable facade and lazy stylesheet URLs are retained in the worker graph. Focused
[`sveltekit-context-forms.spec.ts`](../tests/pwa/sveltekit-context-forms.spec.ts)
acceptance opens them from the real catalog after the origin becomes unavailable,
saves profile/history data offline, and reopens them across two cold launches.
Environment also cold-loads the real EMF editor/stylesheet offline, creates an
assessment and returns to the authored form while preserving quick-exposure values.
Light/Circadian preserves its stored skin type and opens the actual Light setup
offline from the authored summary.
Health Goals uses its authored live Svelte component and captured incremental
session in both builds. Its stable facade, shared modal shell and lazy stylesheet
remain in the worker graph. Focused
[`sveltekit-context-goals.spec.ts`](../tests/pwa/sveltekit-context-goals.spec.ts)
acceptance opens Goals for the first time while the origin is unavailable, edits
and removes goals, explicitly restores a deleted goal, cancels clearing, and
checks committed IndexedDB history and deletion markers through two offline cold
launches. It uses the real catalog and stored profile without importing pruned
source module URLs.
Interpretive Lens shares the authored context form and captured storage session.
[`sveltekit-context-lens.spec.ts`](../tests/pwa/sveltekit-context-lens.spec.ts)
opens it through real Context navigation on offline first use, saves literal
multiline text and history, checks cancellation and Back without saving draft
text, and verifies two offline cold launches plus the empty-string Clear contract.
The authored food-contaminant badge and dialog retain their stable facade and
lazy stylesheet in the static worker graph.
[`sveltekit-context-food.spec.ts`](../tests/pwa/sveltekit-context-food.spec.ts)
opens the dialog through the real Insight badge on offline first use and two cold
launches, preserves original signal/source groups and keyboard controls, and
checks that the complete committed profile remains unchanged. Native headless
checks separately exercise the actual Chat opening with a captured prompt port,
without sending a model request, and reject retired profile/dialog handoffs.
Both static and native production assembly retain the transitive emitted import
graph of raw Knowledge Base and voice workers. Dependencies are discovered from
runtime ESM syntax and checked against the declared worker shell; missing emitted
modules or undeclared assets fail the build. This keeps independently loaded
workers usable offline when their implementation is split into new modules.
Tailwind's relationship markers use the prefix alone (`gb:peer` and `gb:group`);
component scope belongs on the consuming utilities. Switch acceptance checks the
rendered thumb, track color and keyboard focus alongside checked state. Context
source controls and Chat web search exercise these visible states headlessly.
The Context overview uses its authored Svelte component, typed projection and
captured autosave session in both builds, with the same lazy stylesheet URL.
[`sveltekit-context-hub.spec.ts`](../tests/pwa/sveltekit-context-hub.spec.ts)
opens it through real navigation while the origin is unavailable, migrates legacy
source choices, saves canonical flags and the nutrition window, follows Lens and
Knowledge Base Back navigation, and verifies the complete committed profile
through two offline cold launches. Headless native checks cover all six themes,
small and wide layouts, keyboard controls, accessibility, real failed IndexedDB
writes, peer conflicts and retired controls. Source settings retain their existing
history contract and do not create personal-fact history events.
The data-protection picker shares authored `DataProtectionPicker.svelte` markup,
scoped Tailwind and one capability reader across native and static builds.
[`sveltekit-data-protection-picker.spec.ts`](../tests/pwa/sveltekit-data-protection-picker.spec.ts)
loads the owning Insight route, exercises the public delegated entry with the
origin unavailable, follows real encryption and sync setup dialogs without
committing setup, and retains the complete profile across two cold launches.
Headless native checks cover all configured/capability combinations, existing
callback configuration, six themes, keyboard focus, responsive resizing, failed
stylesheet retry and retired controls. Folder selection dispatch is checked with
a callback fixture; no operating-system folder picker is opened.
Saved meal details share authored `NutritionMealDetail.svelte` and
`NutritionMealResponse.svelte` components, scoped Tailwind and captured meal/profile
sessions in native and static builds. The public detail renderer and delegated
meal actions remain available. The session rejects stale reads and changed meals;
accepted writes finish on their originating profile. Focused
[`sveltekit-nutrition-meal-detail.spec.ts`](../tests/pwa/sveltekit-nutrition-meal-detail.spec.ts)
acceptance opens the actual History detail offline, saves and clears optional
check-ins through two cold launches, and verifies committed IndexedDB data while
preserving unrelated profile content. Headless native checks cover all six themes,
small and wide layouts, keyboard controls, accessibility, profile retirement and
late stylesheet/encrypted-read handoffs. Check-ins retain their existing personal
evidence and AI-summary exclusion contracts.
Benchmark result cards and nutrient/difference tables share authored Svelte markup
and a pure projection through the synchronous presentation entry. Scoring, costs,
provider execution and encrypted device-local snapshots retain their domain and
storage owners. [`sveltekit-nutrition-comparison.spec.ts`](../tests/pwa/sveltekit-nutrition-comparison.spec.ts)
opens restored results through real Insight/History navigation on offline first
use, verifies two cold launches, clears only local comparison metadata, and checks
that the complete committed profile remains unchanged. Restored failures require
a new photo to retry and remain explicit about unavailable request costs. Headless
native checks cover keyboard tables, six themes, responsive result layouts and
reduced motion alongside the existing retry/cancel/full-screen workflow.
The benchmark workspace, searchable model picker, photo thumbnails, history
banner and request progress markup also use the shared authored presentation
entry. The static offline check asserts both workspace and picker ownership and
restored zero reference values on each launch. Native
[`nutrition-benchmark-owned.spec.ts`](../tests/playwright/nutrition-benchmark-owned.spec.ts)
checks open reference groups and model cards across all six themes, keyboard and
touch-sized controls, benchmark-only photo replacement/clearing, and preservation
of the parked editor's draft and file input. Full-screen layout is an explicit
scoped CSS contract across the shared modal and result children; ordinary workspace
styles are Tailwind utilities. No rendering backend is introduced.
This is scoped editor acceptance; final whole-application migration acceptance
remains required.

The meal editor, entry-method navigation, model choices, photo previews, ingredient
review, provenance, uncertainty and correction feedback share authored Svelte
presentation between native adapters and the static application. Shared progress
uses `NutritionAnalysisProgress.svelte`. Controllers retain input synchronization,
analysis requests, calculations and canonical/encrypted persistence. Superseded
native templates and editor CSS are removed; shared modal sizing and explicitly
owned loading/presentation styles remain. Nutrition controls use a 45px minimum
to keep the 44px target contract despite browser subpixel rounding.
[`nutrition-editor-owned.spec.ts`](../tests/playwright/nutrition-editor-owned.spec.ts)
covers themes, layout, accessibility, entry tabs and draft preservation.
[`sveltekit-nutrition-editor.spec.ts`](../tests/pwa/sveltekit-nutrition-editor.spec.ts)
checks offline first use, actual save/edit/reuse and closed-client cold launches,
including zero/unknown nutrients, unrelated canonical profile fields and decrypted
meal-cache equality. These local checks do not replace hosted or physical-device
release acceptance.

Chat empty-conversation presentation is authored by `ChatEmptyState.svelte` and a
pure display projection. It shares persona and progress components, retains exact
prompt and navigation payloads, and reserves context-card markup for the catalog
owner. Existing controllers retain branch decisions and provider/profile actions.
[`chat-empty-owned.spec.ts`](../tests/playwright/chat-empty-owned.spec.ts) covers
all seven branches, supported themes, narrow layouts, keyboard and accessibility.
[`sveltekit-chat-empty.spec.ts`](../tests/pwa/sveltekit-chat-empty.spec.ts) checks
offline first use, actual context-note/history commits, skip/return and closed-client
cold launches with unrelated profile parity. This scoped acceptance does not prove
whole-app startup stability or physical installed-PWA acceptance.

Saved Chat summaries, dialog content and standalone print documents share authored
Svelte presentation with the native runtime adapters. Controllers preserve AI
execution, originating profile/thread guards, sync refresh, persistence and export
contracts. Summary rows and dialog actions use scoped Tailwind; escaped Markdown
keeps shared formatting. Print output owns a small inline stylesheet for immediate
offline use. No rendering backend is required.
[`chat-summary-owned.spec.ts`](../tests/playwright/chat-summary-owned.spec.ts)
checks themes, widths, accessibility, keyboard and literal export content.
[`sveltekit-chat-summary.spec.ts`](../tests/pwa/sveltekit-chat-summary.spec.ts)
checks generation using a synthetic local model transport, actual canonical writes,
download, deletion tombstones, unrelated profile equality, two offline closed-client
launches and backup. Synthetic inference does not establish live-provider acceptance;
these scoped checks do not establish whole-app startup or installed-PWA acceptance.

The Light page shell and compact Light Today/dashboard pills share authored Svelte
presentation with existing synchronous runtime adapters. Scoped Tailwind is built
into the original ordered `css/light-sun.css` URL; the remaining base CSS serves
separately owned children. Calculations, session persistence, active tickers,
widget preferences and async child ownership remain in their existing services.
[`light-page-owned.spec.ts`](../tests/playwright/light-page-owned.spec.ts) checks
authored surfaces across themes, widths, keyboard interaction and accessibility.
[`sveltekit-light-page.spec.ts`](../tests/pwa/sveltekit-light-page.spec.ts) uses the
actual route with AI paused and the artifact origin disabled, saves a past session through the
existing dialog, checks canonical IndexedDB records and unrelated profile data,
and verifies cached body-picker artwork decoding, two closed-client launches and backup. A session without coordinates
retains its honest `needs-location` status; this check does not establish live
atmosphere-provider, remaining Light child, installed-PWA or whole-app acceptance.

The past-Sun/device logging forms and completed history are authored Svelte
through `LightSessionPresentation.svelte`, using the established synchronous
controllers and ordered Light utilities. Existing body selection, device mode
coupling, UV safety gates and canonical stores retain ownership. The
[session acceptance](../tests/playwright/light-session-owned.spec.ts) checks native
keyboard activation, radio focus, unit conversion and themes/layout/accessibility.
The [static device workflow](../tests/pwa/sveltekit-light-sessions.spec.ts) saves a
real canonical session with the origin disabled before first form use, checks
mode-specific signals and exact unrelated-profile equality, opens the existing
rich detail and verifies two closed-client launches and backup. AI is paused;
this does not establish physical-device, live-provider or installed-PWA acceptance.

Sun/device session details share authored field grids, disclosures, safety
notices and native channel buttons. The mode editor is also authored; existing
controllers and stores own calculations, coupling and mutations. Static Light
acceptance opens saved Sun details with the origin disabled and edits a real
device session from NIR to red, checking recalculated doses, unrelated data,
offline cold launches and exact backup equality. This extends local evidence;
remaining session setup owners and installed-PWA acceptance stay separate.

Active Sun/device cards, live readouts and channel chips use authored Svelte and
scoped Tailwind, while the existing timer services retain integration and alert
ownership. The [active-session workflow](../tests/pwa/sveltekit-light-active.spec.ts)
starts both real timers offline, pauses Sun exposure, closes the client with both
sessions active, resumes/stops through native keyboard actions, and verifies
precise paused-time accounting, device doses, unrelated profile equality, two
saved-session cold launches and exact backup equality. External providers are
blocked and AI is paused; this is static local acceptance, not live-weather or
installed-PWA evidence.

The [Sun entry acceptance](../tests/pwa/sveltekit-sun-entry.spec.ts) exercises
first offline use of authored live-start and coverage dialogs, native keyboard
region selection and confirmation, unchanged glass/eye/posture/surface inputs,
old/new timed body-exposure slices, exact unrelated-profile equality, closed-client
cold launches and backup export. The authored body silhouette retains its existing asset
and interaction services; preflight thresholds are checked separately through the
stable formatter and native browser entry workflow.

The [body-picker browser contract](../tests/playwright/sun-body-picker-owned.spec.ts)
checks responsive geometry and caption styling in six themes, accessible SVG
region controls, front/back independence, Enter/Space focus retention, actual
image/canvas blob readiness, a visible focus contour after tint readiness, and
overlay updates that do not steal external focus.
The [SVG projection contracts](../tests/sun-body-picker-presentation.test.ts)
cover literal metadata, source placement, namespaces, masks and the retained
parametric fallback. Existing region-map/input browser assertions remain intact.

The [channel detail acceptance](../tests/pwa/sveltekit-light-channel.spec.ts)
opens all six source-aware channel drill-downs and their research disclosures
for the first time offline, checks separate sunlight/device labels and charts,
and retains the full canonical profile over two closed-client cold launches.
It exercises the shipped static artifact and CSP through real navigation; the
component contract separately verifies chart coordinates and delegated quick-log
actions. The actual offline UI opens and cancels live Sun and device entry using
a configured home location, with external weather/provider requests blocked. External research links are inspected without opening browser windows.

The same channel acceptance enables the optional Dashboard Light Channels widget,
checks all six authored pills and retained mini-chart bars, and opens the selected
Light detail through the real cross-route shortcut before checking each channel.
The Dashboard and Light row share typed Svelte SVG output; no raw mini-chart HTML
slot remains. This is exercised offline after first install and on each cold launch.

The [room editor acceptance](../tests/pwa/sveltekit-light-environment-room.spec.ts)
exercises native keyboard disclosure, room names, source archetypes and the full
source selector, daylight, bucket and exact-hour inputs, evening timing, daily
exclusion, nested screen creation and room quick picks. It performs the edits for
the first time offline, checks the full committed profile including unknown saved
fields, and reopens the assessment through two closed-client offline cold launches.
The [room browser contract](../tests/playwright/light-environment-room-owned.spec.ts)
compares independent frozen layouts across themes and breakpoints, audits visible
advanced fields, and checks keyboard focus, touch targets, responsive dialog bounds
and sync-scroll preservation. These focused checks do not establish whole-app,
physical installed-PWA, live-provider or update-consent acceptance.

The [saved-audit comparison contract](../tests/light-audit-compare.test.ts) checks
independent frozen snapshots, historical screen ownership, renamed and duplicate
room identities, measurement-method copy, camera proxy direction/deadband and exact
AI handoff prompts. The [audit browser contract](../tests/playwright/light-audit-card-owned.spec.ts)
compares card, block and comparison layouts across themes and breakpoints and
checks native disclosure activation, independent AI actions, header-to-content tab
order and collapsed content. The existing cached-environment PWA acceptance checks
audit fields, readings, verdicts, renamed-room comparison and modal disclosure focus
with exact full-profile equality over closed-client offline cold launches. These remain focused checks with the boundaries stated above.

The [Light Tools presentation contract](../tests/light-tools-presentation.test.ts)
compares independent native launcher and solar-window snapshots, walkthrough
fields, camera status copy and literal pause labels. The
[tool browser contract](../tests/playwright/light-tools-owned.spec.ts) compares
independent layouts, themes and breakpoints, including widget placement, native
keyboard disclosure, focus and coarse controls. Existing tool and loader browser
checks retain storage, camera teardown and lazy-load coverage. The
[static tool acceptance](../tests/pwa/sveltekit-light-tools.spec.ts) opens the
launcher, cancels a golden-hour form and exercises denied-camera retry/close over
closed-client offline launches, with exact full-profile equality. Camera input is
mocked; these checks do not establish physical sensor accuracy, audit-wide AA,
installed-PWA, update-consent or whole-app acceptance.

The [camera presentation contract](../tests/light-camera-presentation.test.ts)
compares all six shells, shared guides, lock states and camera-result fragments
against preserved native output. The
[camera browser contract](../tests/playwright/light-camera-owned.spec.ts)
compares complete element geometry, palette and typography across themes and
breakpoints, with actual shown overlays, hidden/manual states, keyboard focus,
native disclosure and coarse targets. Existing
[camera workflow checks](../tests/playwright/light-tool-camera-modals-edge-browser-coverage.spec.ts)
retain frame-based calibration, confidence, result, saving and cleanup assertions.
The [static camera acceptance](../tests/pwa/sveltekit-light-camera.spec.ts)
exercises denial fallbacks, manual source choices, per-tool guide dismissal and
close actions over closed-client offline cold launches with exact full-profile
equality. It shares a self-contained denied-camera seed with the adjacent tools
acceptance. These checks use mocked camera input; they do not establish physical
sensor accuracy, camera-wide AA, installed-PWA, update or whole-app acceptance.
