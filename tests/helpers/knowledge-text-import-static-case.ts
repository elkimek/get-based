import type { Page, BrowserContext, TestInfo } from '@playwright/test';
import { runRetiredKnowledgeStaticCase } from './knowledge-chat-static-case.js';
export async function runKnowledgeFileImportStaticCase({ page, context }: { page: Page; context: BrowserContext }, info: TestInfo) { await runRetiredKnowledgeStaticCase('chosen files', { page, context }, info); }
export async function runKnowledgeTextImportStaticCase({ page, context }: { page: Page; context: BrowserContext }, info: TestInfo) { await runRetiredKnowledgeStaticCase('pasted text', { page, context }, info); }
