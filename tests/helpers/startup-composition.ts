/** Every startup side effect remains in its original evaluation order. */
const startupImports = [
  "import './schema.js';",
  "import './constants.js';",
  "import './utils.js';",
  "import './legal-consent.js';",
  "import './health-data-loader.js';",
  "import './light-sun-loader.js';",
  "import './feedback.js';",
  "import './tour.js';",
  "import './touch-tooltip.js';",
  "import './views.js';",
  "import './app-shell-hooks.js';",
  "import './light-env-shell-hooks.js';",
].join('\n');

export function hasDirectStartupImports(source: string) {
  return source.includes(startupImports);
}
