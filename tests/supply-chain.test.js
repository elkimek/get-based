import { describe, expect, it } from 'vitest';

import {
  createDependencySnapshot,
  loadInventory,
  mergeVendorComponents,
  validateInventory,
} from '../scripts/supply-chain.mjs';

describe('supply-chain inventory', () => {
  it('covers every vendored file exactly once', () => {
    const inventory = loadInventory();
    const validation = validateInventory(inventory);

    expect(validation.vendorFiles).toContain('vendor/components.json');
    expect(validation.monitoredComponents.map(component => component.name)).toEqual([
      'chart.js',
      'pdfjs-dist',
      'mammoth',
      'jszip',
      '@cashu/cashu-ts',
      'qrcode-generator',
      '@phala/dcap-qvl',
      'tinfoil',
      'ehbp',
      '@evolu/common',
      '@evolu/common v8 candidate',
      '@evolu/web v8 candidate',
      '@evolu/sqlite-wasm v8 candidate',
    ]);
  });

  it('adds vendored components and file hashes to the npm CycloneDX document', () => {
    const inventory = loadInventory();
    const validation = validateInventory(inventory);
    const base = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      serialNumber: 'urn:uuid:non-deterministic',
      metadata: {
        timestamp: '2026-01-01T00:00:00.000Z',
        component: {
          'bom-ref': 'getbased@1.0.0',
          type: 'application',
          name: 'getbased',
          version: '1.0.0',
        },
      },
      components: [{
        'bom-ref': 'tinfoil@1.2.1',
        type: 'library',
        name: 'tinfoil',
        version: '1.2.1',
        purl: 'pkg:npm/tinfoil@1.2.1',
      }],
      dependencies: [{
        ref: 'getbased@1.0.0',
        dependsOn: ['tinfoil@1.2.1'],
      }],
    };

    const merged = mergeVendorComponents(base, inventory, validation);
    const chart = merged.components.find(component => component.name === 'chart.js');
    const tinfoil = merged.components.find(component => component.name === 'tinfoil');

    expect(merged.serialNumber).toBeUndefined();
    expect(merged.metadata.timestamp).toBeUndefined();
    expect(chart.purl).toBe('pkg:npm/chart.js@4.4.7');
    expect(chart.properties).toEqual(expect.arrayContaining([
      { name: 'getbased:vendor:file', value: 'vendor/chart.min.js' },
      {
        name: 'getbased:vendor:file-sha256',
        value: expect.stringMatching(/^vendor\/chart\.min\.js:[a-f0-9]{64}$/),
      },
    ]));
    expect(merged.components.filter(component => component.name === 'tinfoil')).toHaveLength(1);
    expect(tinfoil.properties).toContainEqual({
      name: 'getbased:vendor:monitoring',
      value: 'github-advisory',
    });
  });

  it('creates a GitHub snapshot containing only advisory-supported npm components', () => {
    const snapshot = createDependencySnapshot(loadInventory(), {
      sha: 'abc123',
      ref: 'refs/heads/main',
      jobId: '42.1',
      repositoryUrl: 'https://github.com/elkimek/get-based',
      scanned: '2026-07-26T00:00:00.000Z',
    });
    const resolved = snapshot.manifests['vendor/components.json'].resolved;

    expect(Object.keys(resolved)).toHaveLength(13);
    expect(resolved['@phala/dcap-qvl']).toEqual({
      package_url: 'pkg:npm/%40phala/dcap-qvl@0.6.1',
      relationship: 'direct',
      scope: 'runtime',
    });
    expect(resolved['qrcode-generator']).toEqual({
      package_url: 'pkg:npm/qrcode-generator@1.4.4',
      relationship: 'direct',
      scope: 'runtime',
    });
    expect(resolved['@evolu/common v8 candidate']?.package_url)
      .toBe('pkg:npm/%40evolu/common@8.7.0');
    expect(resolved['@evolu/web v8 candidate']?.package_url)
      .toBe('pkg:npm/%40evolu/web@3.1.0');
    expect(resolved['@evolu/sqlite-wasm v8 candidate']?.package_url)
      .toBe('pkg:npm/%40evolu/sqlite-wasm@2.2.4');
    expect(resolved.SQLite).toBeUndefined();
    expect(resolved.Inter).toBeUndefined();
  });

  it('rejects a vendor file assigned to more than one component', () => {
    const inventory = structuredClone(loadInventory());
    inventory.components[1].files.push('vendor/chart.min.js');

    expect(() => validateInventory(inventory)).toThrow(/multiple owners: vendor\/chart\.min\.js/);
  });
});
