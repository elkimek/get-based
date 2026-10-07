// Live domain reads for the Context overview; presentation receives a snapshot.
import { isWearableContextEnabled } from './lab-context-wearables.js';
import { state } from './state.js';
import { getActiveData } from './data.js';
import { getLensSummary } from './lens.js';
import { getMarkerStorageDotKey } from './marker-placement.js';
import { isGeneticsPriorityInAIContext, isGeneticsSummaryInAIContext, isGeneticsInventoryInAIContext, isGroupInAIContext, isInsightContextCardsEnabled, isLabMarkersContextEnabled, isLightSunContextEnabled, isSupplementsMedsContextEnabled, isNutritionContextEnabled, getNutritionContextDays } from './lab-context-settings.js';
import type { LabSourceStats, ContextImportedReader, ContextImportSnapshot, ContextImportMarker, ContextActiveCategoryReader } from '../types/context-card-dashboard-ai-impl.js';
import type { ContextHubSnapshot } from './context-hub-model.js';
function hasGenomeSnpData() {
  const snps = (state.importedData as ContextImportedReader | null | undefined)?.genetics?.snps || {};
  return Object.keys(snps).length > 0;
}

function hasGenomeSummaryData() {
  const genetics = (state.importedData as ContextImportedReader | null | undefined)?.genetics || {};
  return !!(genetics.apoe || genetics.mtdna);
}

function getLabSourceStats(): LabSourceStats {
  const stats: LabSourceStats = { coreMarkers: 0, totalMarkers: 0, groups: [] };
  try {
    const data = getActiveData() as { categories?: Record<string, ContextActiveCategoryReader> };
    const groups = new Map<unknown, { name: unknown; count: number; products: Set<unknown>; sections: Set<unknown> }>();
    const imported = ((state.importedData || {}) as ContextImportedReader);
    const snapshotsById = new Map((imported.importSnapshots || []).filter(s => s?.id).map(s => [(s as ContextImportSnapshot).id, s] as const));
    const sourceProductLabel = (dotKey: string) => {
      const labels = new Set<unknown>();
      for (const entry of imported.entries || []) {
        const source = entry?.markerSources?.[dotKey];
        if (!source?.snapshotId) continue;
        const snapshot = snapshotsById.get(source.snapshotId);
        const label = getImportSnapshotProductLabel(snapshot, dotKey);
        if (label) labels.add(label);
      }
      return [...labels];
    };
    for (const [catKey, cat] of Object.entries(data.categories || {})) {
      const markers = Object.entries(cat.markers || {}).filter(([, m]) => Array.isArray(m.values) && m.values.some(v => v !== null));
      if (markers.length === 0) continue;
      stats.totalMarkers += markers.length;
      if (cat.group) {
        const row = groups.get(cat.group) || { name: cat.group, count: 0, products: new Set<unknown>(), sections: new Set<unknown>() };
        row.count += markers.length;
        if (cat.label) row.sections.add(cat.label);
        for (const [markerKey, marker] of markers) {
          const dotKey = getMarkerStorageDotKey(marker, `${catKey}_${markerKey}`);
          if (!dotKey) continue;
          for (const label of sourceProductLabel(dotKey)) row.products.add(label);
          const cm = imported.customMarkers?.[dotKey];
          const categoryLabel = cm?.categoryLabel;
          if (cat.group === 'Fatty Acids' && categoryLabel && !/^fatty acids$/i.test(categoryLabel as string)) {
            row.products.add(categoryLabel);
          }
        }
        groups.set(cat.group, row);
      } else {
        stats.coreMarkers += markers.length;
      }
    }
    stats.groups = [...groups.entries()]
      .map(([, row]) => ({
        name: row.name,
        count: row.count,
        products: [...row.products].sort((a, b) => (a as { localeCompare(value: unknown): number }).localeCompare(b)),
        sections: [...row.sections].sort((a, b) => (a as { localeCompare(value: unknown): number }).localeCompare(b)),
      }))
      .sort((a, b) => (a.name as { localeCompare(value: unknown): number }).localeCompare(b.name));
  } catch { /* active data can be unavailable during early startup tests */ }
  return stats;
}

function getImportSnapshotProductLabel(snapshot: ContextImportSnapshot | null | undefined, dotKey: unknown) {
  if (!snapshot) return null;
  const marker = Array.isArray(snapshot.markers)
    ? (snapshot.markers as Array<ContextImportMarker | null | undefined>).find(m => (m?.mappedKey || m?.suggestedKey) === dotKey)
    : null;
  const markerProduct = marker?.suggestedCategoryLabel;
  if (markerProduct && !/^fatty acids$/i.test(markerProduct as string)) return String(markerProduct);
  const testType = String(snapshot.testType || '').trim();
  if (!testType || /^blood$/i.test(testType)) return markerProduct || null;
  if (/^fattyacids$/i.test(testType)) return markerProduct || 'Fatty Acids';
  if (/^biostarks$/i.test(testType)) return 'BioStarks';
  return testType;
}

function hasLightSunData() {
  const imported = ((state.importedData || {}) as ContextImportedReader);
  const env = imported.lightEnvironment;
  const hasEnv = (env && Array.isArray(env.rooms) && env.rooms.length > 0)
    || (env && Array.isArray(env.screens) && env.screens.length > 0)
    || (Array.isArray(imported.lightAudits) && imported.lightAudits.length > 0);
  return !!(
    (Array.isArray(imported.sunSessions) && imported.sunSessions.length > 0)
    || (Array.isArray(imported.deviceSessions) && imported.deviceSessions.length > 0)
    || (Array.isArray(imported.lightMeasurements) && imported.lightMeasurements.length > 0)
    || hasEnv
    || imported.sunDefaults?.completedAt
    || imported.lightCircadian
  );
}

function hasWearableContextData() {
  const imported = ((state.importedData || {}) as ContextImportedReader);
  return !!(
    imported.wearableSummary
    || (imported.wearableConnections && Object.keys(imported.wearableConnections).length > 0)
    || (Array.isArray(imported.wearableEvents) && imported.wearableEvents.length > 0)
  );
}

function hasNutritionContextData() {
  return Number((state as { nutritionSummary?: { totalMeals?: unknown } | null }).nutritionSummary?.totalMeals || 0) > 0;
}

function hasMeaningfulContextValue(value: unknown): boolean {
  if (value == null || value === false) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === true) return true;
  if (Array.isArray(value)) return value.some(hasMeaningfulContextValue);
  if (typeof value === 'object') return Object.values(value).some(hasMeaningfulContextValue);
  return false;
}

function hasInsightContextData() {
  const imported = ((state.importedData || {}) as ContextImportedReader);
  return [
    'healthGoals',
    'diagnoses',
    'biometrics',
    'menstrualCycle',
    'diet',
    'exercise',
    'sleepRest',
    'stress',
    'loveLife',
    'environment',
    'emfAssessment',
    'notes',
    'contextNotes',
    'changeHistory',
  ].some(key => hasMeaningfulContextValue(imported[key]));
}

function hasSupplementsMedsData() {
  const imported = ((state.importedData || {}) as ContextImportedReader);
  return hasMeaningfulContextValue(imported.supplements);
}


export function readContextHubSnapshot(): ContextHubSnapshot {
  const labStats = getLabSourceStats();
  const insightOn = isInsightContextCardsEnabled();
  const hasInsight = hasInsightContextData();
  const supplementsOn = isSupplementsMedsContextEnabled();
  const hasSupplements = hasSupplementsMedsData();
  const labOn = isLabMarkersContextEnabled();
  const hasGenome = hasGenomeSnpData();
  const hasGenomeSummary = hasGenomeSummaryData();
  const hasLight = hasLightSunData();
  const hasBody = hasWearableContextData();
  const hasNutrition = hasNutritionContextData();
  const genomeSummaryOn = isGeneticsSummaryInAIContext();
  const genomePriorityOn = isGeneticsPriorityInAIContext();
  const genomeOn = isGeneticsInventoryInAIContext();
  const lightOn = isLightSunContextEnabled();
  const bodyOn = isWearableContextEnabled();
  const nutritionOn = isNutritionContextEnabled();
  const nutritionContextDays = getNutritionContextDays();
  let kbSummary: ReturnType<typeof getLensSummary> | null = null;
  try { kbSummary = getLensSummary(); } catch { /* An unavailable library remains unconfigured. */ }
  return { insightOn, hasInsight, supplementsOn, hasSupplements, labOn, hasGenome, hasGenomeSummary, hasLight, hasBody, hasNutrition, genomeSummaryOn, genomePriorityOn, genomeOn, lightOn, bodyOn, nutritionOn, nutritionContextDays,
    labStats: { ...labStats, groups: labStats.groups.map(group => ({ name: String(group.name), count: group.count, products: group.products.map(String), sections: group.sections.map(String), enabled: isGroupInAIContext(group.name) })) },
    lensSet: !!String(state.importedData.interpretiveLens || '').trim(), kbSet: !!kbSummary?.configured, kbEnabled: !!kbSummary?.enabled, kbName: String(kbSummary?.displayName || 'Knowledge Base') };
}
