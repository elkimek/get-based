// @ts-check
// context-card-dashboard-ai-runtime.js - dependency-light Context hub callbacks

const noopContextStatus = () => {};
let contextStatusHandler = noopContextStatus;

export function configureDashboardAIContextStatus(handler = noopContextStatus) {
  const previous = contextStatusHandler;
  contextStatusHandler = typeof handler === 'function' ? handler : noopContextStatus;
  return previous;
}

export function notifyDashboardAIContextStatusChanged() {
  contextStatusHandler();
}
