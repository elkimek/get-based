// @ts-check
// changelog-impl.js — lazy What's New release-note archive and modal renderer
import { escapeHTML } from './utils.js';
import { getAppVersionRuntime } from './utils-runtime.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { CURRENT_RELEASE } from './changelog-current.js';
const CHANGELOG_ACTION_ATTR = 'data-changelog-action';
const changelogDelegateRoots = new WeakSet();
const CHANGELOG = [
  CURRENT_RELEASE,
  { version: '1.18.10', date: '2026-09-03', title: 'AI model menus stay open on desktop', items: ['<b>Model dropdowns in Settings → AI now behave like persistent pickers.</b> A normal click keeps the list open for selection, the list stays above the Settings modal, and browsers without the newer picker UI fall back to their reliable native control.'] },
  { version: '1.18.9', date: '2026-09-03', title: 'Gemini 3.8 Flash joins recommended models', items: ['<b>Gemini 3.8 Flash is recommended wherever it is available.</b> It replaces older Gemini Flash versions in the visible Recommended group for OpenRouter, Venice, Routstr, PPQ, and compatible custom providers, while availability and pricing continue to come from each provider\'s live catalog.'] },
  { version: '1.18.8', date: '2026-09-02', title: 'Claude Fable 5.1 joins recommended models', items: ['<b>Claude Fable 5.1 is recommended wherever it is available.</b> OpenRouter, Venice, Routstr, PPQ, and compatible custom providers recognize each provider\'s model ID format while continuing to source availability and pricing from live catalogs.'] },
  { version: '1.18.7', date: '2026-09-01', title: 'On-device voice is clearer and more reliable', items: ['<b>Local speech behaves better across phones and computers.</b> Android defaults to the stable CPU path, failed GPU runs recover safely when possible, and Whisper Medium is available again.', '<b>Kokoro starts as soon as its first sentence is ready.</b> Playback continues outside the chat panel and clearly shows when the next sentence is still being generated.', '<b>Voice settings are easier to understand.</b> Speech-to-text and text-to-speech have focused sections, model storage explains CPU and GPU weight files, and advanced connections stay collapsed until needed.'] },
  { version: '1.18.6', date: '2026-08-30', title: 'Cross-device sync moves to the newer engine', items: ['<b>Encrypted Sync now uses Evolu 8 by default.</b> Existing recovery words and relay identities carry forward automatically, while compatibility checks continue to exercise the previous client as a rollback path.', '<b>Sync recovery has stronger storage safeguards.</b> The app avoids stale rebroadcasts and preserves a complete snapshot when rebuilding relay history, reducing duplicate growth without dropping newer device changes.'] },
  { version: '1.18.2', date: '2026-08-28', title: 'WHOOP sync is current and securely stored',
    items: [
      '<b>Self-hosted WHOOP connections work with the current WHOOP API.</b> Recovery, sleep, strain, heart rate, and related daily readings once again line up with the correct day.',
      '<b>WHOOP data now has always-on device protection.</b> Imported rows and WHOOP-specific local profile values are AES-GCM encrypted even without an optional profile passphrase, and device-bound raw data stays out of portable backups.',
      '<b>WHOOP access is explicit before sign-in.</b> The connection screen explains the requested read access, the self-hosted data path, optional encrypted sync and AI context, and how to disconnect or revoke access.',
    ]
  },
  {
    version: '1.18.1', date: '2026-08-28', title: 'Nutrition planning stays clear and responsive',
    items: [
      '<b>Meal timing now shows the complete daily rhythm.</b> Trends includes the fasting window, and demo profiles carry enough history to make the 30-day view useful.',
      '<b>Meal Benchmarks now works as its own workspace.</b> Add a photo there, keep your selected models when navigating, and expand known values only when you need them.',
      '<b>Long-running meal analysis no longer holds you in place.</b> Continue elsewhere while analysis runs, cancel it when needed, or stop individual benchmark models without losing the rest.',
      '<b>Nutrition targets are easier to read at a glance.</b> Dashboard and History progress now use semantic grades that reflect progress toward each target.',
    ]
  },
  {
    version: '1.18.0', date: '2026-08-25', title: 'Meals & Nutrition arrives',
    items: [
      '<b>Log, review, and reuse meals.</b> Add a meal photo, scan a nutrition label with your selected AI model, or enter values manually. Every estimate stays editable before saving, and saved meals can be corrected or logged again.',
      '<b>Review complete model-estimated nutrition.</b> The selected vision model estimates macros, vitamins, minerals, and other registered nutrients from identified foods and portions; uncertain values stay blank and every estimate remains editable.',
      '<b>Follow useful seven-day patterns.</b> Daily Nutrition brings intake averages, logging coverage, quick drink logging, and personal planning guides to Body and the Dashboard.',
      '<b>Explore carbohydrate and fat composition separately.</b> Fuel Mix Context shows the logged split and amount without turning it into a metabolic score or universal optimum.',
      '<b>Keep control of meal photos.</b> Full-size photos are sent only when you choose AI analysis and are not saved. Encrypted Sync can carry reviewed meal data and small thumbnails when enabled.',
      '<b>Unsloth Studio is now a first-class Local AI provider.</b> It joins Ollama and LM Studio with automatic model discovery, vision support when available, and connection help tailored to each server. Meal-photo comparisons can also use active models across configured local and cloud providers.',
    ]
  },
  {
    version: '1.17.4', date: '2026-08-24', title: 'Lab units for Australia and New Zealand',
    items: [
      '<b>Lab results can now use common Australian and New Zealand units.</b> Choose Australia / NZ in Settings → Display to keep charts, tables, marker details, reports, and manual entry aligned with local pathology reports.',
    ]
  },
  {
    version: '1.17.3', date: '2026-08-21', title: 'Height and BMI stay accurate in reports',
    items: [
      '<b>Reports now interpret saved height consistently.</b> Heights entered in inches display correctly in feet and inches, and BMI continues to use the canonical metric value.',
    ]
  },
  {
    version: '1.17.2', date: '2026-08-21', title: 'Credentials stay protected on this device',
    items: [
      '<b>Saved provider credentials are now encrypted even when profile encryption is off.</b> Existing keys migrate automatically, unencrypted backups omit credentials, and generated privacy replacements now use secure browser randomness.',
    ]
  },
  {
    version: '1.17.1', date: '2026-08-21', title: 'Weight units stay accurate',
    items: [
      '<b>US weight entries now stay in pounds everywhere.</b> Manual entries, dashboards, charts, reports, and BMI calculations consistently convert between pounds and kilograms.',
    ]
  },
  {
    version: '1.17.0', date: '2026-08-19', title: 'More control over cloud connections',
    items: [
      '<b>You approve each cloud AI provider before first use.</b> getbased names the provider and asks once on this browser before sending sensitive data. If you decline, that request and its sensitive data stay on your device; you can review or withdraw approvals in Settings → Privacy.',
      '<b>Voice still uses your selected AI provider, now directly.</b> Dictation and spoken replies connect from your browser to supported providers instead of passing through a getbased voice relay, with no extra voice setup.',
      '<b>Custom AI providers connect from your browser.</b> If a provider does not allow browser connections, getbased now explains why it cannot connect and what the provider needs to support.',
      '<b>Weather and supported wearables keep working with clearer privacy controls.</b> Weather uses a privacy-rounded location, and hosted wearable connections explain any getbased relay and ask before provider sign-in.',
      '<b>Analytics and privacy information are clearer.</b> Cookieless app analytics still starts on by default with a first-run notice and one-click opt-out. Updated Terms and Privacy explain the company and the services involved.',
    ]
  },
  {
    version: '1.16.0', date: '2026-08-14', title: 'Light & Sun, completely redesigned',
    items: [
      '<b>See your light day in one place.</b> Outdoor conditions, sun sessions, light devices, indoor environments, measurement tools, and guidance now work together as one clear experience.',
      '<b>Understand what light may stimulate.</b> Light channels explain vitamin D, body-clock timing, blood-vessel responses, skin and mood signaling, cellular energy and repair, and outdoor eye light—in plain language and without turning them into daily quotas.',
      '<b>Get more useful local sun context.</b> Use your home area or optionally share a privacy-rounded current location for today\'s conditions, UV, sun position, and the transition from sunrise into meaningful UVA availability.',
      '<b>Follow sun sessions more easily.</b> Set up skin type, coverage, glass, and eye conditions before starting. The live session card keeps the vitamin D estimate visible, shows the other light channels on demand, and works consistently on the Light page and dashboard.',
      '<b>Review patterns without chasing numbers.</b> Light Today explains the current day, while the Weekly Review looks across recent sessions and suggests one practical next step.',
      '<b>Keep sunlight and light devices distinct.</b> Device sessions reflect their specific spectrum, output, distance, and exposure area. Numerical estimates appear only when the available device information supports them.',
      '<b>Understand your indoor light environment.</b> Assess rooms, save observations, and use source-aware tools for brightness, warm/cool appearance, camera-visible banding, darkness, and relative window comparisons. Brightness prefers the phone\'s light sensor or an entered meter reading; a calibrated camera estimate is labeled as approximate.',
      '<b>Safety and uncertainty stay visible.</b> Sun and device guidance considers burn risk, eye exposure, heat, photosensitivity, glass, and measurement limits while keeping the feature educational and practical.',
    ]
  },
  {
    version: '1.15.2', date: '2026-08-13', title: 'Voice follows your AI provider',
    items: [
      '<b>Voice can now reuse your AI connection.</b> PPQ, OpenRouter, and Venice work automatically for dictation and spoken replies, without a second provider setup.',
      '<b>Voice choices are clearer.</b> Settings shows the supported models and voices for each service, while still letting you use different services for dictation and listening.',
      '<b>On-device Knowledge Base is faster and easier to find.</b> It now has its own Manage destination, library setup recommends a balanced search model, large imports show useful progress, updated documents replace old copies, and stopping leaves the library unchanged. Chat shows one AI Context status and flags search problems there.',
    ]
  },
  {
    version: '1.15.1', date: '2026-08-12', title: 'Better lab results and ranges',
    items: [
      '<b>More lab results are recognized and organized correctly.</b> Widely used markers and calculated ratios have been added, while ratios already present on a lab report no longer create duplicate results.',
      '<b>Ranges are more useful without pretending to know more than they do.</b> Your lab\'s range takes priority, broader built-in guidance uses personal context when supported, and you can suggest a correction to a built-in range.',
      '<b>Hormone results now understand cycle context.</b> When cycle timing is available, each blood draw can use a phase-specific range, while uncertain predictions are clearly labeled or safely left out.',
      '<b>Charts and calculated results are easier to understand.</b> Cleaner chart labels, clearer statuses and explanations, and better handling of biological age reduce confusing or misleading results.',
      '<b>Lab imports and demo data are easier to trust.</b> Collection time and fasting status can be extracted and reviewed without guessing, and Sarah\'s demo now has coherent hormone results and cycle timing.',
    ]
  },
  {
    version: '1.15.0', date: '2026-08-10', title: 'A redesigned and expanded Genome',
    items: [
      '<b>Genome is clearer and easier to explore.</b> Findings now use simple risk, protective, trait, and reference associations, with deeper interpretation available only when you want it.',
      '<b>More useful variants are recognized.</b> The curated SNP catalog has been expanded with widely studied wellness and health associations, while genotype matching and DNA-file imports are more reliable.',
      '<b>Evidence is easier to check.</b> SNP findings include relevant publication links and clearer evidence context, plus a direct way to suggest a correction.',
      '<b>Mitochondrial DNA has been improved.</b> More maternal haplogroup subclades are supported, and the mitochondrial climate and environmental-fit view is more complete and easier to use.',
      '<b>Ask AI stays focused without limiting the model.</b> Routine context remains compact, while asking about a finding adds its relevant details and still lets your selected model use broader knowledge.',
      '<b>Imports and related insights are safer.</b> Re-importing DNA preserves manually added findings and mitochondrial data, with additional fixes for strand handling, vitamin D genetics, and light-related guidance.',
    ]
  },
  {
    version: '1.14.0', date: '2026-08-09', title: 'Supplements and medications, rebuilt',
    items: [
      '<b>Keep active routines clean.</b> Ended supplements and medications move to history and can be restarted anytime.',
      '<b>Add products faster.</b> Choose common units, import from links and label photos, and review the result before saving.',
      '<b>See clearer product context.</b> Active ingredients, capsule materials, excipients, and laboratory results stay organized separately and reach AI only when useful.',
      '<b>Review better mitochondrial evidence.</b> Verified primary studies are grouped by compound with clear scope and limitations.',
      '<b>Pause Sync without disconnecting.</b> Pausing this browser keeps its identity and local Sync history. Edits made while paused stay queued and publish before incoming changes when you resume; disconnect/reset remains available under Relay &amp; device options.',
      '<b>Restore and rejoin safely.</b> Profiles restored from a full backup are published before older relay deletions can apply, so recovered supplement and medication history does not disappear during the first Sync.',
      '<b>Join Sync reliably on the hosted app.</b> Production builds now load the encrypted Sync database worker from its stable app location instead of waiting on a missing asset.',
      '<b>Large Local AI lab imports finish more reliably.</b> Progress now separates reading the report from writing results, long model-prefill waits no longer look like broken streams, and incomplete output is rejected instead of offering a partial marker list.',
      '<b>Bug fixes and improvements.</b> Product-page extraction and quality-result edits are more reliable, mobile layouts work better, and existing data migrates safely.',
    ]
  },
  {
    version: '1.13.1', date: '2026-08-08', title: 'Safer sync and complete Agent Access',
    forceShow: true,
    items: [
      '<b>Joining an existing Sync identity now works end to end.</b> After you enter the 24 words, the new device completes setup and downloads the existing data from the relay instead of only appearing to be connected.',
      '<b>Your genome and other profile data are better protected.</b> If a saved profile cannot be read, sync now stops safely instead of treating that profile as empty and sending a blank replacement to your other devices.',
      '<b>Agent Access is ready when you open Settings.</b> Sync and Agent Access controls finish loading automatically, and the Agent Access on/off slider is visible again.',
      '<b>AI agents receive your complete health context.</b> The redesigned Context-card answers now reach both in-app AI and encrypted external agents, including skin type and explicit digestive answers such as “none” or “normal”.',
    ]
  },
  {
    version: '1.13.0', date: '2026-08-08', title: 'A completely redesigned Chat',
    items: [
      '<b>Chat has been redesigned from the ground up.</b> The message box grows for longer prompts, drafts stay with their conversations, and the experience works more naturally across desktop and mobile.',
      '<b>Conversations are easier to navigate.</b> Search your chats, jump to the latest reply, edit and retry your latest question, or fork an assistant reply into a new chat without losing its context.',
      '<b>Discussion mode is clearer and more predictable.</b> Choose the participants, follow whose turn it is, pause a discussion, and retry an individual response when needed.',
      '<b>Custom personalities are easier to create and manage.</b> The new editor provides more room for detailed instructions, while saved personalities persist securely across refreshes, encrypted backups, and synchronized devices.',
      '<b>Responses and helpful suggestions are less disruptive.</b> Streaming status is clearer, and new suggestions remain noticeable without automatically opening after every response.',
      '<b>Accessibility and mobile usability have been improved throughout.</b> Chat now works better with keyboards, touch controls, screen readers, smaller displays, and reduced-motion preferences.',
    ]
  },
  {
    version: '1.12.2', date: '2026-08-07', title: 'Easier, more reliable sync setup',
    items: [
      '<b>Joining an existing sync identity now keeps you informed.</b> You can see when sync is starting, when the 24 words are being checked, and whether the device is reloading or needs you to try again.',
      '<b>Entering a sync identity works better on mobile.</b> Seed phrases are protected from autocorrect and normalized for capitalization, spacing, and pasted line breaks.',
      '<b>A clear confirmation appears after the reload.</b> You can immediately tell that this device joined the existing identity and is syncing its data.',
    ]
  },
  {
    version: '1.12.0', date: '2026-08-07', title: 'A completely redesigned health context',
    items: [
      '<b>Health context has been redesigned from the ground up.</b> The cards are cleaner, easier to scan and edit, work better on mobile, and explain why each area matters.',
      '<b>The questions are more useful and more complete.</b> Medical and family history, diet and digestion, exercise and physiotherapy, sleep, stress, relationships, and environmental exposures now capture the details most likely to affect interpretation.',
      '<b>You stay in control of how much you add.</b> Start with the essentials, add deeper context only when it is relevant, or use a custom answer when the available choices do not fit.',
      '<b>Context is easier to interpret over time.</b> Health priorities are clearer, important changes are preserved, and AI receives a more useful picture of what may be shaping labs and health patterns.',
      '<b>Both demo profiles have been rebuilt.</b> Alex and Sarah now include realistic, up-to-date context, labs, trends, wearables, light data, and other details that make the full app easier to explore.',
      '<b>Demo AI is safer and more flexible.</b> Ready-made demo insights use no AI. Local AI can update edited cards automatically, while paid AI is only used after clear permission.',
    ]
  },
  {
    version: '1.11.7', date: '2026-08-06', title: 'More reliable cross-device sync',
    items: [
      '<b>Sync uses less storage.</b> getbased avoids saving and sending the same data repeatedly, helping prevent sync space from filling up when nothing has changed.',
      '<b>Sync is easier to manage.</b> Settings once again lets you enable, disable, restore, and refresh sync, with clearer status and recovery guidance.',
      '<b>Update notices appear on the right device.</b> The browser where you made a change no longer says it came from another device, while your other open devices still receive the update.',
    ]
  },
  {
    version: '1.11.6', date: '2026-08-05', title: 'Clearer, stronger encrypted Venice chats',
    items: [
      '<b>Encrypted Venice chats now check both the secure environment and its GPU.</b> Before sending a message, getbased verifies the protected Intel environment (called a TEE) and signed NVIDIA GPU evidence. If either required check fails, the encrypted session does not start.',
      '<b>The lock is easier to understand.</b> The old letter shorthand is replaced by “🔒 TEE + GPU.” Hover, focus, or tap it to see what passed, including the underlying DCAP and NRAS checks.',
      '<b>Your message content is encrypted between your browser and Venice\'s confidential-computing session.</b> Venice can still see your API key and connection details such as the selected model, request settings, timing, and message sizes.',
      '<b>The remaining limits are shown alongside the checks.</b> The TEE and GPU can each be genuine without proving that they are running together. getbased also does not yet independently confirm the exact approved code or the source of every response.',
      '<b>One GPU-check step uses the deployment proxy.</b> NVIDIA does not accept this request directly from a browser, so the proxy relays the GPU evidence. The signed NVIDIA result is still verified in your browser.',
    ]
  },
  {
    version: '1.11.2', date: '2026-08-02', title: 'More options for self-hosted wearables',
    items: [
      '<b>Self-hosters can experimentally enable WHOOP and Ultrahuman.</b> Add your own developer app credentials and explicitly turn on the integration for your deployment.',
      '<b>The official hosted app stays focused on integrations it can support.</b> WHOOP and Ultrahuman are hidden there unless the deployment is fully configured; localhost shows disabled setup rows so developers can discover and prepare them.',
      '<b>WHOOP sign-in now keeps its client secret on the server.</b> Token exchange and refresh follow WHOOP\'s confidential OAuth flow instead of treating the browser as a public client.',
      '<b>Existing connections stay manageable.</b> If an operator later disables one of these integrations, syncing pauses while the user can still remove the local connection.',
      '<b>Wearable Settings is easier to scan.</b> Connected sources and migration warnings appear first, followed by available providers, self-host integrations, and import or manual-entry options.',
    ]
  },
  {
    version: '1.11.1', date: '2026-08-01', title: 'Google Health support for self-hosted setups',
    forceShow: true,
    items: [
      '<b>Google Health can be enabled when you self-host getbased.</b> Use your own Google Cloud project to connect Fitbit, Pixel Watch, and other supported data in your Google account.',
      '<b>Google Health is not available in the official hosted app.</b> It remains visible in Wearable Settings so the option is discoverable, but it is clearly marked “self-host only” and cannot be connected there.',
      '<b>Fitbit is moving to Google Health.</b> Google will turn off the legacy Fitbit connection in September 2026, so it is no longer offered to new users. Existing connections remain visible temporarily for migration or disconnection; Fitbit devices will continue to work through Google Health on configured self-hosted setups.',
      '<b>Other wearable connections remain independent.</b> Direct integrations continue to work as before and take priority over the same data received through Google Health.',
      '<b>Self-hosted Google Health connections remain read-only and transparent.</b> Before connecting, getbased explains what is requested, how the data is protected, where requests travel, and how to disconnect or revoke access.',
    ]
  },
  {
    version: '1.11.0', date: '2026-07-31', title: 'Talk and listen in Chat',
    items: [
      '<b>Chat now supports voice.</b> Tap the microphone to dictate a message, or choose Listen under an assistant reply to hear it read aloud. You can also have new replies read automatically.',
      '<b>You choose where speech is processed.</b> Keep dictation and spoken replies on this device after a one-time model download, connect a compatible voice server you control, or use xAI or ElevenLabs with your own API key.',
      '<b>Voice is private by default.</b> On-device voice keeps recordings and reply text in your browser. Other services receive only the audio or text you ask them to process.',
      '<b>Make it sound right for you.</b> Choose separate services for dictation and listening, then adjust the language, voice, speaking speed, and quality in Settings → Voice.',
    ]
  },
  {
    version: '1.10.397', date: '2026-07-27', title: 'Smoother mobile chat and clearer Biology Scores',
    items: [
      '<b>Chat is smoother on mobile.</b> The header and message box stay visible while typing, and choosing or starting a conversation takes you straight back to the chat.',
      '<b>Biology Coherence is easier to read.</b> The score circle now has better contrast in the Glass / Liquid, Synth Sunrise, and Neuromancer themes.',
      '<b>General fixes and improvements.</b> This update also includes codebase improvements, bug fixes, and small usability refinements.',
    ]
  },
  {
    version: '1.10.320', date: '2026-07-21', title: 'Faster, clearer app updates',
    items: [
      '<b>App updates finish faster and show their progress.</b> The update banner now displays a themed progress bar, percentage, file count, and elapsed time while the complete offline app is refreshed.',
    ]
  },
  {
    version: '1.10.318', date: '2026-07-20', title: 'Clearer marker measurements',
    items: [
      '<b>Marker values are easier to read at a glance.</b> Units now sit beside the latest result and its reference or optimal range, while the measurement date stays clearly separated below.',
    ]
  },
  {
    version: '1.10.317', date: '2026-07-20', title: 'More reliable offline use',
    items: [
      '<b>The installed app now opens reliably without a connection.</b> Required app files and fonts are kept together for offline use, and interrupted installations resume safely.',
      '<b>Your downloaded Knowledge Base models survive app updates.</b> Updating getbased no longer clears caches owned by the local research engine.',
    ]
  },
  {
    version: '1.10.316', date: '2026-07-20', title: 'Better Local AI and model comparisons',
    items: [
      '<b>Local AI setup is clearer and more reliable.</b> getbased now works more smoothly with LM Studio, Ollama, and other compatible servers, with better connection details, model guidance, and memory handling.',
      '<b>You can compare AI models on the same lab report.</b> Use the built-in 68-result benchmark or your own imports to compare accuracy and speed across local models, hosted models, and cloud providers.',
      '<b>Model test history stays private.</b> Benchmark results and diagnostics remain on this device and do not sync with your health data.',
    ]
  },
  {
    version: '1.10.305', date: '2026-07-20', title: 'Clearer lab trends at a glance',
    items: [
      '<b>A consistent timeline across lab charts.</b> Your selected timeframe sets the start and end for every marker, making trends easy to compare.',
      '<b>Recent results in one place.</b> Each marker card highlights the latest reading and up to four recent measurements.',
      '<b>Clear marker context.</b> Status, ranges, and trends are presented consistently across cards, dashboards, and marker details.',
    ]
  },
  {
    version: '1.10.185', date: '2026-07-14', title: 'Biology Scores stay unlocked',
    items: [
      '<b>Biology Scores no longer relock after app or health-context updates.</b> Once you complete the context check, scores stay visible and changed context appears as a refresh recommendation.',
    ]
  },
  {
    version: '1.10.184', date: '2026-07-14', title: 'Smoother updates and more reliable health tracking',
    items: [
      '<b>App updates are lighter and stay under your control.</b> Returning visits reuse installed files, while a small check lets you know when a new version is ready.',
      '<b>Your health data imports more reliably.</b> Apple Health keeps supported heart, body, and cycle data, while PTH, Free T3, and calcitriol results import and chart consistently across common units.',
      '<b>Light guidance is clearer.</b> It focuses on sun safety and one practical next step, without irrelevant device warnings or product prompts.',
    ]
  },
  {
    version: '1.10.177', date: '2026-07-12', title: 'More reliable private AI chats',
    forceShow: true,
    items: [
      '<b>Long private replies can finish normally.</b> Once Venice, PPQ Private, or Routstr Private has connected, getbased no longer lets the startup timer cut off a reply that is still arriving.',
      '<b>Reasoning-heavy models no longer leave an empty chat.</b> If a model produces no visible answer, getbased now shows a clear message instead of silently removing the thinking bubble.',
      '<b>PPQ Private handles secure-server key changes.</b> When PPQ rotates its encryption key, getbased refreshes the security evidence and reconnects instead of repeatedly failing with a key mismatch.',
      '<b>Venice privacy labels are more precise.</b> Message contents are encrypted between your browser and Venice\'s confidential-computing endpoint, but connection metadata remains visible and getbased does not fully verify the hardware quote or running code by default.',
    ]
  },
  {
    version: '1.10.169', date: '2026-07-11', title: 'Private chats on Routstr',
    forceShow: true,
    items: [
      '<b>Private Mode is now available on supported Routstr nodes.</b> Your prompts and replies are encrypted in your browser and can only be read inside verified secure hardware.',
      '<b>A lock shows when Private Mode is on.</b> Your balance updates automatically after each chat.',
    ]
  },
  {
    version: '1.10.168', date: '2026-07-11', title: 'Routstr sync and wallet encryption',
    items: [
      '<b>Funded Routstr sessions now follow sync correctly.</b> A node key received on another encrypted device is usable immediately, so its shared node balance no longer appears disconnected until reload.',
      '<b>Cashu bearer data is encrypted at rest.</b> With app encryption enabled, wallet proofs, fee proofs, pending funding details, and recovery journals are AES-GCM protected in IndexedDB.',
      '<b>The two balances are clearer.</b> Routstr node funds sync with the session; the Cashu wallet stays on the device to avoid copying spendable proofs between competing browsers.',
      '<b>New devices cannot receive funds without a recovery seed.</b> Before importing a Cashu token or refunding a synced node balance, each browser must create or restore its separate 12-word Cashu seed.',
      '<b>Routstr session changes reliably reach other devices.</b> Clearing a session after refund now syncs as a tombstone, and provider-setting pushes retry when Evolu is already busy.',
      '<b>Open devices refresh shared node balances.</b> Routstr sessions carry their own update clock, so a newer deposit or refund replaces a stale local session and refreshes the receiving browser.',
      '<b>Existing funded sessions migrate automatically.</b> Reading a funded pre-update Routstr session stamps it for sync, so no extra sats transfer is needed to repair an older second device.',
      '<b>Node balances are always live.</b> Balance checks bypass the browser HTTP cache so a device cannot keep displaying an earlier zero response after receiving the funded session.',
      '<b>Old profile rows cannot resurrect stale Routstr keys.</b> Once a clocked session arrives, legacy rows from another profile are ignored instead of overwriting it with an older zero-balance session.',
      '<b>Device identity mismatches are visible.</b> Settings now shows a safe comparison code: matching codes mean both devices use the same 24-word Data Sync identity, without revealing the mnemonic.',
    ]
  },
  {
    version: '1.10.157', date: '2026-07-10', title: 'Import your menstrual cycle history',
    forceShow: true,
    items: [
      '<b>Cycle history can now come with you.</b> Import Apple Health, Drip, Natural Cycles, or an extracted Clue JSON export and review the detected periods before saving.',
      '<b>Detailed observations stay local.</b> Period summaries can sync for lab interpretation, while daily temperatures, fertility signs, symptoms, and notes remain on the importing device.',
      '<b>Imports remain under your control.</b> Remove one batch, one source, or all cycle data, with encryption and full backups covering the local observations too.',
    ]
  },
  {
    version: '1.10.62', date: '2026-07-04', title: 'Control what AI uses as context',
    forceShow: true,
    items: [
      '<b>You can now choose what AI uses.</b> Manage → Context lets you turn major context sources on or off, including Genome, labs, wearables, light, Biology Scores, supplements and meds, and insight cards.',
      '<b>Turning context off does not delete data.</b> Imported data stays in getbased, but disabled sources stop shaping AI answers and missing-data nudges.',
      '<b>Genome and labs have finer controls.</b> You can include DNA and lab context broadly, or narrow it down by groups like APOE, mtDNA, raw SNPs, other SNPs, blood markers, and specialty lab imports.',
    ]
  },
  {
    version: '1.10.49', date: '2026-07-01', title: 'Add SNPs from small genetic reports',
    forceShow: true,
    items: [
      '<b>Genome import is less all-or-nothing.</b> You can now add a single SNP manually when a lab only reports one or two variants instead of giving you a raw DNA file.',
      '<b>Clinical SNP reports are supported as a review flow.</b> Report PDFs or text that mention catalog rsIDs and genotypes are parsed locally, shown in the same DNA preview, and then merged into your existing genetics data instead of replacing it.',
      '<b>Strand normalization is visible in storage.</b> getbased keeps the reported genotype and the catalog-normalized genotype, so report calls like MTHFR <code>CC</code> can still map safely to the existing health SNP catalog.',
    ]
  },
  {
    version: '1.10.48', date: '2026-07-01', title: 'Updated AI model recommendations',
    forceShow: true,
    items: [
      '<b>Recommended AI models are cleaner.</b> Model pickers now show a shorter Recommended section with the latest available versions, including newer Claude, GPT, Gemini, Grok, GLM, and Kimi options when each provider offers them.',
      '<b>Defaults are more predictable.</b> GPT-5.5 is preferred where available, with Claude fallbacks for regular cloud providers. GLM 5.2 is only auto-selected for private or end-to-end encrypted PPQ and Venice modes.',
    ]
  },
  {
    version: '1.10.29', date: '2026-06-26', title: 'Biology Scores handle updates more safely',
    forceShow: true,
    items: [
      '<b>Biology Scores now separate app updates from real context changes.</b> New context checks store a material snapshot, so getbased can keep scores visible through harmless app, service worker, or fingerprint updates without paying for another AI unlock.',
      '<b>Changed context still requires a refresh.</b> If labs, profile details, or score-relevant context no longer match the saved review, Biology Scores ask for a fresh context check instead of trusting stale AI flags.',
      '<b>Profile Context is cleaner.</b> The duplicate AI interpretation, Knowledge Base, encryption, sync, and backup setup pills were removed from the profile context card because those controls now live in the dedicated Manage → Context and Settings flows.',
    ]
  },
  {
    version: '1.10.28', date: '2026-06-25', title: 'Agent Access for your AI tools',
    forceShow: true,
    items: [
      '<b>Agent Access is now a real private bridge for your agents.</b> getbased can hand your selected health context to local AI tools through the self-hosted MCP while keeping the hosted relay limited to encrypted context.',
      '<b>It works beyond Hermes.</b> Pick Hermes, OpenClaw, Claude Agent, Claude Desktop, Cursor, Cline, or Codex in Settings → Agent Access, then copy one private setup command for that exact tool.',
      '<b>Your setup follows your synced profile.</b> Agent Access enabled state, the relay token, the local Agent Context key, and wearable-series window travel inside your existing end-to-end encrypted Sync profile, so a restored browser does not look disconnected.',
      '<b>The secret boundary is clearer.</b> The token authorizes relay access; the Agent Context key decrypts locally inside your MCP. getbased shows both values separately, and manual-config clients get the exact config snippet to paste next.',
    ]
  },
  {
    version: '1.10.24', date: '2026-06-24', title: 'Clearer AI context and blood pressure details',
    forceShow: true,
    items: [
      '<b>AI Context is easier to find.</b> Personalize how AI answers and Knowledge Base now live together under Manage → Context, so AI grounding has one clear home instead of being mixed into Profile Context.',
      '<b>AI Context status is visible in chat.</b> When an Interpretive Lens or Knowledge Base is enabled, chat shows a clickable green context chip that jumps back to Manage → Context.',
      '<b>Empty Knowledge Base state is visible.</b> If Knowledge Base is enabled but no documents are indexed yet, chat shows an amber KB empty context chip instead of staying silent or pretending answers are grounded.',
      '<b>Blood pressure details now stay paired.</b> Systolic and diastolic readings open as one BP detail view, even if you enter through the diastolic metric, and the chart keeps the two lines and manual readings visually distinct.',
      '<b>Mixed-source BP data is safer.</b> When systolic and diastolic come from different sources, getbased fetches each source separately and only shows a Latest BP pair when both halves were recorded on the same date.',
    ]
  },
  {
    version: '1.10.15', date: '2026-06-23', title: 'Safer Routstr wallet upgrade',
    forceShow: true,
    items: [
      '<b>Routstr wallet upgrades are safer for existing users.</b> getbased now preserves existing Cashu wallet state, pending recovery records, and Routstr session keys more carefully when the wallet runtime updates.',
      '<b>Funding and refund recovery is better protected.</b> Pending wallet funding, node deposits, and node refunds are checked before any real-funds canary reset, so a half-finished money flow is refused instead of wiped.',
      '<b>The wallet engine was refreshed.</b> The bundled Cashu runtime was updated and the app cache version was bumped, so returning users receive the compatibility fixes automatically after update.',
    ]
  },
  {
    version: '1.10.9', date: '2026-06-23', title: 'Terms and Privacy gate priority',
    forceShow: true,
    items: [
      '<b>Terms and Privacy now come first.</b> New browsers and stale-version re-consent see the legal gate before What\'s New, guided tours, backup nudges, analytics prompts, or deferred startup destinations.',
      '<b>No competing overlays.</b> The changelog and guided tour refuse to open while the Terms/Privacy gate is visible, then resume only after acceptance.',
    ]
  },
  {
    version: '1.10.8', date: '2026-06-22', title: 'Private PPQ chat with verified end-to-end encryption',
    forceShow: true,
    items: [
      '<b>PPQ Private TEE Mode is now built in.</b> If you use PPQ for AI, you can switch on a private mode that encrypts prompts in your browser and decrypts them only inside a verified Tinfoil secure enclave.',
      '<b>No local proxy or extra setup required.</b> getbased connects directly to PPQ\'s private endpoint from the app, so the normal provider setup, model picker, balance display, and top-up flow stay in one place.',
      '<b>Clearer privacy signals.</b> Private models are labeled separately, chat shows the lock/attestation state when the secure path is active, and web search is disabled in private mode so prompts do not leak into external search tools.',
    ]
  },
  {
    version: '1.10.6', date: '2026-06-21', title: 'Per-file lab import storage',
    forceShow: true,
    items: [
      '<b>Lab imports are now stored per file.</b> Each imported report gets its own saved import record, so you can review, edit, or delete one report without disturbing another report from the same lab date.',
      '<b>Same-day reports are easier to manage.</b> If two PDFs share a date or overlap on a marker, getbased keeps the report history visible in Settings → Data and preserves the latest live values safely.',
      '<b>Upgrade note for existing imports.</b> Reports imported before this release were saved in the older date-based storage. To move an old report into the new per-file storage, import that report again.',
    ]
  },
  {
    version: '1.9.0', date: '2026-06-19', title: 'Biology Scores and Biological Coherence',
    items: [
      '<b>A new lens on your biology.</b> Biology Scores turn your labs into plain-English system patterns across metabolism, thyroid, cardiovascular health, inflammation, methylation, kidney and hydration, liver and bile flow, iron and blood health, hormones, stress resilience, cellular energy, gut-immune terrain, and more.',
      '<b>Biological Coherence shows the whole-body picture.</b> One overview brings the core domains together so you can see what looks strongest, what is most strained, what is missing, and where your biology deserves attention first.',
      '<b>Built around your context.</b> Scores can use labs, genome/SNP context, wearables and body signals, light exposure, sex, age, cycle timing, sample timing, specialty tests, and calculated ratios — so the result is more personal than a simple reference-range check.',
      '<b>Know what to test next.</b> The Coverage Planner turns missing evidence into a clear marker plan, helping you improve score confidence without blindly ordering everything.',
      '<b>Ask why, not just what.</b> Per-score AI explanations can walk through the marker evidence behind a pattern and help translate the score into practical next questions.',
    ]
  },
  {
    version: '1.8.550', date: '2026-06-18', title: 'Better lab import review',
    items: [
      '<b>Review imports before saving.</b> Edit values and units, scan rows more easily, and map unfamiliar lab names through a searchable marker picker.',
      '<b>Smarter unit handling.</b> Known markers use curated units; new markers get flexible unit entry and common shortcuts. Compatible unit changes update values and ranges automatically.',
      '<b>Your review survives refresh.</b> In-progress import reviews are restored after a page refresh, so you do not have to re-import the same file while checking rows.',
      '<b>Bugfixes &amp; improvements.</b> Import review, unit menus, row actions, and import progress fit the app layout better, with tighter conversion behavior and broader test coverage.',
      '<b>Contributor credit.</b> Thanks to <a href="https://github.com/onlikerop">@onlikerop</a> for the original PR.',
    ]
  },
  {
    version: '1.8.540', date: '2026-06-17', title: 'Smarter lab import and a broader hormone panel',
    items: [
      '<b>Edit values and units in the import review.</b> When a parsed value looks off or the model read the wrong unit, you can now correct the value and switch the unit for any row before confirming an import. Each marker offers a curated list of its valid units, with a fallback for anything unrecognized.',
      '<b>More hormones tracked.</b> Added Free Testosterone %, Bioactive Testosterone (and its percentage), hCG, and AFP (tumor marker), each with reference ranges and unit conversions so they display and convert consistently with the rest of the panel.',
      '<b>More reliable non-English lab reports.</b> The importer now translates localized test names and units (especially Cyrillic: Bulgarian, Russian, Ukrainian, and more) to their English equivalents before matching, and recognizes a wider set of secondary clinical units (European mass-concentration, katal enzyme activity, and trace-mineral units).',
    ]
  },
  {
    version: '1.8.455', date: '2026-06-13', title: 'XLSX lab imports and improvements',
    items: [
      '<b>XLSX lab import support.</b> Excel lab reports can now be imported alongside PDFs and CSVs.',
      '<b>Bugfixes and improvements.</b> Improved import reliability and fixed theme CTA hover contrast issues.',
      '<b>Substantial codebase improvements.</b> Expanded browser test coverage and cleaned up shared app behavior.',
    ]
  },
  {
    version: '1.8.358', date: '2026-06-03', title: 'Private profile sharing',
    items: [
      '<b>Password-protected profile links.</b> Share an encrypted profile copy with someone else, then keep the link and password separate.',
      '<b>Link controls and safeguards.</b> Copy or stop links created on this device, with hosted checks to limit weak encryption settings, abuse, and oversized shared files.',
    ]
  },
  {
    version: '1.8.354', date: '2026-06-02', title: 'Practitioner-ready report builder',
    items: [
      '<b>Report feature overhaul.</b> PDF reports now open in a cleaner preview with a readable patient header, compact clinical snapshot, selected lab categories, supplement dosing context, and a structure built for quick practitioner review.',
      '<b>Editable Practitioner Overview.</b> Generate a one-minute overview from the selected report data, edit the text directly in the report builder, then include the final version in the PDF preview/export.',
      '<b>Smoother report workflow.</b> The builder now follows the app\'s newer modal patterns, keeps long category lists usable, and gives the preview its own Print / Save PDF action.',
    ]
  },
  {
    version: '1.8.0', date: '2026-05-18', title: 'Redesigned dashboard, guided onboarding, and tips',
    items: [
      '<b>A new dashboard built around what matters now.</b> The home screen is now a customizable overview instead of a long all-in-one page. Current Focus, Biological Age, Tips to Explore, Current Priority, Quick Markers, Biometrics Overview, Light Today, and Key Trends give you the short version first, with deeper work still one click away.',
      '<b>Clearer navigation across the whole app.</b> getbased is now organized into focused spaces: Dashboard, Labs, Genome, Body, Light, Insight, and Tips, with Compare dates and Correlations kept as analysis tools. Desktop gets the full sidebar; mobile gets bottom tabs and a compact menu.',
      '<b>First visit is guided, not overwhelming.</b> Fresh profiles now start with a short empty-profile tour, then open guided chat. Chat is the main starting point for new users, while demo profiles and direct import stay available when you want to explore or add files yourself.',
      '<b>Two tours for two real situations.</b> New users get a tour designed for an empty app. Once a profile has data, the full app tour explains imports, lenses, dashboard widgets, display tweaks, settings, and AI chat.',
      '<b>Tips have their own home.</b> The Tips page surfaces general-information ideas connected to Labs, Body, Light, Genome, and Insight signals. You can bookmark useful items, hide ones that are not relevant, and keep product links behind the existing disclosure controls.',
      '<b>Better workspaces for every lens.</b> Labs owns biomarker charts and tables. Genome owns DNA, APOE, mtDNA, and SNP context. Body owns wearables, manual metrics, supplements, and cycle tracking. Light owns sun, devices, indoor light, and measurement tools. Insight owns Current Focus, AI insights, profile context, and synthesis.',
      '<b>Mobile and theme polish.</b> The redesigned app is easier to use on smaller screens, and browser chrome now follows the selected theme so Light, Dark, Synth Sunrise, Neuromancer, Glass, and Cypherpunk Terminal feel consistent on mobile.',
      '<b>Your data model stays the same.</b> Existing profiles, imports, notes, wearables, DNA, context cards, sync, backups, and encryption continue to work. The redesign changes how the app is organized and presented, not who owns your data.',
    ]
  },
  {
    version: '1.7.7', date: '2026-05-13', title: 'Oura RHR matches the Oura app + zero-sentinel cleanup',
    items: [
      '<b>RHR now matches what your Oura app shows.</b> Resting Heart Rate on the dashboard used the night-long average from Oura\'s sleep payload, which runs 5–10 bpm higher than the true RHR. The Oura app\'s "Resting Heart Rate" card and trend graph use the lowest 5-min average during sleep (typically hit in deep sleep) — we now source from the same field. Existing rows refresh on the next sync.',
      '<b>Bad-night zeros render as gaps instead of floor dots.</b> Oura emits a literal <code>0</code> for HRV/HR scalars when a sleep session has no usable data (ring not worn, signal lost, sub-threshold session). Those zeros used to flow through to the history chart as a dot at the floor and drag the weekly mean down. Now treated as missing across HR, HRV, weight, body composition, and sleep durations — legitimate zeros (rest-day steps, no high-stress minutes, perfect-sleep awake time, body-temp deviation centered at 0) still display normally.',
      '<b>Oura Rest Mode still gets its dedicated hint.</b> When Rest Mode is on, activity_score is 0 every day by design — the card stays visible and the detail modal shows a short explanation pointing you to the Steps card for raw movement data.',
    ]
  },
  {
    version: '1.7.6', date: '2026-05-13', title: 'MyHeritage Low-pass WGS: strand-aware SNP matching',
    items: [
      '<b>The "Genotype not in lookup" group is gone.</b> MyHeritage\'s 2025 Low-pass WGS export reports every SNP on the build37 forward strand, but our catalog stored a handful of variants keyed on the opposite strand — so calls like <code>AC</code> for <b>PCSK9 R46L</b> or <code>TT</code> for <b>UGT1A1 G71R</b> silently missed the table and ended up labeled "not in lookup" even though they\'re standard, well-characterized genotypes. SNP lookups now try the reverse-complement as a fallback when the direct read misses, so MyHeritage forward-strand calls resolve to the right catalog entry across all eight affected loci (PCSK9, MTR, UGT1A1, MTRR, BHMT, FADS1 coding, LIPC -514, MC1R). Palindromic A/T and C/G SNPs (where strand flipping is ambiguous) keep the strict lookup to avoid false positives.',
      '<b>Mild-effect SNPs now appear in their own group.</b> Two protective heterozygotes — <b>CETP I405V (AG)</b> and <b>CYP1A2 *1F (AC)</b> — were correctly matched against the catalog but bucketed into "not in lookup" because the import preview only recognized three impact tiers. They\'re now rendered as <b>🟠 Mild findings</b>, between Moderate and Normal.',
      '<b>Honest coverage count.</b> Imputation-noise calls (alleles that aren\'t valid for the variant under either strand — e.g. a <code>CG</code> read at a C/T SNP) are now dropped at parse time instead of inflating the "not in lookup" group. The "X of Y health-relevant SNPs found" line reflects actually-curated matches.',
    ]
  },
  {
    version: '1.7.5', date: '2026-05-13', title: 'Accessibility polish across the dark theme',
    items: [
      '<b>Better readability in dark mode.</b> The muted grays used for footers, hints, and reference text were brightened to clear WCAG AA contrast on every background. A handful of small-text labels (footer trademarks, recommendation disclaimers) had a faint extra opacity layer that dragged them below threshold — that\'s gone now.',
      '<b>Form labels and screen reader names.</b> The chat onboarding fields, the Compare Dates picker, and several form selects now properly announce their purpose to screen readers. Marker-group expand/collapse buttons in the sidebar announce their open/closed state correctly as you toggle them.',
      '<b>Visible link cues.</b> The "primary study" / "more studies" links in the supplements card now carry a persistent underline so they\'re distinguishable without color alone.',
      '<b>Sidebar marker-group rows.</b> Mouse click-anywhere-on-row to toggle still works; keyboard navigation now lands on a real button rather than a div pretending to be one. The AI-context toggle stayed where it was, next to the flag count.',
    ]
  },
  {
    version: '1.7.4', date: '2026-05-12', title: 'See your values in both unit systems',
    items: [
      '<b>Alternate Units toggle (Settings → Display).</b> When on, the marker detail modal shows each value in both the active system AND the other one — <i>5.20 mmol/L · ≈ 93.7 mg/dL</i> for glucose, <i>140 mmol/L · ≈ 140 mEq/L</i> for sodium, <i>8.5 mU/L · ≈ 8.5 µIU/mL</i> for insulin. Off by default to keep the modal uncluttered for single-locale users. Reference + optimal ranges also render in both systems so a US user reading a Quest report (in <code>µIU/mL</code>) can match it against the app\'s EU SI numbers (in <code>mU/L</code>) without flipping the global toggle. Per-profile preference, persists across sessions.',
      '<b>Type values in either unit on manual entry.</b> The "+ Add Value Manually" form now offers a small unit picker next to the value field for markers with a known conversion. Default is the current display unit; flip it to type a value straight from a lab report printed in the other system, and the app converts to canonical SI before storage. Round-trip stays exact (5 mmol/L in, 5 mmol/L back out via the alt unit and home). The range sanity-check now uses alt-unit ranges so typing <i>90 mg/dL</i> in EU mode doesn\'t spuriously flag against the SI ref range.',
      '<b>Expanded unit coverage.</b> Added real conversions for <b>eGFR</b> (mL/s → mL/min), <b>GFR Cystatin</b>, <b>Cystatin C</b>, <b>hs-CRP</b>, and <b>CRP</b> (all now gain mg/dL displays alongside SI). Added label-only entries for markers where the number is the same but the printed label differs on US reports: <b>insulin</b> (mU/L = µIU/mL), <b>TSH</b>, <b>LH</b>, <b>FSH</b>, <b>sodium / potassium / chloride</b> (mmol/L = mEq/L), <b>WBC / RBC / platelets / differential absolute counts</b> (×10⁹/L = K/µL, ×10¹²/L = M/µL). Total coverage: 81 of 124 markers (was 66). Truly universal markers like homocysteine and percentages stay no-toggle since the label is the same in both systems.',
      '<b>MyHeritage Low-pass WGS imports work again.</b> MyHeritage\'s 2025 raw-data export prepends a <code>##fileformat=MyHeritage</code> comment block before the column header, which the detector was reading as the first line and failing on. The CSV now imports normally.',
      '<b>Bugfix: stale marker after switching unit systems.</b> If you flipped EU↔US while the manual-entry form was prepared, the form could carry the old display unit forward and convert your input through the wrong factor on save. The form now re-resolves every marker on open and on save, picking up the current display unit each time.',
    ]
  },
  {
    version: '1.7.2', date: '2026-05-12', title: 'Readable changelog links',
    items: [
      '<b>Hyperlinks in the What\'s New modal are now visible.</b> Links rendered as the browser-default blue and disappeared into the dark-theme background. They now use the same accent-blue + underline as chat-message and summary-modal links.',
    ]
  },
  {
    version: '1.7.1', date: '2026-05-12', title: 'Apple Health ZIP fix, encrypted-backup recovery, security hardening',
    // Carries a critical user action (re-export the encrypted backup), so
    // override the patch-skip in maybeShowChangelog and force the modal
    // even for users on the same major.minor (1.7.0 → 1.7.1).
    forceShow: true,
    items: [
      '<b>Apple Health ZIP imports work again.</b> Dropping an <code>export.zip</code> on Settings → Wearables → Apple Health was throwing "JSZip not loaded" — direct <code>.xml</code> drops were unaffected, but the ZIP path is the one most people use. The vendor unzip bundle now lazy-loads on first use. Thanks to <a href="https://github.com/Savi-1">@Savi-1</a> for the patch.',
      '<b>Encrypted backups, fixed — please re-export.</b> If you had encryption-at-rest turned on, every backup since v1.6.x silently exported <code>profiles: []</code> — a ~1 KB file with only your global settings, no profile data. Manual export, auto-backup, and folder-backup were all affected. Backups taken before today on encrypted installs are not recoverable; <b>strongly recommend re-exporting a fresh backup after updating.</b> Going forward, backups round-trip your profile data correctly. Thanks to <a href="https://github.com/Savi-1">@Savi-1</a> for the patch.',
      '<b>Security hardening.</b> Tightened the allowlist for marker keys interpolated into inline click handlers — defense-in-depth against a theoretical XSS via a maliciously-crafted lab PDF. PDF AI extraction was already sanitized at the parse boundary; this adds the same guard at the render boundary so legacy data and sync pulls can\'t slip through either.',
    ]
  },
  {
    version: '1.7.0', date: '2026-05-12', title: 'Medical History, per-value notes, smoother manual entry',
    items: [
      '<b>The Medical Conditions card is now Medical History</b> — same place, broader scope. Beneath your own diagnoses, a new <b>Family history</b> subsection captures first-degree relatives plus grandparents (mother, father, sibling, child, maternal/paternal grandmothers and grandfathers). Each entry takes a condition, optional age of onset, and an optional note. Family history reframes risk interpretation — a father\'s heart attack at 52 makes a borderline LDL more actionable, and the AI sees both your own diagnoses and what runs in the family.',
      '<b>The conditions list nearly tripled.</b> Was 27 entries (mostly metabolic / endocrine / GI). Now ~117, covering neuro (Alzheimer\'s, Parkinson\'s, Epilepsy, MS, migraine), 19 cancer categories (breast, prostate, colorectal, lung, melanoma, pancreatic, ovarian, lymphoma, leukemia, …), skin (Psoriasis, eczema, rosacea), mental health (bipolar, ADHD, autism, PTSD, OCD), additional autoimmune, musculoskeletal, eye, hearing, infectious / chronic, and several genetic / congenital conditions worth surfacing in family history. Autocomplete-clickable conditions with apostrophes (Alzheimer\'s, Hashimoto\'s, Crohn\'s, Graves\', Sjögren\'s, Cushing\'s, Parkinson\'s, Huntington\'s) — previously broken from the dropdown — are clickable again.',
      '<b>Notes on individual lab values.</b> Every reading in the marker detail modal now has a small <b>+ note</b> on hover. Attach context tied to a single date/marker: <i>"fasted 14h"</i>, <i>"retook because cuff felt loose"</i>, <i>"different lab"</i>, <i>"post-workout"</i>. Notes show as an italic line beneath the value; click to edit, × to remove. The AI sees these notes grouped by marker so a single reading\'s context can change how it\'s interpreted.',
      '<b>Manual entry is much faster for paper lab reports.</b> The marker modal\'s "+ Add Value" button moved above the Note section and is renamed <b>+ Add Value Manually</b> for clarity. The form gained: a <b>Save & Add Another</b> button that keeps the date and clears the value (enter a whole report top-to-bottom without re-picking dates), an optional <b>Note</b> field that saves to the per-value notes above, a <b>range sanity check</b> that flags values >10× the upper bound or <1/10 the lower bound (catches decimal/unit slips), a <b>duplicate-date confirm</b> that shows the existing value before overwriting, and a <b>session-remembered last date</b> so the next entry defaults to whatever date you just used. Plus: Enter to save, Esc to cancel, no future dates allowed.',
      '<b>Click any empty cell in Table view to add a value</b> with that column\'s date pre-filled. The view mode (Charts / Table / Heatmap) now sticks across navigation and survives saves.',
      '<b>Blood pressure renders as one card</b> ("120/80 mmHg") instead of two. Storage stays unchanged — sys and dia are still tracked separately under the hood — but the card face and detail view present them paired like every other BP app.',
      '<b>Manual BP entry, fixed.</b> Tapping the diastolic field no longer kicks the cursor back to systolic. The same idempotency fix also stops the form from rebuilding on every click inside it.',
      '<b>Table and Heatmap views hide markers you have no data for.</b> A 50-row category with values in 8 markers no longer scrolls past 42 rows of dashes — only markers with at least one reading render. Categories with no data at all show a one-line "import a PDF or use the sidebar" hint instead of an empty table.',
      '<b>Sticky header in Compare Dates.</b> Scroll long tables and the dates header stays on screen. Single page scrollbar (the old approach gave you two).',
      '<b>Inline value editing</b> now uses a full-width input instead of an 80px cell that clipped multi-digit values, refreshes the underlying table/heatmap on save (was showing stale values), and treats Escape as a real cancel (no longer flips your imported value to "manual" if you press Esc without changing anything).',
      '<b>PDF import accepts extensionless files</b> — magic-byte sniff catches files exported with no extension (common with OCRFeeder on Linux).',
      '<b>Wearable manual entry got chip + note parity.</b> The "+ Add reading" form in the detail modal now offers the same context chips (resting / morning-fasted / post-workout / stress for BP and RHR) and a freeform note field that the dashboard empty-card form has had. Notes show up under the reading in the entries list, and feed the AI alongside the numbers.',
      '<b>Category navigation no longer bounces to Dashboard.</b> Clicking 3M / 6M / 1Y range buttons, deleting a value, or saving a PDF import — anywhere the sidebar rebuilds in response — used to read a stale "active" state and redirect you to Dashboard. Fixed across all 10 places that had the pattern.',
      '<b>Bugfixes & improvements.</b> Family-history relative picker is grouped into Parents / Siblings & Children / Maternal grandparents / Paternal grandparents. Each family-history entry shows a small relative chip with emoji so a long list reads scannably by "who" before "what". The add-entry form stacks cleanly into two rows on mobile. Manual-entry value input width is now responsive (was clipping 6+ digit values like cholesterol or testosterone). Friendlier empty-state hints throughout Table / Heatmap / Family-history sections. Cross-device sync covers the new per-value notes and family history under the same per-row CRDT path everything else uses — no migration needed.',
    ]
  },
  {
    version: '1.6.19', date: '2026-05-11', title: 'Airplane-mode resilience + identity recovery',
    items: [
      '<b>"Push committed but never arrived"</b> — a small fraction of Evolu sync owners hit a state where the relay acked every push but never persisted anything, so a freshly-imported PDF would simply never show up on another device. Diagnose modal now flags this case explicitly (red dot, "your relay storage is empty despite recent pushes") and offers a one-click <b>Rotate identity</b> to recover. Server-side detection landed in the relay too.',
      '<b>Sun & weather data on airplane.</b> CAMS / Open-Meteo fetches now time out cleanly, fall back gracefully, and don\'t freeze the UV strip when you\'re offline. AI streams + requests gained timeouts so a wedged provider can\'t hang the chat panel.',
      '<b>Scroll-anchor stability.</b> Rapid navigation through AI-verdict cards no longer jumps around — the page restores to the element you focused, not a guessed pixel offset.',
      '<b>Measurement retention redesign.</b> Light & Sun room measurements now keep only the latest reading per (room, tool) instead of every historical sample. Walkthrough audits stay full-history.',
      '<b>Sessions list compaction</b> on the Light & Sun page — older sessions collapse so the page stays readable at 100+ sessions.',
    ]
  },
  {
    version: '1.6.2', date: '2026-05-11', title: 'Silent-reject detector foundation',
    items: [
      '<b>Chart-modal cleanup</b> — chart instances are now destroyed when the modal closes (small memory leak fix).',
      '<b>Foundation for the silent-reject detector</b> that landed in v1.6.19.',
    ]
  },
  {
    version: '1.6.1', date: '2026-05-10', title: 'Bugfixes & improvements',
    items: [
      '<b>PDF image import:</b> clicking Cancel on the AI-provider privacy warning aborts cleanly now (was hanging).',
    ]
  },
  {
    version: '1.6.0', date: '2026-05-04', title: '☀ Light & Sun — the lens for everything sunlight does to you',
    items: [
      '<b>☀ Light & Sun lens.</b> Sunlight does a lot more than make vitamin D. Track your exposure across six biological channels — Vitamin D, Body clock, Cardiovascular, Mood & hormones, Cell energy & repair, and Outdoor eye light — and correlate them with your labs and wearable data over time. One-tap session logging: tap when you go outside, tap again when you come back. Plain-English summary on stop with computed vit-D yield and burn-dose status.',
      '<b>Sun-safety guardrails.</b> Live alert at 70% + 100% of your daily burn dose. A photosensitizing-medication checkbox drops your threshold (tetracyclines, isotretinoin, NSAIDs, St John\'s Wort, others). Cumulative carry-over warning when yesterday + today push you over. High-altitude flag for locations above 1500m.',
      '<b>Light therapy devices, first-class.</b> Pick from a preset library (Joovv panels, Mito Red, Sperti UVB, Verilux dawn simulators, full-spectrum bulbs) or add a custom device. Therapy sessions feed the same channels as outdoor sun.',
      '<b>Indoor light + screens.</b> Map the rooms you spend time in and the screens you stare at. Each audit question carries a one-line photobiology explainer below it. Indoor light deficits feed back into your channel mix.',
      '<b>Eight on-device measurement tools.</b> Lux meter, flicker detector, color-temperature meter, light classifier, glass-transmission test, sleep darkness meter, sunrise/sunset logger, eye-level audit walkthrough. Camera frames stay on your device.',
      '<b>AI sees your sun.</b> Every chat now carries your active deficits, device library, week\'s per-channel exposure, and burn-dose state. After ≥4 weeks of overlapping sessions and labs, channel-by-biomarker correlations join the AI context automatically.',
      '<b>Faster, cleaner cross-device sync.</b> Each push ships only what changed (per-row deltas, gzipped) instead of one fat blob. Concurrent edits from phone and desktop merge cleanly. Self-serve relay-storage compaction lives in the Sync diagnose modal — no more "storage full, ping the maintainer."',
      '<b>Five Lenses framing.</b> getbased is now organized around five lenses on your biology — 🩸 <b>Labs</b>, 🧬 <b>Genome</b>, ⌚ <b>Body</b>, ☀ <b>Light</b>, 🧠 <b>Insight</b>. Every lens informs every other; the AI synthesizes across all of them.',
    ]
  },
  {
    version: '1.5.4', date: '2026-05-07', title: 'Bugfixes & improvements',
    items: [
      '<b>Don\'t want wearables?</b> Settings → Wearables → "Wearable integrations" toggles them off. The strip stays for your manual weight, BP, and pulse entries.',
      '<b>Edit a misread import date.</b> Settings → Data → "Edit date" on any imported entry — useful when the AI guessed wrong on an ambiguous numeric date like "12/7/2025".',
      '<b>Region-aware date parsing.</b> Set your country in the client editor and the PDF importer disambiguates DD/MM vs MM/DD correctly for new imports.',
    ]
  },
  {
    version: '1.5.2', date: '2026-05-02', title: 'Bugfixes & improvements',
    items: [
      'Internal hardening pass — small fixes across input sanitization and worker isolation.',
    ]
  },
  {
    version: '1.5.1', date: '2026-04-29', title: 'Bugfixes & improvements',
    items: [
      '<b>Genetics rows in the marker detail modal no longer duplicate.</b> When a SNP carried both a raw finding and an actionable hint pointing at the same marker, the same gene rendered twice with the same study link. Now collapses to a single row.',
      '<b>"Open App" link in the docs site works on every host.</b> Was producing https://app.getbased.health/app (which doesn\'t exist) on the app subdomain. Now host-aware — points to the right place from localhost, getbased.health, app.getbased.health, or anywhere else.',
    ]
  },
  {
    version: '1.5.0', date: '2026-04-29', title: 'Audit, bugfixes & improvements',
    items: [
      '<b>Security hardening.</b> PDF importer bumped to close a known font-handling vulnerability. AI-supplied marker keys are now validated before touching your data. OpenRouter login + every wearable OAuth callback gained CSRF + 10-minute pending-state expiry.',
      '<b>Sync + chat reliability.</b> Profile-swap no longer drops a pending sync push. Wearable data shows up in chat right after you sync (AI context cache now invalidates on summary changes). Streaming AI replies no longer drop the final chunk on missing trailing newline.',
      '<b>Wearable connect</b> handles the "missing user id" failure mode (Polar) cleanly instead of stranding sync in a reauth loop. OAuth callback during a profile swap is caught — the connection lands in the right profile.',
      '<b>PWA offline first-launch is fixed</b> — installing and going offline no longer breaks chat or the Knowledge Base.',
      '<b>Cycle + biological age fixes.</b> Long perimenopause cycles (60–90 days) no longer get truncated to 45. Biological age now requires hs-CRP, not standard CRP — the two assays measure very different ranges.',
      '<b>Corrupt profile recovery.</b> If your profile data ever gets corrupted (browser crash mid-write), the app preserves the original bytes for recovery instead of silently substituting an empty profile.',
      '<b>Accessibility pass.</b> Dashboard cards, trend alerts, heatmap cells, supplement rows — every clickable surface is now keyboard-reachable. Settings tabs and the Charts/Table/Heatmap toggle are proper tablists. The Layers dropdown closes on Escape.',
      '<b>Weight units</b> respect your chosen system everywhere (US users see "lb"). Light-mode mobile address bar picks up your theme on first paint instead of flashing dark.',
    ]
  },
  {
    version: '1.4.0', date: '2026-04-28', title: 'Smarter chat search, easier setup, more flexibility',
    items: [
      '<b>Chat now stays out of your way.</b> When you open chat, the dashboard automatically shifts left to fit alongside the panel — every chart and section stays visible, scroll and clicks work as normal. New <b>⛶ fullscreen toggle</b> in the chat header for when you want an immersive conversation; your preference is remembered between sessions.',
      '<b>The Knowledge Base finds more of your notes.</b> Your AI provider now rephrases each question before searching — a search for "Black Seed Oil" also finds notes titled "Nigella Sativa"; "insulin sensitivity" pulls in "metabolic flexibility". Adds about a second on the first matching question. Toggle off in <b>Knowledge Base → Improve recall with query rewriting</b> if you want pure local search.',
      '<b>Knowledge Base has its own dedicated panel</b> with a one-click entry from the dashboard. Modern laptops now default to a stronger embedding model when creating a new on-device library, for noticeably better recall.',
      '<b>The dashboard nudges you to set up things you might have missed.</b> Three quiet pills appear under the Interpretive Lens row when something is unconfigured: <b>Personalize how AI answers</b> (Lens + Knowledge Base), <b>Protect your data</b> (Encryption + cross-device Sync + auto-backup), and an <b>Add your DNA data</b> CTA in the genetics section. Each pill goes away once everything is set up.',
      '<b>Self-hosters can bring their own OAuth apps</b> for Oura / Withings / Ultrahuman / Polar / WHOOP / Fitbit. Set <code>OURA_CLIENT_ID</code>, <code>WITHINGS_CLIENT_ID</code>, etc. alongside the existing <code>*_CLIENT_SECRET</code> values in <code>.env.local</code> and the app uses your OAuth app instead of the maintainer\'s. Hosted users see no change. See the updated Wearables guide.',
      '<b>Marker Glossary retired</b> — it was redundant with the sidebar (browse + search), each marker\'s detail page (ranges + history), and the AI chat (plain-English explanations).',
      '<b>Accessibility:</b> dashboard rows + clickable cards are now keyboard-activatable (Enter/Space), icon-only buttons gained explicit labels, and modals move focus inside on open + dismiss on backdrop click + Escape.',
    ]
  },
  {
    version: '1.3.20', date: '2026-04-27', title: 'Region-aware product tips + clearer privacy',
    items: [
      '<b>Set your country in the profile editor</b> and product tips now show products and URLs available in your market — Czech users land on Czech storefronts, US users on .com sites, etc. Each tips section\'s footer reads "Showing for {country} · change" so you always know what\'s being filtered.',
      '<b>Privacy is now its own Settings tab.</b> The analytics opt-out is right there, with a cookieless transparency banner on first launch — no health records or chat content, and raw IP is not stored. The PDF/image/chat obfuscation pipeline (now labeled "AI Privacy Protection") is in the same place.',
      '<b>EMF assessment</b> now also surfaces meter and mitigation-product options tied to the issues actually flagged. Toggle Settings → Display → "Tips" off if you don\'t want them. Affiliate disclosure is built in; brands cannot pay for placement.',
    ]
  },
  {
    version: '1.3.9', date: '2026-04-27', title: 'App footer — trademark attribution + Privacy/Terms links',
    items: [
      'New <b>fineprint block</b> below the dashboard footer: trademark attribution for every wearable vendor whose logo we display (nominative fair use), <b>Privacy</b> and <b>Terms</b> links to the public site, and a Linktree anchor for the maintainer.',
    ]
  },
  {
    version: '1.3.8', date: '2026-04-26', title: 'Wearables — connect your devices, share with AI agents',
    items: [
      '<b>Five wearables, one dashboard.</b> Connect Oura, Fitbit, Withings, Polar, or Apple Health (file import). Or log weight / BP / resting HR by hand. HRV, sleep, recovery, body composition, blood pressure, steps — every signal your hardware produces surfaces in a single strip alongside your blood work. Withings users get the full Body Scan / ScanWatch / BPM picture: body fat %, muscle / bone / water mass, vascular age, PWV, SpO₂, body and skin temperature, sleep architecture (deep / light / REM / awake / breathing rate / snoring / apnea-class), nerve health — cards auto-hide when your device doesn\'t measure that signal. (WHOOP and Ultrahuman support is built but private-beta only while we validate partner credentials.)',
      '<b>Tap any card for detail.</b> 90-day chart, baselines, rolling averages, every individual reading, manual-entry CRUD. Multiple devices? Tap the <i>via Oura</i> / <i>via Fitbit</i> source badge to switch which one drives the card. Reorder the strip via the ⇄ button — hold per profile, sync across devices.',
      '<b>Overnight and daytime, separately.</b> HRV and heart rate split into recovery (overnight) and reactivity (daytime) so the AI can reason about both.',
      '<b>AI chat sees a compact summary</b> by default. External agents (Hermes, OpenClaw, Claude Agent, anything MCP) connect via the new Agent Access tab — token, push controls, optional 7 / 30 / 90-day series for time-series reasoning.',
      '<b>Honest "as of {date}" dates.</b> If a metric\'s latest reading is older than its source\'s freshest reading (e.g. HRV from Oura\'s <code>/sleep</code> often lags daily_sleep by hours while the night\'s analysis finishes), the card surfaces the actual date so the value reads honestly. Hover for the explanation.',
      '<b>Privacy.</b> Raw daily samples never leave your device. Sync carries only the compact summary, encrypted end-to-end. OAuth tokens never sync — re-connect each device independently. Wearable storage is wrapped in AES-GCM when encryption-at-rest is enabled.',
      '<b>Settings reorganised.</b> Old Integrations tab split into <b>Wearables</b> (your devices) and <b>Agent Access</b> (read permission for AI). See the <a href="https://docs.getbased.health/guides/wearables">user guide</a> for the full setup walkthrough.',
    ]
  },
];

/** Extract major.minor from a semver string (e.g. '1.0.1' → '1.0') */
function getMajorMinor(ver) {
  const parts = String(ver).split('.');
  return parts.slice(0, 2).join('.');
}

function getSeenVersion() {
  return localStorage.getItem('labcharts-changelog-seen') || '';
}

function markChangelogSeen() {
  localStorage.setItem('labcharts-changelog-seen', getAppVersionRuntime());
}

// Changelog items are authored in source code (CHANGELOG above) — trusted.
// We escape everything by default and then re-allow a small whitelist of
// inline emphasis tags + safe-href anchors. Anything else (script, img,
// arbitrary attributes, javascript: URLs, etc.) stays escaped — defense-
// in-depth in case an entry ever incorporates user content.
function renderChangelogItem(item) {
  let out = escapeHTML(item);
  // Inline emphasis: <b>/<i>/<em>/<strong>/<code> render as styling.
  out = out.replace(/&lt;(\/?)(b|i|em|strong|code)&gt;/g, '<$1$2>');
  // Anchors: <a href="…">text</a>. Validate the protocol — only http,
  // https, and mailto pass; anything else (javascript:, data:, etc.)
  // strips back to plain text. External links open in a new tab with
  // noopener/noreferrer so the opener can't be navigated.
  out = out.replace(
    /&lt;a href=&quot;(.+?)&quot;&gt;(.+?)&lt;\/a&gt;/g,
    (_match, escapedUrl, inner) => {
      // The captured URL is HTML-escaped (& → &amp; etc.). Decode for the
      // protocol check, but emit the escaped form back into the href so
      // ampersand-bearing URLs (?foo=1&bar=2) round-trip correctly.
      const decoded = escapedUrl.replace(/&amp;/g, '&');
      if (!/^(https?:|mailto:)/i.test(decoded)) return inner; // unsafe → drop the wrapper, keep text
      const isExternal = /^https?:/i.test(decoded);
      const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escapedUrl}"${attrs}>${inner}</a>`;
    }
  );
  return out;
}

export function openChangelog(showAll) {
  const overlay = document.getElementById('changelog-modal-overlay');
  const modal = document.getElementById('changelog-modal');
  if (!overlay || !modal) return;

  const entries = showAll ? CHANGELOG : CHANGELOG.slice(0, 3);

  modal.className = 'modal changelog-modal gb-history-modal';
  let html = `<div class="gb-modal-head">
    <div>
      <div class="gb-modal-title">What's New</div>
    </div>
    <button type="button" class="modal-close" aria-label="Close" ${CHANGELOG_ACTION_ATTR}="close">&times;</button>
  </div>
  <div class="gb-form-body">`;

  for (const entry of entries) {
    html += `<div class="changelog-entry">`;
    html += `<div class="changelog-header"><span class="changelog-version">v${escapeHTML(entry.version)} — ${escapeHTML(entry.title)}</span><span class="changelog-date">${escapeHTML(entry.date)}</span></div>`;
    html += '<ul class="changelog-items">';
    for (const item of entry.items) {
      html += `<li class="changelog-item">${renderChangelogItem(item)}</li>`;
    }
    html += '</ul></div>';
  }

  html += `</div>`;
  modal.innerHTML = html;
  installChangelogDelegates(modal);
  openModalOverlay(overlay);
}

function handleChangelogActionClick(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  const actionEl = target.closest(`[${CHANGELOG_ACTION_ATTR}]`);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  if (actionEl.getAttribute(CHANGELOG_ACTION_ATTR) === 'close') {
    event.preventDefault();
    event.stopPropagation();
    closeChangelog();
  }
}

function installChangelogDelegates(root) {
  if (!root || changelogDelegateRoots.has(root)) return;
  changelogDelegateRoots.add(root);
  root.addEventListener('click', handleChangelogActionClick);
}

export function closeChangelog() {
  closeModalOverlay('changelog-modal-overlay');
  markChangelogSeen();
}

// Compare two semver strings — returns true when `a` is strictly newer
// than `b`. Tolerant of missing parts (treats "1.7" as "1.7.0").
function _semverGt(a, b) {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const ai = pa[i] || 0, bi = pb[i] || 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return false;
}

export function maybeShowChangelog() {
  if (document.getElementById('legal-consent-overlay')) return;
  const seen = getSeenVersion();
  const appVersion = getAppVersionRuntime();
  // First visit — no changelog, just mark as seen
  if (!seen) { markChangelogSeen(); return; }
  // Only show What's New on minor/major bumps, not patch
  if (appVersion && getMajorMinor(seen) !== getMajorMinor(appVersion)) {
    openChangelog(false);
    return;
  }
  // Patch-level bumps normally don't auto-show, but a maintainer can flag
  // an entry as forceShow when it carries a critical user-action notice
  // (e.g. "re-export your encrypted backup" in v1.7.1). Scan all entries
  // newer than the user's seen version — a later non-forceShow patch must
  // not shadow an earlier critical entry. Idempotent because closeChangelog
  // advances seen to the current APP_VERSION.
  const hasForceShowAheadOfSeen = CHANGELOG.some(
    e => e && e.forceShow && _semverGt(e.version, seen)
  );
  if (hasForceShowAheadOfSeen) openChangelog(false);
}
