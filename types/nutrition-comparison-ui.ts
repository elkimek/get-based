import type { analyzeMealPhoto, mealImagesFromPreparedPhotos, MealAnalysisPromptOptions } from '../js/nutrition-analysis.js';
import type { listNutritionVisionModels, NutritionAIRoute } from '../js/nutrition-ai-settings.js';
import type { MealReferenceInput } from '../js/nutrition-comparison.js';
import type { ComparisonAnalysisView } from '../js/nutrition-comparison-results.js';
import type { NutritionRequestLifecycleDependencies, startNutritionComparisonRequest, isNutritionComparisonRequestActive, finishNutritionComparisonRequest } from '../js/nutrition-request-lifecycle.js';

export type ComparisonModel = ReturnType<typeof listNutritionVisionModels>[number];
export type ComparisonImages = ReturnType<typeof mealImagesFromPreparedPhotos>;
export type ComparisonFiles = Extract<Parameters<typeof analyzeMealPhoto>[0], File[]>;

// Persistence keeps analysis and extra result metadata opaque. The controller
// rebuilds routing, labels, status, duration, and the in-memory image envelope.
export interface ComparisonResultReader {
  analysis?: unknown;
  [key: string]: unknown;
}
export type ComparisonEstimateResult = ComparisonResultReader & {
  image: ComparisonImages[number] | null;
  images: ComparisonImages;
};
export type ComparisonRun = {
  route: NutritionAIRoute;
  providerLabel: ComparisonModel['providerDisplay'];
  modelLabel: ComparisonModel['modelDisplay'];
  status: string;
  result: ComparisonResultReader | null;
  error: string;
  durationMs: number;
};
export type ComparisonRunContext = MealAnalysisPromptOptions;
export type ComparisonManualReference = MealReferenceInput;

export interface NutritionComparisonUIDependencies {
  analysisFiles: () => ComparisonFiles | Promise<ComparisonFiles>;
  hasPhotos: () => unknown;
  startRequest: typeof startNutritionComparisonRequest;
  isRequestActive: typeof isNutritionComparisonRequestActive;
  finishRequest: typeof finishNutritionComparisonRequest;
  updateCorrectionState: () => unknown;
  getConsumption: NutritionRequestLifecycleDependencies['getConsumption'];
  getUserContext: NutritionRequestLifecycleDependencies['getUserContext'];
  getAnalysisKind: NutritionRequestLifecycleDependencies['getAnalysisKind'];
  applyAnalysis: (result: ComparisonEstimateResult, options: { quiet: boolean }) => unknown;
  beforeApplyAnalysis: () => unknown;
  setStatus: NutritionRequestLifecycleDependencies['setStatus'];
}

// These are localized property readers, not validators of decrypted JSON.
export interface StoredComparisonSnapshotReader {
  version?: unknown;
  runs?: unknown;
  manualReference?: unknown;
  runContext?: unknown;
  referenceRunIndex?: unknown;
  savedAt?: unknown;
}
export interface StoredComparisonRunReader {
  route?: { provider?: unknown; model?: unknown } | null;
  result?: ComparisonResultReader | null;
  providerLabel?: unknown;
  modelLabel?: unknown;
  error?: unknown;
  durationMs?: unknown;
}
export type ComparisonReferenceAnalysisReader = Pick<ComparisonAnalysisView, 'mealName' | 'nutrients'> & {
  components?: readonly ({ name?: unknown } | null | undefined)[] | null;
};
export interface ComparisonResultsReaderOptions {
  runs: readonly ComparisonRun[];
  reference: ComparisonManualReference;
  referenceRun: ComparisonRun | null;
  referenceRunIndex: number | null;
  isRestored: boolean;
}
