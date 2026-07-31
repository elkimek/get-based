// @ts-check
// voice-response-utils.js — readable bounded error extraction for voice clients.

export function voiceErrorText(value, depth = 0) {
  if (depth > 4 || value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(item => voiceErrorText(item, depth + 1)).filter(Boolean).join('; ');
  }
  if (typeof value === 'object') {
    for (const key of ['message', 'detail', 'error', 'reason', 'description']) {
      const result = voiceErrorText(value[key], depth + 1);
      if (result) return result;
    }
  }
  return '';
}

export async function voiceResponseError(response, fallback) {
  const text = await response.text().catch(() => '');
  try {
    return voiceErrorText(JSON.parse(text)) || fallback;
  } catch {
    return text.slice(0, 300) || fallback;
  }
}

export async function expectVoiceResponseOk(response, fallback) {
  if (response.ok) return response;
  throw new Error(await voiceResponseError(response, `${fallback} (${response.status})`));
}
