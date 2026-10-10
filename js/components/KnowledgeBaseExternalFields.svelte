<script lang="ts">
  import {
    knowledgeBaseClasses as c,
    knowledgeBaseUtilities as u,
  } from '../knowledge-base-classes.js';
  import type { KnowledgeBasePanelView } from '../knowledge-base-presentation.js';
  let { view }: {
    view: KnowledgeBasePanelView;
  } = $props();
</script>
<section class={c('kb-section')} id="lens-remote-fields" aria-labelledby="kb-server-heading">
  <div class={c('kb-section-head')}>
    <div>
      <h3 class={u('section-title')} id="kb-server-heading">Knowledge server</h3>
      <p class={u('section-description')}>Connect getbased to a RAG endpoint you control.</p>
    </div>
  </div>
  <details class={c('kb-setup-details')}>
    <summary class={u('setup-summary')}>Set up the local server on Linux</summary>
    <div class={c('kb-setup-body')}>
      <p class={u('setup-paragraph')}><strong>1. Install and start the agent stack</strong></p>
      <code class={c('kb-command')}>curl -sSL https://getbased.health/install.sh | bash</code>
      <p class={u('setup-paragraph')}><strong>2. Open the dashboard</strong> using the one-click login URL printed by the installer.</p>
      <p class={u('setup-paragraph')}><strong>3. In MCP → Environment, copy <code>LENS_API_KEY</code></strong> and paste it below.</p>
      <p class={[c('kb-field-help'), u('setup-paragraph')].join(' ')}><strong>Linux only for automatic startup.</strong> On macOS or Windows, follow the <a class={[u('section-link'), u('setup-link')].join(' ')} href="https://docs.getbased.health/guides/knowledge-base" target="_blank" rel="noopener">manual setup guide</a>.</p>
      <details class={c('kb-setup-audit')}>
        <summary class={[u('setup-summary'), u('audit-summary')].join(' ')}>Review the installer first</summary>
        <p class={u('setup-paragraph')}><a class={[u('section-link'), u('setup-link')].join(' ')} href="https://github.com/elkimek/get-based-site/blob/main/install.sh" target="_blank" rel="noopener">Read install.sh on GitHub →</a></p>
        <code class={c('kb-command')}>curl -sSL https://getbased.health/install.sh.sha256 | sha256sum -c</code>
      </details>
    </div>
  </details>
  <div class={c('kb-field-grid')}>
    <label class={c('kb-field')} for="lens-name-input">
      <span class={u('field-label')}>Display name</span>
      <input type="text" class={c('kb-field-control')} id="lens-name-input" value={view.name} placeholder="e.g. Functional Medicine Library">
      <small class={u('field-small')}>Shown in chat while this source is grounding an answer.</small>
    </label>
    <label class={c('kb-field')} for="lens-url-input">
      <span class={u('field-label')}>Endpoint URL</span>
      <input type="url" class={c('kb-field-control')} id="lens-url-input" value={view.url} placeholder="http://127.0.0.1:8322/query">
      <small class={u('field-small')}>Include the <code>/query</code> path.</small>
    </label>
    <label class={c('kb-field')} for="lens-key-input">
      <span class={u('field-label')}>API key</span>
      <input type="password" class={c('kb-field-control')} id="lens-key-input" value={view.keyPlaceholder} placeholder="Bearer token">
      <small class={u('field-small')}>Encrypted at rest on this device.</small>
    </label>
    <label class={c('kb-field')} for="lens-test-probe-input">
      <span class={u('field-label')}>Connection test query</span>
      <input type="text" class={c('kb-field-control')} id="lens-test-probe-input" value={view.testProbe} placeholder={view.defaultTestProbe}>
      <small class={u('field-small')}>Used once when you choose Save + connect.</small>
    </label>
  </div>
</section>
