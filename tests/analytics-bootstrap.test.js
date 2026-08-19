import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const analyticsBootstrap = fs.readFileSync(
  new URL('../js/analytics-bootstrap.js', import.meta.url),
  'utf8',
);

function runBootstrap({
  hostname = 'app.getbased.health',
  protocol = 'https:',
  online = true,
  disabled = false,
} = {}) {
  const appended = [];
  let onlineListener = null;
  let onlineListenerOptions = null;
  const storage = new Map(
    disabled ? [['labcharts-analytics-disabled', 'true']] : [],
  );
  const context = {
    document: {
      createElement: () => ({ dataset: {} }),
      head: {
        appendChild: element => appended.push(element),
      },
    },
    localStorage: {
      getItem: key => storage.get(key) || null,
    },
    location: { hostname, protocol },
    navigator: { onLine: online },
    addEventListener: (type, listener, options) => {
      if (type === 'online') {
        onlineListener = listener;
        onlineListenerOptions = options;
      }
    },
  };
  vm.runInNewContext(analyticsBootstrap, context);
  return {
    appended,
    reconnect() {
      context.navigator.onLine = true;
      const listener = onlineListener;
      if (onlineListenerOptions?.once) onlineListener = null;
      listener?.();
    },
  };
}

describe('analytics bootstrap', () => {
  it('loads the self-hosted script on an online production page by default', () => {
    const { appended: [script] } = runBootstrap();

    expect(script).toMatchObject({
      defer: true,
      src: 'https://umami-iota-olive.vercel.app/script.js',
      dataset: {
        websiteId: '6272072c-97a9-47b0-99e7-c52e7a4ca481',
        excludeSearch: 'true',
        excludeHash: 'true',
      },
    });
  });

  it.each([
    ['offline', { online: false }],
    ['file export', { protocol: 'file:' }],
    ['Tor', { hostname: 'example.onion' }],
    ['local development', { hostname: 'localhost' }],
    ['explicit opt-out', { disabled: true }],
  ])('skips analytics for %s', (_label, options) => {
    expect(runBootstrap(options).appended).toEqual([]);
  });

  it('loads analytics once when an offline PWA reconnects', () => {
    const bootstrap = runBootstrap({ online: false });

    expect(bootstrap.appended).toEqual([]);
    bootstrap.reconnect();
    bootstrap.reconnect();

    expect(bootstrap.appended).toHaveLength(1);
    expect(bootstrap.appended[0].src)
      .toBe('https://umami-iota-olive.vercel.app/script.js');
  });
});
