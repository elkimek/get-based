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
