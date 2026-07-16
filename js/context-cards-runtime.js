// @ts-check
// context-cards-runtime.js - Explicit callbacks for context-card integrations.

/** @type {Record<string, Function | null>} */
const contextCardsRuntimeCallbacks = {
  onContextCardSaved: null,
  openContextModal: null,
  openInterpretiveLensEditor: null,
  recordChange: null,
  triggerDNAFilePicker: null,
};

/** @param {Record<string, any>} [callbacks] */
export function configureContextCardsRuntimeCallbacks(callbacks = {}) {
  const previous = { ...contextCardsRuntimeCallbacks };
  for (const name of Object.keys(contextCardsRuntimeCallbacks)) {
    if (name in callbacks) {
      contextCardsRuntimeCallbacks[name] = typeof callbacks[name] === 'function'
        ? callbacks[name]
        : null;
    }
  }
  return previous;
}

function callContextCardsRuntime(name, ...args) {
  const callback = contextCardsRuntimeCallbacks[name];
  if (typeof callback !== 'function') return false;
  try {
    callback(...args);
    return true;
  } catch {
    return false;
  }
}

export function openContextModalRuntime() {
  return callContextCardsRuntime('openContextModal');
}

export function notifyContextCardSavedRuntime() {
  return callContextCardsRuntime('onContextCardSaved');
}

export function openInterpretiveLensEditorRuntime() {
  return callContextCardsRuntime('openInterpretiveLensEditor');
}

/** @param {string} field */
export function recordContextCardChangeRuntime(field) {
  return callContextCardsRuntime('recordChange', field);
}

export function triggerContextCardDNAFilePickerRuntime() {
  return callContextCardsRuntime('triggerDNAFilePicker');
}
