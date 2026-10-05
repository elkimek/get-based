type VaultFixtureWindow = Window & {heldLock: Promise<unknown>; releaseVaultLock: () => void; concurrentWrite: Promise<unknown>; pendingInvalidation: Promise<void>};

import type {Page} from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
import {expect,test} from './coverage-fixture.js';
test.beforeEach(async({page})=>{
 await routeHtml(page, '**/sync-vault-harness', '<!doctype html><title>Vault regression fixture</title>');
 await page.goto('/sync-vault-harness');
});
test('invalidating a real IndexedDB read never restores the obsolete owner',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {createEvolu8IdentityVault}=await import('/js/sync-evolu8-identity-vault.js');
  const vault=createEvolu8IdentityVault();await vault.write({ownerId:'fixture-owner',mnemonic:'synthetic fixture words'});
  const pending=vault.read();const deletion=vault.invalidate();const identity=await pending;await deletion;return identity;
 });
 expect(result).toBeNull();
});
test('invalidating a pending first write cannot republish its commit token',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {createEvolu8IdentityVault,EVOLU8_IDENTITY_TOKEN_KEY}=await import('/js/sync-evolu8-identity-vault.js');
  const vault=createEvolu8IdentityVault();
  const pending=vault.write({ownerId:'fixture-owner',mnemonic:'synthetic fixture words'}).then(()=> 'committed',(error: unknown)=>(error as {message?: unknown}).message);
  await vault.invalidate();return {result:await pending,token:localStorage.getItem(EVOLU8_IDENTITY_TOKEN_KEY),identity:await vault.read()};
 });
 expect(result.result).toMatch(/invalidated|superseded/);expect(result.token).toBeNull();expect(result.identity).toBeNull();
});
test('a fresh write after invalidation persists across reload without exposing recovery words in localStorage',async({page})=>{
 await page.evaluate(async()=>{
  const {createEvolu8IdentityVault}=await import('/js/sync-evolu8-identity-vault.js');const vault=createEvolu8IdentityVault();
  await vault.write({ownerId:'old-fixture',mnemonic:'old synthetic fixture'});await vault.invalidate();
  await vault.write({ownerId:'new-fixture',mnemonic:'new synthetic fixture'});
 });
 await page.reload();
 const result=await page.evaluate(async()=>{
  const {createEvolu8IdentityVault}=await import('/js/sync-evolu8-identity-vault.js');return {identity:await createEvolu8IdentityVault().read(),local:Object.values(localStorage)};
 });
 expect(result.identity).toEqual({ownerId:'new-fixture',mnemonic:'new synthetic fixture'});expect(JSON.stringify(result.local)).not.toContain('synthetic fixture');
});
test('two tabs serialize durable writes and retain a readable final identity',async({page,context})=>{
 await context.route('**/sync-vault-second-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Second vault tab</title>'}));
 const second=await context.newPage();await second.goto('/sync-vault-second-harness');
 try {
  await page.evaluate(async()=>{
   let acquired: (() => void) | undefined;const ready=new Promise<void>(r=>{acquired=r;});
   (window as unknown as VaultFixtureWindow).heldLock=navigator.locks.request('getbased-evolu8-identity-write',()=>new Promise<void>(resolve=>{(window as unknown as VaultFixtureWindow).releaseVaultLock=resolve;acquired!();}));await ready;
  });
  for(const [tab,owner] of ([[page,'tab-a'],[second,'tab-b']] as [Page, string][]))await tab.evaluate(async ownerId=>{
   const {createEvolu8IdentityVault}=await import('/js/sync-evolu8-identity-vault.js');(window as unknown as VaultFixtureWindow).concurrentWrite=createEvolu8IdentityVault().write({ownerId,mnemonic:`synthetic ${ownerId}`}).then(()=>true,(error: unknown)=>(error as {message?: unknown}).message);
  },owner);
  await expect.poll(()=>page.evaluate(async()=>(await navigator.locks.query()).pending!.filter(x=>x.name==='getbased-evolu8-identity-write').length)).toBe(2);
  await page.evaluate(()=>(window as unknown as VaultFixtureWindow).releaseVaultLock());
  expect(await page.evaluate(()=>(window as unknown as VaultFixtureWindow).concurrentWrite)).toBe(true);expect(await second.evaluate(()=>(window as unknown as VaultFixtureWindow).concurrentWrite)).toBe(true);
  const identities=await Promise.all([page,second].map(tab=>tab.evaluate(async()=>{const {createEvolu8IdentityVault}=await import('/js/sync-evolu8-identity-vault.js');return createEvolu8IdentityVault().read();})));
  expect(identities[0]).toEqual({ownerId:'tab-b',mnemonic:'synthetic tab-b'});expect(identities[1]).toEqual(identities[0]);
 } finally {await page.evaluate(()=>(window as unknown as VaultFixtureWindow).releaseVaultLock?.());await second.close();}
});
test('a queued cross-tab invalidation clears a token published ahead of its deletion',async({page,context})=>{
 await context.route('**/sync-vault-second-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Vault invalidator</title>'}));
 const second=await context.newPage();await second.goto('/sync-vault-second-harness');
 try {
  await page.evaluate(async()=>{
   let acquired: (() => void) | undefined;const ready=new Promise<void>(r=>{acquired=r;});(window as unknown as VaultFixtureWindow).heldLock=navigator.locks.request('getbased-evolu8-identity-write',()=>new Promise<void>(resolve=>{(window as unknown as VaultFixtureWindow).releaseVaultLock=resolve;acquired!();}));await ready;
   const {createEvolu8IdentityVault}=await import('/js/sync-evolu8-identity-vault.js');
   (window as unknown as VaultFixtureWindow).concurrentWrite=createEvolu8IdentityVault().write({ownerId:'queued-owner',mnemonic:'synthetic queued identity'});
  });
  await expect.poll(()=>page.evaluate(async()=>(await navigator.locks.query()).pending!.filter(x=>x.name==='getbased-evolu8-identity-write').length)).toBe(1);
  await second.evaluate(async()=>{const {createEvolu8IdentityVault}=await import('/js/sync-evolu8-identity-vault.js');(window as unknown as VaultFixtureWindow).pendingInvalidation=createEvolu8IdentityVault().invalidate();});
  await expect.poll(()=>page.evaluate(async()=>(await navigator.locks.query()).pending!.filter(x=>x.name==='getbased-evolu8-identity-write').length)).toBe(2);
  await page.evaluate(()=>(window as unknown as VaultFixtureWindow).releaseVaultLock());await page.evaluate(()=>(window as unknown as VaultFixtureWindow).concurrentWrite);await second.evaluate(()=>(window as unknown as VaultFixtureWindow).pendingInvalidation);
  for(const tab of [page,second])expect(await tab.evaluate(async()=>{const {createEvolu8IdentityVault,EVOLU8_IDENTITY_TOKEN_KEY}=await import('/js/sync-evolu8-identity-vault.js');return {token:localStorage.getItem(EVOLU8_IDENTITY_TOKEN_KEY),identity:await createEvolu8IdentityVault().read()};})).toEqual({token:null,identity:null});
 } finally {await page.evaluate(()=>(window as unknown as VaultFixtureWindow).releaseVaultLock?.());await second.close();}
});
