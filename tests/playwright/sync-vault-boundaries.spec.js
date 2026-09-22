import {expect,test} from './coverage-fixture.js';
test.beforeEach(async({page})=>{
 await page.route('**/sync-vault-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Vault regression fixture</title>'}));
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
  const pending=vault.write({ownerId:'fixture-owner',mnemonic:'synthetic fixture words'}).then(()=> 'committed',error=>error.message);
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
