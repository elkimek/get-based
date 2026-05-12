// state.js — Centralized mutable application state

export const state = {
  chartInstances: {},
  markerRegistry: {},
  importedData: { entries: [], notes: [], supplements: [], healthGoals: [], diagnoses: null, diet: null, exercise: null, sleepRest: null, lightCircadian: null, stress: null, loveLife: null, environment: null, interpretiveLens: '', contextNotes: '', menstrualCycle: null, emfAssessment: null, genetics: null, customMarkers: {}, markerNotes: {}, markerValueNotes: {}, changeHistory: [] },
  unitSystem: 'EU',
  selectedCorrelationMarkers: [],
  currentProfile: 'default',
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

window._labState = state;
