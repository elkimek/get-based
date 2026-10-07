// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { captureControl, speechControl, INITIAL_CHAT_CAPTURE, type ChatCaptureView } from '../js/chat-voice-contract.js';
import { ownChatCapture, publishChatCapture, configureChatVoiceCancellation, setChatVoiceAvailable } from '../js/chat-voice-view.js';
import { VoiceCaptureSession } from '../js/voice-capture.js';
import { configureChatSpeechAction, renderChatSpeechButton, publishChatSpeech } from '../js/chat-speech-component.js';
import { registerChatComposerInput } from '../js/chat-composer-input-port.js';
const services = vi.hoisted(() => ({ privacy: vi.fn(async () => { }), transcribe: vi.fn(async (_audio: Blob, _options: { settings: { inputProvider: string; localServerUrl: string; }; signal: AbortSignal; }) => ({ text: 'dictated', providerId: 'local-server' })) }));
vi.mock('../js/voice-service.js', () => ({ ensureVoiceRequestPrivacy: services.privacy, transcribeVoice: services.transcribe, getVoiceProviderId: (_: string, settings: { inputProvider: string; }) => settings.inputProvider, createVoiceSynthesizer: vi.fn() }));
import { toggleVoiceRecording, stopVoiceActivity } from '../js/voice-controller.js';
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
class Recorder extends EventTarget {
  static starts = 0;
  static isTypeSupported() { return true; }
  state: RecordingState = 'inactive'; mimeType = 'audio/webm';
  start() { Recorder.starts++; this.state = 'recording'; }
  stop() { const event = new Event('dataavailable'); Object.defineProperty(event, 'data', { value: new Blob(['original audio']) }); this.dispatchEvent(event); this.state = 'inactive'; this.dispatchEvent(new Event('stop')); }
}
let dispose: (() => void) | undefined;
let input: HTMLTextAreaElement, render: ReturnType<typeof vi.fn<(view: ChatCaptureView) => void>>;
const tracks = vi.fn();
function stream() { return { getTracks: () => [{ stop: tracks }] } as unknown as MediaStream; }
beforeEach(() => {
  localStorage.clear(); localStorage.setItem('labcharts-voice-input-provider', 'local-server');
  document.body.innerHTML = '<div data-chat-voice-view><textarea id="chat-input">Draft:</textarea></div><div id="notification-container"></div>';
  state.currentProfile = 'voice-origin'; state.currentThreadId = 'voice-thread';
  input = document.getElementById('chat-input') as HTMLTextAreaElement;
  input.setSelectionRange(input.value.length, input.value.length);
  const registered = registerChatComposerInput(input);
  render = vi.fn(); const owned = ownChatCapture(input.parentElement!, render);
  dispose = () => { owned.destroy(); registered.destroy(); };
  configureChatVoiceCancellation(() => stopVoiceActivity({ preservePlayback: true })); setChatVoiceAvailable(true);
  tracks.mockClear(); Recorder.starts = 0; services.privacy.mockReset().mockResolvedValue(undefined); services.transcribe.mockReset().mockResolvedValue({ text: 'dictated', providerId: 'local-server' });
  vi.stubGlobal('MediaRecorder', Recorder); vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream()) } });
});
afterEach(() => { stopVoiceActivity(); dispose?.(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('owned Chat capture lifetimes', () => {
  it('keeps active operations cancellable even when backend availability changes', () => {
    for (const mode of ['preparing', 'requesting', 'transcribing', 'recording'] as const) expect(captureControl({ ...INITIAL_CHAT_CAPTURE, mode, available: false }).disabled).toBe(false);
    expect(captureControl({ ...INITIAL_CHAT_CAPTURE, available: false }).disabled).toBe(true);
    expect(speechControl('waiting')).toMatchObject({ text: 'Still generating…', label: 'Cancel speech generation', pressed: true });
  });
  it('inserts only in its original composer and dispatches one draft input event', async () => {
    const changed = vi.fn(); input.addEventListener('input', changed);
    expect(await toggleVoiceRecording()).toBe(true); expect(render.mock.lastCall?.[0].mode).toBe('recording');
    expect(await toggleVoiceRecording()).toBe(true); expect(input.value).toBe('Draft: dictated'); expect(changed).toHaveBeenCalledOnce(); expect(tracks).toHaveBeenCalledOnce(); expect(render.mock.lastCall?.[0].mode).toBe('idle');
  });
  it('cancels the microphone when Chat becomes unavailable and retains the disabled view', async () => {
    await toggleVoiceRecording(); setChatVoiceAvailable(false);
    expect(tracks).toHaveBeenCalledOnce();
    expect(render.mock.lastCall?.[0]).toMatchObject({ mode: 'idle', available: false });
    expect(captureControl(render.mock.lastCall![0]).disabled).toBe(true);
    setChatVoiceAvailable(true); expect(captureControl(render.mock.lastCall![0]).disabled).toBe(false);
  });
  it('cancels preparation without requesting a microphone after late privacy assent', async () => {
    const consent = deferred<void>(); services.privacy.mockReturnValue(consent.promise);
    const pending = toggleVoiceRecording(); expect(render.mock.lastCall?.[0].mode).toBe('preparing');
    expect(await toggleVoiceRecording()).toBe(false); consent.resolve(); expect(await pending).toBe(false);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled(); expect(render.mock.lastCall?.[0].mode).toBe('idle');
  });
  it('stops a late permission stream without starting a recorder', async () => {
    const permission = deferred<MediaStream>(); vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(permission.promise);
    const pending = toggleVoiceRecording(); await vi.waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());
    await toggleVoiceRecording(); permission.resolve(stream()); expect(await pending).toBe(false); expect(Recorder.starts).toBe(0); expect(tracks).toHaveBeenCalledOnce();
  });
  it.each(['profile', 'thread', 'input', 'owner'] as const)('rejects late transcription after %s retirement', async boundary => {
    const transcript = deferred<{ text: string; providerId: string; }>(); services.transcribe.mockReturnValue(transcript.promise);
    await toggleVoiceRecording(); const pending = toggleVoiceRecording(); await vi.waitFor(() => expect(services.transcribe).toHaveBeenCalledOnce());
    if (boundary === 'profile') state.currentProfile = 'other'; else if (boundary === 'thread') state.currentThreadId = 'other'; else if (boundary === 'input') { const replacement = document.createElement('textarea'); replacement.id = 'chat-input'; replacement.value = 'Other draft'; input.replaceWith(replacement); } else dispose?.();
    transcript.resolve({ text: 'must not appear', providerId: 'local-server' }); expect(await pending).toBe(false);
    expect(input.value).toBe('Draft:'); expect(document.getElementById('chat-input')?.textContent).not.toContain('must not appear'); expect(tracks).toHaveBeenCalledOnce();
  });
  it('keeps a cancelled provider reply from overwriting a newer recording or its ticker', async () => {
    vi.useFakeTimers(); const late = deferred<{ text: string; providerId: string; }>(); services.transcribe.mockReturnValueOnce(late.promise);
    await toggleVoiceRecording(); const pending = toggleVoiceRecording(); await Promise.resolve(); await Promise.resolve();
    await toggleVoiceRecording(); await toggleVoiceRecording(); late.reject(new Error('obsolete error')); expect(await pending).toBe(false);
    expect(render.mock.lastCall?.[0].mode).toBe('recording'); vi.advanceTimersByTime(2000); expect(render.mock.lastCall?.[0].text).toContain('0:02'); expect(input.value).toBe('Draft:');
  });
  it('freezes the disclosed provider and endpoint for the recording', async () => {
    localStorage.setItem('labcharts-voice-local-server-url', 'http://127.0.0.1:8765'); await toggleVoiceRecording();
    localStorage.setItem('labcharts-voice-input-provider', 'openrouter'); localStorage.setItem('labcharts-voice-local-server-url', 'http://127.0.0.1:9999'); await toggleVoiceRecording();
    expect(services.transcribe.mock.calls[0]?.[1]).toMatchObject({ settings: { inputProvider: 'local-server', localServerUrl: 'http://127.0.0.1:8765' } });
  });
  it('cancels capture and releases subscriptions when the owned composer is disposed', async () => {
    await toggleVoiceRecording(); dispose?.(); expect(tracks).toHaveBeenCalledOnce(); const count = render.mock.calls.length; publishChatCapture('recording', 'stale'); expect(render).toHaveBeenCalledTimes(count);
  });
  it('discards cancelled microphone permission and cleans up a recorder startup failure', async () => {
    const permission = deferred<MediaStream>(); const session = new VoiceCaptureSession({ mediaDevices: { getUserMedia: () => permission.promise } as MediaDevices, MediaRecorderClass: Recorder as unknown as typeof MediaRecorder });
    const pending = session.start(); session.cancel(); permission.resolve(stream()); await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(Recorder.starts).toBe(0); expect(tracks).toHaveBeenCalledOnce();
    class Broken extends Recorder { override start() { throw new Error('start failed'); } }
    const broken = new VoiceCaptureSession({ mediaDevices: { getUserMedia: async () => stream() } as MediaDevices, MediaRecorderClass: Broken as unknown as typeof MediaRecorder });
    await expect(broken.start()).rejects.toThrow('start failed'); expect(broken.recorder).toBeNull(); expect(broken.stream).toBeNull(); expect(tracks).toHaveBeenCalledTimes(2);
  });
});

it('hydrates one speech view without replacing focused controls and rejects retired message owners', async () => {
  state.chatHistory = [{ role: 'assistant', content: 'Original reply' }];
  const host = document.createElement('div'); host.innerHTML = renderChatSpeechButton(0); document.body.appendChild(host);
  const button = document.getElementById('chat-listen-btn-0') as HTMLButtonElement;
  button.focus(); await Promise.resolve();
  const act = vi.fn(); configureChatSpeechAction(act);
  expect(document.getElementById('chat-listen-btn-0')).toBe(button);
  expect(document.activeElement).toBe(button);
  expect(publishChatSpeech(0, 'waiting')).toBe(true);
  expect(button.textContent).toBe('Still generating…'); expect(button.getAttribute('aria-label')).toBe('Cancel speech generation');
  button.click(); expect(act).toHaveBeenCalledExactlyOnceWith(0);
  state.currentProfile = 'different-profile';
  expect(publishChatSpeech(0, 'idle')).toBe(false);
  button.click(); expect(act).toHaveBeenCalledTimes(1);
  host.innerHTML = renderChatSpeechButton(0); await Promise.resolve();
  const replacement = document.getElementById('chat-listen-btn-0') as HTMLButtonElement;
  expect(replacement).not.toBe(button); replacement.click(); expect(act).toHaveBeenCalledTimes(2);
  host.remove(); await Promise.resolve(); replacement.click(); expect(act).toHaveBeenCalledTimes(2);
});
