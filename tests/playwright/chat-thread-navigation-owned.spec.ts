import { expect, test } from './coverage-fixture.js';
import { routeHtml } from '../helpers/browser-static-routes.js';

test.describe('coarse-pointer conversation navigation', () => {
  test.use({hasTouch: true});

test('owned Chat navigation retains accessible themes layouts menus and private result dispatch', async ({ page, context }) => {
  test.setTimeout(180000);
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await routeHtml(page, '**/chat-navigation-owned-test', '<!doctype html><html lang="en"><head><title>Conversation navigation</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/chat-panel-open.css"><link rel="stylesheet" href="/css/chat-mobile.css"><link rel="stylesheet" href="/css/chat-redesign-open.css"></head><body><main aria-label="Conversations" style="width:min(100%,280px);height:700px;display:flex"><div id="chat-thread-list" class="chat-thread-list" tabindex="0"></div></main><button id="outside">Outside</button></body></html>');
  await page.goto('/chat-navigation-owned-test');
  await page.evaluate(async () => {
    const { mountChatThreadNavigation } = await import('/js/chat-thread-navigation-component.js');
    const { projectThreadNavigation } = await import('/js/chat-thread-navigation-presentation.js');
    const stamp = new Date().toISOString();
    const initial = projectThreadNavigation([
      { id:'a',name:'Pinned conversation',createdAt:stamp,updatedAt:stamp,messageCount:1,pinned:true },
      { id:'b',name:'Long conversation about metabolic health and thyroid results',createdAt:stamp,updatedAt:stamp,messageCount:12,projectName:'Health project' },
      { id:'c',name:'Other conversation',createdAt:stamp,updatedAt:stamp,messageCount:2 },
    ],'a','recent','',['Health project'],{default:'🔬'});
    const record = (action: string) => { document.body.dataset.action = action; document.body.dataset.count = String(Number(document.body.dataset.count || 0) + 1); };
    mountChatThreadNavigation(document.getElementById('chat-thread-list')!,initial,{switch:id=>record('switch:'+id),pin:id=>record('pin:'+id),rename:id=>record('rename:'+id),delete:id=>record('delete:'+id),move:(id,project)=>record('move:'+id+':'+project),renameProject:project=>record('rename-project:'+project),deleteProject:project=>record('delete-project:'+project),jump:result=>record('jump:'+result.threadId)},()=>true);
  });
  await page.evaluate(async () => {
    const view = (await import('/js/chat-thread-navigation-component.js')).getChatThreadNavigationView()!;
    view.setSearch({phase:'done',progress:'',results:[{threadId:'a',threadName:'<script>literal</script>',msgIndex:0,role:'user',pre:'<svg>',match:'needle',post:'</svg>',contentPrefix:'PRIVATE-RESULT-PREFIX'}],truncated:false});
  });
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  const owner = page.locator('[data-chat-thread-navigation-view]');
  const summary = owner.locator('[data-thread-id="a"] summary');
  for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
    await page.evaluate(async theme => { const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); },theme);
    for (const width of [1280,700,390,320]) {
      await page.setViewportSize({width,height:900}); const label = `${theme}/${width}`;
      expect(await owner.evaluate(element => element.scrollWidth <= element.clientWidth + 1),label).toBe(true);
      await summary.click(); await expect(summary.locator('..')).toHaveAttribute('open','');
      for (const control of await owner.locator('button:visible,summary:visible').all()) {
        const box = await control.boundingBox(); expect(box!.height,label).toBeGreaterThanOrEqual(44); expect(box!.width,label).toBeGreaterThanOrEqual(44);
      }
      const popover = owner.locator('details[open] .chat-thread-item-menu-popover');
      const box = await popover.boundingBox(); expect(box!.x,label).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width,label).toBeLessThanOrEqual(width);
      const violations = await owner.evaluate(async element => (await (window as unknown as {axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
      expect(violations,label).toEqual([]);
      await summary.press('Escape'); await expect(summary).toBeFocused(); await expect(summary.locator('..')).not.toHaveAttribute('open');
    }
  }
  await summary.click(); await owner.locator('[data-thread-id="a"] [data-chat-thread-action="pin"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-action','pin:a'); await expect(page.locator('body')).toHaveAttribute('data-count','1');
  const project = owner.locator('.chat-project-action'); await project.click(); await page.locator('#outside').click(); await expect(project.locator('..')).not.toHaveAttribute('open');
  await expect(owner.locator('.chat-search-result-thread')).toHaveText('<script>literal</script>');
  expect(await owner.innerHTML()).not.toContain('PRIVATE-RESULT-PREFIX');
  await owner.locator('.chat-search-result').click(); await expect(page.locator('body')).toHaveAttribute('data-count','2'); await expect(page.locator('body')).toHaveAttribute('data-action','jump:a');
  await page.screenshot({path:test.info().outputPath('chat-navigation-mobile.png'),fullPage:true});
});

});

test('fine-pointer desktop navigation retains compact controls and keyboard menus', async ({page}) => {
  await routeHtml(page, '**/chat-navigation-fine-test', '<!doctype html><html lang="en"><head><title>Fine conversation navigation</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/chat-panel-open.css"><link rel="stylesheet" href="/css/chat-redesign-open.css"></head><body><main style="width:280px;height:700px"><div id="chat-thread-list"></div></main></body></html>');
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto('/chat-navigation-fine-test');
  expect(await page.evaluate(() => matchMedia('(pointer: fine)').matches)).toBe(true);
  await page.evaluate(async () => {
    const {mountChatThreadNavigation} = await import('/js/chat-thread-navigation-component.js');
    const {projectThreadNavigation} = await import('/js/chat-thread-navigation-presentation.js');
    const stamp = new Date().toISOString();
    mountChatThreadNavigation(document.getElementById('chat-thread-list')!, projectThreadNavigation([
      {id: 'fine', name: 'Compact desktop conversation', createdAt: stamp, updatedAt: stamp, messageCount: 1},
    ], 'fine', 'recent', '', [], {default: '🔬'}), {
      switch: () => {}, pin: () => {}, rename: () => {}, delete: () => {}, move: () => {},
      renameProject: () => {}, deleteProject: () => {}, jump: () => {},
    }, () => true);
  });
  const owner = page.locator('[data-chat-thread-navigation-view]'), summary = owner.locator('summary');
  await expect(summary).toHaveCSS('width', '20px');
  await expect(summary).toHaveCSS('height', '20px');
  await summary.focus(); await summary.press('Enter');
  await expect(summary.locator('..')).toHaveAttribute('open', '');
  for (const button of await owner.locator('.chat-thread-item-menu-popover button:visible').all()) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(32); expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await summary.press('Escape');
  await expect(summary).toBeFocused(); await expect(summary.locator('..')).not.toHaveAttribute('open');
});
