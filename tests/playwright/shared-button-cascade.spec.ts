import {readFileSync} from 'node:fs';
import {expect,test} from './coverage-fixture.js';
import {routeHtml,routeCss} from '../helpers/browser-static-routes.js';
test('shared buttons retain native specificity and exclude authored Chat empty controls',async({page})=>{
 await routeCss(page,'**/shared-button-source.css',readFileSync('css/app-shell.css','utf8'));
 await routeHtml(page,'**/shared-button-cascade-test','<!doctype html><html lang="en"><head><title>Shared button cascade</title><link rel="stylesheet" href="/shared-button-source.css"><style>.feature{font-size:12px;padding:4px 10px}.feature:hover{font-size:13px}</style></head><body><button id="feature" class="import-btn feature">Feature action</button><button id="shared" class="import-btn">Shared action</button><div data-chat-empty-view><button id="empty" class="import-btn">Chat action</button></div></body></html>');
 await page.goto('/shared-button-cascade-test');
 await expect(page.locator('#feature')).toHaveCSS('font-size','12px');await expect(page.locator('#feature')).toHaveCSS('padding','4px 10px');
 await expect(page.locator('#shared')).toHaveCSS('font-size','14px');await expect(page.locator('#shared')).toHaveCSS('padding','8px 18px');
 expect(await page.locator('#empty').evaluate(el=>getComputedStyle(el).padding)).not.toBe('8px 18px');
 await page.locator('#feature').hover();await expect(page.locator('#feature')).toHaveCSS('font-size','13px');
 await page.locator('#shared').evaluate(el=>(el as HTMLButtonElement).disabled=true);await expect(page.locator('#shared')).toHaveCSS('opacity','0.5');
});
