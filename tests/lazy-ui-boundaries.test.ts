import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {scanActionEmissionFamilies} from './helpers/action-emission.js';
import {GENERIC_DATA_ATTRIBUTE_OWNERS,REVIEWED_ATTRIBUTE_RECORDS} from './helpers/action-emission-contracts.js';
import {walkSourceFiles} from '../scripts/source-files.js';
import { parseModuleSpecifiers } from '../scripts/architecture-map.mjs';
import { readAuthoredRepositorySource } from './helpers/repository-source.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_ROOT = path.join(ROOT, 'js');

const DEFERRED_UI_BOUNDARIES = [
  ['js/dashboard-view-composition.js', 'js/dashboard-composition-loader.js', 'route-gated-render', 'tests/pwa/sveltekit-main-route-acceptance.spec.ts'],
  ['js/lens-pages.js', 'js/dashboard-composition-loader.js', 'route-gated-render', 'tests/pwa/sveltekit-main-route-acceptance.spec.ts'],
  ['js/recommendation-actions.js', 'js/dashboard-composition-loader.js', 'eager-action', 'tests/pwa/sveltekit-main-route-acceptance.spec.ts'],
  ['js/lab-context.js', 'js/lab-context-loader.js', 'load-gated-render', 'tests/pwa/sveltekit-context-status.spec.ts'],
  ['js/desktop-dashboard-renderer.js', 'js/dashboard-renderer-loader.js', 'load-gated-render', 'tests/pwa/sveltekit-main-route-acceptance.spec.ts'],
  ['js/mobile-dashboard-renderer.js', 'js/dashboard-renderer-loader.js', 'load-gated-render', 'tests/pwa/sveltekit-main-route-acceptance.spec.ts'],
  ['js/sync-diagnose-ui-impl.js', 'js/sync-diagnose-ui.js', 'eager-action', 'tests/playwright/chat-history-diagnose-browser-coverage.spec.js'],
  ['js/wearables.js', 'js/app-shell-hooks.js', 'eager-action', 'tests/playwright/wearables-stylesheet-browser-coverage.spec.js'],
  ['js/changelog-impl.js', 'js/changelog.js', 'eager-action', 'tests/playwright/changelog-loader-browser-coverage.spec.js'],
  ['js/app-ai-interaction-modules.js', 'js/chat-loader.js', 'eager-action', 'tests/playwright/chat-loader-browser-coverage.spec.js'],
  ['js/client-list-impl.js', 'js/client-list.js', 'eager-action', 'tests/playwright/client-list-stylesheet-browser-coverage.spec.js'],
  ['js/context-card-dashboard-ai-impl.js', 'js/context-card-dashboard-ai.js', 'eager-delegate', 'tests/playwright/context-card-dashboard-ai-loader-browser-coverage.spec.js'],
  ['js/context-card-lifestyle-editors-impl.js', 'js/context-card-lifestyle-editors.js', 'eager-delegate', 'tests/playwright/context-card-lifestyle-editors-loader-browser-coverage.spec.js'],
  ['js/context-card-medical-history-editor-impl.js', 'js/context-card-medical-history-editor.js', 'eager-delegate', 'tests/playwright/context-card-medical-history-editor-loader-browser-coverage.spec.js'],
  ['js/cycle-import.js', 'js/cycle-import-runtime.js', 'eager-delegate', 'tests/playwright/cycle-import-loader-browser-coverage.spec.js'],
  ['js/export.js', 'js/export-loader.js', 'eager-action', 'tests/playwright/export-facade-loader-browser-coverage.spec.js'],
  ['js/cashu-wallet.js', 'js/export-runtime.js', 'eager-action', 'tests/playwright/cashu-wallet-loader-browser-coverage.spec.js'],
  ['js/export-import.js', 'js/export.js', 'eager-action', 'tests/playwright/export-import-loader-browser-coverage.spec.js'],
  ['js/export-report-builder.js', 'js/export.js', 'eager-action', 'tests/playwright/report-builder-loader-browser-coverage.spec.js'],
  ['js/biology-page-view.js', 'js/biology-page-loader.js', 'load-gated-render', 'tests/playwright/biology-page-owned.spec.js'],
  ['js/nutrition.js', 'js/nutrition-context.js', 'eager-delegate', 'tests/playwright/nutrition-loading-feedback.spec.js'],
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

const CONTEXT_PREPARATION_CONSUMERS = [
  {
    name: 'eligible context health assessment',
    owner: 'js/context-card-health-dots.js',
    evidence: ['if (!staleCardsHaveAssessableData(staleKeys))', 'loaded = await loadLabContextBuilder()',
      /if \(!isHealthRequestCurrent\(request\)\)[ \t\r\n]+return;[ \t\r\n]+build = loaded;/, 'build = loaded;'],
    coverage: 'tests/context-health-cold-builder.test.ts',
    coverageTitle: 'never builds or sends after %s changes during import',
  },
  {
    name: 'owner-bound Agent Access preparation',
    owner: 'js/sync-messenger.js',
    evidence: ['preparedBuild = await configured.prepareContext()', 'if (!preparationCurrent())',
      'return !demo && preparationOwnerCurrent();', 'const baseContext = preparedBuild ? preparedBuild() : buildLabContext()'],
    coverage: 'tests/sync-messenger-cold-context.test.ts',
    coverageTitle: 'does no build, encryption or send after %s changes during import',
  },
  {
    name: 'first-party Sync context wiring',
    owner: 'js/sync-configure.js',
    evidence: ["from './lab-context-loader.js'", "from './lab-context-wearables.js'",
      'buildLabContext: buildDefaultSyncMessengerContext', 'configureSyncMessengerContextPreparation(loadLabContextBuilder)'],
    coverage: 'tests/sync-messenger-cold-context.test.ts',
    coverageTitle: 'first-party reconfiguration replaces a prior injected builder with its stable cold default',
  },
];

const COLD_DELEGATE_CONTRACTS = [
  {
    name: 'marker detail cards',
    facade: 'js/marker-detail-modal.js',
    evidence: [
      "from './marker-detail-actions.js'",
      'installMarkerDetailActionDelegates({ showDetailModal, openManualEntryForm });',
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
    facade: 'js/cycle-import-runtime.js',
    evidence: [
      "document.addEventListener('click', handleDeferredCycleImportAction);",
      "document.addEventListener('change', handleDeferredCycleImportAction);",
    ],
    coverage: 'tests/playwright/cycle-import-loader-browser-coverage.spec.js',
    coverageTitle: 'first delegated click and change are replayed after the implementation loads',
  },
];

// Genuine authored owners, plus the two separately named generic attribute
// compatibility boundaries. Selector-only controller consumers are not emitters.
const IMPLEMENTATION_OWNED_ACTION_FAMILIES = [
 {token:'data-wearable-action',allowedFiles:[...GENERIC_DATA_ATTRIBUTE_OWNERS,
  'js/components/WearableDetailChrome.svelte','js/components/WearableDetailFeedback.svelte',
  'js/components/WearableEmptyCard.svelte','js/components/WearableManualEntries.svelte','js/components/WearableManualLog.svelte',
  'js/components/WearableMetricCard.svelte','js/components/WearableStripBody.svelte',
  'js/components/WearableStripHeader.svelte','js/components/WearableStripStub.svelte',
  'js/wearables-detail-modal.ts']},
 {token:'data-cl-',allowedFiles:[...GENERIC_DATA_ATTRIBUTE_OWNERS,'js/client-list-form.ts',
  'js/components/ClientListFormPresentation.svelte','js/components/ClientListMenuButton.svelte',
  'js/components/ClientListOverview.svelte','js/components/ClientListRow.svelte']},
 {token:'data-changelog-action',allowedFiles:[...GENERIC_DATA_ATTRIBUTE_OWNERS,'js/components/ChangelogPresentation.svelte']},
 {token:'data-report-action',allowedFiles:[...GENERIC_DATA_ATTRIBUTE_OWNERS,
  'js/components/ReportBuilderAI.svelte','js/components/ReportBuilderPresentation.svelte',
  'js/components/ReportBuilderSections.svelte','js/components/ReportBuilderSetup.svelte']},
 {token:'data-profile-share-',allowedFiles:[...GENERIC_DATA_ATTRIBUTE_OWNERS,
  'js/components/ProfileShareActive.svelte','js/components/ProfileShareCreate.svelte',
  'js/components/ProfileShareLoad.svelte','js/components/ProfileShareResult.svelte','js/components/ProfileShareShell.svelte']},
];

function source(relativePath: string) {
  if (relativePath.endsWith('.spec.js')) return readAuthoredRepositorySource(relativePath);
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function walkJavaScript(directory = JS_ROOT): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkJavaScript(absolutePath);
    return entry.isFile() && entry.name.endsWith('.js') ? [absolutePath] : [];
  });
}

function repoRelative(absolutePath: string) {
  return path.relative(ROOT, absolutePath).replaceAll(path.sep, '/');
}

function resolveDynamicTarget(fromFile: string, specifier: string) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0]!;
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

      const parsed = parseModuleSpecifiers(source(boundary.loader!), boundary.loader);
      const matchingImports = parsed.dependencies
        .filter(dependency => dependency.kind === 'dynamic')
        .filter(dependency => resolveDynamicTarget(
          path.join(ROOT, boundary.loader!),
          dependency.specifier,
        ) === boundary.implementation)
        .map(dependency => dependency.specifier);

      expect(matchingImports.some(specifier => specifier.includes('lazy-retry=1'))).toBe(true);
      expect(matchingImports.some(specifier => !specifier.includes('lazy-retry=1'))).toBe(true);
      expect(source(boundary.coverage!)).toContain('test(');
    },
  );

  it.each(CONTEXT_PREPARATION_CONSUMERS)(
    '$name owns its deferred builder acquisition and eligibility regression coverage',
    contract => {
      const owner = source(contract.owner);
      for (const evidence of contract.evidence) {
        if (typeof evidence === 'string') expect(owner).toContain(evidence);
        else expect(owner).toMatch(evidence);
      }
      expect(owner).not.toContain("from './lab-context.js'");
      expect(source(contract.coverage)).toContain(contract.coverageTitle);
      expect(source('tests/pwa/sveltekit-context-status.spec.ts'))
        .toContain('static authored context assessments restore cached literal summaries across offline cold launches without new inference');
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

  // All five original token/owner contracts still examine every authored file.
  // Batches keep the existing five-second per-case deadline while each source
  // is read and parsed only once, with no cross-test source or AST memoization.
  const authoredFiles=walkSourceFiles(JS_ROOT);
  const batches=Array.from({length:Math.ceil(authoredFiles.length/128)},(_,index)=>({
    first:index*128,files:authoredFiles.slice(index*128,(index+1)*128),
  }));
  it('retains every reviewed cold action owner and every authored source in the scan inventory',()=>{
    expect(authoredFiles.length).toBeGreaterThan(0);
    expect(batches.flatMap(batch=>batch.files)).toEqual(authoredFiles);
    const authored=new Set(authoredFiles.map(repoRelative));
    for(const {token,allowedFiles}of IMPLEMENTATION_OWNED_ACTION_FAMILIES){
      expect(allowedFiles.filter(file=>!authored.has(file)),token).toEqual([]);
    }
  });
  it.each(batches)('all cold action ownership families inspect source batch $first',({files})=>{
    const actualByToken=new Map(IMPLEMENTATION_OWNED_ACTION_FAMILIES.map(({token})=>[token,[] as string[]]));
    const tokens=IMPLEMENTATION_OWNED_ACTION_FAMILIES.map(({token})=>token);
    for(const absolutePath of files){
      const relative=repoRelative(absolutePath);
      const scans=scanActionEmissionFamilies(fs.readFileSync(absolutePath,'utf8'),relative,tokens,REVIEWED_ATTRIBUTE_RECORDS[relative]);
      for(const token of tokens){
        const scan=scans.get(token)!;
        expect(scan.unclassified,`${relative}/${token}`).toEqual([]);
        if(scan.emits)actualByToken.get(token)!.push(relative);
      }
    }
    const selected=new Set(files.map(repoRelative));
    for(const {token,allowedFiles}of IMPLEMENTATION_OWNED_ACTION_FAMILIES){
      expect(actualByToken.get(token),token).toEqual([...allowedFiles].filter(file=>selected.has(file)).sort());
    }
  });
});
