import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

const read=(name:string)=>readFileSync('js/'+name+'.ts','utf8');
it('keeps Dashboard presentation and hydration imports behind separate viewport renderer boundaries',()=>{
  const desktop=read('dashboard-page-view'),mobile=read('mobile-dashboard'),loader=read('dashboard-renderer-loader');
  expect(desktop).toContain("import type {DesktopDashboardPageView} from './desktop-dashboard-presentation.js';");
  expect(mobile).toContain("import type {MobileDashboardStackView} from './mobile-dashboard-presentation.js';");
  for(const source of [desktop,mobile]){
    expect(source).not.toContain("from './dashboard-page-hydration.js'");
    expect(source).not.toMatch(/import\s*\{[^}]*\b(?:renderDesktopDashboardPage|renderMobileDashboardPage|hydrateDesktopDashboardPage|hydrateMobileDashboardPage)\b[^}]*\}\s*from/);
  }
  for(const viewport of ['desktop','mobile']){
    const opposite=viewport==='desktop'?'mobile':'desktop';
    const renderer=read(viewport+'-dashboard-renderer'),hydration=read(viewport+'-dashboard-hydration');
    expect(renderer).toContain("from './"+viewport+"-dashboard-presentation.js'");expect(renderer).toContain("from './"+viewport+"-dashboard-hydration.js'");
    expect(renderer).not.toContain(opposite+'-dashboard');expect(hydration).not.toContain(opposite==='desktop'?'DesktopDashboardPage':'MobileDashboardPage');
    expect(loader).toContain("import('./"+viewport+"-dashboard-renderer.js')");
    expect(loader).toContain("import('./"+viewport+"-dashboard-renderer.js?lazy-retry=1' as './"+viewport+"-dashboard-renderer.js')");
  }
  expect(read('dashboard-page-hydration')).toBe("// Public compatibility facade; route owners load only their viewport renderer.\nexport {hydrateDesktopDashboardPage} from './desktop-dashboard-hydration.js';\nexport {hydrateMobileDashboardPage} from './mobile-dashboard-hydration.js';\n");
});
