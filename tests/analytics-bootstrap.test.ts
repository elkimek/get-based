import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const analyticsBootstrap = fs.readFileSync(
  new URL('../js/analytics-bootstrap.js', import.meta.url),
  'utf8',
);

interface AnalyticsScript extends Record<string, unknown> { dataset: Record<string, unknown> }
interface AnalyticsBootstrapOptions { hostname?: string; protocol?: string; online?: boolean; disabled?: boolean }

function runBootstrap({
  hostname = 'app.getbased.health',
  protocol = 'https:',
  online = true,
  disabled = false,
}: AnalyticsBootstrapOptions = {}) {
  const appended: AnalyticsScript[] = [];
  let onlineListener: (() => void) | null = null;
  let onlineListenerOptions: { once?: unknown } | null = null;
  const storage = new Map<string, string>(
    disabled ? [['labcharts-analytics-disabled', 'true']] : [],
  );
  const context = {
    document: {
      createElement: (): AnalyticsScript => ({ dataset: {} }),
      head: {
        appendChild: (element: AnalyticsScript) => appended.push(element),
      },
    },
    localStorage: {
      getItem: (key: string) => storage.get(key) || null,
    },
    location: { hostname, protocol },
    navigator: { onLine: online },
    addEventListener: (type: string, listener: () => void, options: { once?: unknown }) => {
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
      integrity: 'sha384-6PHtXKae10+dZuA/fcmjkSTDco+NPBE5fZ4eS/Em2lVIsS6FdDZIgs06MBJLEcSW',
      crossOrigin: 'anonymous',
      dataset: {
        websiteId: '6272072c-97a9-47b0-99e7-c52e7a4ca481',
        excludeSearch: 'true',
        excludeHash: 'true',
      },
    });
  });

  it('pins the executable analytics response so an upstream change fails closed', () => {
    const { appended: [script] } = runBootstrap();

    expect(script!.integrity).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
    expect(script!.crossOrigin).toBe('anonymous');
  });

  it.each([
    ['offline', { online: false }],
    ['file export', { protocol: 'file:' }],
    ['Tor', { hostname: 'example.onion' }],
    ['local development', { hostname: 'localhost' }],
    ['explicit opt-out', { disabled: true }],
  ] as const)('skips analytics for %s', (_label, options) => {
    expect(runBootstrap(options).appended).toEqual([]);
  });

  it('loads analytics once when an offline PWA reconnects', () => {
    const bootstrap = runBootstrap({ online: false });

    expect(bootstrap.appended).toEqual([]);
    bootstrap.reconnect();
    bootstrap.reconnect();

    expect(bootstrap.appended).toHaveLength(1);
    expect(bootstrap.appended[0]!.src)
      .toBe('https://umami-iota-olive.vercel.app/script.js');
  });
});
