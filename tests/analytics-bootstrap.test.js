import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const analyticsBootstrap = indexSource.match(
  /<script>\s*(\/\/ Cookieless Umami analytics[\s\S]*?)<\/script>/,
)?.[1];

function runBootstrap({
  hostname = 'app.getbased.health',
  protocol = 'https:',
  online = true,
  disabled = false,
} = {}) {
  const appended = [];
  const storage = new Map(
    disabled ? [['labcharts-analytics-disabled', 'true']] : [],
  );
  vm.runInNewContext(analyticsBootstrap, {
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
  });
  return appended;
}

describe('analytics bootstrap', () => {
  it('loads the self-hosted script on an online production page', () => {
    const [script] = runBootstrap();

    expect(script).toMatchObject({
      defer: true,
      src: 'https://umami-iota-olive.vercel.app/script.js',
      dataset: {
        websiteId: '6272072c-97a9-47b0-99e7-c52e7a4ca481',
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
    expect(runBootstrap(options)).toEqual([]);
  });
});
