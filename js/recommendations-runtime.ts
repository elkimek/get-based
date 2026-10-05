// recommendations-runtime.js - Browser runtime adapters for recommendation hooks.

import { configureRuntimeDependencies, scheduleRuntimeTask } from './runtime-callbacks.js';
import { openEMFAssessmentEditor } from './emf-runtime.js';
import type { ProductCatalog } from './recommendations-products.js';
import type { RelevantSnpFinding } from './dna.js';
import type { SnpAnnotation } from './dna-evidence.js';
import type { GenotypeEntry } from './dna-genotype.js';

export interface RecommendationCatalogSlot {
  label?: string;
  card?: string;
  forms?: string[];
  freeActions?: string[] | null;
  foodForms?: string[] | null;
  productForms?: string[] | null;
  formRefs?: Record<string, string> | null;
  [key: string]: unknown;
}
export interface RecommendationCatalog extends ProductCatalog {
  slots: Record<string, RecommendationCatalogSlot>;
  [key: string]: unknown;
}
export type RecommendationInlineSnp = SnpAnnotation
  & Partial<Pick<RelevantSnpFinding, 'rsid' | 'presentation' | 'evidenceProfile'>>
  & { references?: string[] | null };
export interface RecommendationSectionOptions {
  label?: string | undefined;
  maxProducts?: number;
  markerStatus?: unknown;
  inlineSNPs?: RecommendationInlineSnp[] | null;
  [key: string]: unknown;
}
export type RecommendationGenotypeInfo = SnpAnnotation;
export interface RecommendationSnpHint {
  slotKey: string;
  direction: string;
  text: string;
  ref?: string;
  [key: string]: unknown;
}
export interface RecommendationSnpEntry extends SnpAnnotation, GenotypeEntry<RecommendationGenotypeInfo, RecommendationSnpHint> {
  contextCards?: string[];
  [key: string]: unknown;
}
export type RecommendationSnpTable = Record<string, RecommendationSnpEntry>;
// The bridge exposes the actual native exports, so signatures have one owner.
export type RecommendationModuleAPI = Pick<typeof import('./recommendations.js'),
  | 'isProductRecsEnabled' | 'loadCatalog'
  | 'renderRecommendationSection' | 'renderRecommendationSectionSync'
  | 'detectSupplementSlots' | 'detectEMFRelevance'
  | 'getCardSlotKeys' | 'buildDNAHints' | 'renderCardTipsModal'
  | 'renderLightDeviceAffiliateRow'
>;
export interface RecommendationsRuntimeDeps {
  closeModal: (() => unknown) | null;
  openEMFAssessmentEditor: () => unknown;
  openChatPanel: ((prompt?: string) => unknown) | null;
  openProfileLocationEditor: (() => unknown) | null;
  openSettingsModal: ((tab?: string) => unknown) | null;
}
type ModuleFunction = (...args: never[]) => unknown;

const recommendationsRuntimeDeps: RecommendationsRuntimeDeps = {
  closeModal: null,
  openEMFAssessmentEditor,
  openChatPanel: null,
  openProfileLocationEditor: null,
  openSettingsModal: null,
};

const recommendationModuleBridge: Record<string, ModuleFunction> = Object.create(null);
let recommendationsCatalogCache: RecommendationCatalog | null = null;

export function configureRecommendationModuleBridge(api: Record<string, unknown> = {}) {
  const previous: Record<string, ModuleFunction | null> = { ...recommendationModuleBridge };
  for (const name of Object.keys(api)) {
    if (!(name in previous)) previous[name] = null;
  }
  for (const [name, value] of Object.entries(api)) {
    if (typeof value === 'function') {
      recommendationModuleBridge[name] = value as ModuleFunction;
    } else if (value === null) {
      delete recommendationModuleBridge[name];
    }
  }
  return previous;
}

export function getRecommendationModuleFunction<Name extends keyof RecommendationModuleAPI>(name: Name): RecommendationModuleAPI[Name] | null;
export function getRecommendationModuleFunction(name: string): ((...args: unknown[]) => unknown) | null;
export function getRecommendationModuleFunction(name: string) {
  return typeof recommendationModuleBridge[name] === 'function'
    ? recommendationModuleBridge[name] as ((...args: unknown[]) => unknown)
    : null;
}

export function getRecommendationsCatalogCache() {
  return recommendationsCatalogCache;
}

export function setRecommendationsCatalogCache(catalog: RecommendationCatalog | null | undefined) {
  recommendationsCatalogCache = catalog || null;
  return recommendationsCatalogCache;
}

export function configureRecommendationsRuntime(deps: Partial<RecommendationsRuntimeDeps> = {}) {
  return configureRuntimeDependencies(recommendationsRuntimeDeps, deps, ['closeModal', 'openChatPanel', 'openProfileLocationEditor', 'openSettingsModal']);
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? window as Window & { _snpTableCache?: RecommendationSnpTable }
    : null;
}

export function getRecommendationsSnpTable() {
  const runtime = getRuntimeWindow();
  return runtime?._snpTableCache || null;
}

export function isRecommendationsProductRecsEnabled() {
  try {
    return Boolean(getRecommendationModuleFunction('isProductRecsEnabled')?.());
  } catch {
    return false;
  }
}

export async function loadRecommendationsCatalogRuntime() {
  const loadCatalog = getRecommendationModuleFunction('loadCatalog');
  if (!loadCatalog) return null;
  return await loadCatalog();
}

export async function renderRecommendationsDetailSection(slotKey: string, options: RecommendationSectionOptions) {
  const renderRecommendationSection = getRecommendationModuleFunction('renderRecommendationSection');
  if (!renderRecommendationSection) return '';
  return await renderRecommendationSection(slotKey, options);
}

export function closeRecommendationsModal() {
  const closeModal = recommendationsRuntimeDeps.closeModal;
  if (!closeModal) return false;
  closeModal();
  return true;
}

export function openRecommendationsChatPanel(prompt?: string) {
  const openChatPanel = recommendationsRuntimeDeps.openChatPanel;
  if (!openChatPanel) return false;
  openChatPanel(prompt);
  return true;
}

export function openRecommendationsEmfAssessment() {
  void recommendationsRuntimeDeps.openEMFAssessmentEditor();
  return true;
}

export function openRecommendationsLocationEditor() {
  const openProfileLocationEditor = recommendationsRuntimeDeps.openProfileLocationEditor;
  if (!openProfileLocationEditor) return false;
  openProfileLocationEditor();
  return true;
}

export function openRecommendationsPrivacySettings() {
  const openSettingsModal = recommendationsRuntimeDeps.openSettingsModal;
  if (!openSettingsModal) return false;
  openSettingsModal('privacy');
  return true;
}

export function scheduleRecommendationsTask(callback: () => void, delayMs = 0) {
  return scheduleRuntimeTask(callback, delayMs);
}
