import type { Page } from '@playwright/test';
import { routeHtml, routeJavaScript } from '../helpers/browser-static-routes.js';
import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('lensLocalParsersCoverage');

async function openParserCoveragePage(page: Page) {
  await routeHtml(page, '**/lens-local-parsers-browser-coverage', '<!doctype html><html><head><title>Lens parser coverage</title></head><body></body></html>');
  await routeJavaScript(page, '**/js/pdfjs-loader.js', `
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
    `);
  await page.goto('/lens-local-parsers-browser-coverage', { waitUntil: 'load' });
}

test('lens local parsers browser coverage extracts text docx pdf and zip entries', async ({ page }) => {
  await openParserCoveragePage(page);

  const vendorRequests: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path === '/vendor/jszip.min.js' || path === '/vendor/mammoth.browser.min.js') vendorRequests.push(path);
  });
  const { outcomes, errors } = await page.evaluate(async ({ parserUrl }) => {
    const parsers = (await import(parserUrl) as unknown) as Pick<typeof import('../../js/lens-local-parsers.js'), "extractFromFile" | "createLensExtractionScope">;
    const outcomes: Record<string, unknown> = {};
    const errors: string[] = [];
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args) => {
      warnings.push(args.map(String).join(' '));
      originalWarn(...args);
    };

    const runScenario = async (name: string, scenario: () => unknown | Promise<unknown>) => {
      try {
        outcomes[name] = await scenario();
      } catch (error) {
        outcomes[name] = false;
        errors.push(`${name}: ${(error as {message?: unknown} | null)?.message || String(error)}`);
      }
    };

    const captureWarnings = async <Value>(scenario: () => Value | Promise<Value>) => {
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
          && markdown[0]!.name === 'Notes.MARKDOWN'
          && markdown[0]!.text === markdownText;
      });

      await runScenario('csvExtractsAsRawText', async () => {
        const csvText = 'a,b\n1,2';
        const csv = await parsers.extractFromFile(new File([csvText], 'labs.csv', { type: 'text/csv' }));
        return csv.length === 1 && csv[0]!.text === csvText;
      });

      await runScenario('unsupportedExtensionReturnsEmpty', async () => {
        const unsupported = await parsers.extractFromFile(new File(['ignored'], 'scan.exe', { type: 'application/octet-stream' }));
        return Array.isArray(unsupported) && unsupported.length === 0;
      });

      await runScenario('pdfUsesLoaderAndJoinsPages', async () => {
        const pdf = await parsers.extractFromFile(new File([new Uint8Array([1, 2, 3])], 'manual.pdf', {
          type: 'application/pdf',
        }));
        return pdf.length === 1
          && pdf[0]!.text.includes('PDF page-1 alpha')
          && pdf[0]!.text.includes('PDF page-2 omega')
          && pdf[0]!.text.includes('\n\n');
      });

      // The shipped JSZip and Mammoth bundles read an actual synthetic Word document.
      await parsers.extractFromFile(new File(['invalid archive'], 'invalid.zip')).catch(() => {});
      const Zip = (window as unknown as { JSZip: new () => {
        file(name: string, body: string | Blob | Uint8Array): void;
        generateAsync(options: { type: 'blob' }): Promise<Blob>;
      } }).JSZip;
      const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const makeDocx = async (text: string) => {
        const doc = new Zip();
        doc.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
        doc.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
        doc.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>' + text + '</w:t></w:r></w:p></w:body></w:document>');
        return doc.generateAsync({ type: 'blob' });
      };
      const document = await makeDocx('Synthetic lab notes');
      await runScenario('docxLoadsMammothAndExtractsText', async () => {
        const docxA = await parsers.extractFromFile(new File([document], 'report.docx', { type: docxType }));
        const docxB = await parsers.extractFromFile(new File([await makeDocx('A second document')], 'second.docx', { type: docxType }));
        return docxA[0]?.text.trim() === 'Synthetic lab notes' && docxB[0]?.text.trim() === 'A second document';
      });
      await runScenario('rejectsMalformedDocx', async () => {
        try { await parsers.extractFromFile(new File(['not a valid document'], 'invalid.docx')); }
        catch { return true; }
        return false;
      });
      const archive = new Zip();
      archive.file('folder/readme.MD', 'zip markdown body');
      archive.file('folder/manual.pdf', new Uint8Array([1, 2, 3]));
      archive.file('folder/report.docx', document);
      archive.file('folder/broken.pdf', new Uint8Array([9, 9, 9, 9]));
      archive.file('folder/image.png', 'ignored');
      const archiveFile = new File([await archive.generateAsync({ type: 'blob' })], 'archive.zip', { type: 'application/zip' });
      let zip: Awaited<ReturnType<typeof parsers.extractFromFile>> = [];
      let zipWarnings: string[] = [];
      await runScenario('zipExtractsArchiveEntries', async () => {
        const captured = await captureWarnings(() => parsers.extractFromFile(archiveFile));
        if (!Array.isArray(captured.value)) return false;
        zip = captured.value;
        zipWarnings = captured.warnings;
        return true;
      });
      if (outcomes.zipExtractsArchiveEntries === true) {
        await runScenario('zipRecursesSupportedEntriesWithArchivePrefix', async () => {
          const zipNames = zip.map(entry => entry.name).sort();
          return zipNames.includes('archive.zip::folder/readme.MD')
            && zipNames.includes('archive.zip::folder/manual.pdf')
            && zipNames.includes('archive.zip::folder/report.docx')
            && !zipNames.some((name: string) => name.includes('image.png'));
        });
        await runScenario('zipEntryFailureIsSkippedWithWarning', async () => (
          zip.length === 3
            && zipWarnings.some(line => line.includes('Could not extract an archive entry'))
        ));
      }
      await runScenario('archiveStopInterruptsExtraction', async () => {
        let checks = 0;
        try {
          await parsers.extractFromFile(archiveFile, parsers.createLensExtractionScope(() => ++checks === 5));
        } catch (error) {
          return (error as DOMException).name === 'AbortError' && checks === 5;
        }
        return false;
      });
    } finally {
      console.warn = originalWarn;
    }

    return { outcomes, errors };
  }, { parserUrl: moduleUrl('/js/lens-local-parsers.js') });

  expect(vendorRequests.sort()).toEqual(['/vendor/jszip.min.js', '/vendor/mammoth.browser.min.js']);
  expect(errors, errors.join('\n')).toEqual([]);
  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});
