import {isDeepStrictEqual} from 'node:util';
import type {KitServerRoute} from '../pwa/kit-server.js';
/** Owned synthetic HTTP protocol fixture. The calling test supplies a second
 * ephemeral loopback server; stopping the static PWA origin leaves it alive.
 * No application fetch, provider, getter, parser or callback is replaced. */
export function createEMFParserHTTPFixture(expectedRequest:unknown,parsedPreview:unknown,appOrigin:string){
 const requests:unknown[]=[],preflights:unknown[]=[],transactions:unknown[]=[],errors:string[]=[];
 const response=JSON.stringify({choices:[{message:{role:'assistant',content:JSON.stringify(parsedPreview)},finish_reason:'stop'}],usage:{prompt_tokens:12,completion_tokens:5}});
 const route:KitServerRoute=async(request,res)=>{
  const origin=request.headers.origin,method=request.method||'',path=request.url||'';
  const cors={'Access-Control-Allow-Origin':appOrigin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'0','Vary':'Origin'};
  const transaction={method,path,headers:{...request.headers},rawBody:''};transactions.push(transaction);
  if(path!=='/v1/chat/completions'){res.writeHead(404,{'Content-Type':'text/plain'});res.end('No fixture route');return true;}
  if(origin!==appOrigin){errors.push('Unexpected parser request origin');res.writeHead(403,{'Content-Type':'text/plain'});res.end('Unexpected origin');return true;}
  if(method==='OPTIONS'){
   if(request.headers['access-control-request-method']!=='POST'){errors.push('Unexpected CORS method');res.writeHead(405,cors);res.end();return true;}
   preflights.push({method,path,headers:{...request.headers}});res.writeHead(204,cors);res.end();return true;
  }
  if(method!=='POST'){errors.push('Unexpected parser HTTP method');res.writeHead(405,cors);res.end();return true;}
  try{
   const chunks:Uint8Array[]=[];let bytes=0;
   for await(const chunk of request){const value=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));bytes+=value.byteLength;if(bytes>65536)throw new Error('Parser fixture request exceeds native bounded test envelope');chunks.push(value);}
   transaction.rawBody=Buffer.concat(chunks).toString('utf8');const body:unknown=JSON.parse(transaction.rawBody);
   if(request.headers['content-type']!=='application/json')throw new Error('Unexpected parser content type');
   if(request.headers.authorization)throw new Error('Synthetic parser fixture must not receive credentials');
   if(!isDeepStrictEqual(body,expectedRequest)||transaction.rawBody!==JSON.stringify(expectedRequest))throw new Error('Native parser request differs from the complete original oracle');
   requests.push(body);res.writeHead(200,{...cors,'Content-Type':'application/json'});res.end(response);return true;
  }catch(error){errors.push(error instanceof Error?error.message:String(error));res.writeHead(400,{...cors,'Content-Type':'application/json'});res.end(JSON.stringify({error:'Synthetic fixture request rejected'}));return true;}
 };
 return{route,requests,preflights,transactions,errors};
}
