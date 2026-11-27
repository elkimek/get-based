#!/usr/bin/env node
// Compile authored components at stable native URLs for compatibility and
// coverage. The static Kit build consumes their sources with a shared runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'rolldown';
import { walkSourceFiles } from './source-files.js';
import { compile } from 'svelte/compiler';
import assert from 'node:assert/strict';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from './native-typescript-ast.js';
import {MOBILE_DASHBOARD_STACK, SVELTE_COMPATIBILITY_MANIFEST, parseSvelteCompatibilityManifest} from './svelte-compatibility-outputs.mjs';
import {parseAppShellEntries} from './app-shell-budget.mjs';
import { withAppShellSnapshot } from './app-shell-snapshot.mjs';
import { withLegalConsentSnapshot } from './legal-consent-snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = path.join(ROOT, 'js/components/DisplaySettings.svelte');
// Public synchronous HTML facades; child components compose through their owners.
export const HTML_COMPONENTS = new Set([
  'HostedTransitionBanner', 'AppShell', 'LegalFirstLaunchBody', 'LegalFirstLaunchBoot', 'FooterCommitLink', 'DesktopDashboardPage', 'MobileDashboardPage', 'DashboardWidgetFrame', 'DashboardWidgetBody', 'DashboardLabSummary', 'LegalConsentModal', 'EMFPhoto', 'MobileBottomNavigation', 'SupplementImportReview', 'SupplementImportProgress', 'SupplementImpact', 'SupplementEditor', 'SupplementExpanded', 'RestoredThreadList', 'DashboardGenomeWidget', 'DashboardKeyTrends', 'FocusCard', 'LensDataPage',
  'SupplementTimeline', 'SupplementTimelineRow', 'SupplementTimelineBar', 'SupplementMitoEvidence',
  'SupplementIngredientRow', 'SupplementPeriodRow', 'SupplementQualityRow', 'SupplementForm',
  'EmojiPicker', 'EMFInterpretationModal', 'EMFInterpretationStatus', 'EMFComparison', 'EMFEditor', 'EMFImportPreview', 'DashboardMtdnaStudy', 'DashboardMtdnaPanel', 'DashboardGenomeLoading', 'DashboardGenomeRows', 'DashboardAIRow', 'DashboardAICta',
  'PIIDiffViewer', 'PIIReviewModal', 'PIIDiffFragment',
  'RoutstrActions', 'ChatShell', 'ChatAttestationBadge', 'ChatSpeechButton',
  'ChatCitations', 'ChatStoredImages', 'ChatMessageActions', 'ChatAgentDraftCards',
  'ChatProviderQuiz', 'ChatOnboardingProgress', 'ChatEmptyState', 'ChatSummaryPresentation',
  'LightPagePresentation', 'LightSessionPresentation', 'SunBodyPicker', 'LightSetupPresentation',
  'LightOnboardingAI', 'LightSessionAI', 'LightEnvironmentAI', 'LightCameraPresentation',
  'LightCameraGuidePresentation', 'BiologyPlanningPresentation', 'BiologyReadingPresentation', 'BiologyAIPresentation',
  'BiologySummaryPresentation', 'BiologyContextPresentation', 'BiologyOverviewPresentation', 'BiologyCardPresentation',
  'BiologyDashboardScore', 'BiologyDashboardCoherence', 'BiologySummaryWidget',
  'LensDashboardToggle', 'LensShellPresentation', 'BiologyScoresPage', 'LabDateRange',
  'LensPageContent', 'ReportBuilderPresentation', 'TourPresentation', 'DashboardPickerPresentation', 'DashboardActionBar',
  'ImportMarkerMapPresentation', 'ImportMarkerMapCategories', 'ImportMarkerMapResults', 'LightToolPresentation',
  'LightAuditBlock', 'LightAuditCard', 'LightEnvironmentPresentation', 'LightEnvironmentSummary',
  'LightEnvironmentScreen', 'LightEnvironmentTodayToggle', 'LightReviewAI', 'LightChannelDetail',
  'LightDeviceRecommendations', 'LightDeviceSetup', 'LightDevicePresentation', 'LightDeviceAffiliate',
  'LightChannelPills', 'LightChannelSparkline', 'LightConditionsPresentation', 'ContextCardCatalog',
  'ContextCardStatus', 'ContextCardTips', 'ContextEMFLauncher', 'ContextFoodContaminantsBadge',
  'ContextNutritionLink', 'NutritionPresentation', 'NutritionDashboard', 'RecommendationPresentation', 'RecommendationCard',
  'ImportReviewPresentation', 'ImportUnitControl', 'ImportMapControl', 'ImportReviewRowAction',
  'ImportExcludeContent', 'ImportReviewStatus', 'ImportUnitMenu', 'CycleImportPreview',
  'CycleImportPicker', 'CycleImportCoverage', 'CycleEditorPresentation', 'CycleOverviewPresentation', 'TipsSection', 'TipsDetail',
  'TipsProduct', 'TipsCoupon', 'TipsDisclosure', 'TipsBanner',
  'TipsDisclaimer', 'RecommendationPage',
  'NoteEditorPresentation',
  'PdfPreflightPresentation', 'PdfImageModePresentation',
  'ImportProgressPresentation', 'DropZoneResetPresentation',
  'MarkerPlacementSummary', 'MarkerPlacementOptions', 'MarkerPlacementForm',
  'CustomMarkerForm', 'CustomMarkerOptions',
  'MarkerDetailHistory', 'MarkerDetailRange', 'MarkerReferenceEditor', 'LabSampleEditor',
  'MarkerDetailChrome', 'MarkerDetailBioAge', 'MarkerDetailNotes', 'MarkerDetailModal',
  'CompareDatesPage', 'CompareDatesTable', 'CompareRangeStack',
  'CorrelationsSelectionPage', 'CorrelationsSelectionOptions', 'CorrelationsSelectionChips',
  'TherapyComparisonResults', 'TherapyComparisonEntries', 'MarkerPairComparison',
  'CorrelationWorkspaceControls',
  'CorrelationWorkspaceChrome',
  'CorrelationWorkspaceReadout',
  'CorrelationWorkspaceUsageSegments',
  'ManualMarkerEntry', 'ManualMarkerEntryUnits', 'ManualSnpDialog', 'DnaImportPreview', 'MtDnaImportPreview', 'GeneticsSection',
  'WearableManualLog', 'WearableSourcePicker',
  'DashboardGreeting', 'DashboardWelcome', 'DashboardOnboarding',
  'ProfileShareActive', 'ProfileShareCreate', 'ProfileShareResult', 'ProfileShareLoad', 'ProfileShareShell',
  'UtilsConfirmPresentation', 'UtilsPromptPresentation', 'AnalyticsConsentBody',
  'SunDataSourcePresentation', 'TweaksPresentation',
  'FeedbackPresentation', 'ChangelogPresentation', 'ProfileButtonPresentation', 'HeaderDateSummary', 'HeaderRangeButtons',
  'ClientListOverview', 'ClientListMenuButton', 'ClientListFormPresentation', 'ChartLayersDropdown', 'VersionUpdateBody', 'VersionUpdateCopy',
  'SyncIndicatorPresentation', 'SyncPopoverPresentation', 'SyncDiagnoseModal', 'SyncIdentityRotation',
  'KnowledgeBasePanel', 'KnowledgeBaseModal', 'KnowledgeBaseStatus', 'KnowledgeBaseStats',
  'KnowledgeBaseDocuments', 'KnowledgeBaseIngestPill', 'KnowledgeBaseLibraryOptions', 'KnowledgeBaseLibraryCreate',
  'CategoryRangeRail',
  'CategoryChartCard',
  'CategoryTableColgroup',
  'CategoryScrollableTable',
  'CategoryDataTable',
  'CategoryHeatmap',
  'CategoryFattyAcids',
  'CategoryPageRangeEmptyState',
  'CategoryMarkerDataGaps',
  'CategoryPageChrome',
  'CategoryPageViewBody',
  'ConditionalSidebarItem',
  'SidebarCategoryItem',
  'SidebarNavigation',
  'DashboardBiometricSyncStatus',
  'DashboardBiometricTile',
  'DashboardBiometricsOverview', 'DashboardLightWidgetBody', 'DashboardLightSunLoading', 'DashboardInsights', 'DashboardInsightCard',
  'DashboardLabMarkers', 'DashboardLabNotes', 'DashboardQuickMarkers', 'DashboardOwnedWidget',
  'WearableDetailChrome',
  'WearableDetailFeedback',
  'WearableDetailStats',
  'WearableEmptyCard',
  'WearableManualEntries',
  'WearableMetricCard',
  'WearableSparkline',
  'WearableStripBody',
  'WearableStripHeader',
  'WearableStripStub',
  // Direct Nutrition controllers import only their authored HTML leaf.
  'NutritionFuelCard', 'NutritionMealPhoto', 'NutritionComparisonPicker', 'NutritionBenchmark', 'NutritionMealModelPicker', 'NutritionMealEditor', 'NutritionBenchmarkStatus', 'NutritionBenchmarkPhoto', 'NutritionEditorNavigation', 'NutritionComparisonResults', 'NutritionAnalysisProgress', 'NutritionEditorFeedback', 'NutritionEditableIngredients',
]);

/** Native clients import hydrate only for these actual SSR owners. */
export const HYDRATABLE_COMPONENTS = new Set(["AppShell", "DesktopDashboardPage", "MobileDashboardPage", "RoutstrActions", "ChatShell", "ChatEmptyState", "ChatSpeechButton", "ChatMessageActions", "ContextNotes", "ContextCardStatus", "DashboardOwnedWidget", "DashboardLabMarkers", "DashboardInsights", "DashboardBiometricsOverview"]);

// Both compatibility and optimized builds use this exact authored compilation.
export function compileAuthoredComponent(source: string, filename: string, output: 'client' | 'html') {
  const compiled = compile(source, {
    // Compact Biology cards retain the existing lens-shell tools insertion marker.
    preserveComments: path.basename(filename) === 'BiologyScoreDetail.svelte',
    filename, generate: output === 'html' ? 'server' : 'client', css: 'external', dev: false,
  });
  if (compiled.warnings.length) {
    throw new Error(compiled.warnings.map(warning => `${warning.code}: ${warning.message}`).join('\n'));
  }
  if (compiled.css?.code) throw new Error('Component styles must use the scoped Tailwind stylesheet');
  return { code: compiled.js.code, map: compiled.js.map };
}

type SvelteOutput = 'client' | 'html';
type CompiledGroup = {files: Map<string, string | Uint8Array>; dependencies: Map<string, string[]>; shared: string[]};

// These public entries are read during native startup or directly by the
// optimized worker. A standalone response preserves their request boundary.
const STANDALONE_CLIENT = new Set(['AppShell', 'DisplaySettings', 'MigrationRecovery']);
const STANDALONE_HTML = new Set([
  'AnalyticsConsentBody', 'ChartLayersDropdown', 'DashboardGreeting', 'DashboardOnboarding', 'DashboardWelcome',
  'DropZoneResetPresentation', 'EmojiPicker', 'FeedbackPresentation', 'FooterCommitLink', 'HeaderDateSummary',
  'HeaderRangeButtons', 'ImportProgressPresentation', 'LabDateRange', 'LegalFirstLaunchBody', 'LegalFirstLaunchBoot',
  'MobileBottomNavigation', 'ProfileButtonPresentation', 'RecommendationPresentation', 'RestoredThreadList',
  'SidebarNavigation', 'SyncIndicatorPresentation', 'SyncPopoverPresentation', 'TourPresentation',
  'UtilsConfirmPresentation', 'UtilsPromptPresentation', 'VersionUpdateBody', 'VersionUpdateCopy',
]);

function standalone(file: string, output: SvelteOutput) {
  return (output === 'client' ? STANDALONE_CLIENT : STANDALONE_HTML).has(path.basename(file, '.svelte'));
}

function compatibilityDirectory(directory: string) {
  const relative = path.relative(ROOT, directory).replaceAll(path.sep, '/');
  return /^js\/(?:components|kit)(?:\/[a-zA-Z0-9_-]+)*$/.test(relative);
}

function entryName(file: string, output: SvelteOutput) {
  return path.basename(file) + (output === 'client' ? '.native.js' : '.html.js');
}

function exportsFor(file: string, output: SvelteOutput) {
  if (output === 'html') return ['renderHTML'];
  return ['default', 'flushSync', ...(HYDRATABLE_COMPONENTS.has(path.basename(file, '.svelte')) ? ['hydrate'] : []), 'mount', 'unmount'];
}

async function compileGroup(components: readonly string[], outputDirectory: string, output: SvelteOutput): Promise<CompiledGroup> {
  const directory = path.dirname(components[0]!);
  assert(components.every(file => path.dirname(file) === directory), 'Svelte compatibility entries share an output directory');
  const entries = new Map(components.map(file => ['getbased:component-entry:' + path.basename(file), file]));
  const authored = new Map(components.map(file => ['getbased:authored-component:' + path.basename(file), file]));
  const result = await build({
    input: Object.fromEntries([...entries].map(([id, file]) => [entryName(file, output).slice(0, -3), id])),
    write: false,
    platform: output === 'html' ? 'neutral' : 'browser',
    plugins: [{
      name: 'getbased-svelte-component',
      resolveId(id, importer) {
        if (entries.has(id)) return id;
        const source = authored.get(id);
        if (source) return source;
        if (output === 'html' && id === 'node:async_hooks') return {id, external: true};
        if (importer?.endsWith('.svelte') && id.startsWith('.') && id.endsWith('.js')) {
          const relative = path.relative(directory, path.resolve(path.dirname(importer), id)).replaceAll(path.sep, '/');
          return {id: relative.startsWith('.') ? relative : './' + relative, external: true};
        }
        return null;
      },
      async load(id) {
        const file = entries.get(id);
        if (file) {
          const source = JSON.stringify('getbased:authored-component:' + path.basename(file));
          if (output === 'html') return `import Component from ${source}; import {render} from 'svelte/server'; export const renderHTML = props => render(Component, {props}).body;`;
          const lifecycle = exportsFor(file, 'client').filter(name => name !== 'default').join(', ');
          return `export { default } from ${source}; export { ${lifecycle} } from 'svelte';`;
        }
        if (id.endsWith('.svelte')) return compileAuthoredComponent(await fs.readFile(id, 'utf8'), id, output);
        return null;
      },
    }],
    output: {dir: outputDirectory, format: 'es', minify: true, sourcemap: true, sanitizeFileName: false,
      entryFileNames: '[name].js', chunkFileNames: `svelte-compat-${output}-[hash].js`},
  });
  const files = new Map(result.output.map(item => [item.fileName, item.type === 'chunk' ? item.code : item.source]));
  const chunks = result.output.filter(item => item.type === 'chunk');
  const names = new Set(chunks.map(item => item.fileName));
  const expectedEntries = new Map(components.map(file => [entryName(file, output), exportsFor(file, output)]));
  assert.deepEqual(chunks.filter(item => item.isEntry).map(item => item.fileName).sort(), [...expectedEntries.keys()].sort());
  const dependencies = new Map<string, string[]>();
  const shared: string[] = [];
  for (const chunk of chunks) {
    if (output === 'html' && (chunk.imports.some(id => id.startsWith('node:'))
      || chunk.dynamicImports.some(id => id.startsWith('node:') && id !== 'node:async_hooks'))) {
      throw new Error('Browser HTML cannot import Node APIs except Svelte’s unused optional asynchronous renderer');
    }
    const entryExports = expectedEntries.get(chunk.fileName);
    if (entryExports) assert.deepEqual(chunk.exports.toSorted(), entryExports);
    else shared.push(chunk.fileName);
    dependencies.set(chunk.fileName, [...new Set([...chunk.imports, ...chunk.dynamicImports].filter(id => names.has(id)))]);
    if (chunk.map) continue;
    // Pure forwarding modules have no authored positions. Every local import
    // still resolves to an output from this exact graph.
    const outputFrom = (specifier: ts.Expression | undefined) => specifier !== undefined
      && ts.isStringLiteral(specifier) && specifier.text.startsWith('./') && names.has(specifier.text.slice(2));
    const forwarder = withParsedSource(chunk.code, chunk.fileName, ast => ast.statements.length > 0 && ast.statements.every(statement => {
      if (ts.isImportDeclaration(statement)) return outputFrom(statement.moduleSpecifier);
      return ts.isExportDeclaration(statement) && (!statement.moduleSpecifier || outputFrom(statement.moduleSpecifier));
    }));
    assert(forwarder, 'Missing authored map for Svelte output: ' + chunk.fileName);
    const mapName = chunk.fileName + '.map';
    files.set(mapName, JSON.stringify({version: 3, file: chunk.fileName, sources: [], sourcesContent: [], names: [], mappings: ''}));
    files.set(chunk.fileName, chunk.code.trimEnd() + '\n//# sourceMappingURL=' + mapName + '\n');
  }
  return {files, dependencies, shared};
}

async function updateGenerated(file: string, content: string | Uint8Array, check: boolean) {
  const expected = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
  const existing = await fs.readFile(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing?.equals(expected)) return;
  if (check) throw new Error(`Svelte output is stale: ${path.basename(file)}`);
  await fs.writeFile(file, expected);
}

async function writeGroup(group: CompiledGroup, directory: string, check: boolean) {
  if (!check) await fs.mkdir(directory, {recursive: true});
  for (const [file, content] of group.files) {
    assert.equal(file, path.basename(file), 'Svelte output is a sibling of its public entries');
    await updateGenerated(path.join(directory, file), content, check);
  }
}

function groupEntries(directory: string, output: SvelteOutput) {
  return walkSourceFiles(directory).filter(file => path.dirname(file) === directory && file.endsWith('.svelte')
    && (output === 'client' || HTML_COMPONENTS.has(path.basename(file, '.svelte'))));
}

export async function buildSvelte({component = COMPONENT, outputDirectory = path.dirname(component), check = false, output = 'client'}: {
  component?: string; outputDirectory?: string; check?: boolean; output?: SvelteOutput;
} = {}): Promise<void> {
  const file = path.resolve(component), directory = path.dirname(file);
  const registered = path.resolve(outputDirectory) === directory && compatibilityDirectory(directory) ? groupEntries(directory, output) : [];
  const group = await compileGroup(registered.includes(file) && !standalone(file, output)
    ? registered.filter(entry => !standalone(entry, output)) : [file], outputDirectory, output);
  await writeGroup(group, outputDirectory, check);
}

async function buildCompatibility(check: boolean) {
  const components = [...walkSourceFiles(path.join(ROOT, 'js/components')), ...walkSourceFiles(path.join(ROOT, 'js/kit'))]
    .filter(file => file.endsWith('.svelte'));
  const byDirectory = new Map<string, string[]>();
  for (const component of components) {
    const directory = path.dirname(component), entries = byDirectory.get(directory) ?? [];
    entries.push(component);
    byDirectory.set(directory, entries);
  }
  const dependencyGraph = new Map<string, string[]>();
  const shared: string[] = [];
  for (const [directory, entries] of byDirectory) {
    assert(compatibilityDirectory(directory));
    const relative = path.relative(ROOT, directory).replaceAll(path.sep, '/');
    for (const output of ['client', 'html'] as const) {
      const selected = entries.filter(file => output === 'client' || HTML_COMPONENTS.has(path.basename(file, '.svelte')));
      const isolated = selected.filter(file => standalone(file, output));
      const groups = [selected.filter(file => !standalone(file, output)), ...isolated.map(file => [file])];
      for (const files of groups) {
        if (!files.length) continue;
        const group = await compileGroup(files, directory, output);
        await writeGroup(group, directory, check);
        shared.push(...group.shared.map(file => relative + '/' + file));
        for (const [file, children] of group.dependencies) {
          dependencyGraph.set('/' + relative + '/' + file, children.map(child => '/' + relative + '/' + child));
        }
      }
    }
  }
  const manifest = path.join(ROOT, SVELTE_COMPATIBILITY_MANIFEST);
  const previous = await fs.readFile(manifest, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const manifestText = JSON.stringify(shared.sort(), null, 2) + '\n';
  const paths = new Set(parseSvelteCompatibilityManifest(manifestText));
  const workerAssets = path.join(ROOT, 'service-worker-assets.js');
  const workerSource = await fs.readFile(workerAssets, 'utf8');
  const marker = /^([ \t]*\/\/ getbased-svelte-precache:start\r?\n)[\s\S]*?^([ \t]*\/\/ getbased-svelte-precache:end\r?$)/gm;
  const markers = [...workerSource.matchAll(marker)];
  assert.equal(markers.length, 1, 'One native Svelte precache boundary');
  const unexpanded = workerSource.replace(marker, '$1$2');
  const visited = new Set<string>();
  const visit = (url: string) => {
    if (visited.has(url)) return;
    visited.add(url);
    for (const child of dependencyGraph.get(url) ?? []) visit(child);
  };
  const roots = new Set(parseAppShellEntries(unexpanded));
  for (const url of roots) visit(url);
  const dependencies = [...visited].filter(url => paths.has(url.slice(1)) && !roots.has(url)).sort();
  const literals = dependencies.map(url => '    ' + JSON.stringify(url) + ',\n').join('');
  await updateGenerated(workerAssets, unexpanded.replace(marker, (_match, start: string, end: string) => start + literals + end), check);
  await updateGenerated(manifest, manifestText, check);
  if (!check) {
    const oldPaths = previous ? parseSvelteCompatibilityManifest(previous) : [MOBILE_DASHBOARD_STACK + '.shared.js'];
    for (const old of oldPaths) if (!paths.has(old)) {
      await fs.rm(path.join(ROOT, old), {force: true});
      await fs.rm(path.join(ROOT, old + '.map'), {force: true});
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildCompatibility(process.argv.includes('--check'));
  const { renderHTML } = await import(pathToFileURL(path.join(ROOT, 'js/components/AppShell.svelte.html.js')).href) as { renderHTML: () => string };
  const indexPath = path.join(ROOT, 'index.html');
  const index = await fs.readFile(indexPath, 'utf8');
  const { renderFirstLaunchLegalBoot } = await import(pathToFileURL(path.join(ROOT, 'js/legal-first-launch-presentation.js')).href) as { renderFirstLaunchLegalBoot: () => string };
  const generated = withLegalConsentSnapshot(withAppShellSnapshot(index, renderHTML()), renderFirstLaunchLegalBoot());
  if (process.argv.includes('--check')) {
    if (generated !== index) throw new Error('Native App shell snapshot is stale; run npm run svelte:build');
  } else if (generated !== index) await fs.writeFile(indexPath, generated);
}
