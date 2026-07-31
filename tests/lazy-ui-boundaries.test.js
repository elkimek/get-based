import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseModuleSpecifiers } from '../scripts/architecture-map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_ROOT = path.join(ROOT, 'js');

const DEFERRED_UI_BOUNDARIES = [
  ['js/wearables.js', 'js/app-shell-hooks.js', 'eager-action', 'tests/playwright/wearables-stylesheet-browser-coverage.spec.js'],
  ['js/changelog-impl.js', 'js/changelog.js', 'eager-action', 'tests/playwright/changelog-loader-browser-coverage.spec.js'],
  ['js/app-ai-interaction-modules.js', 'js/chat-loader.js', 'eager-action', 'tests/playwright/chat-loader-browser-coverage.spec.js'],
  ['js/client-list-impl.js', 'js/client-list.js', 'eager-action', 'tests/playwright/client-list-stylesheet-browser-coverage.spec.js'],
  ['js/context-card-dashboard-ai-impl.js', 'js/context-card-dashboard-ai.js', 'eager-delegate', 'tests/playwright/context-card-dashboard-ai-loader-browser-coverage.spec.js'],
  ['js/context-card-lifestyle-editors-impl.js', 'js/context-card-lifestyle-editors.js', 'eager-delegate', 'tests/playwright/context-card-lifestyle-editors-loader-browser-coverage.spec.js'],
  ['js/context-card-medical-history-editor-impl.js', 'js/context-card-medical-history-editor.js', 'eager-delegate', 'tests/playwright/context-card-medical-history-editor-loader-browser-coverage.spec.js'],
  ['js/cycle-import.js', 'js/cycle-import-loader.js', 'eager-delegate', 'tests/playwright/cycle-import-loader-browser-coverage.spec.js'],
  ['js/export.js', 'js/export-loader.js', 'eager-action', 'tests/playwright/export-facade-loader-browser-coverage.spec.js'],
  ['js/cashu-wallet.js', 'js/export-runtime.js', 'eager-action', 'tests/playwright/cashu-wallet-loader-browser-coverage.spec.js'],
  ['js/export-import.js', 'js/export.js', 'eager-action', 'tests/playwright/export-import-loader-browser-coverage.spec.js'],
  ['js/export-report-builder.js', 'js/export.js', 'eager-action', 'tests/playwright/report-builder-loader-browser-coverage.spec.js'],
  ['js/charts.js', 'js/health-data-loader.js', 'route-gated-render', 'tests/playwright/health-data-loader-browser-coverage.spec.js'],
  ['js/notes.js', 'js/health-data-loader.js', 'route-gated-render', 'tests/playwright/health-data-loader-browser-coverage.spec.js'],
  ['js/supplements.js', 'js/health-data-loader.js', 'route-gated-render', 'tests/playwright/health-data-loader-browser-coverage.spec.js'],
  ['js/recommendations.js', 'js/health-data-loader.js', 'route-gated-render', 'tests/playwright/health-data-loader-browser-coverage.spec.js'],
  ['js/cycle.js', 'js/health-data-loader.js', 'route-gated-render', 'tests/playwright/health-data-loader-browser-coverage.spec.js'],
  ['js/context-cards.js', 'js/health-data-loader.js', 'route-gated-render', 'tests/playwright/health-data-loader-browser-coverage.spec.js'],
  ['js/dna.js', 'js/health-data-loader.js', 'route-gated-render', 'tests/playwright/health-data-loader-browser-coverage.spec.js'],
  ['js/lens-knowledge-base-ui.js', 'js/lens.js', 'load-gated-render', 'tests/playwright/lens-ui-loader-browser-coverage.spec.js'],
  ['js/light-device-setup-modal.js', 'js/light-device-modal-loader.js', 'eager-action', 'tests/playwright/light-device-modal-loader-browser-coverage.spec.js'],
  ['js/light-device-session-modal.js', 'js/light-device-modal-loader.js', 'eager-action', 'tests/playwright/light-device-modal-loader-browser-coverage.spec.js'],
  ['js/light-tool-camera-modals.js', 'js/light-tools.js', 'eager-action', 'tests/playwright/light-tool-camera-loader-browser-coverage.spec.js'],
  ['js/marker-detail-modal-impl.js', 'js/marker-detail-modal.js', 'eager-delegate', 'tests/playwright/marker-detail-browser-coverage.spec.js'],
  ['js/profile-share.js', 'js/profile-share-loader.js', 'eager-action', 'tests/playwright/profile-share-loader-browser-coverage.spec.js'],
  ['js/settings.js', 'js/settings-loader.js', 'eager-action', 'tests/playwright/settings-loader-browser-coverage.spec.js'],
  ['js/settings-sync-panel-impl.js', 'js/settings-sync-panel.js', 'load-gated-render', 'tests/playwright/settings-sync-panel-loader-browser-coverage.spec.js'],
  ['js/voice-controller.js', 'js/voice-loader.js', 'eager-action', 'tests/playwright/voice-browser.spec.js'],
  ['js/wearables-connect.js', 'js/wearables-connect-loader.js', 'eager-action', 'tests/playwright/wearables-connect-loader-browser-coverage.spec.js'],
].map(([implementation, loader, ownership, coverage]) => ({
  implementation,
  loader,
  ownership,
  coverage,
}));

const COLD_DELEGATE_CONTRACTS = [
  {
    name: 'marker detail cards',
    facade: 'js/marker-detail-modal.js',
    evidence: [
      "from './marker-detail-actions.js'",
      'installMarkerDetailActionDelegates({ showDetailModal });',
    ],
    coverage: 'tests/playwright/marker-detail-browser-coverage.spec.js',
    coverageTitle: 'hard-refreshed category view opens a marker card before any Dashboard marker click',
  },
  {
    name: 'dashboard AI CTAs',
    facade: 'js/context-card-dashboard-ai.js',
    evidence: [
      'configureDashboardAIActionDelegates({',
      'installDashboardAIActionDelegates();',
    ],
    coverage: 'tests/playwright/context-card-dashboard-ai-loader-browser-coverage.spec.js',
    coverageTitle: 'first cold dashboard CTA click loads and runs its delegated action',
  },
  {
    name: 'lifestyle contaminant badge',
    facade: 'js/context-card-lifestyle-editors.js',
    evidence: [
      "document.addEventListener('click', handleColdDietContaminantsClick, true);",
      "runLifestyleContextEditorAction('showDietContaminantsModal', [])",
    ],
    coverage: 'tests/playwright/context-card-lifestyle-editors-loader-browser-coverage.spec.js',
    coverageTitle: 'first cold contaminant badge click bypasses its parent and opens through the loader',
  },
  {
    name: 'medical-history controls',
    facade: 'js/context-card-medical-history-editor.js',
    evidence: [
      "document.addEventListener('click', handleMedicalHistoryClick);",
      "runMedicalHistoryEditorAction('addCondition', args)",
    ],
    coverage: 'tests/playwright/context-card-medical-history-editor-loader-browser-coverage.spec.js',
    coverageTitle: 'first cold medical-history control click loads and runs its delegated action',
  },
  {
    name: 'Cycle import controls',
    facade: 'js/cycle-import-loader.js',
    evidence: [
      "document.addEventListener('click', handleDeferredCycleImportAction);",
      "document.addEventListener('change', handleDeferredCycleImportAction);",
    ],
    coverage: 'tests/playwright/cycle-import-loader-browser-coverage.spec.js',
    coverageTitle: 'first delegated click and change are replayed after the implementation loads',
  },
];

const IMPLEMENTATION_OWNED_ACTION_FAMILIES = [
  {
    token: 'data-wearable-action',
    allowedFiles: [
      'js/dashboard-widget-controls.js',
      'js/wearables-detail-modal.js',
      'js/wearables-manual-detail.js',
      'js/wearables-strip-actions.js',
      'js/wearables.js',
    ],
  },
  {
    token: 'data-cl-',
    allowedFiles: [
      'js/client-list-form.js',
      'js/client-list-impl.js',
    ],
  },
  {
    token: 'data-changelog-action',
    allowedFiles: ['js/changelog-impl.js'],
  },
  {
    token: 'data-report-action',
    allowedFiles: ['js/export-report-builder.js'],
  },
  {
    token: 'data-profile-share-',
    allowedFiles: ['js/profile-share.js'],
  },
];

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function walkJavaScript(directory = JS_ROOT) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkJavaScript(absolutePath);
    return entry.isFile() && entry.name.endsWith('.js') ? [absolutePath] : [];
  });
}

function repoRelative(absolutePath) {
  return path.relative(ROOT, absolutePath).replaceAll(path.sep, '/');
}

function resolveDynamicTarget(fromFile, specifier) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  return repoRelative(path.resolve(path.dirname(fromFile), cleanSpecifier));
}

function retryHardenedDeferredBrowserModules() {
  const targets = new Set();
  for (const absolutePath of walkJavaScript()) {
    const file = repoRelative(absolutePath);
    const fileSource = source(file);
    if (!fileSource.includes('lazy-retry=1')) continue;
    const parsed = parseModuleSpecifiers(fileSource, file);
    for (const dependency of parsed.dependencies) {
      if (
        dependency.kind === 'dynamic'
        && dependency.specifier.includes('lazy-retry=1')
        && file !== 'js/api.js'
      ) {
        targets.add(resolveDynamicTarget(absolutePath, dependency.specifier));
      }
    }
  }
  return [...targets].sort();
}

describe('lazy UI first-interaction ownership', () => {
  it('inventories every retry-hardened deferred browser module', () => {
    const implementations = DEFERRED_UI_BOUNDARIES
      .map(boundary => boundary.implementation)
      .sort();
    expect(implementations).toEqual(retryHardenedDeferredBrowserModules());
    expect(new Set(implementations).size).toBe(implementations.length);
  });

  it.each(DEFERRED_UI_BOUNDARIES)(
    '$implementation declares its loader, ownership strategy, and browser coverage',
    boundary => {
      expect(['eager-action', 'eager-delegate', 'load-gated-render', 'route-gated-render'])
        .toContain(boundary.ownership);

      const parsed = parseModuleSpecifiers(source(boundary.loader), boundary.loader);
      const matchingImports = parsed.dependencies
        .filter(dependency => dependency.kind === 'dynamic')
        .filter(dependency => resolveDynamicTarget(
          path.join(ROOT, boundary.loader),
          dependency.specifier,
        ) === boundary.implementation)
        .map(dependency => dependency.specifier);

      expect(matchingImports.some(specifier => specifier.includes('lazy-retry=1'))).toBe(true);
      expect(matchingImports.some(specifier => !specifier.includes('lazy-retry=1'))).toBe(true);
      expect(source(boundary.coverage)).toContain('test(');
    },
  );

  it.each(COLD_DELEGATE_CONTRACTS)(
    '$name keeps its first cold interaction in the eager facade',
    contract => {
      const facadeSource = source(contract.facade);
      for (const evidence of contract.evidence) expect(facadeSource).toContain(evidence);
      expect(source(contract.coverage)).toContain(contract.coverageTitle);
    },
  );

  it.each(IMPLEMENTATION_OWNED_ACTION_FAMILIES)(
    '$token is not emitted from an unreviewed cold module',
    ({ token, allowedFiles }) => {
      const actualFiles = walkJavaScript()
        .filter(absolutePath => fs.readFileSync(absolutePath, 'utf8').includes(token))
        .map(repoRelative)
        .sort();
      expect(actualFiles).toEqual([...allowedFiles].sort());
    },
  );
});
