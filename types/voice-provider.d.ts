/** Shared request fields for the native voice adapters. */
export interface VoiceConnectionOptions {
  apiKey?: string | undefined; language?: string | undefined; modelId?: string | undefined;
  signal?: AbortSignal | undefined;
}
export interface VoiceTranscriptionOptions extends VoiceConnectionOptions { audio: Blob }
export interface VoiceSynthesisOptions extends VoiceConnectionOptions {
  text: string; voiceId?: string | undefined; rate?: number | undefined;
}
export interface LocalVoiceConnectionOptions extends VoiceConnectionOptions { baseUrl?: string | undefined }
export interface LocalVoiceTranscriptionOptions extends LocalVoiceConnectionOptions { audio: Blob }
export interface LocalVoiceSynthesisOptions extends LocalVoiceConnectionOptions {
  text: string; voiceId?: string | undefined; rate?: number | undefined;
}
export interface BrowserVoiceTranscriptionOptions extends VoiceConnectionOptions {
  audio: Blob | Float32Array; backend?: string | undefined;
}
export interface BrowserVoiceSynthesisOptions extends VoiceSynthesisOptions {
  backend?: string | undefined; streaming?: boolean | undefined;
}
/** Provider JSON is inspected and coerced by the adapters, without new validation. */
export interface VoiceModelRow {
  id?: unknown; name?: unknown; supported_voices?: unknown;
  model_spec?: { voices?: unknown } | null;
}
export interface VoiceCatalogueRow {
  voice_id?: unknown; id?: unknown; name?: unknown; language?: unknown; gender?: unknown;
  model_id?: unknown; preview_url?: unknown;
  labels?: { language?: unknown; gender?: unknown } | null;
}
export interface VoiceTranscript { text?: unknown; language?: string | null; language_code?: string | null }
export interface CuratedVoiceModel {
  id: string; label: string; optionLabel: string; description: string; defaultVoice?: string;
}
export interface LiveVoiceModel extends CuratedVoiceModel { supportedVoices: string[] }
export interface AiVoiceDefaults { label: string; sttModel: string; ttsModel: string; voice: string }
export interface VoiceConnectionResult {
  ok: boolean; message: string;
  voices?: { id: string; name: string; language: string; descriptor: string; previewUrl?: string }[];
}
export interface VoiceTranscriptionResult {
  text: string; language?: string | null | undefined; backend?: string | undefined;
  fallbackReason?: string | undefined; inferenceMs?: number | undefined;
}
export interface VoiceSynthesisResult {
  contentType: string; audio?: Blob | undefined; stream?: ReadableStream<Uint8Array> | undefined;
  pcmStream?: ReadableStream<{ samples: Float32Array; sampleRate: number }> | undefined;
  backend?: string | undefined; inferenceMs?: number | undefined;
}
export interface VoiceListEntry {
  id: string; name: string; language: string; descriptor?: string | undefined;
  gender?: string | undefined; quality?: string | undefined; previewUrl?: string | undefined;
}
export interface VoiceProvider {
  id: string;
  transcribe(options: LocalVoiceTranscriptionOptions & { backend?: string | undefined }): Promise<VoiceTranscriptionResult>;
  synthesize(options: LocalVoiceSynthesisOptions & { backend?: string | undefined; streaming?: boolean | undefined }): Promise<VoiceSynthesisResult>;
  listModels(kind: string, options?: LocalVoiceConnectionOptions): Promise<{ id: string; label: string; optionLabel?: string; supportedVoices?: string[] }[]>;
  listVoices?: ((options?: VoiceConnectionOptions) => Promise<VoiceListEntry[]>) | undefined;
  testConnection(options?: LocalVoiceConnectionOptions): Promise<VoiceConnectionResult>;
}
