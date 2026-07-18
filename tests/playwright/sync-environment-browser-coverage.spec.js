import { expect, test } from './coverage-fixture.js';
import fs from 'fs';

const moduleUrl = path => `${path}?syncEnvironmentCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
const syncEnvironmentSource = fs.readFileSync(new URL('../../js/sync-environment.js', import.meta.url), 'utf8');
const utilsRuntimeSource = fs.readFileSync(new URL('../../js/utils-runtime.js', import.meta.url), 'utf8');

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

async function openOnionPage(page) {
  await page.route('**/sync-environment-onion-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.route('**/js/sync-environment.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: syncEnvironmentSource,
  }));
  await page.route('**/js/utils-runtime.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: utilsRuntimeSource,
  }));
  await page.goto('http://relay-check.onion/sync-environment-onion-coverage', { waitUntil: 'load' });
}

test('sync environment browser coverage handles relay storage probes and capability blockers', async ({ page }) => {
  await openBlankPage(page, '/sync-environment-coverage');

  const outcomes = await page.evaluate(async ({ environmentUrl }) => {
    const env = await import(environmentUrl);
    const relayKey = 'labcharts-sync-relay';
    const originalRelay = localStorage.getItem(relayKey);
    const OriginalWebSocket = window.WebSocket;
    const originalNavigatorDescriptors = {
      locks: Object.getOwnPropertyDescriptor(navigator, 'locks'),
      storage: Object.getOwnPropertyDescriptor(navigator, 'storage'),
    };
    const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const websocketEvents = [];
    const outcomes = {};

    const setNavigatorValue = (key, value) => {
      Object.defineProperty(navigator, key, {
        configurable: true,
        value,
      });
    };
    const restoreNavigatorValue = key => {
      const descriptor = originalNavigatorDescriptors[key];
      if (descriptor) Object.defineProperty(navigator, key, descriptor);
      else delete navigator[key];
    };
    const setCryptoValue = value => {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value,
      });
    };
    const restoreCryptoValue = () => {
      if (originalCryptoDescriptor) Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
      else delete globalThis.crypto;
    };

    try {
      localStorage.removeItem(relayKey);
      const defaultRelay = env.getSyncRelay();
      env.setSyncRelay('wss://relay.example.test');
      outcomes.defaultRelayUsesProductionEndpoint = defaultRelay === 'wss://sync.getbased.health';
      outcomes.setSyncRelayPersistsCustomValue = localStorage.getItem(relayKey) === 'wss://relay.example.test';
      outcomes.customRelayOverridesDefaultRelay = env.getSyncRelay() === 'wss://relay.example.test';

      window.WebSocket = class {
        constructor(url) {
          websocketEvents.push(['open-url', url]);
          setTimeout(() => this.onopen?.({ type: 'open' }), 0);
        }
        close() {
          websocketEvents.push(['open-close']);
        }
      };
      const openResult = await env.checkRelayConnection(50);

      window.WebSocket = class {
        constructor(url) {
          websocketEvents.push(['error-url', url]);
          setTimeout(() => this.onerror?.({ type: 'error' }), 0);
        }
        close() {
          websocketEvents.push(['error-close']);
        }
      };
      const errorResult = await env.checkRelayConnection(50);

      window.WebSocket = class {
        constructor(url) {
          websocketEvents.push(['timeout-url', url]);
        }
        close() {
          websocketEvents.push(['timeout-close']);
        }
      };
      const timeoutResult = await env.checkRelayConnection(5);

      window.WebSocket = class {
        constructor() {
          throw new Error('socket constructor failed');
        }
      };
      const throwResult = await env.checkRelayConnection(50);

      outcomes.openProbeUsesRelayPingUrl = websocketEvents
        .some(event => event[0] === 'open-url' && event[1] === 'wss://relay.example.test/ping');
      outcomes.openProbeResolvesTrueAndClosesSocket =
        openResult === true
        && websocketEvents.some(event => event[0] === 'open-close');
      outcomes.errorProbeResolvesFalseAndClosesSocket =
        errorResult === false
        && websocketEvents.some(event => event[0] === 'error-close');
      outcomes.timeoutProbeResolvesFalseAndClosesSocket =
        timeoutResult === false
        && websocketEvents.some(event => event[0] === 'timeout-close');
      outcomes.constructorFailureProbeResolvesFalse = throwResult === false;

      setNavigatorValue('locks', { request() {} });
      setNavigatorValue('storage', { getDirectory() {} });
      setCryptoValue({ subtle: {} });
      const supported = env.getSyncBlocker();

      setNavigatorValue('locks', undefined);
      const missingLocks = env.getSyncBlocker();

      setNavigatorValue('locks', { request() {} });
      setNavigatorValue('storage', undefined);
      const missingStorage = env.getSyncBlocker();

      setNavigatorValue('storage', {});
      const missingOpfs = env.getSyncBlocker();

      setNavigatorValue('storage', { getDirectory() {} });
      setCryptoValue({});
      const missingCrypto = env.getSyncBlocker();

      outcomes.syncBlockerReturnsNullWhenCapabilitiesExist = supported === null;
      outcomes.syncBlockerReportsMissingWebLocks = missingLocks.startsWith('navigator.locks not available');
      outcomes.syncBlockerReportsMissingStorageManager = missingStorage.startsWith('navigator.storage not available');
      outcomes.syncBlockerReportsMissingOpfs = missingOpfs.startsWith('OPFS');
      outcomes.syncBlockerReportsMissingWebCrypto = missingCrypto.startsWith('crypto.subtle');

      return outcomes;
    } finally {
      window.WebSocket = OriginalWebSocket;
      restoreNavigatorValue('locks');
      restoreNavigatorValue('storage');
      restoreCryptoValue();
      if (originalRelay == null) localStorage.removeItem(relayKey);
      else localStorage.setItem(relayKey, originalRelay);
    }
  }, {
    environmentUrl: moduleUrl('/js/sync-environment.js'),
  });

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});

test('sync environment browser coverage prefers onion relay on onion origins', async ({ page }) => {
  await openOnionPage(page);

  const outcomes = await page.evaluate(async ({ environmentUrl }) => {
    const env = await import(environmentUrl);
    localStorage.setItem('labcharts-sync-relay', 'wss://relay.example.test');
    return {
      testPageUsesOnionHostname: window.location.hostname === 'relay-check.onion',
      onionRelayIgnoresStoredClearnetRelay:
        env.getSyncRelay() === 'ws://udou6gehyfpfccdjpibmuttaoauawmh5cgzszffnskbvczppvr2sfjad.onion',
    };
  }, {
    environmentUrl: moduleUrl('/js/sync-environment.js'),
  });

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});
