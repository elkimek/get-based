# Comprehensive code quality audit — 2026-07-29

This is the repository-wide reassessment of getbased after the July audit and
the subsequent remediation program. The audited production state is commit
`47108990` on `main` (`Skip optional analytics while the PWA is offline`,
PR #1493).

The assessment covers first-party browser, service-worker, server, and API
code; module boundaries; persistence and deletion paths; security and privacy
controls; vendored and npm dependencies; CI workflows; production and PWA
builds; test coverage; accessibility guardrails; and a live online/offline
production smoke test. It does not independently validate every medical or
scientific interpretation, penetrate-test every external provider, or audit
the implementation of third-party dependencies.

## Overall result

**9/10.** The repository has moved from a well-tested but structurally and
operationally risky 7/10 to a strong, production-disciplined codebase. No open
critical, high, or medium engineering finding remains from this audit. The
remaining deductions are for material but bounded performance footprint,
defence-in-depth limitations in the browser security policy, browser-suite
asymmetry, and concentrated ownership.

| Area | Score | Current assessment |
| --- | ---: | --- |
| Correctness and reliability | 9.4/10 | Destructive, persistence, import, offline, and proxy paths have explicit behavioral coverage and failure contracts |
| Testing and CI | 9.5/10 | Broad unit/browser coverage, enforced coverage ratchet, non-skipping accessibility checks, Firefox smoke, and immutable CI actions |
| Security and privacy | 9.0/10 | Stored-XSS, proxy, PII diagnostics, dependency, and deployment controls are strong; CSP still carries documented product-driven allowances |
| Architecture | 9.2/10 | Zero import cycles, explicit runtime boundaries, generated dependency map, and decomposed server/service-worker owners |
| Maintainability | 8.8/10 | No production JavaScript file reaches 800 lines; checkJs, strict-null, parse, and debt gates prevent regression |
| Performance and PWA | 8.4/10 | Cold load was cut substantially and both online and precache budgets are enforced; the complete offline shell remains sizeable |
| UX and accessibility | 9.0/10 | Responsive/theme matrix, local axe, semantic guardrails, and offline relaunch are covered |
| Documentation and tooling | 9.3/10 | Architecture, supply-chain, quality, coverage, build, and performance policies are executable and documented |

## Material change since the 2026-07-21 baseline

| Indicator | 2026-07-21 audit | 2026-07-29 audit |
| --- | ---: | ---: |
| Modules in dependency cycles | 206 | 0 |
| Largest cyclic component | 204 | 0 |
| Production JavaScript files at least 800 lines | 23 | 0 |
| Largest production JavaScript file | 1,168 lines | 799 lines |
| Cold-load requests | 470 | 276 |
| Cold-load transferred bytes | about 2.0 MB | 1,015,691 bytes |
| Cold-load decoded bytes | 6.22 MB | 2,734,242 bytes |
| Combined function coverage | 67.07% | 81.10% |
| Vitest tests | 437 | 642 |
| Chromium Playwright tests | 376 | 496 |
| Responsive/theme assertions | 472 | 520 |
| Focused Firefox tests | none | 3 |

The higher module count is primarily the intentional decomposition that
removed large files and cycles. The request count still fell by 41% because
feature code and presentation were moved behind real first-use boundaries.

## Repository and architecture evidence

- 1,249 tracked files.
- 527 browser JavaScript files under `js/`.
- 541 runtime modules in the generated architecture map.
- About 131,289 lines of first-party production JavaScript across `js/`,
  `api/`, `lib/`, and the root server/service-worker runtime files.
- 462 JavaScript/MJS test files with about 142,478 lines.
- 39 CSS files with 22,445 lines.
- The architecture check reports 541 modules, zero cyclic modules, and a
  largest cycle of zero.
- All first-party production JavaScript remains below 800 lines. The current
  maximum is 799 lines in `js/context-card-lifestyle-editors-impl.js`.
- Type checking passes for the browser app, server, and service worker.
  Strict-null diagnostics and their committed debt baseline are both zero.
- All 565 JavaScript/MJS files parse successfully.
- The quality suite passes all 16 guardrails, including zero production global
  coupling, privacy-safe diagnostics, the hard file-size cap, and immutable
  third-party Actions references.

## Verification evidence

The final exhaustive GitHub Actions run for PR #1493 passed in 9m02s:

- 159/159 pre-test verification checks.
- 80/80 Vitest files and 642/642 tests.
- 496/496 Chromium Playwright tests.
- 520/520 responsive/theme assertions across six themes and desktop, mobile,
  and compact-mobile layouts.
- 3/3 focused Firefox critical-flow tests, including offline installation.
- CodeQL JavaScript/TypeScript analysis.
- Combined coverage of 10,085/12,435 functions (81.10%) and
  4,921,044/5,845,275 bytes (84.19%).
- The committed 79.50% function-coverage floor passed with 1.60 percentage
  points of headroom.

Change-scoped local verification for the final runtime slice also passed:

- 14 focused analytics and distributed-rate-limit unit tests.
- 367/367 audit assertions.
- The installed-PWA cache-only offline relaunch.
- 5/5 cold-load and first-interaction performance tests.
- Production build, PWA budget, and all 16 quality checks.

Greptile's exact-head review initially found that an offline launch would skip
analytics for the entire same-document session after reconnect. PR #1493
added a one-shot reconnect path and a transition test, replied to the finding,
and was re-reviewed at 5/5 with the thread resolved before merge.

## Production, performance, and offline evidence

- The production build starts with two JavaScript files and 1,000.8 KiB
  decoded, with 129 lazy JavaScript outputs totaling 3,871.8 KiB.
- A fresh source-mode mobile load uses 276 same-origin requests,
  1,015,691 transferred bytes, and 2,734,242 decoded bytes. Enforced ceilings
  are 290 requests, 1,193,220 transferred bytes, and 2,875,000 decoded bytes.
- The PWA app shell contains 270 resources and 13,246.7 KiB decoded. Enforced
  ceilings are 300 resources and 15,000,000 decoded bytes.
- Production `/api/commit` returned exact audited commit `47108990`.
- Live production served CSP, HSTS (`max-age=63072000`), `nosniff`, frame
  denial, same-origin opener isolation, credentialless embedder isolation, and
  a strict-origin referrer policy.
- A clean live Chromium session produced no console errors or failed requests.
  The installed service worker controlled the page and the welcome surface was
  visible.
- A cache-only offline relaunch remained controlled and readable, produced no
  console errors or failed requests, and made no analytics request.
- Returning online in the same document injected exactly one Umami script and
  completed without a failed request or console error.

## Security and supply-chain evidence

- Production proxy redirects are followed manually and every hop is
  revalidated. DNS results are checked for private targets and the approved
  address is pinned at connection time. Redirects, headers, response size, and
  duration are bounded.
- Hosted proxy throttling uses distributed atomic slots and fails closed when
  its shared limiter is unavailable. Local fallback is bounded and explicit.
- Imported chat fields are normalized before storage and escaped before
  rendering, closing the stored-XSS path.
- Profile deletion covers every profile-owned store and global clear covers
  all application storage. Corrupt IndexedDB state is recoverable.
- Persistence APIs expose durable success/failure outcomes, callers respect
  them, and generated IDs use collision-resistant entropy.
- Privacy-sensitive error reporting is redacted and bounded; recovery-phrase
  fragments and raw sync failures are guarded from support diagnostics.
- `npm audit` reported zero moderate-or-higher vulnerabilities for production
  and for the complete dependency tree.
- Vendor integrity checks reproduce the committed hashes for Cashu, Tinfoil,
  and EHBP browser bundles.
- The supply-chain inventory covers 15 components and 78 vendor files, with
  nine versioned npm components submitted for advisory monitoring.
- All 12 workflow action references are pinned to full immutable commit SHAs.

## Finding reconciliation

| Finding | Resolution | Closing change |
| --- | --- | --- |
| Imported-chat stored XSS | Normalize imported records and escape every render path; add persistence/render regression coverage | PR #1484 |
| Incomplete profile deletion, global clear, and corrupt-state recovery | Centralize owned-store cleanup, cover all global stores, and make broken IndexedDB recoverable | PR #1485 |
| Ambiguous persistence success and collision-prone IDs | Return durable outcomes, handle failures at callers, and use collision-resistant IDs | PR #1486 |
| Proxy abuse, distributed throttling, and upstream resource limits | Add fail-closed distributed limiting plus redirect, DNS, connection, timeout, header, and size guardrails | PR #1487 |
| Oversized and weakly checked development server | Split responsibilities and enforce server checkJs | PR #1488 |
| Oversized and weakly checked service worker | Split runtime logic and enforce service-worker checkJs | PR #1489 |
| PII-bearing or unbounded support diagnostics | Redact privacy-sensitive failures and add guardrails | PR #1490 |
| Mutable GitHub Actions tags | Pin every third-party action and recursively guard `.github/` | PR #1491 |
| No explicit complete-PWA-shell budget and an exhausted cold-load ceiling | Add strict generated-shell parsing, resource/byte budgets, missing-asset rejection, and evidence-based cold-load headroom | PR #1492 |
| Optional analytics request failed during offline relaunch | Skip while offline, inject once on reconnect, and test the transition; also stabilize the limiter test exposed by exhaustive CI | PR #1493 |

The earlier July findings are also closed: proxy redirect/SSRF controls are in
place, the 204-module cycle is gone, cold-load budgets ratchet, axe cannot
silently skip, destructive wipe paths are covered, Firefox smoke runs in CI,
coverage has an enforced positive floor, and vendored dependencies have SBOM
and advisory visibility.

## Residual risks and next ratchets

These are not open release-blocking defects, but they explain the remaining
one-point deduction:

1. The complete offline shell is still 270 resources and roughly 13.6 MB
   decoded. The new hard budget prevents silent growth; future work should
   lower it without weakening offline completeness.
2. Source-mode cold startup still uses 276 requests and about 2.73 MB decoded.
   The production bundle is much smaller, but further first-use boundaries can
   ratchet these ceilings down.
3. The CSP retains `'unsafe-inline'` for the existing inline bootstrap/styles
   and broad `https:`/`wss:` connectivity for user-selected providers and
   decentralized nodes. Hashes/nonces or Trusted Types would add defence in
   depth if the delivery architecture is changed.
4. Exhaustive browser coverage is Chromium-centric. Firefox covers critical
   flows, but a broader cross-browser matrix would further reduce engine risk.
5. Runtime boundaries and zero cycles are enforced, while finer-grained
   feature dependency direction still relies partly on documented ownership
   conventions.
6. Recent authorship remains concentrated: 491 of 497 commits in the preceding
   30 days used the two names associated with the primary maintainer. This is a
   bus-factor and review-independence risk, not a code defect.
7. Medical/scientific claims and arbitrary external provider behavior require
   continuing domain review and integration monitoring outside this code audit.

## Verdict

The remediation program is complete for the findings in scope. The codebase is
fit for continued production development with strong automated regression
protection. The next quality gains should come from lowering the existing
performance/PWA ceilings, expanding independent and cross-browser review, and
incrementally hardening the browser policy—not from another broad structural
rewrite.
