// @ts-check

export function errorMessage(error, fallback = 'Unknown error') {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error ? error : fallback;
}

export function errorCode(error) {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return typeof error.code === 'string' ? error.code : '';
}

export function createErrorWithCode(code, message) {
  return Object.assign(new Error(message), { code });
}
