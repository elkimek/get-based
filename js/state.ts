// state.js — Centralized mutable application state

import type { AppState } from '../types/app-state.js';
export const state: AppState = {
  chartInstances: {},
  markerRegistry: {},
  importedData: { entries: [], notes: [], supplements: [], healthGoals: [], diagnoses: null, diet: null, exercise: null, sleepRest: null, lightCircadian: null, stress: null, loveLife: null, environment: null, interpretiveLens: '', contextNotes: '', menstrualCycle: null, emfAssessment: null, genetics: null, customMarkers: {}, markerPlacements: {}, markerNotes: {}, markerValueNotes: {}, biologyScoreAI: {}, contextSourceSettings: {}, nutritionContextDays: 30, nutritionTargets: null, nutritionMeals: [], changeHistory: [], importSnapshots: [] },
  unitSystem: 'EU',
  showAltUnits: false,
  selectedCorrelationMarkers: [],
  selectedCorrelationSupplements: [],
  correlationView: {},
  currentProfile: 'default',
  nutritionSummary: null,
  profiles: null,
  profileSex: null,
  profileDob: null,
  chatHistory: [],
  chatThreads: [],
  currentThreadId: null,
  currentChatPersonality: 'default',
  dateRangeFilter: 'all',
  rangeMode: 'optimal',
  suppOverlayMode: 'off',
  noteOverlayMode: 'off',
  phaseOverlayMode: 'off',
  compareDate1: null,
  compareDate2: null,
};

/** Clear profile-scoped comparison controls when switching profiles. */
export function resetCorrelationSelection() {
  state.selectedCorrelationMarkers = [];
  state.selectedCorrelationSupplements = [];
  state.correlationView = {};
}
