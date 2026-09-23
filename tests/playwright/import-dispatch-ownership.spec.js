import { expect, test } from './coverage-fixture.js';

for (const route of ['picker', 'lazy-drop', 'loaded-drop']) {
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
