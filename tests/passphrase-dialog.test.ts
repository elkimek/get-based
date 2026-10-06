// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureCryptoUi, showPassphraseModal, showEnableEncryptionModal, changePassphrase, maybeShowEncryptionNudge, maybeShowBackupNudge } from '../js/crypto-ui.js';
import { disposePassphraseDialog } from '../js/passphrase-component.js';
import { flushSync } from '../js/components/PassphraseDialog.svelte.native.js';
const backup = vi.hoisted(()=>({ download:vi.fn(), folder:vi.fn(()=>({ supported:false,folderName:null,permissionLost:false,lastBackup:null })) }));
vi.mock('../js/backup.js',()=>({exportEncryptedBackup:backup.download, getFolderBackupState:backup.folder, getAutoBackupSnapshots:vi.fn(async()=>[]), importEncryptedBackup:vi.fn(),restoreAutoBackup:vi.fn(),MAX_SNAPSHOTS:5}));
const ports = { prepare:vi.fn(async (_value:string)=>{}), migrate:vi.fn(async()=>{}), unlock:vi.fn(async (_value:string)=>{}),
  change:vi.fn(async (_old:string,_next:string)=>{}), erase:vi.fn(async()=>{}),clear:vi.fn(),reload:vi.fn() };
let previous: ReturnType<typeof configureCryptoUi>;
beforeEach(()=>{
  document.body.replaceChildren();localStorage.clear();vi.clearAllMocks();
  ports.prepare.mockResolvedValue(undefined);ports.migrate.mockResolvedValue(undefined);ports.unlock.mockResolvedValue(undefined);ports.change.mockResolvedValue(undefined);ports.erase.mockResolvedValue(undefined);
  previous=configureCryptoUi({getEncryptionEnabled:()=>false,prepareEncryption:ports.prepare,migrateEncryptionStorage:ports.migrate,unlockEncryption:ports.unlock,
    changeEncryptionPassphrase:ports.change,eraseAllLocalAppData:ports.erase,clearEncryptionSession:ports.clear,reloadApp:ports.reload});
});
afterEach(()=>{disposePassphraseDialog();configureCryptoUi(previous);vi.useRealTimers();vi.restoreAllMocks();document.body.replaceChildren();localStorage.clear();});
function fill(id:string,value:string) { const input=document.getElementById(id) as HTMLInputElement;input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));flushSync(); }
const click=(id:string)=>document.getElementById(id)!.click();
const error=(id:string)=>document.getElementById(id)?.textContent;
const phrase='SyntheticStrong1!';
function enableValues(value=phrase,confirmation=value) {fill('passphrase-set-input',value);fill('passphrase-confirm-input',confirmation);}
it.each([
  ['','Please enter a passphrase'],['short','At least 8 characters'],['UPPERCASE!','At least 1 lowercase letter'],
  ['lowercase!','At least 1 uppercase letter'],['NoSpecial1','At least 1 special character'],
])('preserves enable validation for %s', (value,message)=>{
  showEnableEncryptionModal();enableValues(value);click('passphrase-set-btn');expect(error('passphrase-set-error')).toBe(message);expect(ports.prepare).not.toHaveBeenCalled();
});
it('preserves mismatch validation and every strength rule while keeping secrets out of markup and storage',()=>{
  const writes=vi.spyOn(Storage.prototype,'setItem');showEnableEncryptionModal();enableValues(phrase,'Mismatch1!');
  expect(document.querySelectorAll('.passphrase-rules li.met')).toHaveLength(4);
  expect(document.querySelectorAll('.passphrase-rules .gb\\:passphrase\\:text-success-ink')).toHaveLength(4);click('passphrase-set-btn');
  expect(error('passphrase-set-error')).toBe('Passphrases do not match');expect(ports.prepare).not.toHaveBeenCalled();
  expect(document.getElementById('passphrase-overlay')!.outerHTML).not.toContain(phrase);expect(writes).not.toHaveBeenCalled();
});
it('completes enable once, blocks duplicate submissions and clears secret controls on success',async()=>{
  let finish!:()=>void;ports.migrate.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
  showEnableEncryptionModal();enableValues();click('passphrase-set-btn');
  await vi.waitFor(()=>expect(ports.migrate).toHaveBeenCalledOnce());
  expect(document.querySelector('[role="dialog"]')!.getAttribute('aria-busy')).toBe('true');
  document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  expect(ports.prepare).toHaveBeenCalledExactlyOnceWith(phrase);expect(ports.migrate).toHaveBeenCalledOnce();
  expect((document.getElementById('passphrase-set-cancel') as HTMLButtonElement).disabled).toBe(true);
  finish();await vi.waitFor(()=>expect(document.getElementById('passphrase-overlay')!.style.display).toBe('none'));
  expect(document.querySelector('.passphrase-input')).toBeNull();
});
it('retries the original initialized encryption without accepting a different passphrase',async()=>{
  ports.migrate.mockRejectedValueOnce(new Error('Synthetic quota failure'));
  showEnableEncryptionModal();enableValues();click('passphrase-set-btn');
  await vi.waitFor(()=>expect(document.getElementById('passphrase-set-btn')!.textContent).toBe('Retry Encryption'));
  expect((document.getElementById('passphrase-set-input') as HTMLInputElement).disabled).toBe(true);
  expect((document.getElementById('passphrase-set-cancel') as HTMLButtonElement).disabled).toBe(true);
  expect((document.getElementById('passphrase-set-btn') as HTMLButtonElement).disabled).toBe(false);
  expect(document.getElementById('passphrase-overlay')!.textContent).toContain('Retry to finish encrypting your data with this passphrase');
  click('passphrase-set-btn');await vi.waitFor(()=>expect(ports.migrate).toHaveBeenCalledTimes(2));
  expect(ports.prepare).toHaveBeenCalledExactlyOnceWith(phrase);
  await vi.waitFor(()=>expect(document.getElementById('passphrase-overlay')!.style.display).toBe('none'));
});
it('allows a corrected passphrase after failed initialization and captures its original service dependencies',async()=>{
  ports.prepare.mockRejectedValueOnce(new Error('Synthetic setup failure'));
  showEnableEncryptionModal();enableValues();click('passphrase-set-btn');
  await vi.waitFor(()=>expect(error('passphrase-set-error')).toContain('Synthetic setup failure'));
  expect((document.getElementById('passphrase-set-input') as HTMLInputElement).disabled).toBe(false);
  const replacement=vi.fn();configureCryptoUi({prepareEncryption:replacement});enableValues('OtherStrong1!');click('passphrase-set-btn');
  await vi.waitFor(()=>expect(ports.prepare).toHaveBeenCalledTimes(2));expect(replacement).not.toHaveBeenCalled();expect(ports.prepare).toHaveBeenLastCalledWith('OtherStrong1!');
});
it('preserves empty unlock validation, failed-attempt count through Go Back, and the five-second cooldown',async()=>{
  ports.unlock.mockRejectedValue(new Error('Wrong synthetic passphrase'));showPassphraseModal(vi.fn());click('passphrase-unlock-btn');
  expect(error('passphrase-error')).toBe('Please enter your passphrase');
  for(let attempt=1;attempt<=3;attempt++){fill('passphrase-unlock-input',phrase);click('passphrase-unlock-btn');await vi.waitFor(()=>expect(error('passphrase-error')).toBe(`Wrong passphrase (attempt ${attempt})`));}
  click('passphrase-forgot-btn');expect(document.getElementById('passphrase-overlay')!.textContent).toContain('This cannot be undone');click('passphrase-forgot-cancel');
  vi.useFakeTimers();fill('passphrase-unlock-input',phrase);click('passphrase-unlock-btn');expect(error('passphrase-error')).toBe('Too many attempts. Please wait...');
  await vi.advanceTimersByTimeAsync(4999);expect(ports.unlock).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(1);expect(ports.unlock).toHaveBeenCalledTimes(4);expect(error('passphrase-error')).toBe('Wrong passphrase (attempt 4)');
});
it('does not let a late unlock close or complete a newer dialog',async()=>{
  let finish!:()=>void;ports.unlock.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const completed=vi.fn();showPassphraseModal(completed);fill('passphrase-unlock-input',phrase);click('passphrase-unlock-btn');
  showEnableEncryptionModal();finish();await Promise.resolve();await Promise.resolve();
  expect(completed).not.toHaveBeenCalled();expect(document.getElementById('passphrase-set-input')).not.toBeNull();
});
it('requires confirmed complete erasure before clearing the session or reloading, and recovers on retry',async()=>{
  ports.erase.mockRejectedValueOnce(new Error('Synthetic blocked database'));showPassphraseModal(vi.fn());click('passphrase-forgot-btn');
  expect(ports.erase).not.toHaveBeenCalled();click('passphrase-forgot-confirm');
  await vi.waitFor(()=>expect(document.getElementById('passphrase-forgot-confirm')!.textContent).toBe('Retry Erase'));
  expect(error('passphrase-erase-error')).toContain('Synthetic blocked database');expect(ports.clear).not.toHaveBeenCalled();expect(ports.reload).not.toHaveBeenCalled();
  click('passphrase-forgot-confirm');await vi.waitFor(()=>expect(ports.reload).toHaveBeenCalledOnce());expect(ports.clear).toHaveBeenCalledOnce();
});
it('preserves change validation, current-key failures, success arguments and secret cleanup',async()=>{
  await changePassphrase();click('passphrase-change-btn');expect(error('passphrase-change-error')).toBe('Enter current passphrase');
  fill('passphrase-old-input','OldStrong1!');fill('passphrase-new1-input',phrase);fill('passphrase-new2-input','Mismatch1!');click('passphrase-change-btn');expect(error('passphrase-change-error')).toBe('New passphrases do not match');
  ports.change.mockRejectedValueOnce(new Error('Wrong original key'));fill('passphrase-new2-input',phrase);click('passphrase-change-btn');
  await vi.waitFor(()=>expect(error('passphrase-change-error')).toBe('Current passphrase is incorrect'));
  click('passphrase-change-btn');await vi.waitFor(()=>expect(document.getElementById('passphrase-overlay')!.style.display).toBe('none'));
  expect(ports.change).toHaveBeenLastCalledWith('OldStrong1!',phrase);expect(document.querySelector('.passphrase-input')).toBeNull();
});
it('keeps keyboard focus inside the dialog, preserves mandatory Escape behavior, and restores the trigger',()=>{
  const trigger=document.createElement('button');document.body.appendChild(trigger);trigger.focus();showEnableEncryptionModal();
  const first=document.getElementById('passphrase-set-input')!;const last=document.getElementById('passphrase-set-btn')!;
  expect(document.activeElement).toBe(first);first.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));expect(document.activeElement).toBe(last);
  last.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));expect(document.activeElement).toBe(first);
  first.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));expect(document.getElementById('passphrase-overlay')!.style.display).toBe('flex');
  click('passphrase-set-cancel');expect(document.activeElement).toBe(trigger);expect(document.body.style.overflow).not.toBe('hidden');
});
it('does not let a delayed encryption reminder replace an active dialog and preserves dismissal/enable actions',()=>{
  vi.useFakeTimers();maybeShowEncryptionNudge();showPassphraseModal(vi.fn());vi.advanceTimersByTime(800);expect(document.getElementById('passphrase-unlock-input')).not.toBeNull();
  disposePassphraseDialog();maybeShowEncryptionNudge();vi.advanceTimersByTime(800);click('encryption-nudge-dismiss');expect(localStorage.getItem('labcharts-encryption-nudge-dismissed')).toBe('true');
  localStorage.removeItem('labcharts-encryption-nudge-dismissed');maybeShowEncryptionNudge();vi.advanceTimersByTime(800);click('encryption-nudge-enable');expect(document.getElementById('passphrase-set-input')).not.toBeNull();
});
it('preserves backup reminder snooze duration and download delegation',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
  localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'synthetic'}]));localStorage.setItem('labcharts-synthetic-imported',JSON.stringify({entries:[{}]}));
  maybeShowBackupNudge();vi.advanceTimersByTime(500);click('backup-nudge-snooze');expect(Number(localStorage.getItem('labcharts-backup-nudge-snoozed-until'))).toBe(Date.now()+30*24*60*60*1000);
  localStorage.removeItem('labcharts-backup-nudge-snoozed-until');maybeShowBackupNudge();vi.advanceTimersByTime(500);click('backup-nudge-download');expect(backup.download).toHaveBeenCalledOnce();
});
