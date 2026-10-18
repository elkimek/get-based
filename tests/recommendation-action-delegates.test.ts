// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, expect, it, vi} from 'vitest';
import {initRecommendationDetailDelegates} from '../js/recommendation-action-delegates.js';
import {configureRecommendationsRuntime} from '../js/recommendations-runtime.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
afterEach(() => {document.body.replaceChildren(); vi.restoreAllMocks();});

it('owns one eager close delegate shared by canonical and fixed-retry action entries', async () => {
  const close = vi.fn(), previous = configureRecommendationsRuntime({closeModal: close});
  const add = vi.spyOn(document, 'addEventListener');
  initRecommendationDetailDelegates();
  const installs = add.mock.calls.filter(([event]) => event === 'click');
  expect(installs).toHaveLength(1);
  initRecommendationDetailDelegates();
  const canonical = await import('../js/recommendation-actions.js');
  const retry = await import('../js/recommendation-actions.js?lazy-retry=1' as '../js/recommendation-actions.js');
  expect(canonical.createRecommendationActions).not.toBe(retry.createRecommendationActions);
  expect(add.mock.calls.filter(([event]) => event === 'click')).toHaveLength(1);
  document.body.innerHTML = '<div id="detail-modal"><button data-recommendation-detail-action="close"><span>Close</span></button></div>'
    + '<button id="outside" data-recommendation-detail-action="close">Outside</button>';
  const click = new MouseEvent('click', {bubbles: true, cancelable: true});
  document.querySelector('#detail-modal span')!.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(close).toHaveBeenCalledTimes(1);
  document.getElementById('outside')!.click();
  expect(close).toHaveBeenCalledTimes(1);
  configureRecommendationsRuntime(previous);
});

it('retains the exact close action boundary in the eager owner while all Tips HTML remains cold', () => {
  const core = fs.readFileSync(path.join(ROOT, 'js/recommendation-action-delegates.ts'), 'utf8');
  const actions = fs.readFileSync(path.join(ROOT, 'js/recommendation-actions.ts'), 'utf8');
  const runtime = fs.readFileSync(path.join(ROOT, 'js/views-runtime.ts'), 'utf8');
  expect(core).toContain("actionEl.closest('#detail-modal')");
  expect(core).toContain("actionEl.dataset.recommendationDetailAction === 'close'");
  expect(core).toContain('event.preventDefault();\n    closeRecommendationsModal();');
  expect(core).toContain('if (recommendationDetailDelegatesInstalled) return;');
  expect(core).not.toContain('TipsDetail');
  expect(actions).toContain("from './recommendation-action-delegates.js'");
  expect(actions).toContain('initRecommendationDetailDelegates();');
  expect(actions).not.toContain('document.addEventListener');
  expect(runtime).toContain('initRecommendationDetailDelegates();');
});
