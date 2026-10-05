import type { normalizeToSI } from '../js/pdf-import-marker-mapping.js';
export interface ReferenceMarkerReader extends Record<string, unknown> {
  rawName?: unknown; mappedKey?: unknown; suggestedKey?: unknown; unit?: unknown;
  value?: unknown; refMin?: unknown; refMax?: unknown; section?: unknown;
}
// Private property operations on unvalidated JSON; these do not validate input.
export interface ReferenceDocumentReader { markers?: unknown; date?: unknown; testType?: unknown }
export interface ReferenceManifest extends Record<string, unknown> {
  id?: unknown; sourcePath?: unknown; fileName?: unknown; version?: unknown;
  label?: unknown; pageCount?: unknown; expected?: unknown;
}
export interface ReferenceIssue { field: string; label: string; expected: string; actual: string; note?: string }
export interface ReferenceDiscrepancy {
  kind: string; scope: string; markerName: string; section: string;
  actualName?: string; issues: ReferenceIssue[];
}
export type ReferenceNormalizer = (key: unknown, value: Parameters<typeof normalizeToSI>[1], unit: unknown, context: unknown) => ReturnType<typeof normalizeToSI>;
export type ReferenceFileConstructor = new (parts: ConstructorParameters<typeof File>[0], name: unknown, options?: ConstructorParameters<typeof File>[2]) => File;
