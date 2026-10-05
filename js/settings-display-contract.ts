import type { AppState } from '../types/app-state.js';

export interface DisplayPreferences {
  unitSystem: AppState['unitSystem'];
  showAltUnits: boolean;
  rangeMode: AppState['rangeMode'];
  timeFormat: '12h' | '24h';
  productRecs: boolean;
  debugMode: boolean;
  version: string;
}
