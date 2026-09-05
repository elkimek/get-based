// @ts-check
// Local management UI, optionally framed by an approved getbased origin. Never exports installation secrets.
import { randomUUID } from 'node:crypto';

// Management has a narrower trust boundary than chat: custom chat origins and
// arbitrary loopback ports must never receive privileged frame access.
const MANAGEMENT_PARENT_ORIGINS = new Set([
  'https://getbased.health', 'https://www.getbased.health',
  'https://app.getbased.health', 'https://beta.getbased.health',
  'https://get-based.vercel.app', 'https://get-based-managed-subscription-v2.vercel.app',
  'http://127.0.0.1:8000', 'http://localhost:8000',
]);

/** @param {string} origin */
export function isAllowedCompanionManagementParent(origin) {
  return MANAGEMENT_PARENT_ORIGINS.has(origin);
}

/** @param {{status: () => any, control: (request: Request) => Promise<Response>, now?: () => number, allowParentOrigin?: (origin: string) => boolean}} options */
export function createCompanionManagement(options) {
  const now = options.now || Date.now;
  /** @type {Map<string, {origin: string, expires: number}>} */
  const sessions = new Map();
  /** @param {Request} request */
  return async function handle(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/manage')) return null;
    const headers = {
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Cross-Origin-Resource-Policy': 'same-origin',
    };
    const deny = () => new Response('Open Companion management directly on this computer.', { status: 403, headers });
    // The Node server preserves Host even though it constructs its Request URL
    // from the listening address. Check both to prevent DNS-rebinding aliases.
    if (url.hostname !== '127.0.0.1' || request.headers.get('Host') !== url.host) return deny();
    for (const [key, session] of sessions) if (session.expires <= now()) sessions.delete(key);
    const embedded = url.pathname === '/manage/embed';
    const parentOrigin = url.searchParams.get('parentOrigin') || '';
    if ((url.pathname === '/manage' || embedded) && request.method === 'GET') {
      if (embedded) {
        let normalized;
        try { normalized = new URL(parentOrigin).origin; } catch { return deny(); }
        if (normalized !== parentOrigin || !options.allowParentOrigin?.(parentOrigin)) return deny();
      }
      if (request.headers.get('Sec-Fetch-Mode') !== 'navigate'
        || request.headers.get('Sec-Fetch-Dest') !== (embedded ? 'iframe' : 'document')) return deny();
      while (sessions.size >= 8) sessions.delete(sessions.keys().next().value);
      const key = randomUUID();
      const nonce = randomUUID();
      sessions.set(key, { origin: url.origin, expires: now() + 15 * 60_000 });
      const pageHeaders = { ...headers };
      if (embedded) {
        delete pageHeaders['X-Frame-Options'];
        pageHeaders['Cross-Origin-Resource-Policy'] = 'cross-origin';
        pageHeaders['Cross-Origin-Embedder-Policy'] = 'credentialless';
      }
      return new Response(managementHTML(key, nonce, embedded, url.searchParams.get('theme') === 'light', parentOrigin), { headers: {
        ...pageHeaders, 'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors ${embedded ? parentOrigin : "'none'"}; base-uri 'none'; form-action 'none'`,
      } });
    }
    const session = sessions.get(request.headers.get('Authorization')?.replace(/^Bearer /, '') || '');
    if (!session || session.origin !== url.origin
      || request.headers.get('Sec-Fetch-Site') !== 'same-origin'
      || (request.method !== 'GET' && request.headers.get('Origin') !== url.origin)) return deny();
    if (url.pathname === '/manage/status' && request.method === 'GET') {
      return Response.json(options.status(), { headers });
    }
    if (url.pathname === '/manage/control' && request.method === 'POST') {
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return deny();
      const result = await options.control(request);
      // No CORS headers, even for an allowlisted hosted application.
      return new Response(result.body, { status: result.status, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    return new Response('Not found', { status: 404, headers });
  };
}

/** @param {string} key @param {string} nonce @param {boolean} embedded @param {boolean} light @param {string} parentOrigin */
function managementHTML(key, nonce, embedded, light, parentOrigin) {
  return `<!doctype html><html lang="en" data-theme="${light ? 'light' : 'dark'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>getbased Companion</title><style nonce="${nonce}">
*{box-sizing:border-box}
body{font:11px system-ui,sans-serif;background:var(--bg);color:var(--text);margin:0;--bg:#232737;--text:#edf0f5;--muted:#a8b0be;--border:#363d49;--button:#252c38;--accent:#9fc5ff;color-scheme:dark}
html[data-theme="light"] body{--bg:#f7f8fa;--text:#252b36;--muted:#606b7c;--border:#d7dce4;--button:#fff;--accent:#225ab0;color-scheme:light}
main{max-width:680px;margin:${embedded ? '0' : '5vh auto'};padding:${embedded ? '10px 12px' : '24px'}}
h1{font-size:20px;margin:0 0 8px}p{line-height:1.5;color:var(--muted)}
button{font:inherit;font-weight:600;border:1px solid var(--border);border-radius:6px;padding:4px 10px;background:var(--button);color:var(--text);cursor:pointer;white-space:nowrap}
button:hover{border-color:var(--accent)}button:disabled{opacity:.5;cursor:wait}button:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
[hidden]{display:none!important}.overview{display:flex;align-items:center;justify-content:space-between;gap:12px}.overview strong{font-size:11px}.overview small{display:block;color:var(--muted);font-size:10px;line-height:1.5;margin-top:3px}
.actions{display:flex;gap:6px;flex-wrap:wrap}.advanced-actions{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap}details{margin-top:10px}summary{color:var(--muted);cursor:pointer;font-size:10px;width:fit-content}details p{font-size:10px;margin:8px 0 0}
#message:empty{display:none}#message{margin:8px 0 0;font-size:10px}#confirmation{padding:10px;border:1px solid var(--border);border-radius:6px;margin-top:10px}#confirmation p{margin:0 0 8px}
.danger{color:#ed7d85}html[data-theme="light"] .danger{color:#b32738}
@media(max-width:380px){.overview{align-items:flex-start;flex-wrap:wrap}}
</style><main>${embedded ? '' : '<h1>getbased Companion</h1>'}
<div class="overview"><div><strong id="status" role="status">Checking connection…</strong><small id="startup-description"></small></div>
<div class="actions"><button data-action="install" hidden>Start automatically</button><button data-action="update" hidden>Check for update</button><button data-action="resume" id="resume" hidden>Resume</button><button data-action="restart-companion" id="finish-update" hidden>Restart to finish update</button></div></div>
<details id="advanced"><summary>Advanced</summary><div class="advanced-actions">
<button data-action="pause">Pause</button><button data-action="restart">Reconnect CLIs</button><button data-action="restart-companion">Restart Companion</button><button class="danger" data-action="uninstall">Uninstall…</button>
</div><p>Use these if an agent stops responding or you want to remove Companion.</p></details>
<section id="confirmation" hidden aria-label="Confirm uninstall"><p>Remove Companion and automatic startup? Your CLI agents and health data will stay in place.</p><div class="actions"><button id="confirm-uninstall" class="danger">Uninstall Companion</button><button id="cancel-action">Cancel</button></div></section>
<p id="message" role="status" aria-live="polite"></p>${embedded ? '' : '<button id="reconnect" hidden>Try again</button>'}</main>
<script nonce="${nonce}">
const credential=${JSON.stringify(key)};
const embedded=${JSON.stringify(embedded)};
const parentOrigin=${JSON.stringify(parentOrigin)};
const status=document.getElementById('status'), message=document.getElementById('message');
const buttons=[...document.querySelectorAll('[data-action]')];
const confirmation=document.getElementById('confirmation');
let busy=false, restartRequired=false;
buttons.forEach(button=>button.disabled=true);
function recoveryText(){return embedded?'Select Check connection above to reconnect.':'Select Try again to reconnect.';}
async function request(path,action){
  const response=await fetch('/manage/'+path,{cache:'no-store',headers:{Authorization:'Bearer '+credential,...(action?{'Content-Type':'application/json'}:{})},...(action?{method:'POST',body:JSON.stringify({action})}:{})});
  if(response.status===403)throw Error('Session expired. '+recoveryText());
  const value=await response.json();
  if(!response.ok)throw Error(value.error==='finish_the_active_response_first'?'Finish or stop the current AI response first.':value.error||'The operation failed.');
  return value;
}
function render(value){
  const installed=value.runtimeMode==='installed';
  restartRequired=Boolean(value.restartRequired);
  status.textContent=value.paused?'Paused':'Connected';
  document.getElementById('startup-description').textContent=(installed?'Starts automatically at login':value.processMode==='service'?'Automatic startup removed · service still running':'Connected for this terminal session')+(value.companionVersion?' · v'+value.companionVersion:'');
  for(const button of buttons){
    const action=button.dataset.action;
    button.hidden=button.id==='finish-update'?!restartRequired:action==='install'?installed:action==='resume'?!value.paused:action==='pause'?value.paused:['restart-companion','update','uninstall'].includes(action)&&!installed;
    button.disabled=busy;
  }
}
function showError(error){
  message.textContent=error instanceof TypeError?'Companion is unavailable. '+recoveryText():error.message;
  const reconnect=document.getElementById('reconnect');
  if(reconnect)reconnect.hidden=false;
}
async function refresh(){try{render(await request('status'));}catch(error){showError(error);}}
async function waitForRestart(){
  status.textContent='Reconnecting…';
  document.getElementById('finish-update').hidden=true;
  // Keep this document visible during downtime. A new service rejects the old
  // management session; reload only once that new service can answer requests.
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,600));
    try{
      const response=await fetch('/manage/status',{cache:'no-store',headers:{Authorization:'Bearer '+credential},signal:AbortSignal.timeout(1500)});
      if(response.ok){
        const value=await response.json();
        if(value.restartStatus==='failed'){
          render(value);
          message.textContent='Restart failed. Your previous connection is still available.';
          return;
        }
      }
      if(response.status===403){
        const health=await fetch('/health',{cache:'no-store',signal:AbortSignal.timeout(1500)});
        if(health.ok&&(await health.json()).service==='getbased-agent-host'){location.reload();return;}
      }
    }catch{/* Companion is still restarting. */}
  }
  status.textContent='Connection interrupted';
  throw Error('Companion has not reconnected yet. '+recoveryText());
}
async function execute(action){
  if(busy)return;
  busy=true;
  confirmation.hidden=true;
  buttons.forEach(item=>item.disabled=true);
  message.textContent=action==='update'?'Checking for updates…':'Working…';
  try{
    const value=await request('control',action);
    message.textContent=value.restarting?'Restarting Companion…':value.restartRequired?(value.updated?'Update installed. Restart when you’re ready.':'Update ready. Restart when you’re ready.'):action==='update'?'Companion is up to date.':action==='install'?'Automatic startup enabled.':action==='uninstall'?'Companion removed. This connection stays available until stopped.':action==='restart'?'CLI connections refreshed.':'';
    if(action==='install'&&value.processMode==='terminal'){value.restartRequired=true;message.textContent='Automatic startup enabled. Restart to switch to the background service.';}
    render(value);
    if(value.restarting)await waitForRestart();
  }catch(error){showError(error);}finally{
    busy=false;
    buttons.forEach(item=>item.disabled=false);
  }
}
for(const button of buttons)button.addEventListener('click',()=>{
  if(busy)return;
  confirmation.hidden=true;
  if(button.dataset.action==='uninstall'){
    confirmation.hidden=false;
    document.getElementById('confirm-uninstall').focus();
  }else void execute(button.dataset.action);
});
document.getElementById('confirm-uninstall').addEventListener('click',()=>{if(!confirmation.hidden)void execute('uninstall');});
document.getElementById('cancel-action').addEventListener('click',()=>{confirmation.hidden=true;});
document.getElementById('reconnect')?.addEventListener('click',()=>location.reload());
if(embedded){
  // Only visual properties cross this boundary; management credentials never do.
  window.addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==parentOrigin||event.data?.type!=='getbased-companion-panel-theme')return;
    for(const key of ['bg','text','muted','border','button','accent']){
      const value=event.data.colors?.[key];
      if(typeof value==='string'&&CSS.supports('color',value))document.body.style.setProperty('--'+key,value);
    }
  });
  new ResizeObserver(()=>parent.postMessage({type:'getbased-companion-panel-size',height:Math.ceil(document.querySelector('main').getBoundingClientRect().height)+2},parentOrigin)).observe(document.querySelector('main'));
}
refresh();
</script></html>`;
}
