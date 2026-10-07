// Presentation only: signal calculations remain in food-contaminants.ts.
import type { FoodContaminantWarning } from './food-contaminants.js';
export interface FoodContaminantSection {
  type: FoodContaminantWarning['type']; title: string; caution: boolean;
  items: Array<{ warning: string; source: string; href: string | null }>;
}
export function foodContaminantSections(warnings: readonly FoodContaminantWarning[]): FoodContaminantSection[] {
  return ([
    { type: 'pesticide', title: '🥬 Pesticide Residues', caution: true },
    { type: 'plastic', title: '🧴 Plastic Chemicals', caution: true },
    { type: 'clean', title: '✅ Low Contamination', caution: false },
  ] as const).map(section => ({ ...section, items: warnings.filter(item => item.type === section.type).map(item => {
    let href: string | null = null;
    try { const url = new URL(item.url); if (url.protocol === 'https:' || url.protocol === 'http:') href = url.href; } catch { /* Keep the source label when its link is invalid. */ }
    return { warning: item.warning, source: item.source, href };
  }) })).filter(section => section.items.length);
}
export function foodContaminantFlaggedCount(warnings: readonly FoodContaminantWarning[]): number {
  return warnings.filter(item => item.type !== 'clean').length;
}
