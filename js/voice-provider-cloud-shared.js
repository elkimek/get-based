// @ts-check
// voice-provider-cloud-shared.js — same-origin hosted voice relay client.

import { expectVoiceResponseOk } from './voice-response-utils.js';

const PROVIDER_LABELS = Object.freeze({
  elevenlabs: 'ElevenLabs',
  openrouter: 'OpenRouter',
  ppq: 'PPQ',
  venice: 'Venice',
  xai: 'xAI',
});

function connectionError(provider) {
  const area = ['openrouter', 'ppq', 'venice'].includes(provider) ? 'AI' : 'Voice';
  return `Connect ${PROVIDER_LABELS[provider] || provider} in Settings → ${area}.`;
}

function relayHeaders(provider, apiKey, contentType) {
  const headers = {
    'X-Voice-Provider': provider,
    Authorization: `Bearer ${apiKey}`,
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

function improveOpenRouterError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/no endpoints available.*(?:guardrail|data policy)/i.test(message)) {
    return new Error(
      'OpenRouter blocked this voice model under your privacy or guardrail settings. '
      + 'Review https://openrouter.ai/settings/privacy.',
    );
  }
  return error;
}

export async function relayTranscription(provider, {
  audio,
  apiKey,
  modelId,
  language = 'auto',
  signal,
}) {
  if (!apiKey) throw new Error(connectionError(provider));
  const form = new FormData();
  if (provider === 'elevenlabs') {
    form.append('model_id', modelId || 'scribe_v2');
  } else if (modelId) {
    form.append('model', modelId);
  }
  if (['openrouter', 'ppq', 'venice'].includes(provider)) {
    form.append('response_format', 'json');
  }
  if (provider === 'ppq' && (!language || language === 'auto')) {
    form.append('language', 'multi');
  } else if (language && language !== 'auto') {
    if (provider === 'xai') form.append('format', 'true');
    form.append(provider === 'elevenlabs' ? 'language_code' : 'language', language);
  }
  form.append('file', audio, `recording.${audio.type?.includes('ogg') ? 'ogg' : audio.type?.includes('mp4') ? 'm4a' : 'webm'}`);
  const response = await fetch('/api/voice?action=stt', {
    method: 'POST',
    headers: relayHeaders(provider, apiKey),
    body: form,
    signal,
  });
  await expectVoiceResponseOk(response, 'Cloud transcription failed');
  const result = await response.json();
  return { text: String(result?.text || '').trim(), language: result?.language_code || result?.language };
}

export async function relaySynthesis(provider, payload) {
  if (!payload.apiKey) throw new Error(connectionError(provider));
  if (provider === 'elevenlabs' && !String(payload.voiceId || '').trim()) {
    throw new Error('Refresh ElevenLabs voices and choose a voice before using Listen.');
  }
  const response = await fetch('/api/voice?action=tts', {
    method: 'POST',
    headers: relayHeaders(provider, payload.apiKey, 'application/json'),
    body: JSON.stringify({
      text: payload.text,
      voiceId: payload.voiceId,
      modelId: payload.modelId,
      language: payload.language,
      rate: payload.rate,
    }),
    signal: payload.signal,
  });
  try {
    await expectVoiceResponseOk(response, 'Cloud speech generation failed');
  } catch (error) {
    throw provider === 'openrouter' ? improveOpenRouterError(error) : error;
  }
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
}

/**
 * @param {string} provider
 * @param {{ apiKey?: string, language?: string, signal?: AbortSignal }} [options]
 */
export async function relayVoices(provider, { apiKey, language = 'auto', signal } = {}) {
  if (!apiKey) return [];
  const response = await fetch('/api/voice?action=voices', {
    method: 'POST',
    headers: relayHeaders(provider, apiKey, 'application/json'),
    body: '{}',
    signal,
  });
  await expectVoiceResponseOk(response, 'Could not list voices');
  const payload = await response.json();
  const rows = provider === 'elevenlabs'
    ? payload?.voices
    : payload?.voices || payload?.data;
  const compatibleRows = provider === 'ppq'
    ? (Array.isArray(rows) ? rows : []).filter(voice => (
      voice?.model_id === 'deepgram_aura_2'
      && (
        !language
        || language === 'auto'
        || voice?.language === 'multi'
        || voice?.language === language
      )
    ))
    : rows;
  return (Array.isArray(compatibleRows) ? compatibleRows : []).map(voice => {
    const rawDescriptor = String(voice?.gender || voice?.labels?.gender || '').toLowerCase();
    const descriptor = rawDescriptor === 'female'
      ? 'female'
      : rawDescriptor === 'male'
        ? 'male'
        : '';
    return {
      id: String(voice?.voice_id || voice?.id || ''),
      name: String(voice?.name || voice?.voice_id || voice?.id || ''),
      language: String(voice?.language || voice?.labels?.language || ''),
      descriptor,
      previewUrl: String(voice?.preview_url || ''),
    };
  }).filter(voice => voice.id);
}

export async function testRelayProvider(provider, options = {}) {
  const voices = await relayVoices(provider, options);
  return {
    ok: true,
    message: `Connected. ${voices.length} voice${voices.length === 1 ? '' : 's'} available.`,
    voices,
  };
}
