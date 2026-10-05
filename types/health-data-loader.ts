export type ChartsModule = typeof import('../js/charts.js');
export type NotesModule = typeof import('../js/notes.js');
export type SupplementsModule = typeof import('../js/supplements.js');
export type RecommendationsModule = typeof import('../js/recommendations.js');
export type CycleModule = typeof import('../js/cycle.js');
export type ContextCardsModule = typeof import('../js/context-cards.js');
export type DnaModule = typeof import('../js/dna.js');
export type NutritionModule = Awaited<ReturnType<typeof import('../js/nutrition-context.js').loadNutritionFeature>>;
export type HealthModule = ChartsModule | NotesModule | SupplementsModule | RecommendationsModule | CycleModule | ContextCardsModule | DnaModule | NutritionModule;
export interface HealthRequirement { load: () => Promise<HealthModule>; ready: () => boolean }
export interface DashboardHealthDataReader {
  dates?: { length?: unknown } | null | undefined;
  categories?: Record<string, { singlePoint?: unknown; singleDate?: unknown } | null | undefined> | null | undefined;
}
export interface DashboardHealthOptions { visibleWidgetIds?: Iterable<unknown> | null | undefined }
export type ChartPluginName = 'refBandPlugin' | 'noteAnnotationPlugin' | 'supplementBarPlugin';
