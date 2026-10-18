import path from 'node:path';
import type {TestProject} from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {getbasedClassicCoverageFiles: string[];}
}

/** Raw classic scripts bypass Vite, so qualify their coverage using the resolved project options. */
export default function coverageGlobalSetup(project: TestProject): void {
  const {coverage, root} = project.config;
  const candidates = ['service-worker.js', 'service-worker-runtime.js', 'service-worker-assets.js'];
  const files = coverage.enabled && coverage.provider === 'istanbul' ? candidates.filter(file => {
    const absolute = path.resolve(root, file);
    const matches = (pattern: string) => path.matchesGlob(path.isAbsolute(pattern) ? absolute : file, pattern);
    return (coverage.include ?? []).some(matches) && !(coverage.exclude ?? []).some(matches);
  }).map(file => path.resolve(root, file)) : [];
  project.provide('getbasedClassicCoverageFiles', files);
}
