// @ts-check
// dna-window-bindings.js - legacy browser globals for DNA modules

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
      if (win.navigate) win.navigate('dashboard');
      return true;
    },
  });
}
