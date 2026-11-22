// @vitest-environment jsdom
import {createRequire} from 'node:module';
import {expect, it} from 'vitest';
import {renderHTML as renderModal} from '../js/components/KnowledgeBaseModal.svelte.html.js';
import {renderHTML as renderDocuments} from '../js/components/KnowledgeBaseDocuments.svelte.html.js';
import {projectKnowledgeBasePanel, projectKnowledgeBaseStatus, projectKnowledgeBaseDocuments} from '../js/knowledge-base-presentation.js';
import {expectNativeReview} from './helpers/native-review-dom.js';

const load = createRequire(import.meta.url);
const name = '<strong>Literature collection</strong>';

it.each([
  {engine: 'in-browser', connected: false, enabled: false, usable: false, state: 'idle'},
  {engine: 'in-browser', connected: true, enabled: true, usable: false, state: 'ready'},
  {engine: 'in-browser', connected: true, enabled: true, usable: true, state: 'ready'},
  {engine: 'external-server', connected: false, enabled: false, usable: false, state: 'idle'},
  {engine: 'external-server', connected: true, enabled: true, usable: false, state: 'error'},
  {engine: 'external-server', connected: true, enabled: false, usable: true, state: 'ready'},
])('preserves actual $engine credentials and switches while $state ($connected/$enabled/$usable)', async setup => {
  const config = {
    backend: setup.engine, enabled: setup.enabled, topK: 5, name,
    url: 'http://127.0.0.1:8322/query', testProbe: 'Synthetic probe', multiQuery: setup.enabled,
  };
  const isBrowser = setup.engine === 'in-browser';
  const status = projectKnowledgeBaseStatus(config, setup.connected, isBrowser, setup.usable, {
    state: setup.state, lastChunkCount: setup.usable ? 2 : 0,
    lastError: setup.state === 'error' ? 'Local response unavailable <literal>' : null,
    sourceName: name,
  });
  const panel = projectKnowledgeBasePanel({
    config, isBrowser, isExternal: !isBrowser, connected: setup.connected,
    keySet: !isBrowser && setup.connected, status, defaultTestProbe: 'Default synthetic check',
  });
  const view = {showContextBack: isBrowser, panel};
  const native = load('../js/components/KnowledgeBaseModal.svelte.native.js') as typeof import('../js/components/KnowledgeBaseModal.svelte.native.js');
  await expectNativeReview(renderModal({view}), root => {
    const owned = native.mount(native.default, {target: root, props: {view}});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    expect(root.querySelector<HTMLInputElement>('#lens-enabled-toggle')?.checked).toBe(setup.enabled);
    expect(root.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute('data-lens-backend')).toBe(setup.engine);
    expect(root.querySelector('#lens-library-select') !== null).toBe(isBrowser);
    if (!isBrowser) {
      expect(root.querySelector<HTMLInputElement>('#lens-key-input')?.value).toBe(setup.connected ? '••••••••' : '');
      expect(root.querySelector<HTMLInputElement>('#lens-name-input')?.value).toBe(name);
    }
    expect(root.querySelector('literal')).toBeNull();
  });
});

it('binds native document actions to exact source titles and renders those titles as text', async () => {
  const source = '<span data-document-probe>Saved reading</span>';
  const docs = projectKnowledgeBaseDocuments([{source, chunks: 2}, {source: 'Conditions', chunks: 1}]);
  const native = load('../js/components/KnowledgeBaseDocuments.svelte.native.js') as typeof import('../js/components/KnowledgeBaseDocuments.svelte.native.js');
  const props = {documents: docs};
  await expectNativeReview(renderDocuments(props), root => {
    const owned = native.mount(native.default, {target: root, props});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    expect(root.textContent).toContain(source);
    expect(root.querySelector('[data-document-probe]')).toBeNull();
    expect(Array.from(root.querySelectorAll('[data-lens-action="delete-doc"]'), element => element.getAttribute('data-lens-source')))
      .toEqual([source, 'Conditions']);
  });
});
