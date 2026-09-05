import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?chatSummaryCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openIsolatedSummaryPage(page) {
  await page.route('**/chat-summary-browser-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><title>Chat summary coverage</title></head><body></body></html>',
  }));
  await page.route('**/js/api.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export function hasAIProvider() { return true; }
      export function isAIPaused() { return false; }
      export function getAIProvider() { return 'ollama'; }
      export function getActiveModelId() { return 'summary-coverage-model'; }
      export function getActiveModelDisplay() { return 'Summary Coverage Model'; }
      export function supportsVision() { return false; }
      export async function callClaudeAPI(opts) {
        window.__summaryApiCalls = window.__summaryApiCalls || [];
        window.__summaryApiCalls.push({
          system: opts.system,
          messages: opts.messages,
          maxTokens: opts.maxTokens,
          signalPresent: !!opts.signal,
        });
        opts.onStream?.('## Key Findings\\nFerritin improved.');
        await Promise.resolve();
        const text = '## Key Findings\\nFerritin improved.\\n\\n## Action Items\\n1. Retest vitamin D.';
        opts.onStream?.(text);
        return { text, usage: { inputTokens: 64, outputTokens: 18 } };
      }
    `,
  }));
  await page.route('**/js/data.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export async function saveImportedData() {
        window.__summaryDataSaves = (window.__summaryDataSaves || 0) + 1;
        return true;
      }
    `,
  }));
  await page.route('**/js/ai-feature-routing.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `import { callClaudeAPI } from '/js/api.js';
      export const hasAssistantFeatureProvider = () => true;
      export const getAssistantFeatureIdentity = () => ({ provider: 'ollama', modelId: 'summary-coverage-model', modelDisplay: 'Summary Coverage Model' });
      export const callAssistantFeatureAI = options => callClaudeAPI(options);`,
  }));
  await page.route('**/js/chat-threads.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export function saveChatThreadIndex() {
        window.__summaryThreadIndexSaves = (window.__summaryThreadIndexSaves || 0) + 1;
        return true;
      }
      export function renderThreadList() {
        window.__summaryThreadListRenders = (window.__summaryThreadListRenders || 0) + 1;
      }
    `,
  }));
  await page.goto('/chat-summary-browser-coverage', { waitUntil: 'load' });
}

test('chat summary browser coverage streams saves refreshes and closes summaries', async ({ page }) => {
  await openIsolatedSummaryPage(page);

  const results = await page.evaluate(async ({ summariesUrl }) => {
    const [{ state }, summaries] = await Promise.all([
      import('/js/state.js'),
      import(summariesUrl),
    ]);
    const outcomes = {};
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 50; i += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const original = {
      currentProfile: state.currentProfile,
      importedData: state.importedData,
      chatThreads: state.chatThreads,
      currentThreadId: state.currentThreadId,
      chatHistory: state.chatHistory,
    };

    try {
      document.body.innerHTML = '<div id="chat-saved-summaries"></div><div id="chat-thread-list"></div>';
      const profileId = 'chat-summary-browser-coverage';
      window.__summaryApiCalls = [];
      window.__summaryDataSaves = 0;
      window.__summaryThreadIndexSaves = 0;
      window.__summaryThreadListRenders = 0;
      state.currentProfile = profileId;
      state.importedData = { entries: [], chatSummaries: [] };
      state.chatThreads = [{
        id: 'summary-thread',
        name: 'Generated Summary Thread',
        createdAt: '2026-06-10T08:00:00.000Z',
        updatedAt: '2026-06-10T08:05:00.000Z',
        messageCount: 4,
      }];
      state.currentThreadId = 'summary-thread';
      state.chatHistory = [
        { role: 'user', content: 'Please summarize my ferritin trend.' },
        { role: 'assistant', personalityName: 'Analyst', content: 'Ferritin rose from 22 to 47.' },
        { role: 'user', content: [{ type: 'text', text: 'Also mention vitamin D.' }] },
        { role: 'assistant', content: 'Vitamin D is stable and should be retested.' },
      ];

      await summaries.summarizeThread();
      await waitUntil(
        () => state.importedData.chatSummaries?.length === 1,
        'generated summary save'
      );
      const generatedThread = state.chatThreads.find(t => t.id === 'summary-thread');
      const saved = state.importedData.chatSummaries?.[0];
      const overlay = document.getElementById('summary-modal-overlay');
      const modalBody = document.getElementById('summary-modal-body');
      outcomes.generatedSummarySavedToThreadAndProfile =
        generatedThread?.summary?.includes('Ferritin improved') === true
        && generatedThread.summaryModel === 'Summary Coverage Model'
        && generatedThread.summaryCost?.inputTokens === 64
        && saved?.threadId === 'summary-thread'
        && saved.content.includes('Retest vitamin D')
        && overlay?.dataset.syncRefreshSummaryId === saved.id
        && modalBody?.textContent.includes('Retest vitamin D') === true;
      outcomes.generateSummaryUsedPromptAndRenderedSideEffects =
        window.__summaryApiCalls?.length === 1
        && window.__summaryApiCalls[0].system.includes('concise medical note-taker')
        && window.__summaryApiCalls[0].messages[0].content.includes('Summarize this conversation transcript')
        && window.__summaryApiCalls[0].signalPresent === true
        && window.__summaryThreadIndexSaves === 1
        && window.__summaryDataSaves === 1
        && window.__summaryThreadListRenders === 1;

      summaries.renderSavedSummaries();
      outcomes.generatedSummaryRendersInSavedList =
        document.getElementById('chat-saved-summaries')?.textContent.includes('Generated Summary Thread') === true;

      summaries.closeSummaryModal();
      outcomes.exportedCloseHidesModal =
        document.getElementById('summary-modal-overlay')?.classList.contains('show') === false;

      saved.attribution = 'Written with Grok';
      generatedThread.summaryAttribution = 'Written with Grok';
      let copiedSummary = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async text => { copiedSummary = text; } },
      });
      summaries.viewSavedSummary(saved.id);
      await waitUntil(
        () => document.getElementById('summary-modal-overlay')?.classList.contains('show') === true,
        'saved summary modal reopen'
      );
      const reopenedBody = document.getElementById('summary-modal-body');
      summaries.copySummary();
      await Promise.resolve();
      outcomes.grokSummaryCarriesVisibleAndCopiedAttribution =
        document.getElementById('summary-modal-overlay')?.textContent.includes('Written with Grok') === true
        && copiedSummary.endsWith('Written with Grok');
      if (reopenedBody) reopenedBody.scrollTop = 11;
      saved.content = '## Key Findings\nSynced summary content.';
      window.dispatchEvent(new Event('labcharts-sync-applied'));
      await waitUntil(
        () => document.getElementById('summary-modal-body')?.textContent.includes('Synced summary content') === true,
        'summary sync refresh'
      );
      outcomes.syncRefreshUsesSummaryIdDataset =
        document.getElementById('summary-modal-overlay')?.dataset.syncRefreshSummaryId === saved.id
        && document.getElementById('summary-modal-body')?.textContent.includes('Synced summary content') === true;

      state.importedData.chatSummaries = [];
      window.dispatchEvent(new Event('labcharts-sync-applied'));
      await waitUntil(
        () => document.getElementById('summary-modal-overlay')?.classList.contains('show') === false,
        'summary sync close'
      );
      outcomes.syncRefreshClosesWhenSummaryDisappears =
        document.getElementById('summary-modal-overlay')?.classList.contains('show') === false;
    } finally {
      state.currentProfile = original.currentProfile;
      state.importedData = original.importedData;
      state.chatThreads = original.chatThreads;
      state.currentThreadId = original.currentThreadId;
      state.chatHistory = original.chatHistory;
      document.getElementById('summary-modal-overlay')?.remove();
      document.body.innerHTML = '';
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    summariesUrl: moduleUrl('/js/chat-summaries.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
