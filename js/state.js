// @ts-check
// state.js — Centralized mutable application state

/** @type {import('../types/app-state.js').AppState} */
export const state = {
  chartInstances: {},
  markerRegistry: {},
  importedData: { entries: [], notes: [], supplements: [], healthGoals: [], diagnoses: null, diet: null, exercise: null, sleepRest: null, lightCircadian: null, stress: null, loveLife: null, environment: null, interpretiveLens: '', contextNotes: '', menstrualCycle: null, emfAssessment: null, genetics: null, customMarkers: {}, markerPlacements: {}, markerNotes: {}, markerValueNotes: {}, biologyScoreAI: {}, contextSourceSettings: {}, nutritionTargets: null, nutritionMeals: [], changeHistory: [], importSnapshots: [] },
  unitSystem: 'EU',
  showAltUnits: false,
  selectedCorrelationMarkers: [],
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
