import type {Profiler, Debugger} from 'node:inspector';
import type {EncodedSourceMap} from '@jridgewell/trace-mapping';
export interface NativeEnvironment {name: 'node' | 'jsdom'; viteEnvironment: 'ssr' | 'client'; consumer: 'server' | 'client';}
export interface NativeContext {root: string; directory: string; runId: string; revision: string; sources: string[];}
export interface NativeBlob {file: string; sha256: string; bytes: number;}
export interface NativeSnapshot {
  file: string | null; scriptId: string; url: string; metadata: Debugger.ScriptParsedEventDataType;
  source: NativeBlob; sourceLength: number;
}
export interface NativeCapture {
  schemaVersion: 1; runId: string; revision: string; holderId: string; pid: number;
  environment: NativeEnvironment; raw: NativeBlob; snapshots: NativeSnapshot[];
  moduleExecutionInfo: [string, {startOffset: number}][];
  completed: true;
}
/** Versioned storage only; readers restore the unchanged logical schema-one capture. */
export interface NativeCaptureTransport {
  schemaVersion: 2; producer: 'native-capture-transport';
  capture: Omit<NativeCapture, 'snapshots'> & {snapshots: (NativeSnapshot & {sourceMapURLExternal?: true})[]};
  sourceMapURLs: {scriptId: string; source: NativeBlob}[];
}
export interface NativeSuiteCapture {file: NativeBlob; testFiles: string[]; project: string; environment: string;}
export interface NativeRaw {result: Profiler.ScriptCoverage[]; timestamp: number;}
export interface NativeGeometry {file: string; environment: string; consumer: string; originalHash: string; code: string;}
export interface NativeObservation {
  file: string; environment: string; consumer: string; code: string;
  ordering: {name: string; order: string | null}[]; ownIndex: number; analysisIndex: number;
}
export interface NativeTransform {canonical: string; runtime: string; code: string; map: EncodedSourceMap | null; offset: number; file: string;}
export interface NativeContribution {file: string; start: number; end: number; count: number;}
export interface NativeUnknown {file: string; start: number; end: number; count: number; runtimeLength: number; reason: string;}
export interface NativeUnattributedScript {capture: string; scriptId: string; sourceHash: string; runtimeLength: number; functions: number; positiveOwnFunctions: number;}
export interface NativeMappedCapture {called: NativeContribution[]; unmapped: NativeUnknown[]; unattributed: NativeUnattributedScript[];}
declare module 'vitest' {interface ProvidedContext {getbasedNativeCoverage?: NativeContext;}}
