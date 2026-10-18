import {expect, it, vi} from 'vitest';
import {createDesktopDashboardRendererLoader, createMobileDashboardRendererLoader} from '../js/dashboard-renderer-loader.js';

type Desktop = Awaited<ReturnType<ReturnType<typeof createDesktopDashboardRendererLoader>['load']>>;
type Mobile = Awaited<ReturnType<ReturnType<typeof createMobileDashboardRendererLoader>['load']>>;
function deferred<T>() {
  let resolve!: (value:T) => void, reject!: (error:unknown) => void;
  const promise = new Promise<T>((yes,no) => {resolve=yes; reject=no;});
  return {promise,resolve,reject};
}
const desktop = ():Desktop => ({renderDesktopDashboardPage:()=>'desktop',hydrateDesktopDashboardPage:()=>{}});
const mobile = ():Mobile => ({renderMobileDashboardPage:()=>'mobile',hydrateMobileDashboardPage:()=>{}});

it('shares each cold request and keeps Desktop/Mobile renderer caches independent', async () => {
  const desktopRequest=deferred<Desktop>(), mobileRequest=deferred<Mobile>();
  const requestDesktop=vi.fn(()=>desktopRequest.promise), requestMobile=vi.fn(()=>mobileRequest.promise);
  const a=createDesktopDashboardRendererLoader(requestDesktop), b=createMobileDashboardRendererLoader(requestMobile);
  expect(a.getLoaded()).toBeNull();expect(b.getLoaded()).toBeNull();
  const first=a.load(), second=b.load();expect(a.load()).toBe(first);expect(b.load()).toBe(second);
  expect(requestDesktop.mock.calls).toEqual([[false]]);expect(requestMobile.mock.calls).toEqual([[false]]);
  const da=desktop(), mb=mobile();desktopRequest.resolve(da);expect(await first).toBe(da);
  expect(a.getLoaded()).toBe(da);expect(b.getLoaded()).toBeNull();expect(a.load()).toBe(first);
  mobileRequest.resolve(mb);expect(await second).toBe(mb);expect(b.getLoaded()).toBe(mb);
});
it('retries only the failed viewport through the fixed retry request and never publishes a failed module', async () => {
  const flags:boolean[]=[], failure=Error('offline'), da=desktop(), mb=mobile();
  const a=createDesktopDashboardRendererLoader(retry=>{flags.push(retry);return retry?Promise.resolve(da):Promise.reject(failure);});
  const b=createMobileDashboardRendererLoader(()=>Promise.resolve(mb));
  await expect(a.load()).rejects.toBe(failure);expect(a.getLoaded()).toBeNull();
  expect(await b.load()).toBe(mb);expect(await a.load()).toBe(da);expect(flags).toEqual([false,true]);
  expect(b.getLoaded()).toBe(mb);expect(a.getLoaded()).toBe(da);
});
it('releases failed Mobile requests independently', async () => {
  const flags:boolean[]=[], failure=Error('mobile offline'), mb=mobile();
  const loader=createMobileDashboardRendererLoader(retry=>{flags.push(retry);return retry?Promise.resolve(mb):Promise.reject(failure);});
  await expect(loader.load()).rejects.toBe(failure);expect(loader.getLoaded()).toBeNull();
  expect(await loader.load()).toBe(mb);expect(flags).toEqual([false,true]);
});
