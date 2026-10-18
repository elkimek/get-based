import type { SyncDiagnoseInput } from '../../js/sync-diagnose-projector.js';
export function diagnosticFixture(): SyncDiagnoseInput {
  return { diagnostics: {syncEnabled:true,relay:'wss://synthetic.invalid',ownerId:'synthetic-owner',mnemonicConfigured:true,
    rows:[],rowParseFailureCount:0,rowsReadFailed:false,activeProfileId:'synthetic-profile',
    activeImported:{sunSessions:2,lightDevices:3}}, healthVerdict:{verdict:'unknown',at:0,reason:null},
    quota:null,isDebug:false,cutoverEnabled:false };
}
export function diagnosticCases(): Array<{name:string;input:SyncDiagnoseInput;summary:string}> {
  const cases:Array<{name:string;input:SyncDiagnoseInput;summary:string}>=[];
  const add=(name:string,change:(v:SyncDiagnoseInput)=>void,summary:string)=>{const input=diagnosticFixture();change(input);cases.push({name,input,summary});};
  add('disabled',v=>{v.diagnostics.syncEnabled=false;},'Sync is off on this device');
  add('missing-owner',v=>{v.diagnostics.ownerId=null;},'Finish setting up sync');
  add('missing-mnemonic',v=>{v.diagnostics.mnemonicConfigured=false;},'Finish setting up sync');
  add('wedged',v=>{v.healthVerdict={verdict:'wedged',at:1700000000000,reason:'synthetic detail'};},'Sync needs attention');
  add('query-failed',v=>{v.diagnostics.rowsReadFailed=true;},'Some sync records could not be checked');
  add('parse-failed',v=>{v.diagnostics.rowParseFailureCount=2;},'Some sync records could not be checked');
  for(const level of ['green','amber','red'] as const)add('quota-'+level,v=>{v.quota={bytes:25*1024*1024,cap:50*1024*1024,pct:level==='red'?95:level==='amber'?80:50,level};},level==='red'?'Sync works, but storage needs attention':level==='amber'?'Sync is working':'No problem detected');
  add('healthy',v=>{v.healthVerdict={verdict:'healthy',at:1700000000000,reason:null};},'Sync looks healthy');
  add('unknown',()=>{},'No problem detected');
  add('row-formats',v=>{v.diagnostics.rows=['gz','invalid','plain'].map((format,index)=>({profileId:'row-'+index,profileIdSource:index===0?'payload':'column',format,isDeleted:index===1,syncedAtMs:1700000000000,syncedAt:1700000000000,sun:2,dev:3,bytes:100}));},'No problem detected');
  add('sparse-rows',v=>{v.diagnostics.rows=new Array(3);},'No problem detected');
  add('quota-clamp-high',v=>{v.quota={bytes:100,cap:50,pct:125,level:'red'};},'Sync works, but storage needs attention');
  add('debug-empty',v=>{v.isDebug=true;v.diagnostics.deltaTelemetry={pushes:[],pull:{mergedAt:0,perArray:{}},summary:{count:0,totalBlobBytes:0,totalDeltaBytes:0,totalOps:0,ratio:0}};},'No problem detected');
  for(const mode of ['blocked','ready','enabled'] as const)add('debug-'+mode,v=>{
    v.isDebug=true;v.cutoverEnabled=mode==='enabled';
    v.diagnostics.deltaTelemetry={pushes:Array.from({length:8},(_,i)=>({at:1700000000000+i*1000,blobBytes:100,totalDeltaBytes:10,totalOps:1,perArray:{z:{ins:1,upd:0,tom:0,bytes:10},a:{ins:0,upd:0,tom:0,bytes:0}}})),pull:{mergedAt:1700000000000,perArray:{z:{live:2,tombstones:1},a:{live:1,tombstones:0}}},summary:{count:8,totalBlobBytes:800,totalDeltaBytes:80,totalOps:8,ratio:0.1}};
    v.diagnostics.cutoverReadiness={ready:mode!=='blocked',blockerCount:mode==='blocked'?1:0,surfaceCount:1,surfaces:{entries:{shape:'array',localCount:2,rowCount:mode==='blocked'?0:2,status:mode==='blocked'?'missing-rows':'ok'}}};
  },'No problem detected');
  add('hostile-escaped-metadata',v=>{v.diagnostics.ownerId='<img data-probe="owner">';v.diagnostics.activeProfileId='<svg data-probe="profile">';v.diagnostics.relay='"<&\'';v.diagnostics.rows=[{profileId:'<b data-probe="row">',profileIdSource:'column',format:'plain',isDeleted:false,syncedAtMs:0,syncedAt:0,sun:0,dev:0,bytes:0}];},'No problem detected');
  return cases;
}
