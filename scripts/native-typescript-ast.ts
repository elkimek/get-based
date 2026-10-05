import path from 'node:path';
import { API, type Project, type Snapshot } from 'typescript/unstable/sync';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import type { SourceFile } from 'typescript/unstable/ast';

let nextProject = 0;

/**
 * Parse source text with the genuine TypeScript 7 SDK. The explicit virtual
 * project contains syntax inputs only; it does not replace any semantic gate.
 * Keep all node traversal, diagnostics and printing inside the synchronous
 * callback. Return computed data, never nodes or the owning project.
 */
export function withParsedSources<Result>(
  sources: ReadonlyMap<string, string>,
  operation: (files: ReadonlyMap<string, SourceFile>, project: Project) => Result,
): Result {
  if (!sources.size) throw new Error('Native AST parsing requires at least one source');
  const cwd = process.cwd();
  const config = `/__getbased_typescript_ast__/session-${++nextProject}/tsconfig.json`;
  const virtualFiles: Record<string, string> = {};
  const resolved = new Map<string, string>();
  const seen = new Set<string>();
  for (const [name, source] of sources) {
    const fileName = path.resolve(cwd, name);
    if (fileName === config || seen.has(fileName)) {
      throw new Error(`Duplicate or reserved native AST source: ${name}`);
    }
    if (typeof source !== 'string') throw new Error(`Native AST source must be text: ${name}`);
    seen.add(fileName);
    resolved.set(name, fileName);
    virtualFiles[fileName] = source;
  }
  // noLib applies only to this syntax container. Production and test compiler
  // configurations, type checking and emission are owned by their real projects.
  virtualFiles[config] = JSON.stringify({
    compilerOptions: { allowJs: true, noEmit: true, noLib: true, target: 'esnext' },
    files: [...resolved.values()],
  });
  const api = new API({ cwd, fs: createVirtualFileSystem(virtualFiles) });
  let snapshot: Snapshot | undefined;
  try {
    snapshot = api.updateSnapshot({ openProjects: [config] });
    const project = snapshot.getProject(config);
    if (!project) throw new Error('Native AST project was not created');
    const files = new Map<string, SourceFile>();
    for (const [name, fileName] of resolved) {
      const file = project.program.getSourceFile(fileName);
      if (!file) throw new Error(`Native AST source was not parsed: ${name}`);
      files.set(name, file);
    }
    const result = operation(files, project);
    if (result !== null && (typeof result === 'object' || typeof result === 'function')
      && 'then' in result && typeof result.then === 'function') {
      throw new Error('Native AST operations must finish synchronously');
    }
    return result;
  } finally {
    try { snapshot?.dispose(); } finally { api.close(); }
  }
}

/** Parse one source while retaining its original extension and UTF-16 offsets. */
export function withParsedSource<Result>(
  source: string,
  fileName: string,
  operation: (file: SourceFile, project: Project) => Result,
): Result {
  return withParsedSources(new Map([[fileName, source]]), (files, project) => {
    const file = files.get(fileName);
    if (!file) throw new Error(`Native AST source is missing: ${fileName}`);
    return operation(file, project);
  });
}
