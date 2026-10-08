import { scopedFrozenStyles } from '../helpers/frozen-style-scope.js';
import fs from 'node:fs';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import type { AIVerdictStatus } from '../../js/ai-verdict-engine.js';
interface Example { kind: import('../../js/light-environment-ai-presentation.js').EnvironmentAIKind; status: AIVerdictStatus; analysis: { dot?: string; tip?: string; detail?: string; errorMessage?: string } | null; provider: boolean; html: string }
const original = JSON.parse(fs.readFileSync('tests/fixtures/light-environment-ai-original.json', 'utf8')) as { cases: Example[]; sharedInlineCSS: { selector: string; declarations: string; media: string | null }[]; sharedVerdictCSS: { selector: string; declarations: string; media: string | null }[]; styleBlocks: { selector: string; declarations: string; media: string | null }[] };
const examples = original.cases.filter(item => item.provider && item.html);
test('authored environment verdicts retain original geometry, accessible themes, keyboard actions and render ownership', async ({ page }, info) => {
  test.setTimeout(120000); await installDiscussionFixture(page.context()); await page.goto('/app');
  await page.evaluate(async originalCSS => {
    const style = document.createElement('style'); style.textContent = originalCSS;
    // Explicit touch improvement: the legacy room override reduced the 44px target to 28px.
    // Apply only this declared improvement to the reference, including its layout consequences.
    style.textContent += '@media (pointer:coarse) { [data-original] .light-env-room-ai-refresh { min-height:44px; } }';
    document.head.append(style);
    localStorage.setItem('labcharts-ai-paused','true'); await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const host = document.createElement('div'); host.id = 'environment-ai-acceptance'; host.style.cssText = 'position:fixed;inset:16px;overflow:auto;z-index:20000;background:var(--bg-primary);padding:12px'; document.body.append(host);
  }, scopedFrozenStyles([...original.sharedInlineCSS, ...original.sharedVerdictCSS, ...original.styleBlocks]));
  const host = page.locator('#environment-ai-acceptance'); let pairs = 0;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320,1100]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']) {
      await page.evaluate(async theme => (await import('/js/theme.js')).setTheme(theme), theme);
      const result = await host.evaluate(async (element, { examples, theme }) => {
        const [{ projectEnvironmentAI }, { renderHTML }, { aiActionOwner }] = await Promise.all([import('/js/light-environment-ai-presentation.js'),import('/js/components/LightEnvironmentAI.svelte.html.js'),import('/js/ai-action-delegates.js')]);
        element.innerHTML = examples.map((example, index) => `<div data-pair="${index}"><section style="${example.kind === 'measurement' ? 'display:flex;flex-wrap:wrap' : ''}" data-original inert aria-hidden="true">${example.html}</section><section style="${example.kind === 'measurement' ? 'display:flex;flex-wrap:wrap' : ''}" data-current>${renderHTML({ view: projectEnvironmentAI({ kind: example.kind, status: example.status, targetId: 'session-1', actionOwner: aiActionOwner(), analysis: example.analysis }) })}</section></div>`).join('');
        const props = ['display','gridTemplateColumns','marginLeft','letterSpacing','fontFamily','borderTopStyle','borderTopColor','width','height','fontSize','fontWeight','lineHeight','marginTop','marginBottom','paddingTop','paddingRight','paddingBottom','paddingLeft','gap','alignItems','flexGrow','flexShrink','minWidth','borderTopWidth','borderLeftWidth','borderLeftColor','backgroundColor','borderRadius','whiteSpace','textOverflow','color'] as const;
        const errors: string[] = []; let pairs = 0;
        const probe = document.createElement('span'); probe.style.transition = 'none'; element.append(probe);
        const color = (name: string) => { probe.style.color = name.startsWith('--') ? `var(${name})` : name; return getComputedStyle(probe).color; };
        for (const pair of element.querySelectorAll('[data-pair]')) {
          const original = pair.querySelector('[data-original]')!, current = pair.querySelector('[data-current]')!;
          const oldNodes = [...original.querySelectorAll('*')], newNodes = [...current.querySelectorAll('*')];
          if (oldNodes.length !== newNodes.length) { errors.push(`node count ${pair.getAttribute('data-pair')}: ${oldNodes.length}/${newNodes.length}`); continue; }
          for (let n = 0; n < oldNodes.length; n++) {
            const oldStyle = getComputedStyle(oldNodes[n]!), node = newNodes[n]!, next = getComputedStyle(node);
            for (const property of props) {
              let expected = oldStyle[property];
              // Coarse CTA minimum width is explicit; the original cascade reset it to zero.
              if (property === 'minWidth' && node.tagName === 'BUTTON' && matchMedia('(pointer:coarse)').matches) expected = '44px';
              if (property === 'color' || property === 'borderLeftColor' && oldStyle.borderLeftWidth === '0px' && oldStyle.borderLeftColor === oldStyle.color || property === 'borderTopColor' && oldStyle.borderTopWidth === '0px' && oldStyle.borderTopColor === oldStyle.color) {
                const tone = ['green','yellow','red'].find(tone => node.closest(`.sun-session-ai-tip-${tone}`));
                if (node.matches('.sun-session-ai-cta')) expected = color(theme === 'light' ? 'color-mix(in srgb, var(--accent-light) 90%, var(--text-primary))' : '--accent-light');
                else if (tone) expected = color(tone === 'green' ? '--success-ink' : tone === 'yellow' ? '--warning-ink' : '--danger-ink');
                else if (['neuromancer','cyberterm'].includes(theme) && node.tagName !== 'BUTTON' && (node.matches('.sun-session-ai-tip,.sun-detail-ai-body,.sun-detail-ai-loading,.sun-detail-ai-error,.sun-detail-ai-idle,.light-env-room-ai-label,.light-env-screen-ai-head,.light-audit-ai-head') || node.closest('.sun-session-ai-tip,.sun-detail-ai-body,.sun-detail-ai-loading,.sun-detail-ai-error,.sun-detail-ai-idle,.light-env-room-ai-label,.light-env-screen-ai-head,.light-audit-ai-head'))) expected = color('--text-secondary');
              }
              if (next[property] !== expected) errors.push(`${pair.getAttribute('data-pair')}/${n}/${property}: ${next[property]} != ${expected}`);
            }
          }
          pairs++; original.remove();
        }
        probe.remove(); return { errors, pairs, overflow: element.scrollWidth - element.clientWidth };
      }, { examples, theme });
      expect(result.errors, `${width}/${theme} original style parity`).toEqual([]); pairs += result.pairs;
      expect(result.overflow, `${width}/${theme} overflow`).toBeLessThanOrEqual(1);
      // Let the new theme paint before axe samples hit-tested background colors.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await host.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element,{ runOnly: { type: 'tag',values:['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target:n.target,summary:n.failureSummary })) }))), `${width}/${theme} accessibility`).toEqual([]);
      for (const button of await host.locator('button').all()) {
        await button.focus(); await expect(button).toBeFocused(); await expect(button).toHaveCSS('outline-width','2px');
        if (await page.evaluate(() => matchMedia('(pointer:coarse)').matches)) { const box = await button.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44); }
      }
    }
  }
  expect(pairs).toBe(examples.length * 12); await fs.promises.writeFile(info.outputPath('environment-ai-style-pairs.json'),JSON.stringify({pairs,examples:examples.length,themes:6,widths:2}));
  await host.evaluate(async element => {
    const [{ projectEnvironmentAI }, { renderHTML }, actions] = await Promise.all([import('/js/light-environment-ai-presentation.js'),import('/js/components/LightEnvironmentAI.svelte.html.js'),import('/js/ai-action-delegates.js')]);
    Object.assign(window,{sessionAIKeyboardCalls:0,sessionAIRowCalls:0});
    actions.registerAIActionHandler('refresh-measurement', () => { (window as unknown as { sessionAIKeyboardCalls: number }).sessionAIKeyboardCalls++; });
    element.innerHTML = renderHTML({view:projectEnvironmentAI({kind:'measurement',status:'ok',targetId:'session-1',actionOwner:actions.aiActionOwner(),analysis:{dot:'green',tip:'Saved context'}})});
    element.addEventListener('click', () => { (window as unknown as { sessionAIRowCalls:number }).sessionAIRowCalls++; });
  });
  const button = host.getByRole('button',{name:'Re-run AI analysis',exact:true});
  for (const key of ['Enter','Space']) { await button.focus(); await page.keyboard.press(key); }
  expect(await page.evaluate(() => ({calls:(window as unknown as {sessionAIKeyboardCalls:number}).sessionAIKeyboardCalls,rows:(window as unknown as {sessionAIRowCalls:number}).sessionAIRowCalls}))).toEqual({calls:2,rows:0});
  await page.evaluate(async () => { const {state}=await import('/js/state.js'); state.importedData=structuredClone(state.importedData); });
  await button.click(); expect(await page.evaluate(() => (window as unknown as {sessionAIKeyboardCalls:number}).sessionAIKeyboardCalls)).toBe(2);
  await host.evaluate(async element => {
    const [{ projectEnvironmentAI }, { renderHTML }, {aiActionOwner}] = await Promise.all([import('/js/light-environment-ai-presentation.js'),import('/js/components/LightEnvironmentAI.svelte.html.js'),import('/js/ai-action-delegates.js')]);
    element.innerHTML=renderHTML({view:projectEnvironmentAI({kind:'screen',status:'analyzing',targetId:'session-1',actionOwner:aiActionOwner(),analysis:null})});
  });
  await expect(host.locator('.sun-session-ai-dot-shimmer')).toHaveCSS('animation-name','none'); await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(host.locator('.sun-session-ai-dot-shimmer')).toHaveCSS('animation-name','shimmer');
  expect(await host.locator('.sun-session-ai-dot-shimmer').evaluate(element => element.getAnimations().filter(animation => animation instanceof CSSAnimation && animation.animationName === 'shimmer').length)).toBe(1);
});
