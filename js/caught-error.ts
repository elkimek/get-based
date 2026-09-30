// Values crossing catch boundaries may have hostile getters or conversions.
function readCaughtField(error: unknown, field: string): unknown {
  if ((typeof error !== 'object' || error === null) && typeof error !== 'function') return undefined;
  try { return (error as Record<string, unknown>)[field]; } catch { return undefined; }
}

export function getErrorMessage(error: unknown, fallback: unknown = 'Unknown error'): string {
  const fallbackMessage = () => {
    if (fallback === undefined || fallback === null || fallback === '') return 'Unknown error';
    try {
      const text = String(fallback);
      return text && text !== '[object Object]' ? text : 'Unknown error';
    } catch { return 'Unknown error'; }
  };
  if (typeof error === 'string') return error || fallbackMessage();
  const message = readCaughtField(error, 'message');
  if (message !== undefined && message !== null) {
    try { return String(message) || fallbackMessage(); } catch {}
  }
  return fallbackMessage();
}

export function getErrorName(error: unknown): string {
  const name = readCaughtField(error, 'name');
  return typeof name === 'string' ? name : '';
}

export function getErrorStatus(error: unknown): number | null {
  const status = readCaughtField(error, 'status');
  if (typeof status === 'number' && Number.isFinite(status)) return status;
  if (typeof status === 'string' && status.trim()) {
    const parsed = Number(status);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function getErrorCode(error: unknown): string | number | null {
  const code = readCaughtField(error, 'code');
  return typeof code === 'string' || typeof code === 'number' ? code : null;
}
