import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchOpenRouterModels, fetchPpqModels, fetchRoutstrModels, fetchVeniceModels,
  isRecommendedModel, selectLatestRecommendedModels,
} from '../js/api.js';
import { jsonResponse } from './helpers/http-responses.js';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });
const providers = ['openrouter', 'ppq', 'routstr', 'venice', 'custom'];
const ids = (models: Array<{ id: string }>) => models.map(model => model.id).sort();

describe('DeepSeek current-family recommendations', () => {
  it.each(providers)('prefers rolling aliases and keeps Flash and Pro distinct for %s', provider => {
    const catalog = [
      'deepseek/deepseek-v4-flash-0731', 'deepseek/deepseek-v4.1-flash-1017',
      '~deepseek/deepseek-v4-flash-latest', '~deepseek/deepseek-flash-latest',
      'deepseek/deepseek-v4-pro-0813', '~deepseek/deepseek-pro-latest',
    ].map(id => ({ id }));
    const expected = ['~deepseek/deepseek-flash-latest', '~deepseek/deepseek-pro-latest'];
    expect(ids(selectLatestRecommendedModels(provider, catalog))).toEqual(expected);
    expect(ids(selectLatestRecommendedModels(provider, [...catalog].reverse()))).toEqual(expected);
  });

  it.each(providers)('selects the newest release and revision across provider spellings for %s', provider => {
    for (const prefix of ['', 'deepseek/', 'deepseek-ai/']) {
      const catalog = ['deepseek-v4-flash-0731', 'deepseek-v4-1-flash', 'deepseek-v4.1-flash-1017:batch',
        'deepseek-v4-1-flash-1017', 'deepseek-v4-pro', 'deepseek-v4-pro-0813', 'deepseek-v3.2']
        .map(id => ({ id: prefix + id }));
      expect(ids(selectLatestRecommendedModels(provider, catalog)))
        .toEqual([prefix + 'deepseek-v4-1-flash-1017', prefix + 'deepseek-v4-pro-0813'].sort());
    }
  });

  it('automatically advances future versions, compares version components numerically, and scopes version aliases', () => {
    const catalog = ['deepseek-v4-flash-latest', 'deepseek-v4.1-flash-1017',
      'deepseek-v5.9-flash-1231', 'deepseek-v5.10-flash-0101',
      'deepseek-v4-pro-0813', 'deepseek-v5-pro-20270101', 'deepseek-v5-pro-latest'].map(id => ({ id }));
    expect(ids(selectLatestRecommendedModels('custom', catalog)))
      .toEqual(['deepseek-v5-pro-latest', 'deepseek-v5.10-flash-0101'].sort());
    expect(ids(selectLatestRecommendedModels('custom', [...catalog, { id: 'deepseek-flash' }])))
      .toEqual(['deepseek-flash', 'deepseek-v5-pro-latest']);
  });

  it('orders compact and separated full-date revisions consistently', () => {
    const older = { id: 'deepseek-v4.1-pro-20261017' };
    const newer = { id: 'deepseek-v4-1-pro-2026-10-18' };
    expect(selectLatestRecommendedModels('custom', [newer, older])).toEqual([newer]);
    expect(selectLatestRecommendedModels('custom', [older, newer])).toEqual([newer]);
  });

  it.each(providers)('does not promote specialized, legacy, third-party or unapproved private routes for %s', provider => {
    for (const id of ['deepseek-v3.2', 'deepseek-r1-0528', 'deepseek-v4-flash-vision-exp',
      'deepseek-v4-pro-preview', 'deepseek-v4-pro-coder', 'deepseek-v4-pro-0813-fast',
      'deepseek-v4-flash-distill', 'other/deepseek-flash-latest', 'private/deepseek-flash-latest',
      'tinfoil-deepseek-flash-latest', 'e2ee-deepseek-flash-latest']) {
      expect(isRecommendedModel(provider, id), id).toBe(false);
    }
  });

  it.each(providers)('recommends both Gemini tiers without reviving older Flash fallbacks for %s', provider => {
    const old = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview'].map(id => ({ id }));
    const prefix = provider === 'venice' ? '' : 'google/';
    const flash = { id: prefix + (provider === 'venice' ? 'gemini-3-8-flash' : 'gemini-3.8-flash') };
    const argon = { id: prefix + 'gemini-4-argon' };
    expect(selectLatestRecommendedModels(provider, [...old, { id: flash.id + ':batch' }, flash, argon])).toEqual([flash, argon]);
    expect(selectLatestRecommendedModels(provider, [flash])).toEqual([flash]);
    expect(selectLatestRecommendedModels(provider, old)).toEqual([]);
    expect(isRecommendedModel(provider, flash.id + '-cyber')).toBe(false);
  });

  it('preserves existing private and local recommendation policies', () => {
    expect(isRecommendedModel('routstr', 'tinfoil-deepseek-v4-pro')).toBe(true);
    expect(isRecommendedModel('ppq', 'private/deepseek-v4-1-flash')).toBe(false);
    expect(isRecommendedModel('venice', 'e2ee-deepseek-v4-flash')).toBe(false);
    expect(isRecommendedModel('ollama', 'deepseek-v4.1-flash-1017')).toBe(false);
  });

  it('preserves full-date revisions through provider discovery before choosing the newest', async () => {
    localStorage.setItem('labcharts-routstr-node', 'https://node.example.com');
    for (const [provider, fetchModels] of [
      ['openrouter', fetchOpenRouterModels], ['ppq', fetchPpqModels],
      ['routstr', fetchRoutstrModels], ['venice', fetchVeniceModels],
    ] as const) {
      const prefix = provider === 'venice' ? '' : 'deepseek/';
      const older = { id: prefix + 'deepseek-v4-pro-20261017', name: 'A older release', enabled: true, type: 'text' };
      const newer = { id: prefix + 'deepseek-v4-pro-20261018', name: 'Z newer release', enabled: true, type: 'text' };
      for (const rows of [[older, newer], [newer, older]]) {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: rows })));
        const catalog = await fetchModels();
        expect(ids(catalog)).toEqual(ids([older, newer]));
        expect(selectLatestRecommendedModels(provider, catalog)).toEqual([newer]);
      }
    }
  });

  it('discovers available DeepSeek routes with their original IDs and preserves selections and capability metadata', async () => {
    localStorage.setItem('labcharts-routstr-node', 'https://node.example.com');
    for (const [provider, fetchModels] of [
      ['openrouter', fetchOpenRouterModels], ['ppq', fetchPpqModels],
      ['routstr', fetchRoutstrModels], ['venice', fetchVeniceModels],
    ] as const) {
      const prefix = provider === 'venice' ? '' : 'deepseek/';
      const revision = { id: prefix + 'deepseek-v4.1-flash-1017', name: 'DeepSeek Flash 1017', enabled: true, type: 'text',
        architecture: { input_modalities: ['text', 'image'] } };
      const old = { id: prefix + 'deepseek-v4-flash-0731', enabled: true, type: 'text' };
      const rolling = { id: '~deepseek/deepseek-flash-latest', enabled: true, type: 'text' };
      const disabled = { id: '~deepseek/deepseek-pro-latest', enabled: false, type: 'text' };
      const rows = [old, revision, rolling, disabled];
      localStorage.setItem(`labcharts-${provider}-model`, old.id);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: rows })));
      const catalog = await fetchModels();
      expect(ids(catalog)).toEqual(ids([old, revision, rolling]));
      expect(ids(selectLatestRecommendedModels(provider, catalog))).toEqual([rolling.id]);
      expect(localStorage.getItem(`labcharts-${provider}-model`)).toBe(old.id);
      if (provider !== 'venice') {
        const vision = JSON.parse(localStorage.getItem(`labcharts-${provider}-vision-models`) || '[]');
        expect(vision).toContain(revision.id);
        expect(vision).not.toContain(rolling.id);
      }
      // A missing rolling alias must expose the newest actual release instead.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [old, revision, { ...rolling, enabled: false }] })));
      const refreshed = await fetchModels();
      expect(ids(selectLatestRecommendedModels(provider, refreshed))).toEqual([revision.id]);
    }
  });
});
