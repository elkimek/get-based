// @vitest-environment node
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {expect, it} from 'vitest';
import {startKitServer} from './pwa/kit-release-server.js';
it('serves two valid build identities and retains the exact legacy-client transition seam', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'getbased-release-fixture-'));
  await writeFile(path.join(directory, 'service-worker.js'), "const BUILD_ID = '';\nconst APP_SHELL = [];\n");
  await writeFile(path.join(directory, 'version.js'), "self.APP_BUILD_ID = '';\n");
  const server = await startKitServer(directory);
  try {
    expect(server.state.buildId).toBe('a'.repeat(64));
    const first = await fetch(server.origin + '/service-worker.js');
    expect(first.headers.get('Content-Security-Policy')).toContain('script-src');
    expect(await first.text()).toBe("const BUILD_ID = '" + 'a'.repeat(64) + "';\nconst APP_SHELL = [\n  '/js/bundle-legacy-probe-AAA.js',];\n");
    expect(await fetch(server.origin + '/js/bundle-legacy-probe-AAA.js').then(response => response.text())).toBe('export const legacyProbe = "old-tab-code";');
    server.state.buildId = 'b'.repeat(64);
    expect(await fetch(server.origin + '/service-worker.js').then(response => response.text())).toBe("const BUILD_ID = '" + 'b'.repeat(64) + "';\nconst APP_SHELL = [];\n");
    expect(await fetch(server.origin + '/version.js').then(response => response.text())).toBe("self.APP_BUILD_ID = '" + 'b'.repeat(64) + "';\n");
    expect(await fetch(server.origin + '/api/commit').then(response => response.json())).toEqual({cacheKey: 'b'.repeat(64)});
    expect(await fetch(server.origin + '/js/bundle-legacy-probe-AAA.js').then(response => response.status)).toBe(404);
    server.state.buildId = 'invalid';
    expect(await fetch(server.origin + '/service-worker.js').then(response => response.status)).toBe(404);
  } finally {await server.close(); await rm(directory, {recursive: true, force: true});}
});
