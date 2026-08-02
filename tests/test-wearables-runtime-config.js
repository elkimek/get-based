#!/usr/bin/env node
// test-wearables-runtime-config.js — Self-host OAuth client_id override (issue #145)
//
// Covers the helper layer that lets self-hosters override the maintainer's
// hardcoded OAuth client_id via *_CLIENT_ID env vars surfaced through
// /api/proxy `wearable_runtime_config`. End-to-end behavior (the actual
// fetch round-trip) is exercised by the live dev-server + Vercel proxy.
//
// Run: node tests/test-wearables-runtime-config.js  (or via npm test)

import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Wearable runtime-config tests ===\n');

const reg = await import('../js/wearable-adapters.js');

  // Snapshot hardcoded client_ids before any override touches them.
  const baseline = {};
  for (const a of reg.ADAPTERS) if (a?.oauth?.clientId) baseline[a.id] = a.oauth.clientId;

  // 1. Pre-override: getOAuthClientId returns the hardcoded value.
  reg._resetOAuthOverrides();
  assert('getOAuthClientId(oura) returns hardcoded baseline pre-override',
    reg.getOAuthClientId('oura') === baseline.oura);
  assert('getOAuthClientId(withings) returns hardcoded baseline pre-override',
    reg.getOAuthClientId('withings') === baseline.withings);
  assert('getOAuthClientId by adapter object equals by id',
    reg.getOAuthClientId(reg.adapterById('oura')) === reg.getOAuthClientId('oura'));
  assert('Google Health is disabled without deployment capability',
    reg.isOAuthAdapterConfigured('google_health') === false);
  assert('Ultrahuman is disabled without deployment capability',
    reg.isOAuthAdapterConfigured('ultrahuman') === false);
  assert('WHOOP is disabled without deployment capability',
    reg.isOAuthAdapterConfigured('whoop') === false);

  // 2. applyOAuthOverrides — single override, single adapter affected.
  reg.applyOAuthOverrides({ oura: 'self-host-oura-id-123' });
  assert('Override wins for the targeted adapter',
    reg.getOAuthClientId('oura') === 'self-host-oura-id-123');
  assert('Override does not leak to other adapters',
    reg.getOAuthClientId('withings') === baseline.withings);

  // 3. applyOAuthOverrides — empty/whitespace strings are ignored, not
  //    treated as a deliberate "blank out". Otherwise an empty env var
  //    would silently clobber the maintainer fallback.
  reg.applyOAuthOverrides({ withings: '   ', polar: '' });
  assert('Empty string override is ignored',
    reg.getOAuthClientId('withings') === baseline.withings);
  assert('Whitespace-only override is ignored',
    reg.getOAuthClientId('polar') === baseline.polar);

  // 4. applyOAuthOverrides — leading/trailing whitespace on a real value
  //    is trimmed (env vars in .env files often pick up stray spaces).
  reg.applyOAuthOverrides({ polar: '  polar-self-id-xyz  ' });
  assert('Override values are trimmed before application',
    reg.getOAuthClientId('polar') === 'polar-self-id-xyz');

  // 5. Non-string / non-object inputs are no-ops, not crashes.
  reg.applyOAuthOverrides(null);
  reg.applyOAuthOverrides(undefined);
  reg.applyOAuthOverrides('not-an-object');
  reg.applyOAuthOverrides({ oura: 42, fitbit: { nested: 'bad' } });
  assert('null override is a safe no-op',
    reg.getOAuthClientId('oura') === 'self-host-oura-id-123');
  assert('Non-string override value is ignored',
    reg.getOAuthClientId('fitbit') === baseline.fitbit);

  // 6. _resetOAuthOverrides restores baseline (used by tests; not by app).
  reg._resetOAuthOverrides();
  assert('_resetOAuthOverrides clears all overrides',
    reg.getOAuthClientId('oura') === baseline.oura);
  assert('_resetOAuthOverrides leaves other adapters at baseline',
    reg.getOAuthClientId('polar') === baseline.polar);

  // 7. Unknown adapter id returns null (not undefined, not a throw).
  assert('Unknown adapter id returns null',
    reg.getOAuthClientId('not-a-real-vendor') === null);

  // 8. A public client ID alone must not enable a confidential, self-hosted
  //    provider. The server capability proves the explicit flag and secret.
  const whoopBaseline = reg.adapterById('whoop')?.oauth?.clientId || '';
  assert('WHOOP baseline is REPLACE_WITH_ (preserved gate behavior)',
    whoopBaseline.startsWith('REPLACE_WITH_'));
  reg.applyOAuthOverrides({ whoop: 'real-whoop-self-id' });
  const effectiveWhoop = reg.getOAuthClientId('whoop') || '';
  assert('Self-host override replaces the placeholder client ID',
    !effectiveWhoop.startsWith('REPLACE_WITH_') && effectiveWhoop === 'real-whoop-self-id');
  assert('WHOOP client ID alone does not enable Connect',
    reg.isOAuthAdapterConfigured('whoop') === false);
  reg.applyOAuthConfigured({ whoop: true });
  assert('WHOOP capability plus client ID enables Connect',
    reg.isOAuthAdapterConfigured('whoop') === true);

  // 9. Google Health requires both a public client ID override and the
  //    server-computed capability proving its matching secret is present.
  reg.applyOAuthOverrides({ google_health: 'self-host-google-id' });
  assert('Google Health client ID alone does not enable Connect',
    reg.isOAuthAdapterConfigured('google_health') === false);
  reg.applyOAuthConfigured({ google_health: true });
  assert('Google Health capability plus client ID enables Connect',
    reg.isOAuthAdapterConfigured('google_health') === true);
  reg.applyOAuthConfigured({ google_health: false });
  assert('Google Health false capability disables Connect again',
    reg.isOAuthAdapterConfigured('google_health') === false);
  reg.applyOAuthConfigured(null);
  reg.applyOAuthConfigured({ google_health: 'yes' });
  assert('Invalid capability values are ignored',
    reg.isOAuthAdapterConfigured('google_health') === false);

  reg.applyOAuthOverrides({ ultrahuman: 'self-host-ultrahuman-id' });
  reg.applyOAuthConfigured({ ultrahuman: true });
  assert('Ultrahuman capability plus client ID enables Connect',
    reg.isOAuthAdapterConfigured('ultrahuman') === true);

  const hostedLocation = { hostname: 'app.getbased.health' };
  const localLocation = { hostname: 'localhost' };
  assert('developer-host helper recognizes localhost and loopback',
    reg.isWearableDeveloperHost(localLocation)
      && reg.isWearableDeveloperHost({ hostname: '127.0.0.1' })
      && !reg.isWearableDeveloperHost(hostedLocation));
  reg.applyOAuthConfigured({ whoop: false, ultrahuman: false });
  assert('unconfigured experimental providers are hidden on hosted deployments',
    !reg.visibleAdapters([], hostedLocation).some(adapter => adapter.id === 'whoop')
      && !reg.visibleAdapters([], hostedLocation).some(adapter => adapter.id === 'ultrahuman'));
  assert('localhost exposes experimental provider setup rows',
    reg.visibleAdapters([], localLocation).some(adapter => adapter.id === 'whoop')
      && reg.visibleAdapters([], localLocation).some(adapter => adapter.id === 'ultrahuman'));
  reg.applyOAuthConfigured({ whoop: true });
  assert('configured experimental providers are visible on a self-hosted domain',
    reg.visibleAdapters([], hostedLocation).some(adapter => adapter.id === 'whoop'));

  reg._resetOAuthOverrides();
  assert('Runtime reset clears Google Health capability and overrides',
    reg.isOAuthAdapterConfigured('google_health') === false
      && reg.getOAuthClientId('google_health') === baseline.google_health);

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
