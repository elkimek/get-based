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
import {MOBILE_DASHBOARD_PAGE, MOBILE_DASHBOARD_STACK, MOBILE_DASHBOARD_SHARED} from './svelte-compatibility-outputs.mjs';
import { withAppShellSnapshot } from './app-shell-snapshot.mjs';
import { withLegalConsentSnapshot } from './legal-consent-snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = path.join(ROOT, 'js/components/DisplaySettings.svelte');
// Public synchronous HTML facades; child components compose through their owners.
export const HTML_COMPONENTS = new Set([
  'AppShell', 'LegalFirstLaunchBody', 'LegalFirstLaunchBoot', 'FooterCommitLink', 'DesktopDashboardPage', 'MobileDashboardPage', 'DashboardWidgetFrame', 'DashboardWidgetBody', 'DashboardLabSummary', 'LegalConsentModal', 'EMFPhoto', 'MobileBottomNavigation', 'SupplementImportReview', 'SupplementImportProgress', 'SupplementImpact', 'SupplementEditor', 'SupplementExpanded', 'RestoredThreadList', 'DashboardGenomeWidget', 'DashboardKeyTrends', 'FocusCard', 'LensDataPage',
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

export async function buildSvelte({ component = COMPONENT, outputDirectory = path.dirname(component), check = false, output = 'client' }: {
  component?: string; outputDirectory?: string; check?: boolean; output?: 'client' | 'html';
} = {}): Promise<void> {
  const group = [MOBILE_DASHBOARD_PAGE, MOBILE_DASHBOARD_STACK].map(file => path.join(ROOT, file));
  const shared = output === 'client' && group.includes(path.resolve(component));
  const entries = new Map(group.map(file => ['getbased:component-entry:' + path.basename(file), file]));
  const sharedName = path.basename(MOBILE_DASHBOARD_SHARED);
  const result = await build({
    input: shared ? Object.fromEntries([...entries].map(([id, file]) => [path.basename(file) + '.native', id])) : 'getbased:component-entry',
    write: false,
    // HTML rendering needs Svelte's server lifecycle exports, even when the
    // synchronous result is later used by a browser compatibility adapter.
    platform: output === 'html' ? 'neutral' : 'browser',
    plugins: [{
      name: 'getbased-svelte-component',
      resolveId(id, importer) {
        if (shared && entries.has(id)) return id;
        if (id === 'getbased:component-entry') return id;
        if (id === 'getbased:authored-component') return path.resolve(component);
        if (output === 'html' && id === 'node:async_hooks') return { id, external: true }; // Svelte retains its optional async renderer; this entry exposes only synchronous .body.
        if (importer?.endsWith('.svelte') && id.startsWith('.') && id.endsWith('.js')) return { id, external: true };
        return null;
      },
      async load(id) {
        if (shared && entries.has(id)) {
          const file = entries.get(id)!;
          const hydration = HYDRATABLE_COMPONENTS.has(path.basename(file, '.svelte')) ? ', hydrate' : '';
          return `export { default } from ${JSON.stringify(file)}; export { mount, unmount, flushSync${hydration} } from 'svelte';`;
        }
        if (id === 'getbased:component-entry') {
          if (output === 'html') return `import Component from 'getbased:authored-component'; import { render } from 'svelte/server'; export const renderHTML = props => render(Component, { props }).body;`;
          const hydration = HYDRATABLE_COMPONENTS.has(path.basename(component, '.svelte')) ? ', hydrate' : '';
          return `export { default } from 'getbased:authored-component'; export { mount, unmount, flushSync${hydration} } from 'svelte';`;
        }
        if (!id.endsWith('.svelte')) return null;
        return compileAuthoredComponent(await fs.readFile(id, 'utf8'), id, output);
      },
    }],
    output: { dir: outputDirectory, format: 'es', minify: true, sourcemap: true,
      ...(shared ? {entryFileNames: '[name].js', chunkFileNames: sharedName} : {entryFileNames: `${path.basename(component)}.${output === 'html' ? 'html' : 'native'}.js`}) },
  });
  if (output === 'html' && result.output.some(chunk => chunk.type === 'chunk' && (
    chunk.imports.some(id => id.startsWith('node:')) ||
    chunk.dynamicImports.some(id => id.startsWith('node:') && id !== 'node:async_hooks')
  ))) throw new Error('Browser HTML cannot import Node APIs except Svelte’s unused optional asynchronous renderer');
  const outputs = new Map(result.output.map(item => [item.fileName, item.type === 'chunk' ? item.code : item.source]));
  if (shared) {
    const chunks = result.output.filter(item => item.type === 'chunk');
    assert.deepEqual(chunks.map(item => item.fileName).sort(), [...group.map(file => path.basename(file) + '.native.js'), sharedName].sort());
    for (const chunk of chunks) {
      if (chunk.map) continue;
      // Rolldown emits no original-source coordinates for a wholly generated
      // forwarding entry. Qualify its complete program before writing a map
      // with no original mappings. Executable component bodies keep Rolldown's maps.
      assert.equal(chunk.fileName, path.basename(MOBILE_DASHBOARD_STACK) + '.native.js');
      const forwarder = withParsedSource(chunk.code, chunk.fileName, ast => {
        const [imports, exports] = ast.statements;
        if (ast.statements.length !== 2 || !imports || !ts.isImportDeclaration(imports)
          || !ts.isStringLiteral(imports.moduleSpecifier) || imports.moduleSpecifier.text !== './' + sharedName
          || !imports.importClause?.namedBindings || !ts.isNamedImports(imports.importClause.namedBindings)
          || !exports || !ts.isExportDeclaration(exports) || exports.moduleSpecifier
          || !exports.exportClause || !ts.isNamedExports(exports.exportClause)) return false;
        const locals = new Set(imports.importClause.namedBindings.elements.map(binding => binding.name.text));
        return exports.exportClause.elements.every(binding => locals.has((binding.propertyName ?? binding.name).text));
      });
      assert(forwarder, 'Only a generated mobile dashboard re-export may have an empty source map');
      assert.deepEqual(chunk.exports.toSorted(), ['default', 'flushSync', 'mount', 'unmount']);
      const mapName = chunk.fileName + '.map';
      outputs.set(mapName, JSON.stringify({version: 3, file: chunk.fileName, sources: [], sourcesContent: [], names: [], mappings: ''}));
      outputs.set(chunk.fileName, chunk.code.trimEnd() + '\n//# sourceMappingURL=' + mapName + '\n');
    }
  }
  for (const [fileName, content] of outputs) {
    const file = path.join(outputDirectory, fileName);
    if (check) {
      const existing = await fs.readFile(file);
      if (!existing.equals(Buffer.from(content))) throw new Error(`Svelte output is stale: ${fileName}`);
    } else {
      const expected = Buffer.from(content);
      const existing = await fs.readFile(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
        return undefined;
      });
      if (!existing?.equals(expected)) {
        await fs.mkdir(outputDirectory, { recursive: true });
        await fs.writeFile(file, expected);
      }
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const component of [...walkSourceFiles(path.join(ROOT, 'js/components')), ...walkSourceFiles(path.join(ROOT, 'js/kit'))].filter(file => file.endsWith('.svelte'))) {
    if (component !== path.join(ROOT, MOBILE_DASHBOARD_STACK)) await buildSvelte({ component, check: process.argv.includes('--check') });
    if (HTML_COMPONENTS.has(path.basename(component, '.svelte'))) await buildSvelte({ component, output: 'html', check: process.argv.includes('--check') });
  }
  const { renderHTML } = await import(pathToFileURL(path.join(ROOT, 'js/components/AppShell.svelte.html.js')).href) as { renderHTML: () => string };
  const indexPath = path.join(ROOT, 'index.html');
  const index = await fs.readFile(indexPath, 'utf8');
  const { renderFirstLaunchLegalBoot } = await import(pathToFileURL(path.join(ROOT, 'js/legal-first-launch-presentation.js')).href) as { renderFirstLaunchLegalBoot: () => string };
  const generated = withLegalConsentSnapshot(withAppShellSnapshot(index, renderHTML()), renderFirstLaunchLegalBoot());
  if (process.argv.includes('--check')) {
    if (generated !== index) throw new Error('Native App shell snapshot is stale; run npm run svelte:build');
  } else if (generated !== index) await fs.writeFile(indexPath, generated);
}
