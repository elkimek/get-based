// Presentation values only. Provider credentials and endpoint configuration stay in services.
export interface NutritionAIOption {
  value: string;
  label: string;
}
export interface NutritionAISettingsSnapshot {
  selectedValue: string;
  automaticLabel: string;
  automaticDisabled: boolean;
  providerDisplay: string;
  groups: readonly {
    label: string;
    options: readonly NutritionAIOption[];
  }[];
}
export interface NutritionAISettingsComponentView {
  refresh(snapshot: NutritionAISettingsSnapshot): void;
}
export interface NutritionAISettingsView extends NutritionAISettingsComponentView {
  isCurrent(): boolean;
}
