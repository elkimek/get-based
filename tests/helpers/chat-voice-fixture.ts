import type { BrowserContext } from '@playwright/test';
export type Fixture = { starts: number; stops: number; mediaCalls: number; holdPermission: boolean; permission?: () => void; holdTranscript: boolean; transcript?: () => void; holdSpeech: boolean; speech?: () => void; finishAudio?: () => void; playedAudio: string[]; requests: string[]; };
export async function installChatVoiceFixture(context: BrowserContext): Promise<void> {
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-analytics-consent-seen', '1'); localStorage.setItem('labcharts-ai-provider', 'ollama'); localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-07T00:00:00Z', appVersion: 'test', location: 'local-test' }));
    localStorage.setItem('labcharts-ai-transparency-acknowledgement', JSON.stringify({ version: '2026-08-31', acknowledged: true }));
    localStorage.setItem('labcharts-voice-input-provider', 'local-server'); localStorage.setItem('labcharts-voice-output-provider', 'local-server'); localStorage.setItem('labcharts-voice-local-server-url', 'http://127.0.0.1:8765');
    const fixture: Fixture = { starts: 0, stops: 0, mediaCalls: 0, holdPermission: false, holdTranscript: false, holdSpeech: false, playedAudio: [], requests: [] };
    Object.assign(window, { voiceFixture: fixture });
    class Recorder extends EventTarget {
      state = 'inactive'; mimeType = 'audio/webm'; static isTypeSupported() { return true; }
      start() { fixture.starts++; this.state = 'recording'; }
      stop() { const event = new Event('dataavailable'); Object.defineProperty(event, 'data', { value: new Blob(['original voice bytes'], { type: this.mimeType }) }); this.dispatchEvent(event); this.state = 'inactive'; this.dispatchEvent(new Event('stop')); }
    }
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { fixture.mediaCalls++; if (fixture.holdPermission) await new Promise<void>(resolve => { fixture.permission = resolve; }); return { getTracks: () => [{ stop: () => { fixture.stops++; } }] }; } } });
    class Audio extends EventTarget { paused = true; src = ''; playbackRate = 1; play() { this.paused = false; fixture.playedAudio.push(this.src); fixture.finishAudio = () => { this.paused = true; this.dispatchEvent(new Event('ended')); }; return Promise.resolve(); } pause() { this.paused = true; } removeAttribute() { } load() { } }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder }); Object.defineProperty(window, 'Audio', { configurable: true, value: Audio }); Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined }); Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (source: unknown) => source instanceof Blob ? 'blob:voice-audio' : 'blob:voice-prime' }); Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => { } });
    const fetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const url = String(input instanceof Request ? input.url : input); if (!url.startsWith('http://127.0.0.1:8765/')) return fetch(input, options);
      fixture.requests.push(url);
      if (url.endsWith('/audio/transcriptions')) { if (fixture.holdTranscript) await new Promise<void>(resolve => { fixture.transcript = resolve; }); return Response.json({ text: 'check my ferritin' }); }
      if (fixture.holdSpeech) await new Promise<void>(resolve => { fixture.speech = resolve; });
      return new Response(new Blob(['synthetic voice'], { type: 'audio/wav' }), { headers: { 'Content-Type': 'audio/wav' } });
    };
  });
}
