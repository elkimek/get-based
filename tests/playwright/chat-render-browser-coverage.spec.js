import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?chatRenderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('chat render browser coverage handles lens sources and rich transcript UI', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-messages', { state: 'attached' });

  const results = await page.evaluate(async ({ chatRenderUrl }) => {
    const [{ state }, chatRender, chatActions, recommendationRuntime] = await Promise.all([
      import('/js/state.js'),
      import(chatRenderUrl),
      import('/js/chat-actions.js'),
      import('/js/recommendations-runtime.js'),
    ]);
    const outcomes = {};
    const messages = document.getElementById('chat-messages');
    const panel = document.getElementById('chat-panel');
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const saved = {
      chatHistory: state.chatHistory,
      messagesHTML: messages?.innerHTML,
      messagesId: messages?.id,
      panelClass: panel?.className,
    };
    const savedCatalog = recommendationRuntime.getRecommendationsCatalogCache();
    let previousRecommendationBridge = null;
    let emfOpens = 0;
    const restoreChatActions = chatActions.configureChatMessageActionDeps({
      openEMFAssessmentEditor: () => { emfOpens += 1; },
    });

    try {
      const sourceHtml = chatRender._renderLensSources([
        { source: 'report <one>.md', score: 0.934, text: 'Ferritin <low>\nLine two' },
        { text: 'No named source' },
      ], 'Private <Vault>');
      const sourceHost = document.createElement('div');
      sourceHost.innerHTML = sourceHtml;
      outcomes.lensSourcesEscapesLabelsScoresAndText = sourceHost.querySelector('.chat-lens-sources-summary')?.textContent ===
          '📎 2 excerpts from Private <Vault>'
        && sourceHost.querySelector('.chat-lens-source-name')?.textContent === 'report <one>.md'
        && sourceHost.querySelector('.chat-lens-source-score')?.textContent === '0.93'
        && sourceHost.querySelector('.chat-lens-source-text')?.innerHTML.includes('Ferritin &lt;low&gt;<br>Line two') === true
        && sourceHost.querySelectorAll('.chat-lens-source').length === 2;
      outcomes.lensSourcesEmptyInputReturnsBlank = chatRender._renderLensSources([], '') === '';

      if (messages) {
        messages.id = 'chat-messages-off';
        chatRender.renderChatMessages();
        outcomes.renderMissingContainerIsNoop = messages.id === 'chat-messages-off';
        messages.id = saved.messagesId || 'chat-messages';
      }

      previousRecommendationBridge = recommendationRuntime.configureRecommendationModuleBridge({
        isProductRecsEnabled: () => true,
        renderRecommendationSectionSync: (slot, { label, maxProducts }) => `
          <div class="rec-disclosure-banner">Disclosure for ${slot}</div>
          <section class="rec-section" data-max="${maxProducts}">
            <h3 class="rec-section-header">${label}</h3>
            <p>${slot}</p>
          </section>
        `,
      });
      recommendationRuntime.setRecommendationsCatalogCache({
        slots: {
          'emf.bedroom': { label: 'Bedroom EMF' },
          'sleep.blackout': { label: 'Blackout setup' },
        },
      });
      state.chatHistory = [
        {
          joined: true,
          joinIcon: '<img src=x onerror=\"window.__chatImportXss=1\">',
          joinName: 'Dr <Ada>',
        },
        { role: 'user', hidden: true, content: 'Hidden setup should not render' },
        {
          role: 'user',
          content: 'Hello **team**',
          hasImages: true,
          imageCount: 2,
        },
        {
          role: 'assistant',
          personalityName: 'Lab <Guide>',
          personalityIcon: '<svg onload=\"window.__chatImportXss=1\">',
          content: 'Here is **analysis**',
          auto: true,
          stopped: true,
          truncated: true,
          hasImages: true,
          thumbnails: [
            tinyPng,
            'data:image/svg+xml,<svg onload=\"window.__chatImportXss=1\">',
            'x\" onerror=\"window.__chatImportXss=1',
          ],
          usage: { inputTokens: 120, outputTokens: 180 },
          provider: 'openrouter',
          modelId: 'openai/gpt-4o-mini',
          modelDisplay: 'Coverage Model',
          webSearch: true,
          e2ee: true,
          attestation: {
            nonceVerified: true,
            signingKeyBound: true,
            debugMode: false,
            serverTdxValid: true,
          },
          lensSources: [
            { source: 'lab <note>.txt', score: 0.876, text: 'Root cause <maybe>\nSecond line' },
          ],
          lensSourceName: 'Knowledge <Base>',
          emfHint: true,
          recSlots: ['emf.bedroom', 'sleep.blackout'],
        },
        {
          role: 'assistant',
          personalityName: 'Lab <Guide>',
          personalityIcon: '#',
          content: 'Follow-up answer',
          hasImages: true,
          imageCount: 1,
        },
      ];

      chatRender.renderChatMessages();
      const rendered = document.getElementById('chat-messages');
      const chatMessages = [...rendered.querySelectorAll('.chat-msg')];
      const costFootnote = rendered.querySelector('.chat-cost-footnote')?.textContent || '';

      outcomes.richTranscriptSkipsHiddenAndShowsJoined = rendered.textContent.includes('Dr <Ada> joined the discussion')
        && !rendered.textContent.includes('Hidden setup should not render')
        && chatMessages.length === 3;
      outcomes.personaMarkdownAndClassesRender = rendered.querySelectorAll('.chat-persona-label').length === 1
        && rendered.querySelector('.chat-persona-label')?.textContent.includes('Lab <Guide>')
        && rendered.querySelector('.chat-msg.chat-user strong')?.textContent === 'team'
        && rendered.querySelector('.chat-msg.chat-ai.chat-msg-auto strong')?.textContent === 'analysis';
      outcomes.imagesRenderAsBadgeAndThumbnail = rendered.querySelector('.chat-image-badge')?.textContent.includes('2 images attached') === true
        && rendered.querySelector('.chat-image-thumbs img.chat-image-thumb')?.getAttribute('src') === tinyPng
        && rendered.querySelectorAll('.chat-image-thumbs img.chat-image-thumb').length === 1
        && rendered.querySelectorAll('.chat-image-badge').length === 2;
      outcomes.importedMarkupCannotCreateExecutableElements =
        rendered.querySelectorAll('[onerror], [onload]').length === 0
        && rendered.textContent.includes('<img src=x onerror=\"window.__chatImportXss=1\">')
        && rendered.textContent.includes('<svg onload=\"window.__chatImportXss=1\">')
        && !window.__chatImportXss;
      outcomes.usageFootnoteIncludesProviderContext = costFootnote.includes('Coverage Model')
        && costFootnote.includes('300 tokens')
        && costFootnote.includes('web')
        && costFootnote.includes('e2ee');
      outcomes.assistantExtrasRender = rendered.textContent.includes('[stopped]')
        && rendered.textContent.includes('[output limit reached - ask "continue" to finish]')
        && rendered.querySelector('.chat-action-bar') !== null
        && rendered.querySelector('.chat-lens-sources-summary')?.textContent === '📎 1 excerpt from Knowledge <Base>'
        && rendered.querySelector('.chat-lens-source-score')?.textContent === '0.88'
        && rendered.querySelector('.chat-lens-source-text')?.innerHTML.includes('Root cause &lt;maybe&gt;<br>Second line') === true;
      rendered.querySelector('.chat-emf-hint a')?.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      }));
      outcomes.emfHintClickUsesEditor = emfOpens === 1;
      outcomes.recommendationSectionsRenderDedupedDisclosure =
        rendered.querySelector('.rec-chat-summary')?.textContent === 'What can help'
        && rendered.querySelectorAll('.rec-disclosure-banner').length === 1
        && [...rendered.querySelectorAll('.rec-chat-subheading')].map(el => el.textContent).join('|') ===
          'Bedroom EMF|Blackout setup';
    } finally {
      state.chatHistory = saved.chatHistory;
      if (messages) {
        messages.id = saved.messagesId || 'chat-messages';
        messages.innerHTML = saved.messagesHTML || '';
      }
      if (panel && saved.panelClass != null) panel.className = saved.panelClass;
      if (previousRecommendationBridge) {
        recommendationRuntime.configureRecommendationModuleBridge(previousRecommendationBridge);
      }
      recommendationRuntime.setRecommendationsCatalogCache(savedCatalog);
      chatActions.configureChatMessageActionDeps(restoreChatActions);
    }

    return outcomes;
  }, {
    chatRenderUrl: moduleUrl('/js/chat-render.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
