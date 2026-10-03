import type { VoiceConnectionResult, LocalVoiceConnectionOptions, LocalVoiceSynthesisOptions, LocalVoiceTranscriptionOptions, VoiceModelRow, VoiceTranscript } from '../types/voice-provider.js';

// voice-provider-local-server.js — direct OpenAI-compatible local voice adapter.

import { expectVoiceResponseOk } from './voice-response-utils.js';
import { requireAIProcessingApproval } from './cloud-ai-consent.js';

function endpoint(baseUrl: string | undefined, path: string) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('Set a local voice server URL in Settings → Voice.');
  return `${base}${path}`;
}

function authHeaders(apiKey: string | undefined, extra: Record<string, string> = {}) {
  return apiKey ? { ...extra, Authorization: `Bearer ${apiKey}` } : extra;
}

export const localServerVoiceProvider = {
  id: 'local-server',
  async transcribe({ audio, baseUrl, apiKey, modelId = 'whisper-1', language = 'auto', signal }: LocalVoiceTranscriptionOptions) {
    await requireAIProcessingApproval('local-server', { kind: 'voice-input', endpoint: baseUrl, modelId });
    const form = new FormData();
    form.append('model', modelId);
    if (language && language !== 'auto') form.append('language', language);
    form.append('file', audio, `recording.${audio.type?.includes('ogg') ? 'ogg' : audio.type?.includes('mp4') ? 'm4a' : 'webm'}`);
    const response = await fetch(endpoint(baseUrl, '/v1/audio/transcriptions'), {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: form,
      signal,
    } as RequestInit);
    await expectVoiceResponseOk(response, 'Local transcription failed');
    const result = await response.json() as VoiceTranscript;
    return { text: String(result?.text || '').trim(), language: result?.language };
  },
  async synthesize({
    text,
    baseUrl,
    apiKey,
    modelId = 'tts-1',
    voiceId = 'alloy',
    rate = 1,
    signal,
  }: LocalVoiceSynthesisOptions) {
    await requireAIProcessingApproval('local-server', { kind: 'voice-output', endpoint: baseUrl, modelId });
    const response = await fetch(endpoint(baseUrl, '/v1/audio/speech'), {
      method: 'POST',
      headers: authHeaders(apiKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        model: modelId,
        voice: voiceId,
        input: text,
        speed: rate,
        response_format: 'mp3',
      }),
      signal,
    } as RequestInit);
    await expectVoiceResponseOk(response, 'Local speech generation failed');
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    if (response.body) {
      return {
        stream: response.body,
        contentType,
      };
    }
    return {
      audio: await response.blob(),
      contentType,
    };
  },
  async listModels(_kind: string, { baseUrl, apiKey, signal }: LocalVoiceConnectionOptions = {}) {
    const response = await fetch(endpoint(baseUrl, '/v1/models'), {
      headers: authHeaders(apiKey),
      signal,
    } as RequestInit);
    await expectVoiceResponseOk(response, 'Could not list local voice models');
    const payload = await response.json() as { data?: VoiceModelRow[] | null };
    return (Array.isArray(payload?.data) ? payload.data : []).map(model => ({
      id: String(model?.id || ''),
      label: String(model?.name || model?.id || ''),
    })).filter(model => model.id);
  },
  listVoices() {
    return Promise.resolve([]);
  },
  async testConnection({ baseUrl, apiKey, signal }: LocalVoiceConnectionOptions = {}): Promise<VoiceConnectionResult> {
    const models = await this.listModels('stt', { baseUrl, apiKey, signal });
    return { ok: true, message: `Connected. ${models.length} model${models.length === 1 ? '' : 's'} reported.` };
  },
};

export default localServerVoiceProvider;
