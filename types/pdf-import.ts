import type { importDataJSON, loadDemoData } from '../js/export.js';
import type { maybeShowEncryptionNudge } from '../js/crypto.js';
import type { startOpenRouterOAuth } from '../js/api.js';
import type { ImportAIResult } from '../js/pdf-import-ai-utils.js';
import type { FileImportResult } from '../js/pdf-import-file-handlers.js';
import type { normalizeParsedImportMarkers } from '../js/pdf-import-marker-normalization.js';
import type { updateImportBenchmark } from '../js/import-benchmarks.js';
import type { showImportPreviewAsync } from '../js/pdf-import-review.js';
export type { ImportAIResult };
// Configured callbacks can change between the guard and the assignment's getter read.
export interface PdfImportDependencies { importDataJSON: unknown; loadDemoData: unknown; maybeShowEncryptionNudge: unknown; startOpenRouterOAuth: unknown }
export interface PdfImportDependencyOperations {
 importDataJSON(...args: Parameters<typeof importDataJSON>): unknown;
 loadDemoData(...args: Parameters<typeof loadDemoData>): unknown;
 maybeShowEncryptionNudge(...args: Parameters<typeof maybeShowEncryptionNudge>): unknown;
 startOpenRouterOAuth(...args: Parameters<typeof startOpenRouterOAuth>): unknown;
}
// Private property access reader for unvalidated parsed JSON; this is not a schema guarantee.
export interface RawAIImportReader extends Record<string, unknown> { date?: unknown; testType?: unknown; labName?: unknown; markers?: unknown }
export type RawNormalizer = (parsed: RawAIImportReader, options: Parameters<typeof normalizeParsedImportMarkers>[1]) => { testType: unknown; markers: FileImportResult['markers'] };
export interface ParsedPDFResult extends FileImportResult { usage: ImportAIResult['usage']; diagnostics: ImportAIResult['diagnostics']; benchmarkRawModelResult?: unknown }
export interface ParsePDFOptions { captureRawModelOutput?: unknown; deterministicBenchmark?: unknown }
export type AIProgressCallback = (percent: number, stageLabel: string) => unknown;
export type BenchmarkPatch = NonNullable<Parameters<typeof updateImportBenchmark>[1]>;
export type PreviewReader = (result: ParsedPDFResult, ...args: [current: Parameters<typeof showImportPreviewAsync>[1], total: Parameters<typeof showImportPreviewAsync>[2]]) => ReturnType<typeof showImportPreviewAsync>;

// Original callers materialize absent optional fields as undefined; native implementations guard them.
type UndefinedFields<Value> = { [Field in keyof Value]: Value[Field] | undefined };
export type ProgressFactory = (options: UndefinedFields<Parameters<typeof import('../js/pdf-import-ai-utils.js').createImportAIProgress>[0]>) => ReturnType<typeof import('../js/pdf-import-ai-utils.js').createImportAIProgress>;
export type PerformanceWriter = (key: Parameters<typeof import('../js/pdf-import-ai-utils.js').saveImportAIPerf>[0], sample: UndefinedFields<NonNullable<Parameters<typeof import('../js/pdf-import-ai-utils.js').saveImportAIPerf>[1]>>) => ReturnType<typeof import('../js/pdf-import-ai-utils.js').saveImportAIPerf>;
export type FileClassifier = (files: Parameters<typeof import('../js/pdf-import-file-utils.js').classifyImportFiles>[0], deps: UndefinedFields<NonNullable<Parameters<typeof import('../js/pdf-import-file-utils.js').classifyImportFiles>[1]>>) => ReturnType<typeof import('../js/pdf-import-file-utils.js').classifyImportFiles>;
