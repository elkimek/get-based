// @ts-check
// dna-window-bindings.js - legacy browser globals for DNA modules

import { getViewRuntimeFunction } from './views-runtime-bridge.js';

export function installDNAWindowBindings(win, deps) {
  if (!win) return;
  const { state, saveImportedData, buildGeneticsContext, getRelevantSNPs, ...bindings } = deps;
  Object.assign(win, {
    ...bindings,
    _buildGeneticsContext: buildGeneticsContext,
    _getRelevantSNPs: getRelevantSNPs,
    _getState: () => state,
    _saveAndRefresh: async () => {
      if (!await saveImportedData()) return false;
      if (win.buildSidebar) try { win.buildSidebar(); } catch (e) {}
      const navigate = win.navigate || (typeof window !== 'undefined' && win === window
        ? getViewRuntimeFunction('navigate')
        : null);
      navigate?.call(win, 'dashboard');
      return true;
    },
  });
}
