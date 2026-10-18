/** Delegated action data captured before rendering, never an HTML fragment. */
export type NutritionContextActionAttributes = Readonly<Record<`data-${string}`, string>>;
export type NutritionContextActionFactory = (
  action: 'open-nutrition', options: {surface: 'meals' | 'timing'}
) => NutritionContextActionAttributes;

export interface NutritionContextLinkView {
  readonly title: string;
  readonly detail: string;
  readonly surface: 'meals' | 'timing';
  readonly attributes: NutritionContextActionAttributes;
}

/** Snapshot a caller's action data so Svelte never observes provider getters. */
export function captureNutritionContextActionAttributes(attributes: NutritionContextActionAttributes): NutritionContextActionAttributes {
  if (attributes === null || typeof attributes !== 'object' || Array.isArray(attributes)) {
    throw new TypeError('Nutrition action attributes must be a data-attribute object');
  }
  const result: Record<`data-${string}`, string> = {};
  for (const [name, value] of Object.entries(attributes)) {
    if (!/^data-[a-z0-9_.:-]+$/i.test(name) || typeof value !== 'string') {
      throw new TypeError('Nutrition action attributes must contain literal data attributes');
    }
    result[name as `data-${string}`] = value;
  }
  return result;
}
