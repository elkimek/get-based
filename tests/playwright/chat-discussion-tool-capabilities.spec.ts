import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture, installDiscussionProvider } from '../helpers/chat-discussion-fixture.js';

test('real discussion requests advertise only tools with handlers in that turn', async ({ page, context }) => {
  await installDiscussionFixture(context); await installDiscussionProvider(context);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app');
  const observed = await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
    const { state } = await import('/js/state.js'), before = JSON.stringify(state.importedData);
    const rounds = await import('/js/chat-discussion-round-request.js');
    const request = await rounds.buildDiscussionRoundRequest({ msgText: 'Explain healthy sleep in general.', roundHistory: [{ role: 'user', content: 'Explain healthy sleep in general.' }] });
    const result = await rounds.callDiscussionRoundAssistant({ request, profileId: state.currentProfile, onStream: () => {} });
    const wire = (window as unknown as { discussionRequests: { tools?: { function: { name: string } }[] }[] }).discussionRequests;
    return { text: result.text, catalogs: wire.filter(body => body.tools).map(body => body.tools!.map(tool => tool.function.name)), unchanged: JSON.stringify(state.importedData) === before };
  });
  expect(observed.text).toBe('Synthetic discussion reply.'); expect(observed.unchanged).toBe(true);
  expect(observed.catalogs).toEqual([[
    'getbased_lab_context', 'getbased_section', 'getbased_search_markers', 'getbased_marker_history',
    'getbased_nutrition_summary', 'getbased_wearable_series', 'getbased_search_knowledge', 'getbased_read_context_card',
    'getbased_read_data', 'getbased_draft_data', 'getbased_navigate', 'getbased_draft_context', 'getbased_search_conversations',
  ]]);
  expect(errors).toEqual([]);
});
