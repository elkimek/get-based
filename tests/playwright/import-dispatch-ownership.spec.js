import { expect, test } from './coverage-fixture.js';

for (const route of ['picker', 'lazy-drop', 'loaded-drop']) {
  for (const overlap of route === 'picker' ? [] : ['drop-drop', 'picker-drop', 'drop-picker']) test(`${route} rejects overlapping ${overlap} during classification`, async ({ page }) => {
    await page.goto('/app', { waitUntil: 'load' });
    const result = await page.evaluate(async ({ route, overlap }) => {
      const pdf = await (await import('/js/import-loader.js')).loadImportUI();
      const { configureDnaModuleBridge } = await import('/js/dna-runtime-bridge.js');
      const { importDispatch } = await import('/js/pdf-import-progress.js');
      let release, started, classifications = 0;
      const gate = new Promise(resolve => { release = resolve; });
      const ready = new Promise(resolve => { started = resolve; });
      const previous = configureDnaModuleBridge({
        isDNAFile: () => false,
        isDNAFileByContent: async () => { classifications++; started(); await gate; return false; },
      });
      document.getElementById('drop-zone')?.remove();
      const zone = document.createElement('div'); zone.id = 'drop-zone'; document.body.append(zone);
      const completions = [], add = zone.addEventListener.bind(zone);
      zone.addEventListener = (name, listener, options) => add(name, name === 'drop'
        ? event => { completions.push(listener(event)); } : listener, options);
      const setup = route === 'lazy-drop' ? (await import('/js/import-drop-zone.js')).setupDropZone : pdf.setupDropZone;
      setup(); setup();
      const transfer = new DataTransfer();
      transfer.items.add(new File(['date,bleeding.value\n2026-09-01,1'], 'cycle.csv', { type: 'text/csv' }));
      const drop = () => zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      try {
        const { handleImportInputChange } = await import('/js/import-file-input.js');
        const pick = () => handleImportInputChange({ target: { files: Array.from(transfer.files), value: 'selected' } });
        const first = overlap === 'picker-drop' ? pick() : (drop(), completions[0]);
        await ready;
        if (overlap === 'drop-picker') await pick();
        else { drop(); await completions.at(-1); }
        const pending = { classifications, busy: importDispatch.busy };
        (await import('/js/state.js')).state.currentProfile = 'after-overlap';
        release(); await first;
        return { pending, busy: importDispatch.busy };
      } finally { release(); configureDnaModuleBridge(previous); }
    }, { route, overlap });
    expect(result).toEqual({ pending: { classifications: 1, busy: true }, busy: false });
  });

  test(`${route} rejects a profile switch during file classification`, async ({ page }) => {
    await page.goto('/app', { waitUntil: 'load' });
    const result = await page.evaluate(async route => {
      const { state } = await import('/js/state.js');
      const { configureDnaModuleBridge } = await import('/js/dna-runtime-bridge.js');
      const pdf = await (await import('/js/import-loader.js')).loadImportUI();
      const previous = configureDnaModuleBridge({
        isDNAFile: () => false,
        isDNAFileByContent: async () => { state.currentProfile = 'replacement-profile'; return false; },
      });
      let reads = 0;
      const file = new File(['date,bleeding.value\n2026-09-01,1'], 'cycle.csv', { type: 'text/csv' });
      const originalText = file.text.bind(file);
      file.text = () => { reads++; return originalText(); };
      try {
        if (route === 'picker') {
          const { handleImportInputChange } = await import('/js/import-file-input.js');
          await handleImportInputChange({ target: { files: [file], value: 'selected' } });
        } else {
          document.getElementById('drop-zone')?.remove();
          const zone = document.createElement('div'); zone.id = 'drop-zone'; document.body.append(zone);
          const add = zone.addEventListener.bind(zone);
          let completion;
          zone.addEventListener = (name, listener, options) => add(name, name === 'drop'
            ? event => { completion = listener(event); } : listener, options);
          if (route === 'lazy-drop') (await import('/js/import-drop-zone.js')).setupDropZone();
          else pdf.setupDropZone();
          const transfer = new DataTransfer(); transfer.items.add(file);
          zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
          await completion;
        }
        return { reads, preview: !!document.querySelector('[data-cycle-import-action="confirm"]') };
      } finally { configureDnaModuleBridge(previous); }
    }, route);
    expect(result).toEqual({ reads: 0, preview: false });
  });
}
