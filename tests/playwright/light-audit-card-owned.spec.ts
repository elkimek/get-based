import fs from 'node:fs';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { scopedFrozenStyles, type FrozenStyleBlock } from '../helpers/frozen-style-scope.js';
interface Sample { name: string; data: unknown; expanded: string | null; callbacks: boolean; html: string }
const original = JSON.parse(fs.readFileSync('tests/fixtures/light-audit-original.json', 'utf8')) as {cases: Sample[]; styleBlocks: FrozenStyleBlock[]};
const examples = original.cases.filter(sample => ['expanded', 'empty-snapshot', 'no-readings', 'latest-reading', 'snapshot-screen'].includes(sample.name));

test('saved audit cards preserve frozen geometry and accessible snapshot controls', async ({page}, info) => {
  test.setTimeout(120000);
  await installDiscussionFixture(page.context()); await page.goto('/app');
  await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.emulateMedia({reducedMotion: 'reduce'});
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async ({examples, css}) => {
    localStorage.setItem('labcharts-ai-paused', 'true');
    await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const style = document.createElement('style');
    // Coarse inputs/delete controls gain the existing 44px editor target size.
    style.textContent = css + '@media(pointer:coarse){[data-original] .light-audit-card input,[data-original] .light-audit-footer button{min-height:44px}}';
    document.head.append(style);
    const host = document.createElement('div'); host.id = 'audit-card-acceptance';
    host.style.cssText = 'position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px'; document.body.append(host);
    const {state} = await import('/js/state.js');
    const {computeRoomSeverityForRoom} = await import('/js/light-env-model.js');
    const before = state.importedData;
    try {
      for (const [index, sample] of examples.entries()) {
        const api = await import(`/js/light-env-audits.js?audit-fixture=${index}`);
        (state as {importedData: unknown}).importedData = structuredClone(sample.data);
        api.configureLightEnvAudits({computeRoomSeverity: computeRoomSeverityForRoom, refreshLightEnvironmentUI: () => {}, renderAuditAIDot: () => sample.callbacks ? '<button type="button" data-fixture-audit-dot>Trusted audit dot</button>' : '', renderAuditAIBlock: () => sample.callbacks ? '<div data-fixture-audit-ai>Trusted audit verdict</div>' : ''});
        if (sample.expanded !== null) api.toggleLightAudit(sample.expanded);
        const pair = document.createElement('div'); pair.dataset.pair = sample.name;
        const reference = document.createElement('section'); reference.dataset.original = ''; reference.innerHTML = sample.html;
        const current = document.createElement('section'); current.dataset.current = ''; current.innerHTML = api.renderLightAuditsBlock();
        pair.append(reference, current); host.append(pair);
      }
    } finally { state.importedData = before; }
  }, {examples, css: scopedFrozenStyles(original.styleBlocks)});
  const host = page.locator('#audit-card-acceptance'); let pairs = 0;
  for (const width of [320, 600, 601, 1100]) for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
    await page.setViewportSize({width, height: 1000}); await page.mouse.move(0, 0);
    await page.evaluate(async theme => (await import('/js/theme.js')).setTheme(theme), theme);
    await host.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const failures = await host.evaluate(element => {
      const properties = ['display', 'width', 'height', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'gap', 'alignItems', 'borderTopWidth', 'borderTopStyle', 'borderRadius', 'whiteSpace', 'overflow', 'opacity', 'backgroundColor', 'color'] as const;
      const selectors = ['.light-audit-card', '.light-audit-header', '.light-audit-info', '.light-audit-info-top', '.light-audit-date', '.light-audit-label', '.light-audit-meta', '.light-audit-detail', '.light-audit-meta-row', '.light-audit-meta-field', '.light-audit-meta-field-text', '.ctx-input', '.light-audit-rooms', '.light-audit-room-card', '.light-audit-room-head', '.light-audit-room-name', '.light-audit-room-status', '.light-audit-room-empty', '.light-audit-channel', '.light-audit-channel-label', '.light-audit-channel-value', '.light-audit-footer', '.light-audit-footer button', '.light-env-sev-dot', '.light-audit-empty'];
      const failures: string[] = [];
      for (const pair of element.querySelectorAll('[data-pair]')) for (const selector of selectors) {
        const old = [...pair.querySelector('[data-original]')!.querySelectorAll(selector)];
        const current = [...pair.querySelector('[data-current]')!.querySelectorAll(selector)];
        if (old.length !== current.length) { failures.push(`${pair.getAttribute('data-pair')}/${selector} count ${old.length}/${current.length}`); continue; }
        old.forEach((node, index) => {
          const a = getComputedStyle(node), b = getComputedStyle(current[index]!);
          for (const property of properties) if (a[property] !== b[property]) failures.push(`${pair.getAttribute('data-pair')}/${selector}/${index}/${property}: ${b[property]} != ${a[property]}`);
        });
      }
      return failures;
    });
    expect(failures, `${width}/${theme} frozen audit geometry and palette`).toEqual([]); pairs += examples.length;
  }
  await host.locator('[data-original]').evaluateAll(elements => elements.forEach(element => element.remove()));
  const structural = await host.evaluate(element => ({nested: element.querySelectorAll('.light-audit-card button button,.light-audit-card [role="button"] button').length, native: [...element.querySelectorAll('[data-light-env-action="toggle-audit"]')].every(node => node.tagName === 'BUTTON')}));
  expect(structural).toEqual({nested: 0, native: true});
  let controls = 0;
  for (const control of await host.locator('[data-current] .light-audit-card [data-light-env-action]').all()) {
    await control.focus(); await expect(control).toBeFocused(); controls++;
    expect(await control.evaluate(node => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2);
  }
  await info.attach('audit-card-parity.json', {body: JSON.stringify({pairs, controls, widths: [320,600,601,1100], themes: 6, structural, pageErrors: errors}), contentType: 'application/json'});
  expect(errors).toEqual([]);
});

test('native audit disclosure activates once by keyboard and leaves AI actions independent', async ({page}) => {
  await installDiscussionFixture(page.context()); await page.goto('/app');
  await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.evaluate(async sample => {
    localStorage.setItem('labcharts-ai-paused', 'true');
    await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const {state} = await import('/js/state.js'); const api = await import('/js/light-env-audits.js' + '?audit-keyboard') as typeof import('../../js/light-env-audits.js');
    const {installLightEnvActionDelegates} = await import('/js/light-env-actions.js');
    (state as {importedData: unknown}).importedData = structuredClone(sample.data);
    const host = document.createElement('div'); host.id = 'audit-keyboard'; host.style.cssText = 'position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px'; document.body.append(host);
    const calls: string[] = []; Object.assign(window, {auditKeyboardCalls: calls});
    const render = () => { host.innerHTML = api.renderLightAuditsBlock(); };
    api.configureLightEnvAudits({refreshLightEnvironmentUI: render, renderAuditAIDot: () => '<button type="button" data-fixture-audit-dot>AI verdict</button>'});
    api.setLightAuditsBlockOpen(true); render();
    host.addEventListener('click', event => { if ((event.target as Element).closest('[data-fixture-audit-dot]')) calls.push('ai'); });
    installLightEnvActionDelegates({...api.lightEnvAuditActionHandlers, toggleLightAudit: (id: unknown) => {calls.push('toggle'); api.toggleLightAudit(id);}}, host);
  }, original.cases.find(sample => sample.name === 'collapsed')!);
  const host = page.locator('#audit-keyboard'), toggle = host.locator('[data-light-env-action="toggle-audit"]');
  await toggle.focus(); await toggle.press('Enter'); await expect(host.locator('.light-audit-card')).toHaveClass(/expanded/);
  await expect.poll(() => page.evaluate(() => (window as unknown as {auditKeyboardCalls: string[]}).auditKeyboardCalls)).toEqual(['toggle']);
  await host.locator('[data-fixture-audit-dot]').click(); await expect(host.locator('.light-audit-card')).toHaveClass(/expanded/);
  await toggle.focus(); await toggle.press('Space'); await expect(host.locator('.light-audit-card')).not.toHaveClass(/expanded/);
  expect(await page.evaluate(() => (window as unknown as {auditKeyboardCalls: string[]}).auditKeyboardCalls)).toEqual(['toggle', 'ai', 'toggle']);
});
