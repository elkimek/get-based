// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { WearableConnection } from '../js/wearable-persistence-types.js';
const ports=vi.hoisted(()=>({ connections:{} as Record<string,WearableConnection>,connected:{} as Record<string,{connectedSince:string}> }));
vi.mock('../js/wearables-connect.js',()=>({getConnection:(id:string)=>ports.connections[id] || null,listConnectedSources:()=>ports.connected}));
import { buildWearablesSettingsSnapshot } from '../js/wearables-settings-view.js';
import { summarizeWearableConnections } from '../js/wearables-connection-summaries.js';
import { _resetOAuthOverrides,applyOAuthOverrides,applyOAuthConfigured } from '../js/wearable-adapters.js';
beforeEach(()=>{ports.connections={};ports.connected={};_resetOAuthOverrides();localStorage.clear();});
it('projects only intended account/status values and never exposes credential or arbitrary account properties',()=>{
  ports.connections.oura={connectedAt:'2026-06-01',lastSyncAt:1,accessToken:'SYNTHETIC_ACCESS_SECRET',refreshToken:'SYNTHETIC_REFRESH_SECRET',account:{email:'safe@example.test',unrelatedSecret:'SYNTHETIC_ACCOUNT_SECRET'}};
  ports.connected.oura={connectedSince:'2026-06-01'};
  const snapshot=buildWearablesSettingsSnapshot('profile-a',false);const json=JSON.stringify(snapshot);
  expect(json).not.toContain('SYNTHETIC_ACCESS_SECRET');expect(json).not.toContain('SYNTHETIC_REFRESH_SECRET');expect(json).not.toContain('SYNTHETIC_ACCOUNT_SECRET');
  const row=snapshot.groups.flatMap(g=>g.rows).find(r=>r.id==='oura')!;
  expect(row.identity).toBe('safe@example.test');expect(row.detail).toBe('oauth');expect(row.actions.map(a=>a.action)).toEqual(['sync-now','backfill','disconnect']);
});
it('keeps an unavailable legacy connection removable and migration capability gated',()=>{
  ports.connections.fitbit={connectedAt:'2026-06-01',account:{email:'legacy@example.test'}};ports.connected.fitbit={connectedSince:'2026-06-01'};
  let row=buildWearablesSettingsSnapshot('profile-a',false).groups.flatMap(g=>g.rows).find(r=>r.id==='fitbit')!;
  expect(row.status).toBe('Move this connection');expect(row.actions.map(a=>a.action)).toEqual(['disconnect']);expect(row.docsUrl).toBeTruthy();
  applyOAuthOverrides({google_health:'synthetic-client'});applyOAuthConfigured({google_health:true});
  row=buildWearablesSettingsSnapshot('profile-a',false).groups.flatMap(g=>g.rows).find(r=>r.id==='fitbit')!;
  expect(row.actions[0]).toMatchObject({action:'connect',adapter:'google_health',label:'Connect Google Health'});
});
it('public source summaries exclude ineligible credentials and never carry account data',()=>{
  const connections:Record<string,WearableConnection>={
    oura:{connectedAt:'2026-06-01',lastSyncAt:10,accessToken:'SECRET',account:{email:'synthetic@example.test'}},
    google_health:{connectedAt:'2026-06-02',refreshToken:'SECRET'},manual:{connectedAt:'2026-06-03'},unconnected:{},
  };
  const summaries=summarizeWearableConnections(connections,id=>id!=='google_health');
  expect(summaries).toEqual({oura:{connectedSince:'2026-06-01',lastSyncAt:10},manual:{connectedSince:'2026-06-03',lastSyncAt:0}});
  expect(JSON.stringify(summaries)).not.toContain('SECRET');expect(JSON.stringify(summaries)).not.toContain('synthetic@example.test');
});
