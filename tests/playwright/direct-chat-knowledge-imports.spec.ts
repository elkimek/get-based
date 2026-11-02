import { test } from './knowledge-native-fixture.js';
import { runKnowledgeManagementBrowserCase } from '../helpers/knowledge-management-browser-case.js';
for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const request of ['inventory', 'pasted text', 'replacement', 'native UI help'] as const) {
  test(`${provider} ${protocol} keeps Knowledge Base ${request} management in the native UI`, async ({ page, context }) => {
    await runKnowledgeManagementBrowserCase({ page, context }, provider, protocol, request);
  });
}
