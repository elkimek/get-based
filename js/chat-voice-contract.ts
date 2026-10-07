/** Presentation states contain no recordings, transcripts or provider credentials. */
export type ChatCaptureMode = 'idle' | 'preparing' | 'requesting' | 'recording' | 'transcribing' | 'error';
export type ChatSpeechMode = 'idle' | 'busy' | 'speaking' | 'waiting';
export interface ChatCaptureView { mode: ChatCaptureMode; text: string; available: boolean; }
export const INITIAL_CHAT_CAPTURE: ChatCaptureView = { mode: 'idle', text: '', available: true };
export function captureControl(view: ChatCaptureView) {
  const recording = view.mode === 'recording';
  const cancellable = ['preparing', 'requesting', 'transcribing'].includes(view.mode);
  const label = recording ? 'Stop recording' : view.mode === 'transcribing' ? 'Cancel transcription' : cancellable ? 'Cancel microphone preparation' : 'Speak message';
  return { recording, busy: cancellable, label, title: recording ? 'Stop and transcribe' : label, disabled: !view.available && !recording && !cancellable };
}
export function speechControl(mode: ChatSpeechMode) {
  return {
    pressed: mode !== 'idle', busy: mode === 'busy' || mode === 'waiting',
    text: mode === 'speaking' ? 'Stop' : mode === 'busy' ? 'Preparing…' : mode === 'waiting' ? 'Still generating…' : 'Listen',
    label: mode === 'speaking' ? 'Stop reading' : mode === 'busy' ? 'Cancel speech preparation' : mode === 'waiting' ? 'Cancel speech generation' : 'Read message aloud',
    title: mode === 'busy' ? 'Generating speech · tap to cancel' : mode === 'waiting' ? 'Speech generation is still running · tap to cancel' : mode === 'speaking' ? 'Stop reading' : 'Read message aloud',
  };
}
