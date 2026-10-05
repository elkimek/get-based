import type { configureNutritionRequestLifecycle } from '../js/nutrition-request-lifecycle.js';
import type { normalizeNutritionComponent } from '../js/nutrition-food-data.js';
import type { mealLocalDateTime } from '../js/nutrition-render.js';
import type { photoEstimateNutrientBasis } from '../js/nutrition-photo-provenance.js';

// Private consumed operations, not validated saved or AI result contracts.
// Original unchecked property/method reads and malformed errors are preserved.
export type ComponentOperations = NonNullable<Parameters<typeof normalizeNutritionComponent>[0]>;
export interface ImageOperations { thumbnailUrl?: unknown; dataUrl?: unknown; qualityWarnings?: unknown[] | null }
interface LabelOperations { consumedAmount?: unknown; consumedUnit?: unknown }
interface ReviewOperations extends Record<string, unknown> {
 editedNutrients?: unknown[] | null; editedComponentIdentities?: unknown[] | null;
 editedPortions?: unknown; removedComponents?: unknown[] | null; userContext?: unknown;
}
export interface SourceOperations extends NonNullable<Parameters<typeof photoEstimateNutrientBasis>[0]>, Record<string, unknown> {
 kind?: unknown; review?: ReviewOperations | null; label?: LabelOperations | null;
}
export interface AnalysisOperations {
 analysis: {mealName?: unknown; nutrients: Record<string, unknown>; components: (ComponentOperations | null | undefined)[]; confidence?: unknown; assumptions?: unknown[] | null; warnings?: unknown[] | null; label?: LabelOperations | null};
 source?: SourceOperations | null; image?: ImageOperations | null; images?: ImageOperations[] | null;
}
export type MealOperations = NonNullable<Parameters<typeof mealLocalDateTime>[0]> & {
 id?: unknown; createdAt?: unknown; source?: SourceOperations | null;
 components?: (ComponentOperations | null | undefined)[] | null; nutrients?: Record<string, unknown> | null;
 assumptions?: unknown[] | null; warnings?: unknown[] | null; analysisContext?: unknown;
};
export interface NutritionEditorOptions {seedMeal?: unknown; mode?: unknown; returnTo?: unknown; returnMealId?: unknown; returnMealOrigin?: unknown}

export type RequestLifecycleReader = (dependencies: Omit<NonNullable<Parameters<typeof configureNutritionRequestLifecycle>[0]>, 'getExistingImages'> & {getExistingImages: () => ImageOperations[]}) => ReturnType<typeof configureNutritionRequestLifecycle>;
