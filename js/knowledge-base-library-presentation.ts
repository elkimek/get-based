import type { LibraryRecord } from './lens-local-store.js';

export interface KnowledgeBaseLibraryOptionView {
  value: string;
  label: string;
  selected: boolean;
}

export type KnowledgeBaseLibraryOptionsInput =
  | {
      kind: 'libraries';
      libraries: readonly LibraryRecord[];
      activeId: string;
    }
  | {
      kind: 'empty' | 'error';
    };

export interface KnowledgeBaseLibraryOptionsView {
  options: readonly KnowledgeBaseLibraryOptionView[];
}

export interface KnowledgeBaseLibraryModelInput {
  key: string;
  isRecommended: boolean;
  profileLabel: string;
  label: unknown;
  downloadMB: unknown;
  langLabel: string;
  notes: unknown;
}

export interface KnowledgeBaseLibraryModelView {
  key: string;
  isRecommended: boolean;
  profileLabel: string;
  label: string;
  downloadMB: string;
  langLabel: string;
  notes: string;
}

export interface KnowledgeBaseLibraryCreateInput {
  deviceLine: string;
  models: readonly KnowledgeBaseLibraryModelInput[];
}

export interface KnowledgeBaseLibraryCreateView {
  deviceLine: string;
  models: readonly KnowledgeBaseLibraryModelView[];
}

const literal = (value: unknown): string => value == null ? '' : String(value);

/** Select and fallback decisions remain in the library controller. */
export function projectKnowledgeBaseLibraryOptions(
  input: KnowledgeBaseLibraryOptionsInput,
): KnowledgeBaseLibraryOptionsView {
  if (input.kind !== 'libraries') {
    return {
      options: [{
        value: '',
        label: input.kind === 'empty' ? 'No libraries yet' : '(engine not ready)',
        selected: false,
      }],
    };
  }

  return {
    options: input.libraries.map(library => ({
      value: literal(library.id),
      selected: library.id === input.activeId,
      label: literal(library.name),
    })),
  };
}

/** Receives the controller's computed recommendation and profile facts. */
export function projectKnowledgeBaseLibraryCreate(
  input: KnowledgeBaseLibraryCreateInput,
): KnowledgeBaseLibraryCreateView {
  return {
    deviceLine: input.deviceLine,
    models: input.models.map(model => ({
      key: model.key,
      isRecommended: model.isRecommended,
      profileLabel: model.profileLabel,
      label: literal(model.label),
      downloadMB: String(model.downloadMB),
      langLabel: model.langLabel,
      notes: literal(model.notes),
    })),
  };
}
