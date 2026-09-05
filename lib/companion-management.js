// @ts-check
// Same-origin, user-opened management UI. Never exports installation secrets.
import { randomUUID } from 'node:crypto';

/** @param {{status: () => any, control: (request: Request) => Promise<Response>, now?: () => number}} options */
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
    if (url.pathname === '/manage' && request.method === 'GET') {
      if (request.headers.get('Sec-Fetch-Mode') !== 'navigate'
        || request.headers.get('Sec-Fetch-Dest') !== 'document') return deny();
      while (sessions.size >= 8) sessions.delete(sessions.keys().next().value);
      const key = randomUUID();
      const nonce = randomUUID();
      sessions.set(key, { origin: url.origin, expires: now() + 15 * 60_000 });
      return new Response(managementHTML(key, nonce), { headers: {
        ...headers, 'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
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

/** @param {string} key @param {string} nonce */
function managementHTML(key, nonce) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>getbased Companion</title><style nonce="${nonce}">
body{font:16px system-ui,sans-serif;background:#141820;color:#eef2fa;margin:0;padding:24px}main{max-width:640px;margin:5vh auto}h1{font-size:26px}p{line-height:1.6;color:#c0cada}button{font:inherit;border:1px solid #718099;border-radius:8px;padding:12px;background:#24334a;color:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:wait}button:focus-visible{outline:3px solid #80abff}nav{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}#status{padding:16px;border:1px solid #52627d;border-radius:10px}#message{min-height:3em}small{color:#a9b6c9}
</style><main><h1>getbased Companion</h1><p>This page runs on your computer. Hosted getbased can chat through Companion, but only this local management page can use these controls.</p>
<p id="status">Checking connection…</p><nav aria-label="Companion controls">
<button data-action="pause">Pause</button><button data-action="restart">Reconnect CLIs</button>
<button data-action="install">Start automatically</button><button data-action="restart-companion">Restart companion</button>
<button data-action="update">Check for update</button><button data-action="uninstall">Uninstall</button>
</nav><p id="message" role="status" aria-live="polite"></p><button id="refresh">Refresh status</button>
<p><small>Reconnect CLIs resets agent connections. Restart companion reloads the installed service. Uninstall removes automatic startup and its runtime, not your agents or health data. An updated bundle takes effect after restart. This management session expires after 15 minutes; reopen the page to continue.</small></p></main>
<script nonce="${nonce}">
const credential=${JSON.stringify(key)};
const status=document.getElementById('status'), message=document.getElementById('message');
const buttons=[...document.querySelectorAll('[data-action]')];
buttons.forEach(button=>button.disabled=true);
let busy=false;
async function request(path,action){const response=await fetch('/manage/'+path,{cache:'no-store',headers:{Authorization:'Bearer '+credential,...(action?{'Content-Type':'application/json'}:{})},...(action?{method:'POST',body:JSON.stringify({action})}:{})});if(response.status===403)throw Error('Session expired or access denied. Reopen this local page.');const value=await response.json();if(!response.ok)throw Error(value.error==='finish_the_active_response_first'?'Finish or stop the current AI response first.':value.error||'The operation failed.');return value;}
function render(value){const installed=value.runtimeMode==='installed';status.textContent=(installed?'Installed · starts at login':'Temporary')+' · '+(value.processMode==='service'?'Background service':'Terminal session')+' · '+(value.paused?'Paused':'Running')+' · v'+(value.companionVersion||'unknown')+' · '+location.host;for(const button of buttons){const action=button.dataset.action;button.hidden=action==='install'?installed:['restart-companion','update','uninstall'].includes(action)&&!installed;if(action==='pause'||action==='resume'){button.dataset.action=value.paused?'resume':'pause';button.textContent=value.paused?'Resume':'Pause';}button.disabled=busy;}}
async function refresh(){try{render(await request('status'));}catch(error){message.textContent=error.message;}}
for(const button of buttons)button.addEventListener('click',async()=>{if(busy)return;const action=button.dataset.action;if(['install','uninstall','update','restart-companion'].includes(action)&&!confirm(button.textContent+' on this computer?'))return;busy=true;buttons.forEach(item=>item.disabled=true);message.textContent='Working…';try{const value=await request('control',action);message.textContent=value.restartRequired?'Update installed. Restart companion to use it.':value.restarting?'Restart requested. Refresh status after it starts; reopen this page if its session expired.':action==='install'?'Automatic startup configured. Choose Restart companion to hand over this terminal session to the background service.':action==='uninstall'?'Automatic startup and its runtime removed. This running instance remains available until stopped.':'Done.';render(value);}catch(error){message.textContent=error.message;}finally{busy=false;buttons.forEach(item=>item.disabled=false);}});
document.getElementById('refresh').addEventListener('click',refresh);refresh();
</script></html>`;
}
