export interface VoiceCatalogEntry { id: string; name: string; language: string; descriptor: string; }
interface VoiceCatalogSource { id?: unknown; name?: unknown; language?: unknown; descriptor?: unknown; }

// voice-catalog-storage.js — device-local normalized cloud voice catalogues.

const VOICE_CATALOG_PREFIX = 'labcharts-voice-catalog-';
const MAX_CATALOG_VOICES = 200;

function normalizeVoice(voice: unknown): VoiceCatalogEntry {
  return {
    id: String((voice as VoiceCatalogSource | null | undefined)?.id || ''),
    name: String((voice as VoiceCatalogSource | null | undefined)?.name || ''),
    language: String((voice as VoiceCatalogSource | null | undefined)?.language || ''),
    descriptor: String((voice as VoiceCatalogSource | null | undefined)?.descriptor || ''),
  };
}

export function readVoiceCatalog(provider: string): VoiceCatalogEntry[] {
  try {
    const rows = JSON.parse(localStorage.getItem(`${VOICE_CATALOG_PREFIX}${provider}`) || '[]');
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, MAX_CATALOG_VOICES).map(normalizeVoice).filter(voice => voice.id);
  } catch {
    return [];
  }
}

export function writeVoiceCatalog(provider: string, voices: unknown): VoiceCatalogEntry[] {
  const rows = (Array.isArray(voices) ? voices : [])
    .slice(0, MAX_CATALOG_VOICES)
    .map(normalizeVoice)
    .filter(voice => voice.id);
  try {
    localStorage.setItem(`${VOICE_CATALOG_PREFIX}${provider}`, JSON.stringify(rows));
  } catch {}
  return rows;
}
