// longevity-tools-loader.ts — lazy loader for the Longevity Tools screen
// (same pattern as lab-test-planner-loader.ts).

const STYLESHEET_URL = new URL('../css/longevity-tools.css', import.meta.url).href;
type LongevityToolsModule = typeof import('./longevity-tools-view.js');
let moduleLoad: Promise<LongevityToolsModule> | null = null;
let loadedModule: LongevityToolsModule | null = null;
let stylesheetLoad: Promise<void> | null = null;
let stylesheetLoaded = false;

export function isLongevityToolsReady(): boolean { return loadedModule !== null && stylesheetLoaded; }
export function getLoadedLongevityToolsModule(): LongevityToolsModule | null { return loadedModule; }

function loadModule(): Promise<LongevityToolsModule> {
  if (!moduleLoad) {
    moduleLoad = import('./longevity-tools-view.js')
      .then(module => { loadedModule = module; return module; })
      .catch((err: unknown) => { moduleLoad = null; loadedModule = null; throw err; });
  }
  return moduleLoad;
}

function loadStylesheet(): Promise<void> {
  if (!stylesheetLoad) {
    if (typeof document === 'undefined') return Promise.reject(new Error('Longevity Tools stylesheet requires a document'));
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLESHEET_URL;
    link.dataset.longevityToolsStylesheet = '';
    stylesheetLoad = new Promise<void>((resolve, reject) => {
      link.addEventListener('load', () => { stylesheetLoaded = true; resolve(); }, { once: true });
      link.addEventListener('error', () => reject(new Error('Longevity Tools stylesheet could not be loaded')), { once: true });
      document.head.appendChild(link);
    }).catch((err: unknown) => { link.remove(); stylesheetLoad = null; stylesheetLoaded = false; throw err; });
  }
  return stylesheetLoad;
}

export function loadLongevityToolsUI(): Promise<LongevityToolsModule> {
  return Promise.all([loadModule(), loadStylesheet()]).then(([module]) => module);
}
