// @ts-check
// caught-error.js — Safe normalization for values crossing catch boundaries.

/**
 * Read one field without assuming JavaScript callers throw Error instances.
 *
 * @param {unknown} error
 * @param {string} field
 * @returns {unknown}
 */
function readCaughtField(error, field) {
  if ((typeof error !== 'object' || error === null) && typeof error !== 'function') {
    return undefined;
  }
  try {
    return /** @type {Record<string, unknown>} */ (error)[field];
  } catch {
    return undefined;
  }
}

/**
 * @param {unknown} error
 * @param {unknown} [fallback]
 */
export function getErrorMessage(error, fallback = 'Unknown error') {
  const fallbackMessage = () => {
    if (fallback === undefined || fallback === null || fallback === '') return 'Unknown error';
    try {
      const text = String(fallback);
      return text && text !== '[object Object]' ? text : 'Unknown error';
    } catch {
      return 'Unknown error';
    }
  };
  if (typeof error === 'string') return error || fallbackMessage();
  const message = readCaughtField(error, 'message');
  if (message !== undefined && message !== null) {
    try {
      return String(message) || fallbackMessage();
    } catch {}
  }
  return fallbackMessage();
}

/** @param {unknown} error */
export function getErrorName(error) {
  const name = readCaughtField(error, 'name');
  return typeof name === 'string' ? name : '';
}

/** @param {unknown} error */
export function getErrorStatus(error) {
  const status = readCaughtField(error, 'status');
  if (typeof status === 'number' && Number.isFinite(status)) return status;
  if (typeof status === 'string' && status.trim()) {
    const parsed = Number(status);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** @param {unknown} error */
export function getErrorCode(error) {
  const code = readCaughtField(error, 'code');
  if (typeof code === 'string' || typeof code === 'number') return code;
  return null;
}
