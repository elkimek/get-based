# Code quality audit snapshot — 2026-07-21

> Superseded for the current repository state by the
> [2026-07-29 comprehensive audit](code-quality-audit-2026-07-29.md).
> This document remains as the historical 7/10 baseline.

This document records the end-to-end audit of commit `2b2db033` (`Clarify
marker card units`) on `main`. It is a point-in-time engineering assessment,
not a claim that every scientific recommendation or external dependency was
independently validated.

## Overall result

**7/10.** getbased is mature, functional, privacy-conscious, and unusually
well tested. Its regression discipline is stronger than its current module
architecture. The main constraints on a higher score were a production proxy
security gap, a heavily cyclic import graph, and a costly cold-load footprint.

| Area | Score | Summary |
| --- | ---: | --- |
| Correctness and reliability | 9/10 | Broad functionality, excellent regression coverage, clean runtime |
| Testing and CI | 8.5/10 | Comprehensive, but coverage enforcement and browser diversity are weak |
| Security and privacy | 6/10 | Strong encryption/XSS defenses; production proxy required hardening |
| Architecture | 5.5/10 | Good feature split, but severe import coupling |
| Maintainability | 6.5/10 | Typed and documented, with large-file and static-style debt |
| Performance | 4.5/10 | Excessive modules, requests, CSS, and service-worker precaching |
| UX and accessibility | 8/10 | Polished and responsive; accessibility test can silently skip |
| Documentation and tooling | 8.5/10 | Clear guidance, CI, security documentation, and integrity checks |

## Evidence collected

- Inventory: 1,066 tracked files, 455 browser JavaScript modules, about 122,090
  production JavaScript lines and 127,161 test JavaScript lines.
- Standard and coverage test runs:
  - 437/437 Vitest tests passed.
  - 376/376 Playwright tests passed.
  - 472/472 responsive-theme assertions passed.
  - Type checking, `checkJs`, vendor integrity, module verification, the local
    origin guard, and all 11 quality guardrails passed.
- Combined coverage: 67.07% of functions and 85.83% of source bytes. Browser
  coverage was 91.09% of functions and 76.43% of bytes.
- Clean desktop and 390x844 mobile sessions had no console errors, warnings, or
  failed requests. Local load completed in roughly one second.
- Cold mobile load: 470 resources, including 421 JavaScript modules and 39
  stylesheets; about 2.0 MB transferred and 6.22 MB decoded.
- The installed PWA passed a cache-only cold offline relaunch.
- Import graph: about 2,050 local edges; 206 modules participated in cycles,
  including one strongly connected component of 204 modules.
- Maintainability indicators: 23 JavaScript files at least 800 lines long,
  largest file 1,168 lines, about 1,150 inline styles, and about 269 empty
  catches. TypeScript strict mode was disabled.
- Recent ownership was highly concentrated: 352 of 364 commits in the prior 30
  days came from one contributor.

Cold-load remediation status: subsequent focused slices moved Import, Settings,
Client List, marker-detail, EMF, Genome, category/compare/correlation, Light &
Sun, Wearables, and conditionally relevant Cycle presentation styles behind
their first visual entry points. Optional-theme presentation is now conditional
too: dark/light startup stays cold, while saved or newly selected visual themes
load at the original final cascade position. Cross-theme shell and Sunset Mode
rules remain eager after that anchor. Chat personality, messages, composer,
onboarding, responsive, actions, and mobile presentation now wait for the first
Chat open while its persistent launcher, closed panel shell, and redesign
overrides remain eager. Data-protection presentation now joins the first Import,
Settings, privacy-review, encryption, or backup surface that needs it; ordinary
startup remains cold. Context-card editor and tips-modal presentation now waits
for the first corresponding action, while shared card, button, tag, tooltip, and
notes rules remain eager. Each boundary keeps offline assets precached, preserves
cascade order, and retains shared rules in eager bundles or the HTML shell.

## Findings

### 1. Production proxy boundary — high priority

At the audited commit, `api/proxy.js` validated only the initial generic proxy
URL and then used redirect-following `fetch`. A public URL could therefore
redirect toward a destination that the URL policy would have rejected. The
route also treated browser CORS as the effective caller restriction, which did
not reject non-browser requests, and it lacked a bounded upstream timeout and
abuse throttling.

Remediation status: **addressed immediately after this audit**. The follow-up
change requires an allowed or same-site caller origin, handles redirects
manually, validates each hop, strips credentials from safe cross-origin GET
redirects, refuses cross-origin redirects that retain request bodies, bounds
redirect count and header wait time, resolves every upstream hostname, rejects
any DNS answer set containing a private address, pins the validated addresses
at the socket connection boundary, and adds per-client throttling plus runtime
regression tests. The proxy uses Vercel's Node.js runtime because the Edge
runtime does not expose the DNS and connection controls required for safe
pinning. Because a
static browser app cannot authenticate arbitrary custom-provider calls with a
server-held secret, deployment-level distributed rate limiting remains useful
defence in depth.

### 2. Architecture and dependency direction

The feature-oriented file split is useful, but most of the application is in a
single cyclic dependency region. Shared hubs such as state, data, profile,
crypto, and utilities have high fan-in, while shell assembly has high fan-out.
Several dynamic imports do not create code-splitting boundaries because the
same modules are imported statically elsewhere.

Foundation status: **architecture mapping and non-regression guardrails added
after the proxy remediation**. `ARCHITECTURE.md` now defines module ownership
and target dependency direction, while generated `MODULE_MAP.md` records the
file-level import graph. CI rejects stale maps, cross-runtime boundary
violations, new computed dynamic imports, new modules entering dependency
cycles, and increases to the cyclic-module or largest-component budgets. The
initial cycle was then removed in behavior-preserving dependency-inversion
slices. Remediation status: **completed on 2026-07-23**. The current graph has
zero cyclic modules and both cycle ceilings are fixed at zero.

### 3. Cold-load performance

The browser requests nearly the entire application as native modules, and the
service worker precaches essentially all of them. Local performance is fine,
but the request and decoded-byte totals are expensive on constrained mobile
networks. There is no CI request-count or transfer-size budget.

Remediation status: **in progress**. CI now measures a fresh mobile
returning-user load with cache and service workers disabled and enforces
ceilings for same-origin application requests, compressed transfer bytes, and
decoded bytes. The initial reference was 474 requests, 2,017,210 compressed
bytes, and 6,252,286 decoded bytes. Lazy-loading the PDF import review,
Light/Sun analysis hooks, Settings/Tweaks, Profile Sharing, and the Settings,
Light/Sun, Client List, Import review, Marker Detail, EMF, Genetics, and
Category/Compare, Wearables, Cycle, optional-theme, Chat, data-protection, and
context-editor stylesheets reduced that reference to 424 requests, 1,807,746
compressed bytes, and 5,411,168 decoded bytes. The context-editor stylesheet
slice saved 1,616 compressed bytes and 11,309 decoded bytes net of its loader.
Deferring the Chat panel's open-state and interior presentation then saved
another 3,299 compressed bytes and 17,624 decoded bytes, bringing the reference
to 424 requests, 1,804,447 compressed bytes, and 5,393,544 decoded bytes.
Splitting the remaining Chat redesign overrides into an eager shell and an
open-only bundle saved a further 1,869 compressed bytes and 10,578 decoded
bytes, bringing the reference to 424 requests, 1,802,578 compressed bytes, and
5,382,966 decoded bytes. Loading the marker-detail JavaScript implementation
only on its first action then saved one request, 20,334 compressed bytes, and
81,571 decoded bytes, bringing the reference to 423 requests, 1,782,244
compressed bytes, and 5,301,395 decoded bytes. Each result was reproduced in
identical before/after runs on the same machine. The Client List implementation
then moved behind its first-open boundary. The pre-change reference reproduced
as 423 requests, 1,782,242 compressed bytes, and 5,301,412 decoded bytes; the
new reference reproduced as 423 requests, 1,771,493 compressed bytes, and
5,254,832 decoded bytes, saving 10,749 compressed bytes and 46,580 decoded
bytes. Deferring the Wearables implementation, detail modal, chart, settings,
and manual-form helpers behind the first Wearables action then reduced the
reference from that same 423-request baseline to 416 requests, 1,731,010
compressed bytes, and 5,117,921 decoded bytes. The result reproduced exactly,
saving seven requests, 40,483 compressed bytes, and 136,911 decoded bytes.
Loading the six camera-backed Light tool modals only after a user opens one of
them then reduced the reference to 415 requests, 1,716,755 compressed bytes,
and 5,059,297 decoded bytes. The result again reproduced exactly, saving one
request, 14,255 compressed bytes, and 58,624 decoded bytes while preserving
the synchronous close behavior once the implementation is resident.
Deferring the JSON import implementation until a file is actually imported
then reduced the reference to 414 requests, 1,708,324 compressed bytes, and
5,023,634 decoded bytes. Two identical runs confirmed savings of one request,
8,431 compressed bytes, and 35,663 decoded bytes, with the facade retaining an
awaitable API and a fixed retry URL for failed module fetches.
Loading the Reports modal builder only when the user opens it then reduced the
reference to 413 requests, 1,704,671 compressed bytes, and 5,009,775 decoded
bytes. The result reproduced exactly, saving one request, 3,653 compressed
bytes, and 13,859 decoded bytes without moving the synchronous report renderer
or preview-window path behind an asynchronous boundary.
Route and feature lazy loading remains active, with the ceilings ratcheting
downward after each reproducible slice.

### 4. Guardrails and test gaps

The existing quality checks stop regression but preserve a sizeable debt
baseline. CI has no positive coverage threshold, Playwright runs only Chromium,
and the axe test can skip when its CDN download fails. `js/data-wipe.js`, a
high-consequence path, measured 0% function coverage.

Remediation status: **addressed after the audit**. The destructive data-wipe
path now has focused behavioral coverage, axe is installed locally and cannot
silently skip, a Firefox critical-flow smoke suite runs in CI, and the full
Vitest/Playwright coverage run now enforces a committed 67.0% combined function
coverage floor. The fresh reference measurement is 67.23%; the floor is a
ratchet to raise as meaningful coverage is added.

### 5. Supply-chain visibility

Vendored dependencies are integrity checked and now have a complete
machine-readable ownership inventory. A dedicated workflow generates a
combined CycloneDX SBOM and submits versioned npm vendor components to GitHub's
dependency graph for Dependabot advisory monitoring. Generic and unversioned
assets remain explicitly identified as SBOM-only or asset-only.

## Recommended sequence

1. Harden the production proxy boundary. **Completed in the immediate follow-up.**
2. Break the large dependency cycle around state, crypto, profiles, storage,
   and feature UI; enforce import boundaries. **Completed.**
3. Add route/feature lazy loading and CI budgets for request count, transferred
   bytes, and decoded bytes. **In progress: CI budgets added; lazy loading
   remains.**
4. Vendor axe locally, fail when it cannot run, add a Firefox smoke suite, and
   ratchet function coverage upward. **Completed in follow-up changes.**
5. Add linting and stricter type checking incrementally; lower large-file
   baselines rather than preserving them.
6. Add automated SBOM/CVE monitoring for vendored libraries. **Completed.**
