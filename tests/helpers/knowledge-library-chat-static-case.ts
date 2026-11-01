import type { Page, BrowserContext, TestInfo } from '@playwright/test';
import { runRetiredKnowledgeStaticCase } from './knowledge-chat-static-case.js';
export async function runKnowledgeLibraryChatStaticCase({ page, context }: { page: Page; context: BrowserContext }, info: TestInfo) { await runRetiredKnowledgeStaticCase('libraries', { page, context }, info); }
