/** Browser-local voice worker messages and persisted installation measurements. */
export type VoiceKind = 'stt' | 'tts';
export type VoiceRequestId = number | string | undefined;
export interface VoiceRequest {
  type?: string | undefined; id?: VoiceRequestId; model?: string | undefined;
  backend?: string | undefined; preferredBackend?: string | undefined; allowWebGpuFallback?: boolean | undefined;
  language?: string | undefined; audio?: ArrayBuffer | ArrayLike<number> | undefined; mockTranscript?: string | undefined;
  voice?: string | undefined; rate?: number | undefined; text?: string | undefined; streaming?: boolean | undefined;
}
export interface VoiceReply {
  type?: string | undefined; id?: VoiceRequestId; kind?: VoiceKind | undefined;
  model?: string | undefined; backend?: string | undefined; fallbackReason?: string | undefined;
  text?: string | undefined; language?: string | undefined; inferenceMs?: number | undefined; audioSeconds?: number | undefined;
  samples?: ArrayBuffer | Float32Array<ArrayBuffer> | undefined; sampleRate?: number | undefined;
  message?: string | undefined; progress?: Record<string, string | number> | undefined;
}
export interface VoiceModelStatus {
  version: string; model?: string | undefined; backend?: string | undefined; fallbackReason?: string | undefined;
  performance?: Record<string, unknown> | undefined; availableBackends?: string[] | undefined;
  lastInferenceMs?: number | undefined; installedAt?: number | undefined;
}
export interface VoiceOptions {
  model?: string | undefined; language?: string | undefined; voice?: string | undefined;
  rate?: number | undefined; backend?: string | undefined; signal?: AbortSignal | undefined;
}
export interface VoiceBackendEnvironment { android?: boolean; initialBackend?: 'wasm' | 'webgpu' }
export interface VoiceNavigator {
  userAgent?: string | undefined; userAgentData?: { platform?: string | undefined; mobile?: boolean | undefined } | undefined;
  gpu?: { requestAdapter?: ((options: { powerPreference: 'high-performance' }) => Promise<object | null>) | undefined } | undefined;
}
export interface VoiceWorkerError { voiceBackend?: unknown; name?: unknown; message?: unknown }
export interface VoiceGpu { requestAdapter(options: { powerPreference: 'high-performance' }): Promise<object | null> }
export interface VoiceReady { model: string; backend: string; fallbackReason?: string | undefined }
export type VoiceProgress = Record<string, unknown> | null | undefined;
