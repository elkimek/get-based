# PWA verification — 2026-09-11

## Fixes prepared for 1.19.2

- Escape closes the PDF unit picker before its parent review, keeps the pending import, and restores focus. A second Escape closes the review normally.
- The installation cache includes AI-provider, CLI-agent, and wearable artwork. The Fitbit registry uses the existing neutral fallback instead of four missing PNG files.
- The new release version causes an atomic service-worker cache update.

## Repeatable verification

Run `npm run test:pwa` after installing Chromium, Firefox, and WebKit. It runs two scenarios on each of four profiles: Chromium desktop, Firefox desktop, WebKit desktop, and WebKit with iPhone emulation.

1. Install the app, validate the manifest and icons, disconnect its isolated local server, open previously unused Settings/Wearables/Light features, and reload.
2. Save a synthetic glucose result, open another tab, fail a required file during update installation, verify the old app remains active, restore the file, defer and then apply the update, reload the secondary tab, and verify the saved result and cache cleanup.

All eight lifecycle checks passed locally. Ten related import, modal, and wearable browser checks also passed. Service-worker/import unit tests and change-scoped static/build gates passed. The production app-shell budget remains unchanged.

The lifecycle harness runs the source application with production cache routing and synthetic release numbers on isolated origins. A separate local smoke test of the generated production bundles passed offline Settings/Wearables and reload in Chromium, desktop WebKit, and mobile WebKit, with version 1.19.2 and no page errors. This does not replace a physical home-screen installation. The preceding live production smoke verified the existing main release, not these unmerged changes.

## WebKit offline emulation diagnostic

The initial WebKit failure occurs with Playwright `context.setOffline(true)`: previously cached dynamic modules fail with `WebKit encountered an internal error`. It also reproduces in a minimal page with no GetBased code, a service worker that precaches one JavaScript module, and a cache-first fetch handler. Chromium returns the module's value; WebKit rejects its import.

With the origin disconnected at the HTTP server instead, both production and development cache strategies pass in WebKit. The automated suite therefore destroys origin connections and verifies an uncached API request actually fails before exercising cached features. It does not disable the network globally or establish behavior in an actual iOS airplane-mode session.

## Remaining release acceptance

- Install to the home screen on physical iOS and Android; force-close, relaunch in airplane mode, then update while retaining existing local data.
- Verify real linked wearable accounts and AI-provider requests using authorized test accounts/data. Fixture-based OAuth and UI tests do not establish those external services' current behavior.
- Review full CI and the deployment preview before promoting this branch to production.

No claim of universal or 100% correctness is made by these checks.

## Publication status

The user authorized publication after local verification. The branch is published for review in [PR #1623](https://github.com/elkimek/get-based/pull/1623); use its checks and deployment links for current remote CI and preview status. Production promotion and physical-device acceptance remain separate steps.
