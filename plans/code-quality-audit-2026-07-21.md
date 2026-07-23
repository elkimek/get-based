# Code quality audit snapshot — 2026-07-21

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
Light/Sun analysis hooks, and Settings/Tweaks reduced that reference to 450
requests, 1,915,305 compressed bytes, and 5,918,162 decoded bytes. Route and
feature lazy loading remains active, with the ceilings ratcheting downward
after each reproducible slice.

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

Vendored dependencies are integrity checked, but most are outside Dependabot
and CodeQL coverage. The audit could not independently query the current npm
advisory database because external registry access was not approved, so the
current dependency-vulnerability state was not verified.

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
6. Add automated SBOM/CVE monitoring for vendored libraries.
