#!/usr/bin/env node
// Compile authored components at stable native URLs for compatibility and
// coverage. The static Kit build consumes their sources with a shared runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'rolldown';
import { walkSourceFiles } from './source-files.js';
import { compile } from 'svelte/compiler';
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
  'MarkerDetailHistory', 'MarkerDetailRange', 'MarkerReferenceEditor',
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
  const result = await build({
    input: 'getbased:component-entry',
    write: false,
    // HTML rendering needs Svelte's server lifecycle exports, even when the
    // synchronous result is later used by a browser compatibility adapter.
    platform: output === 'html' ? 'neutral' : 'browser',
    plugins: [{
      name: 'getbased-svelte-component',
      resolveId(id, importer) {
        if (id === 'getbased:component-entry') return id;
        if (output === 'html' && id === 'node:async_hooks') return { id, external: true }; // Svelte retains its optional async renderer; this entry exposes only synchronous .body.
        if (importer?.endsWith('.svelte') && id.startsWith('.') && id.endsWith('.js')) return { id, external: true };
        return null;
      },
      async load(id) {
        if (id === 'getbased:component-entry') {
          if (output === 'html') return `import Component from ${JSON.stringify(component)}; import { render } from 'svelte/server'; export const renderHTML = props => render(Component, { props }).body;`;
          const hydration = HYDRATABLE_COMPONENTS.has(path.basename(component, '.svelte')) ? ', hydrate' : '';
          return `export { default } from ${JSON.stringify(component)}; export { mount, unmount, flushSync${hydration} } from 'svelte';`;
        }
        if (!id.endsWith('.svelte')) return null;
        return compileAuthoredComponent(await fs.readFile(id, 'utf8'), id, output);
      },
    }],
    output: { dir: outputDirectory, format: 'es', minify: true, sourcemap: true, entryFileNames: `${path.basename(component)}.${output === 'html' ? 'html' : 'native'}.js` },
  });
  if (output === 'html' && result.output.some(chunk => chunk.type === 'chunk' && (
    chunk.imports.some(id => id.startsWith('node:')) ||
    chunk.dynamicImports.some(id => id.startsWith('node:') && id !== 'node:async_hooks')
  ))) throw new Error('Browser HTML cannot import Node APIs except Svelte’s unused optional asynchronous renderer');
  for (const output of result.output) {
    const file = path.join(outputDirectory, output.fileName);
    const content = output.type === 'chunk' ? output.code : output.source;
    if (check) {
      const existing = await fs.readFile(file);
      if (!existing.equals(Buffer.from(content))) throw new Error(`Svelte output is stale: ${output.fileName}`);
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
    await buildSvelte({ component, check: process.argv.includes('--check') });
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
