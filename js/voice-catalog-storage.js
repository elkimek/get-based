// @ts-check
// voice-catalog-storage.js — device-local normalized cloud voice catalogues.

const VOICE_CATALOG_PREFIX = 'labcharts-voice-catalog-';
const MAX_CATALOG_VOICES = 200;

function normalizeVoice(voice) {
  return {
    id: String(voice?.id || ''),
    name: String(voice?.name || ''),
    language: String(voice?.language || ''),
    gender: String(voice?.gender || ''),
  };
}

export function readVoiceCatalog(provider) {
  try {
    const rows = JSON.parse(localStorage.getItem(`${VOICE_CATALOG_PREFIX}${provider}`) || '[]');
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, MAX_CATALOG_VOICES).map(normalizeVoice).filter(voice => voice.id);
  } catch {
    return [];
  }
}

export function writeVoiceCatalog(provider, voices) {
  const rows = (Array.isArray(voices) ? voices : [])
    .slice(0, MAX_CATALOG_VOICES)
    .map(normalizeVoice)
    .filter(voice => voice.id);
  try {
    localStorage.setItem(`${VOICE_CATALOG_PREFIX}${provider}`, JSON.stringify(rows));
  } catch {}
  return rows;
}
