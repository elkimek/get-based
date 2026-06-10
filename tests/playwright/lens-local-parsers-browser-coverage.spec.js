import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lensLocalParsersCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openParserCoveragePage(page) {
  await page.route('**/lens-local-parsers-browser-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><title>Lens parser coverage</title></head><body></body></html>',
  }));
  await page.route('**/js/pdfjs-loader.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export async function getPdfDocument({ data }) {
        const bytes = new Uint8Array(data);
        if (bytes.length === 4 && bytes[0] === 9) throw new Error('stub pdf failure');
        return {
          numPages: 2,
          getPage: async pageNumber => ({
            getTextContent: async () => ({
              items: [
                { str: 'PDF' },
                { str: 'page-' + pageNumber },
                { str: pageNumber === 1 ? 'alpha' : 'omega' },
              ],
            }),
          }),
        };
      }
    `,
  }));
  await page.route('**/vendor/mammoth.browser.min.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.__mammothLoadCount = (window.__mammothLoadCount || 0) + 1;
      window.mammoth = {
        extractRawText: async ({ arrayBuffer }) => ({
          value: 'DOCX text bytes=' + arrayBuffer.byteLength,
        }),
      };
    `,
  }));
  await page.route('**/vendor/jszip.min.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.__jszipLoadCount = (window.__jszipLoadCount || 0) + 1;
      window.JSZip = {
        loadAsync: async () => ({
          files: {
            'folder/': { dir: true, name: 'folder/' },
            'folder/readme.MD': {
              dir: false,
              name: 'folder/readme.MD',
              async: async () => new Blob(['zip markdown body'], { type: 'text/markdown' }),
            },
            'folder/manual.pdf': {
              dir: false,
              name: 'folder/manual.pdf',
              async: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }),
            },
            'folder/report.docx': {
              dir: false,
              name: 'folder/report.docx',
              async: async () => new Blob([new Uint8Array([5, 6, 7, 8, 9])], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
            },
            'folder/broken.pdf': {
              dir: false,
              name: 'folder/broken.pdf',
              async: async () => new Blob([new Uint8Array([9, 9, 9, 9])], { type: 'application/pdf' }),
            },
            'folder/image.png': {
              dir: false,
              name: 'folder/image.png',
              async: async () => new Blob(['ignored'], { type: 'image/png' }),
            },
          },
        }),
      };
    `,
  }));
  await page.goto('/lens-local-parsers-browser-coverage', { waitUntil: 'load' });
}

test('lens local parsers browser coverage extracts text docx pdf and zip entries', async ({ page }) => {
  await openParserCoveragePage(page);

  const { outcomes, errors } = await page.evaluate(async ({ parserUrl }) => {
    const parsers = await import(parserUrl);
    const outcomes = {};
    const errors = [];
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => {
      warnings.push(args.map(String).join(' '));
      originalWarn(...args);
    };

    const runScenario = async (name, scenario) => {
      try {
        outcomes[name] = await scenario();
      } catch (error) {
        outcomes[name] = false;
        errors.push(`${name}: ${error?.message || String(error)}`);
      }
    };

    const captureWarnings = async scenario => {
      const start = warnings.length;
      const value = await scenario();
      return {
        value,
        warnings: warnings.slice(start),
      };
    };

    try {
      await runScenario('textExtensionIsCaseInsensitive', async () => {
        const markdownText = '# Notes\nKeep spacing.';
        const markdown = await parsers.extractFromFile(new File([markdownText], 'Notes.MARKDOWN', {
          type: 'text/markdown',
        }));
        return markdown.length === 1
          && markdown[0].name === 'Notes.MARKDOWN'
          && markdown[0].text === markdownText;
      });

      await runScenario('csvExtractsAsRawText', async () => {
        const csvText = 'a,b\n1,2';
        const csv = await parsers.extractFromFile(new File([csvText], 'labs.csv', { type: 'text/csv' }));
        return csv.length === 1 && csv[0].text === csvText;
      });

      await runScenario('unsupportedExtensionReturnsEmptyAndWarns', async () => {
        const { value: unsupported, warnings: unsupportedWarnings } = await captureWarnings(() => (
          parsers.extractFromFile(new File(['ignored'], 'scan.exe', {
            type: 'application/octet-stream',
          }))
        ));
        return Array.isArray(unsupported)
          && unsupported.length === 0
          && unsupportedWarnings.some(line => line.includes('scan.exe') && line.includes('application/octet-stream'));
      });

      await runScenario('pdfUsesLoaderAndJoinsPages', async () => {
        const pdf = await parsers.extractFromFile(new File([new Uint8Array([1, 2, 3])], 'manual.pdf', {
          type: 'application/pdf',
        }));
        return pdf.length === 1
          && pdf[0].text.includes('PDF page-1 alpha')
          && pdf[0].text.includes('PDF page-2 omega')
          && pdf[0].text.includes('\n\n');
      });

      await runScenario('docxLoadsMammothOnceAndExtractsText', async () => {
        const docxA = await parsers.extractFromFile(new File([new Uint8Array([1, 2, 3, 4])], 'report.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }));
        const docxB = await parsers.extractFromFile(new File([new Uint8Array([1, 2])], 'second.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }));
        return docxA[0]?.text === 'DOCX text bytes=4'
          && docxB[0]?.text === 'DOCX text bytes=2'
          && window.__mammothLoadCount === 1;
      });

      let zip = [];
      let zipWarnings = [];
      await runScenario('zipExtractsArchiveEntries', async () => {
        const captured = await captureWarnings(() => (
          parsers.extractFromFile(new File([new Uint8Array([80, 75])], 'archive.zip', {
            type: 'application/zip',
          }))
        ));
        zip = captured.value;
        zipWarnings = captured.warnings;
        return Array.isArray(zip);
      });
      await runScenario('zipRecursesSupportedEntriesWithArchivePrefix', async () => {
        const zipNames = zip.map(entry => entry.name).sort();
        return zipNames.includes('archive.zip::folder/readme.MD')
          && zipNames.includes('archive.zip::folder/manual.pdf')
          && zipNames.includes('archive.zip::folder/report.docx')
          && !zipNames.some(name => name.includes('image.png'));
      });
      await runScenario('zipEntryFailureIsSkippedWithWarning', async () => (
        zip.length === 3
          && zipWarnings.some(line => line.includes('zip entry failed: folder/broken.pdf'))
      ));
      await runScenario('zipLoadsJsZipOnce', async () => window.__jszipLoadCount === 1);
    } finally {
      console.warn = originalWarn;
    }

    return { outcomes, errors };
  }, { parserUrl: moduleUrl('/js/lens-local-parsers.js') });

  expect(errors, errors.join('\n')).toEqual([]);
  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});
