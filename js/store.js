// Simple centralized state store for the application

export const store = {
  state: {
    profile: null,
    importedData: {},
    biomarkers: [],
    chatHistory: [],
    ui: {
      loading: false
    }
  },

  listeners: [],

  setState(partialState) {
    this.state = {
      ...this.state,
      ...partialState
    };

    this.listeners.forEach((listener) => listener(this.state));
  },

  subscribe(listener) {
    this.listeners.push(listener);

    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
};
