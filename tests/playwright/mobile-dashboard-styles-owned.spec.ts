import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect,test} from '@playwright/test';
import postcss from 'postcss';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const original=fs.readFileSync(path.join(root,'tests/fixtures/mobile-dashboard-original.css'),'utf8');
const compiled=fs.readFileSync(path.join(root,'css/mobile-dashboard.css'),'utf8');
const common=fs.readFileSync(path.join(root,'styles.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'themes-extra.css'),'utf8');
const properties=new Set<string>();postcss.parse(original).walkDecls(declaration=>{properties.add(declaration.prop);});
const props=[...properties].sort();
const stat=(kind:string)=>`<button class="m-stat-card ${kind}"><span class="m-stat-head"><span class="m-marker-dot"></span><span class="m-stat-label">Marker summary</span></span><strong>123<small>units</small></strong><span class="m-stat-meta">Recent result</span></button>`;
const insight=(kind:string)=>`<button class="m-insight ${kind}"><span class="m-insight-eyebrow">Research</span><strong>Review recent results</strong><span>Follow a familiar detailed workflow</span><small>Updated today</small></button>`;
const marker=(kind:string)=>`<button class="m-marker-row"><span class="m-marker-dot m-marker-${kind}"></span><span class="m-marker-main"><strong>Very long marker name for narrow screens</strong><small>Latest laboratory result</small></span><svg class="m-spark m-spark-${kind}" viewBox="0 0 74 32"><polyline points="0,24 30,15 74,8"/></svg><span class="m-marker-value"><strong>123.4</strong><small>mmol/L</small></span></button>`;
const markup=`<header class="header">getbased</header><div class="layout"><aside class="sidebar mobile-open">Sidebar</aside><main class="main"><section class="m-shell"><div class="m-bg"></div><div class="m-content"><div class="m-greeting dashboard-greeting"><h1>Good morning</h1><div class="m-greeting-sub">Your health dashboard</div></div><div class="m-stats">${['m-stat-normal','m-stat-high','m-stat-low','m-stat-summary'].map(stat).join('')}</div><section class="m-section"><div class="m-section-head"><span class="m-section-labels"><span class="m-section-title">Highlights</span><span class="m-section-count">Four items</span></span><button>View all</button></div><div class="m-insights">${['m-insight-danger','m-insight-warn','m-insight-good','m-insight-info'].map(insight).join('')}</div></section><div class="m-marker-list">${['normal','high','low'].map(marker).join('')}<span class="m-spark-empty"></span></div><div class="m-empty">No additional results</div><div class="m-wear-strip">${Array.from({length:4},()=>'<button class="m-wear-tile"><span class="m-wear-label">Activity data</span><strong>123<small>minutes</small></strong><span class="m-wear-change">+12 today</span></button>').join('')}</div><div class="m-wear-empty"><strong>Connect your wearable</strong><span>Activity stays available alongside your results.</span><button>Connect</button></div><div class="m-embedded-strip"><div class="light-today-strip"><div class="light-today-head"><span class="light-today-sub">Light exposure</span><a class="light-today-link">View details</a></div><div class="light-pills-row"><span class="light-pill">Morning</span><span class="light-pill">Afternoon</span></div></div><div class="wearable-strip"><div class="wearable-strip-head">Wearables</div><div class="wearable-metrics"><span class="wearable-card">Sleep</span></div></div><div class="wearable-strip-empty">Connect wearable</div><div class="genetics-section">Genome</div></div><div class="m-dashboard-widget-section"><div class="m-dashboard-widget-actions"><button class="dashboard-action-btn">Customize widgets</button></div><div class="m-dashboard-widgets">${['dashboard-widget','dashboard-widget-half','dashboard-widget-quarter','dashboard-widget-third','dashboard-widget-two-third'].map(kind=>`<section class="${kind}"><p class="dashboard-widget-description">A longer description wraps on a small screen.</p></section>`).join('')}</div></div></div></section></main></div><nav class="m-tabbar" aria-label="Primary navigation">${['Dashboard','Labs','Insight','Profile','Settings'].map((label,index)=>`<button class="m-tab ${index===0?'active':''}"><span class="m-tab-icon"><svg viewBox="0 0 24 24"><path d="M2 12H22"/></svg></span><small>${label}</small></button>`).join('')}</nav><button id="chat-fab">Chat</button><footer class="app-footer">Footer</footer>`;

for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
test(`Mobile Tailwind preserves native geometry and computed values across responsive boundaries: ${theme}`,async({page})=>{
  test.setTimeout(120_000);
  await page.route('**/*',route=>route.abort());
  let comparisons=0;
  for(const width of [320,375,390,540,768,799,800,1024])for(const mode of ['mobile-dashboard-active','mobile-tabs-active']){
    await page.setViewportSize({width,height:844});
    async function snapshot(css:string){
      await page.setContent(`<!doctype html><html lang="en" data-theme="${theme}" class="${mode}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${common}</style><style>${css}</style></head><body class="${mode}" style="--mobile-visual-bottom-offset:17px">${markup}</body></html>`);
      await page.evaluate(async()=>{await document.fonts.ready;for(const animation of document.getAnimations()){animation.pause();animation.currentTime=0;}});
      return page.evaluate(properties=>{
        const styles=(element:Element,pseudo?:string)=>{const computed=getComputedStyle(element,pseudo);return properties.map(property=>[property,computed.getPropertyValue(property)]);};
        return [...document.querySelectorAll('body,body *')].map(element=>{
          const rect=element.getBoundingClientRect();return {tag:element.tagName,classes:element.getAttribute('class'),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},styles:styles(element),before:styles(element,'::before'),after:styles(element,'::after')};
        });
      },props);
    }
    const native=await snapshot(original);const candidate=await snapshot(compiled);
    expect(candidate,`${width}px ${theme} ${mode}`).toEqual(native);comparisons++;
  }
  expect(comparisons).toBe(16);
});
}
