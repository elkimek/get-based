export function errorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error ? error : fallback;
}

export function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return typeof error.code === 'string' ? error.code : '';
}

export function createErrorWithCode<T>(code: T, message?: string): Error & { code: T } {
  return Object.assign(new Error(message), { code });
}
