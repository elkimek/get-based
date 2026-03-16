// state.js — Centralized mutable application state

export const state = {
  chartInstances: {},
  markerRegistry: {},
  importedData: {
    entries: [],
    notes: [],
    supplements: [],
    healthGoals: [],
    diagnoses: null,
    diet: null,
    exercise: null,
    sleepRest: null,
    lightCircadian: null,
    stress: null,
    loveLife: null,
    environment: null,
    interpretiveLens: '',
    contextNotes: '',
    menstrualCycle: null,
    emfAssessment: null,
    genetics: null,
    customMarkers: {}
  },
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

const stateListeners = new Set();

export function subscribeToState(listener) {
  if (typeof listener !== 'function') return () => {};
  stateListeners.add(listener);

  return () => {
    stateListeners.delete(listener);
  };
}

export function notifyStateChange() {
  for (const listener of stateListeners) {
    try {
      listener(state);
    } catch (error) {
      console.error('State listener error:', error);
    }
  }
}

export function updateState(patch) {
  if (!patch || typeof patch !== 'object') return;
  Object.assign(state, patch);
  notifyStateChange();
}

window._labState = state;
window._notifyStateChange = notifyStateChange;
window._updateState = updateState;
