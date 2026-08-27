import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?emfEdgeCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openIsolatedEMFPage(page) {
  await page.route('**/emf-edge-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html>
      <html>
        <body>
          <div id="modal-overlay"><div id="detail-modal"></div></div>
          <div id="notification-container"></div>
        </body>
      </html>`,
  }));
  await page.route('**/js/api.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export function hasAIProvider() { return true; }
      export function getAIProvider() { return 'ollama'; }
      export function getActiveModelId() { return 'emf-edge-model'; }
      export function getActiveModelDisplay() { return 'EMF Edge Model'; }
      export async function callClaudeAPI(opts) {
        window.__emfApiCalls = window.__emfApiCalls || [];
        window.__emfApiCalls.push({
          hasStream: typeof opts.onStream === 'function',
          system: opts.system || '',
          user: opts.messages?.[0]?.content || '',
          signalPresent: !!opts.signal,
        });
        if (typeof opts.onStream === 'function') {
          opts.onStream('<think>hidden chain</think>\\n## Draft EMF interpretation\\nShield the bedroom first.');
          await Promise.resolve();
          return {
            text: '<think>hidden final</think>\\n## Final EMF interpretation\\nShielding paint and WiFi off at night are the priority.',
            usage: { inputTokens: 80, outputTokens: 24 },
          };
        }
        return {
          text: JSON.stringify({
            date: '2026-06-20',
            consultant: 'Edge Consultant',
            rooms: [{
              name: 'Bedroom',
              location: 'Pillow wall',
              measurements: {
                acElectric: { value: 35, meter: 'NFA1000' },
                rfMicrowave: { value: 12, meter: 'Safe Living' },
              },
              sources: ['WiFi router'],
              mitigations: ['WiFi off at night'],
            }],
            note: 'Imported edge report note',
          }),
          usage: { inputTokens: 16, outputTokens: 12 },
        };
      }
    `,
  }));
  await page.route('**/js/data.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export async function saveImportedData() {
        window.__emfDataSaves = (window.__emfDataSaves || 0) + 1;
        return true;
      }
    `,
  }));
  await page.route('**/js/pdf-import.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export async function extractPDFText(file) {
        window.__emfExtractedPdfName = file?.name || '';
        return 'Client bedroom report with WiFi router, RF microwave readings, and mitigation recommendations.';
      }
    `,
  }));
  await page.route('**/js/pii.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export function obfuscatePDFText(text) {
        window.__emfObfuscations = (window.__emfObfuscations || 0) + 1;
        return { obfuscated: text.replace(/Client/g, 'Person') };
      }
      export async function sanitizeWithOllama(text) { return text; }
      export function sanitizeWithOllamaStreaming() {}
      export async function checkOllamaPII() { return { available: false }; }
      export async function reviewPIIBeforeSend() { return 'cancel'; }
    `,
  }));
  await page.route('**/js/image-utils.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export function isValidImageType(type) {
        return /^image\\//.test(type || '');
      }
      export async function resizeImage(file) {
        window.__emfResizeCalls = window.__emfResizeCalls || [];
        window.__emfResizeCalls.push(file.name);
        return { base64: btoa(file.name || 'photo'), mediaType: file.type || 'image/png' };
      }
    `,
  }));
  await page.route('**/js/recommendations.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export async function loadEMFCatalog() {
        window.__emfCatalogLoads = (window.__emfCatalogLoads || 0) + 1;
        return { products: [{ name: 'Shielding paint' }] };
      }
      export function renderEMFMeterRecs() {
        return '<div class="meter-rec">Meter recommendation</div>';
      }
      export function renderEMFMitigationRecs() {
        return '<div class="mitigation-rec">Products to consider</div>';
      }
      export function isProductRecsEnabled() { return true; }
      export function detectMitigationsInText(text) {
        return /shielding paint/i.test(text || '') ? ['shielding paint'] : [];
      }
    `,
  }));
  await page.goto('/emf-edge-browser-coverage', { waitUntil: 'load' });
}

test('EMF edge browser coverage imports PDFs photos rooms and streams interpretations', async ({ page }) => {
  await openIsolatedEMFPage(page);

  const results = await page.evaluate(async ({ emfUrl }) => {
    const [{ state }, emf] = await Promise.all([
      import('/js/state.js'),
      import(emfUrl),
    ]);
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 80; i += 1) {
        if (predicate()) return true;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const outcomes = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const original = {
      importedData: state.importedData,
      currentProfile: state.currentProfile,
    };
    const previousRuntimeDeps = emf.configureEMFRuntimeDeps({
      closeModal: () => document.getElementById('modal-overlay')?.classList.remove('show'),
    });
    const assessments = () => state.importedData.emfAssessment?.assessments || [];

    try {
      window.__emfApiCalls = [];
      window.__emfDataSaves = 0;
      window.__emfResizeCalls = [];
      window.__emfCatalogLoads = 0;
      state.currentProfile = 'emf-edge-browser-coverage';
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        diagnoses: null,
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
        emfAssessment: { assessments: [] },
      };
      localStorage.setItem('labcharts-pii-review', 'false');

      emf.openEMFAssessmentEditor();
      await waitUntil(() => !!document.querySelector('#detail-modal .emf-editor-actions'), 'EMF editor');
      document.querySelector('#detail-modal .modal-close')?.click();
      outcomes.closeEditorActionClosesEmptyEditor =
        !document.getElementById('modal-overlay')?.classList.contains('show');

      emf.openEMFAssessmentEditor();
      await waitUntil(() => !!document.querySelector('.emf-editor-actions'), 'reopened EMF editor');
      document.querySelector('.emf-editor-actions .import-btn-primary')?.click();
      await waitUntil(() => assessments().length === 1, 'manual assessment created');
      const manualId = assessments()[0].id;
      const editorHtml = document.getElementById('detail-modal')?.innerHTML || '';
      outcomes.emfEditorRendersDelegatedControls =
        !/\bon(?:click|keydown|submit|change|input)=/.test(editorHtml)
        && !!document.querySelector('[data-emf-action="add-assessment"]')
        && !!document.querySelector('[data-emf-action="add-room"]')
        && !!document.querySelector('[data-emf-change-action="measurement"]');

      const labelInput = document.querySelector('[data-emf-field="label"]');
      if (labelInput) {
        labelInput.value = 'Delegated Label';
        labelInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      document.querySelector(`#emf-sources-${manualId}-0 [data-emf-action="toggle-tag"]`)?.click();
      document.querySelector('[data-emf-action="save"]')?.click();
      const acInput = document.querySelector('[data-emf-measurement-type="acElectric"]');
      if (acInput) {
        acInput.value = '9';
        acInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await waitUntil(() => assessments()[0].rooms[0].measurements?.acElectric?.value === 9, 'delegated measurement saved');
      outcomes.delegatedEMFEditorControlsUpdateState =
        assessments()[0].label === 'Delegated Label'
        && assessments()[0].rooms[0].sources.length === 1
        && assessments()[0].rooms[0].measurements.acElectric.unit === 'V/m';

      document.querySelector('#detail-modal .modal-close')?.click();
      outcomes.closeEditorActionTearsDownAndCloses =
        !document.getElementById('modal-overlay')?.classList.contains('show');
      emf.openEMFAssessmentEditor();
      await waitUntil(() => !!document.querySelector(`[data-emf-action="toggle-assessment"][data-emf-assessment-id="${manualId}"]`), 'reopened delegated EMF editor');
      document.querySelector(`[data-emf-action="toggle-assessment"][data-emf-assessment-id="${manualId}"]`)?.click();
      await waitUntil(() => !!document.querySelector('[data-emf-action="add-room"]'), 'reopened expanded EMF editor');

      document.querySelector(`#emf-mits-${manualId}-0 [data-emf-action="toggle-tag"]:not(.active)`)?.click();
      document.querySelector('#detail-modal .modal-close')?.click();
      outcomes.closeEditorCollectsTagOnlyChanges =
        assessments()[0].rooms[0].mitigations.length === 1
        && !document.getElementById('modal-overlay')?.classList.contains('show');
      emf.openEMFAssessmentEditor();
      await waitUntil(() => !!document.querySelector(`[data-emf-action="toggle-assessment"][data-emf-assessment-id="${manualId}"]`), 'reopened after tag close');
      document.querySelector(`[data-emf-action="toggle-assessment"][data-emf-assessment-id="${manualId}"]`)?.click();
      await waitUntil(() => !!document.querySelector('[data-emf-action="add-room"]'), 'reopened expanded after tag close');

      document.querySelector('[data-emf-action="add-room"]')?.click();
      await waitUntil(() => assessments()[0].rooms.length === 2, 'explicit EMF room added');
      outcomes.addEMFRoomAddsBlankRoomAndSelectsIt =
        assessments()[0].rooms[1].name === 'Bedroom'
        && document.querySelector('.emf-room-tab.active')?.textContent.includes('Bedroom') === true;

      await emf.handleEMFPDF(new File(['fake pdf bytes'], 'edge-emf-report.pdf', { type: 'application/pdf' }));
      await waitUntil(() => !!document.getElementById('emf-confirm-btn'), 'EMF import preview');
      outcomes.pdfPreviewRendersParsedRoomAndUsesPiiFallback =
        window.__emfExtractedPdfName === 'edge-emf-report.pdf'
        && window.__emfObfuscations === 1
        && document.getElementById('detail-modal')?.textContent.includes('Edge Consultant') === true
        && document.getElementById('detail-modal')?.textContent.includes('WiFi router') === true;

      document.querySelector('#detail-modal .modal-close')?.click();
      await waitUntil(() => !!document.querySelector('#detail-modal .emf-editor-actions'), 'EMF editor restored from preview');
      outcomes.pdfPreviewCancelReturnsToEditorAndPreservesWork =
        document.getElementById('modal-overlay')?.classList.contains('show') === true
        && assessments()[0].rooms.length === 2
        && document.querySelector('[data-emf-action="trigger-pdf-import"]') != null;

      await emf.handleEMFPDF(new File(['fake pdf bytes'], 'edge-emf-report.pdf', { type: 'application/pdf' }));
      await waitUntil(() => !!document.getElementById('emf-confirm-btn'), 'reopened EMF import preview');
      document.getElementById('emf-confirm-btn').click();
      await waitUntil(() => assessments().some(a => a.consultant === 'Edge Consultant'), 'EMF import confirmed');
      const imported = assessments().find(a => a.consultant === 'Edge Consultant');
      outcomes.confirmImportPersistsUnitsAndRendersEditor =
        imported?.date === '2026-06-20'
        && imported.rooms[0].measurements.acElectric.unit === 'V/m'
        && imported.rooms[0].measurements.rfMicrowave.unit === '\u00b5W/m\u00b2'
        && document.querySelector('.emf-assessment-card.expanded')?.textContent.includes('Edge Consultant') === true;

      const files = [
        new File(['one'], 'one.jpg', { type: 'image/jpeg' }),
        new File(['two'], 'two.png', { type: 'image/png' }),
        new File(['three'], 'three.webp', { type: 'image/webp' }),
        new File(['four'], 'four.gif', { type: 'image/gif' }),
        new File(['five'], 'five.jpg', { type: 'image/jpeg' }),
        new File(['six'], 'six.jpg', { type: 'image/jpeg' }),
        new File(['seven'], 'seven.jpg', { type: 'image/jpeg' }),
        new File(['skip'], 'skip.txt', { type: 'text/plain' }),
      ];
      await emf.addEMFPhotos(imported.id, 0, files);
      await waitUntil(() => imported.rooms[0].photos?.length === 6, 'EMF photos capped');
      outcomes.addEMFPhotosResizesValidImagesAndCapsAtSix =
        imported.rooms[0].photos.length === 6
        && window.__emfResizeCalls.length === 6
        && imported.rooms[0].photos[0].name === 'one.jpg'
        && document.querySelectorAll('.emf-photo-thumb').length === 6;

      emf.interpretEMFAssessment(imported.id);
      await waitUntil(() => !!document.querySelector('#emf-interp-overlay.show #emf-interp-generate'), 'EMF interpretation modal');
      document.getElementById('emf-interp-generate').click();
      await waitUntil(
        () => imported.interpretation?.text.includes('Final EMF interpretation'),
        'EMF streamed interpretation saved'
      );
      const interpBody = document.getElementById('emf-interp-body')?.textContent || '';
      outcomes.streamInterpretationStripsThinkingSavesUsageAndAddsDiscuss =
        !interpBody.includes('hidden final')
        && interpBody.includes('Final EMF interpretation')
        && imported.interpretation.model === 'EMF Edge Model'
        && imported.interpretation.inputTokens === 80
        && imported.interpretation.outputTokens === 24
        && window.__emfApiCalls.some(call => call.hasStream && call.signalPresent)
        && !!document.querySelector('#emf-interp-overlay [data-emf-interp-action="discuss"]');
      const interpHtml = document.getElementById('emf-interp-overlay')?.innerHTML || '';
      outcomes.interpretationOverlayUsesDelegatedControls =
        !/\bon(?:click|keydown|submit|change|input)=/.test(interpHtml)
        && !!document.querySelector('#emf-interp-overlay [data-emf-interp-action="close"]')
        && !!document.querySelector('#emf-interp-overlay [data-emf-interp-action="generate"]');

      await waitUntil(() => document.getElementById('emf-interp-recs')?.textContent.includes('Products to consider'), 'mitigation recs');
      outcomes.productRecsLoadForMitigationTags = window.__emfCatalogLoads >= 1;
    } finally {
      document.getElementById('emf-interp-overlay')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      state.importedData = original.importedData;
      state.currentProfile = original.currentProfile;
      emf.configureEMFRuntimeDeps(previousRuntimeDeps);
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    emfUrl: moduleUrl('/js/emf.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
