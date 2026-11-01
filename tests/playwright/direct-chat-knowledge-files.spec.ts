import { test } from './knowledge-native-fixture.js';
import { runKnowledgeManagementBrowserCase } from '../helpers/knowledge-management-browser-case.js';
for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) {
  test(`${provider} ${protocol} cannot request files or replay a historical import control from chat`, async ({ page, context }) => {
    await runKnowledgeManagementBrowserCase({ page, context }, provider, protocol, 'chosen files', true);
  });
}
