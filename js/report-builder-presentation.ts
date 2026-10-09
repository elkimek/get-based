/** Literal report setup data. Report selection, snapshots and exports stay in the controller. */
export interface ReportBuilderChoice {
  value: string;
  label: string;
  selected: boolean;
}
export interface ReportBuilderSection {
  id: string;
  label: string;
  checked: boolean;
}
export interface ReportBuilderPreset {
  id: string;
  label: string;
  subtitle: string;
  active: boolean;
}
export interface ReportBuilderCategory {
  key: string;
  label: string;
  checked: boolean;
  priority: boolean;
  summary: string;
}
export interface ReportBuilderNote {
  index: number;
  date: string;
  text: string;
}
export interface ReportBuilderView {
  overlayId: string;
  presetId: string;
  description: string;
  presets: ReportBuilderPreset[];
  dateOptions: ReportBuilderChoice[];
  rangeOptions: ReportBuilderChoice[];
  sections: ReportBuilderSection[];
  categories: ReportBuilderCategory[];
  contextTitles: string[];
  notes: ReportBuilderNote[];
  aiAvailable: boolean;
}
export interface ReportBuilderInput {
  overlayId: string;
  presetId: unknown;
  preset: {description?: unknown; dateRange?: unknown; sections?: readonly string[]};
  presets: Array<{id: string; label: unknown; subtitle: unknown}>;
  dateOptions: Array<{value: string; label: unknown}>;
  rangeOptions: Array<{value: string; label: unknown}>;
  rangeMode: unknown;
  sections: Array<{id: string; label: unknown}>;
  categories: Array<{key: string; label: unknown; markerCount: number; flaggedCount: number}>;
  selectedCategoryKeys: readonly string[];
  contextTitles: unknown[];
  notes: Array<{date?: unknown; text?: unknown}>;
  aiAvailable: boolean;
}

const text = (value: unknown): string => value == null ? '' : String(value);

export function projectReportBuilder(input: ReportBuilderInput): ReportBuilderView {
  const selectedSections = new Set(input.preset.sections);
  const selectedCategories = new Set(input.selectedCategoryKeys);
  return {
    overlayId: input.overlayId,
    presetId: text(input.presetId),
    description: text(input.preset.description),
    presets: input.presets.map(preset => ({
      id: preset.id,
      label: text(preset.label),
      subtitle: text(preset.subtitle),
      active: preset.id === input.presetId,
    })),
    dateOptions: input.dateOptions.map(option => ({
      value: option.value,
      label: text(option.label),
      selected: input.preset.dateRange === option.value,
    })),
    rangeOptions: input.rangeOptions.map(option => ({
      value: option.value,
      label: text(option.label),
      selected: input.rangeMode === option.value,
    })),
    sections: input.sections.map(section => ({
      id: section.id,
      label: text(section.label),
      checked: selectedSections.has(section.id),
    })),
    categories: input.categories.map(category => {
      const markers = `${category.markerCount} marker${category.markerCount === 1 ? '' : 's'}`;
      return {
        key: category.key,
        label: text(category.label),
        checked: selectedCategories.has(category.key),
        priority: category.flaggedCount > 0,
        summary: category.flaggedCount > 0 ? `${markers} · ${category.flaggedCount} flagged` : markers,
      };
    }),
    contextTitles: input.contextTitles.map(text),
    notes: input.notes.map((note, index) => ({note, index}))
      .sort((a, b) => String(b.note.date || '').localeCompare(String(a.note.date || '')))
      .map(({note, index}) => ({index, date: text(note.date || 'Undated'), text: text(note.text || '')})),
    aiAvailable: input.aiAvailable,
  };
}
