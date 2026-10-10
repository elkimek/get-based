import { renderHTML } from './components/SunDataSourcePresentation.svelte.html.js';
import type { SunDataSourceView } from './sun-data-source-presentation.js';

/** Synchronous markup only; the Light owner and native delegated controller own its lifetime. */
export function renderSunDataSource(view: SunDataSourceView): string {
  return renderHTML({ view });
}
