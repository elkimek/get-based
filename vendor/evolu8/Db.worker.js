// @ts-nocheck
// Generated from locked Evolu 8 packages; run npm run vendor:evolu8:check.
const e=()=>{t(),m()},t=()=>{d();let e=u(`dispose`,`Symbol.dispose`),t=u(`asyncDispose`,`Symbol.asyncDispose`);typeof globalThis.DisposableStack!=`function`&&i(globalThis,`DisposableStack`,f(e)),typeof globalThis.AsyncDisposableStack!=`function`&&i(globalThis,`AsyncDisposableStack`,p(e,t))},n=`An error was suppressed during disposal.`,r=(e,t)=>`Cannot call ${e}.prototype.${t} on an already-disposed DisposableStack`,i=(e,t,n)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:!0,value:n})},a=(e,t,n)=>{i(e,t,Object.getOwnPropertyDescriptor(e,n)?.value)},o=(e,t)=>{if(e)throw ReferenceError(t)},s=(e,t)=>new globalThis.SuppressedError(e,t,n),c=e=>{if((typeof e!=`object`||!e)&&typeof e!=`function`)throw TypeError(`Disposable value must be an object or function.`);return e},l=(e,t)=>{let n=e[t];if(n!==void 0){if(typeof n!=`function`)throw TypeError(`Disposable method must be a function.`);return n}},u=(e,t)=>{let n=globalThis.Symbol,r=Object.getOwnPropertyDescriptor(n,e)?.value,i=typeof r==`symbol`?r:void 0;if(i!=null)return i;let a=Symbol(t);return Object.defineProperty(n,e,{configurable:!1,enumerable:!1,writable:!1,value:a}),a},d=()=>{if(typeof globalThis.SuppressedError==`function`)return;class e extends Error{error;suppressed;constructor(e,t,r){super(r??n),this.name=`SuppressedError`,this.error=e,this.suppressed=t}}i(globalThis,`SuppressedError`,e)},f=e=>{class t{#e=!1;#t=[];get disposed(){return this.#e}use(t){if(o(this.#e,r(`DisposableStack`,`use`)),t==null)return t;let n=c(t),i=l(n,e);if(i==null)throw TypeError(`Resource does not implement Symbol.dispose.`);return this.#t.push({dispose:()=>{i.call(n)}}),t}adopt(e,t){if(o(this.#e,r(`DisposableStack`,`adopt`)),typeof t!=`function`)throw TypeError(`onDispose must be a function.`);return this.#t.push({dispose:()=>{t(e)}}),e}defer(e){if(o(this.#e,r(`DisposableStack`,`defer`)),typeof e!=`function`)throw TypeError(`onDispose must be a function.`);this.#t.push({dispose:()=>{e()}})}move(){o(this.#e,r(`DisposableStack`,`move`));let e=new t;return e.#t=this.#t,this.#t=[],this.#e=!0,e}dispose(){if(this.#e)return;this.#e=!0;let e=this.#t;this.#t=[];let t,n=!1;for(let r=e.length-1;r>=0;r--)try{e[r].dispose()}catch(e){t=n?s(e,t):e,n=!0}if(n)throw t}}return a(t.prototype,e,`dispose`),Object.defineProperty(t.prototype,Symbol.toStringTag,{configurable:!0,enumerable:!1,writable:!1,value:`DisposableStack`}),t},p=(e,t)=>{class n{#e=!1;#t=[];get disposed(){return this.#e}use(n){if(o(this.#e,r(`AsyncDisposableStack`,`use`)),n==null)return n;let i=c(n),a=l(i,t);if(a!=null)return this.#t.push({dispose:async()=>{await a.call(i)}}),n;let s=l(i,e);if(s!=null)return this.#t.push({dispose:()=>Promise.resolve().then(()=>{s.call(i)})}),n;throw TypeError(`Resource does not implement Symbol.asyncDispose or Symbol.dispose.`)}adopt(e,t){if(o(this.#e,r(`AsyncDisposableStack`,`adopt`)),typeof t!=`function`)throw TypeError(`onDisposeAsync must be a function.`);return this.#t.push({dispose:()=>Promise.resolve().then(()=>t(e))}),e}defer(e){if(o(this.#e,r(`AsyncDisposableStack`,`defer`)),typeof e!=`function`)throw TypeError(`onDisposeAsync must be a function.`);this.#t.push({dispose:()=>Promise.resolve().then(()=>e())})}move(){o(this.#e,r(`AsyncDisposableStack`,`move`));let e=new n;return e.#t=this.#t,this.#t=[],this.#e=!0,e}async disposeAsync(){if(this.#e)return;this.#e=!0;let e=this.#t;this.#t=[];let t,n=!1;for(let r=e.length-1;r>=0;r--)try{await e[r].dispose()}catch(e){t=n?s(e,t):e,n=!0}if(n)throw t}}return a(n.prototype,t,`disposeAsync`),Object.defineProperty(n.prototype,Symbol.toStringTag,{configurable:!0,enumerable:!1,writable:!1,value:`AsyncDisposableStack`}),n},m=()=>{let e=function(e,t){return this.has(e)||this.set(e,t),this.get(e)},t=function(e,t){return this.has(e)||this.set(e,t(e)),this.get(e)};typeof Map.prototype.getOrInsert!=`function`&&i(Map.prototype,`getOrInsert`,e),typeof Map.prototype.getOrInsertComputed!=`function`&&i(Map.prototype,`getOrInsertComputed`,t),typeof WeakMap.prototype.getOrInsert!=`function`&&i(WeakMap.prototype,`getOrInsert`,e),typeof WeakMap.prototype.getOrInsertComputed!=`function`&&i(WeakMap.prototype,`getOrInsertComputed`,t)},h=e=>{if(typeof e!=`object`||!e)return!1;let t=Object.getPrototypeOf(e);return t===null||Object.getPrototypeOf(t)===null&&Object.hasOwn(t,`hasOwnProperty`)&&Object.hasOwn(t,`isPrototypeOf`)},g=e=>typeof e==`function`,_=e=>Object.entries(e),y=(e,t)=>Object.fromEntries(e.map(e=>[e,t(e)]));function b(e){let t=Object.create(null);return e===void 0?t:Object.assign(t,e)}const x=(e,t)=>Object.hasOwn(e,t)?e[t]:void 0,S=(e,t)=>Object.is(e,t),C=(e,t)=>e===t||Object.is(e,t),w=S,T=C,E=e=>(t,n)=>{if(t===n)return!0;if(t.length!==n.length)return!1;for(let r=0;r<t.length;r++)if(!e(t[r],n[r]))return!1;return!0},D=E(S),O=E(T),k=e=>(t,n)=>{if(t===n)return!0;for(let r in e)if(!e[r](t[r],n[r]))return!1;return!0},A=(e,t)=>{if(!e)throw Error(t)},j=(e,t=`Expected value to be non-nullable.`)=>{A(e!=null,t)},M=(e,t=`Expected value not to be undefined.`)=>{A(e!==void 0,t)},N=(e,t=`Expected a non-empty readonly array.`)=>{A(e.length>0,t)},P=e=>{A(!e.disposed,`Cannot use a disposed object.`)},F=e=>{throw Error(`exhaustiveCheck unhandled case: ${JSON.stringify(e)}`)},I=e=>e;function L(e,t=null){let n=e,r=t?.move()??new DisposableStack;for(let[t,i]of Object.entries(e))g(i)&&(n[t]=(...e)=>(P(r),i(...e)));return r instanceof AsyncDisposableStack?e[Symbol.asyncDispose]=()=>r.disposeAsync():e[Symbol.dispose]=()=>r.dispose(),e}const ee=e=>()=>e,te=ee(!1),ne=ee(void 0),re=e=>Array(e);function ie(e){return e.length>0}const ae=(e,t)=>[...e,t],oe=e=>e[0]
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
;function se(e){return e instanceof Uint8Array||ArrayBuffer.isView(e)&&e.constructor.name===`Uint8Array`&&`BYTES_PER_ELEMENT`in e&&e.BYTES_PER_ELEMENT===1}const ce=e=>e?`"${e}" `:``;function le(e,t=``){if(typeof e!=`boolean`)throw TypeError(ce(t)+`expected boolean, got type=`+typeof e);return e}function ue(e,t=``){if(typeof e!=`number`)throw TypeError(ce(t)+`expected number, got `+typeof e);if(!Number.isSafeInteger(e)||e<0)throw RangeError(ce(t)+`expected integer >= 0, got `+e);return e}function de(e,t,n=``){if(se(e)&&(t===void 0||e.length===t))return e;t!==void 0&&ue(t,`length`);let r=se(e),i=t===void 0?``:` of length ${t}`,a=r?`length=${e.length}`:`type=${typeof e}`,o=ce(n)+`expected Uint8Array`+i+`, got `+a;throw r?RangeError(o):TypeError(o)}const fe=(e,t)=>{if(typeof e!=`object`||!e||Array.isArray(e))throw TypeError(t===`object`?`expected valid options object`:`"${t}" expected object, got type=${typeof e}`)};function pe(e,t=!0){if(e.destroyed)throw Error(`hash was destroyed`);if(t&&e.finished)throw Error(`digest() was already called`)}function me(e,t){de(e,void 0,`output`);let n=t.outputLen;if(!(e.length>=n))throw RangeError(`"output" expected length >= `+n)}function R(e){return new Uint32Array(e.buffer,e.byteOffset,Math.floor(e.byteLength/4))}function he(...e){for(let t=0;t<e.length;t++)e[t].fill(0)}function ge(e){return new DataView(e.buffer,e.byteOffset,e.byteLength)}const _e=new Uint8Array(new Uint32Array([287454020]).buffer)[0]===68;function ve(e){return e<<24&4278190080|e<<8&16711680|e>>>8&65280|e>>>24&255}function ye(e){for(let t=0;t<e.length;t++)e[t]=ve(e[t]);return e}const be=_e?e=>e:ye,xe=typeof Uint8Array.from([]).toHex==`function`&&typeof Uint8Array.fromHex==`function`,Se=Array.from({length:256},(e,t)=>t.toString(16).padStart(2,`0`));function Ce(e){if(de(e),xe)return e.toHex();let t=``;for(let n=0;n<e.length;n++)t+=Se[e[n]];return t}function we(e){return e>=48&&e<=57?e-48:e>=65&&e<=70?e-55:e>=97&&e<=102?e-87:void 0}function Te(e){if(typeof e!=`string`)throw TypeError(`hex string expected, got `+typeof e);if(xe)try{return Uint8Array.fromHex(e)}catch(e){throw e instanceof SyntaxError?RangeError(e.message):e}let t=e.length,n=t/2;if(t%2)throw RangeError(`hex string expected, got unpadded hex of length `+t);let r=new Uint8Array(n);for(let t=0,i=0;t<n;t++,i+=2){let n=we(e.charCodeAt(i)),a=we(e.charCodeAt(i+1));if(n===void 0||a===void 0){let t=e[i]+e[i+1];throw RangeError(`hex string expected, got non-hex character "`+t+`" at index `+i)}r[t]=n*16+a}return r}function Ee(e){if(typeof e!=`string`)throw TypeError(`string expected`);return new Uint8Array(new TextEncoder().encode(e))}function De(e){return new TextDecoder().decode(e)}function Oe(e,t){return!e.byteLength||!t.byteLength?!1:e.buffer===t.buffer&&e.byteOffset<t.byteOffset+t.byteLength&&t.byteOffset<e.byteOffset+e.byteLength}function z(e,t){if(Oe(e,t)&&e.byteOffset<t.byteOffset)throw Error(`complex overlap of input and output is not supported`)}function ke(...e){let t=0;for(let n=0;n<e.length;n++){let r=e[n];de(r),t+=r.length}let n=new Uint8Array(t);for(let t=0,r=0;t<e.length;t++){let i=e[t];n.set(i,r),r+=i.length}return n}function Ae(e,t){return fe(e,`defaults`),fe(t,`opts`),Object.assign(e,t)}function je(e,t){if(e=de(e),t=de(t),e.length!==t.length)return!1;let n=0;for(let r=0;r<e.length;r++)n|=e[r]^t[r];return n===0}function Me(e,t,n){let r=t,i=n||(()=>[]),a=(e,t)=>r(t,...i(e)).update(e).digest(),o=r(new Uint8Array(e),...i(new Uint8Array));return a.outputLen=o.outputLen,a.blockLen=o.blockLen,a.create=(e,...t)=>r(e,...t),a}const Ne=(e,t)=>{function n(n,...r){if(de(n,void 0,`key`),e.nonceLength!==void 0){let t=r[0];de(t,e.varSizeNonce?void 0:e.nonceLength,`nonce`)}let i=e.tagLength,a=e.nonceLength===void 0?0:1;if(!e.withAAD){for(let e=a;e<r.length;e++)if(se(r[e]))throw Error(`AAD not supported`)}e.withAAD&&r[a]!==void 0&&de(r[a],void 0,`AAD`);let o=t(n,...r),s=(e,t)=>{if(t!==void 0){if(e!==2)throw Error(`cipher output not supported`);de(t,void 0,`output`)}},c=!1;return{encrypt(e,t){if(c)throw Error(`cannot encrypt() twice with same key + nonce`);return c=!0,de(e,void 0,`data`),s(o.encrypt.length,t),o.encrypt(e,t)},decrypt(e,t){if(de(e,void 0,`data`),i&&e.length<i)throw Error(`"ciphertext" expected length >= tagLength=`+i);return s(o.decrypt.length,t),o.decrypt(e,t)}}}return Object.assign(n,e),n};function Pe(e,t,n=!0){if(t===void 0)return new Uint8Array(e);if(de(t,e,`output`),n&&!Ie(t))throw Error(`invalid output, must be aligned`);return t}function Fe(e,t,n){ue(e),ue(t),le(n);let r=new Uint8Array(16),i=ge(r);return i.setBigUint64(0,BigInt(t),n),i.setBigUint64(8,BigInt(e),n),r}function Ie(e){return e.byteOffset%4==0}function B(e){return Uint8Array.from(de(e))}var Le=class extends Error{constructor(e){super(e),this.name=this.constructor.name,Error.captureStackTrace(this,this.constructor)}};const V=e=>{let t=e?.length??0;ht(t,`arrayLike.length`);let n=e?new globalThis.Uint8Array(e):new globalThis.Uint8Array(512),r=t;return{getCapacity:()=>n.length,getLength:()=>r,extend:e=>{let t=e.length;ht(t,`arg.length`);let i=r+t;if(ht(i,`Buffer length`),n.length<i){let e=n,t=Math.max(n.length*2,i);n=new globalThis.Uint8Array(t),n.set(e)}n.set(e,r),r=i},shift:()=>{gt(r,1);let e=n[0];return n=n.subarray(1),r--,e},shiftN:e=>{gt(r,e);let t=n.subarray(0,e);return n=n.subarray(e),r-=e,t},truncate:e=>{if(e>r)throw new Le(`Cannot truncate to a length greater than current`);r=e},reset:()=>{r=0},unwrap:()=>n.length===r?n:n.subarray(0,r)}},Re=1e3;let H=new globalThis.Uint8Array(8192),ze=new globalThis.DataView(H.buffer),U=0,Be=0,Ve=!1;const He=new globalThis.Uint8Array(0),Ue=new globalThis.DataView(He.buffer);let We=He,Ge=Ue,W=0,Ke=0;const qe=globalThis.String.fromCharCode,Je=globalThis.Array.from({length:4096},()=>void 0),Ye=(e,t)=>{if(Ve)throw new Le(`Reentrant JSON encoding is not supported.`);Ve=!0,U=0;try{Ze(t),e.extend(H.subarray(0,U))}finally{U=0,Be=0,Ve=!1}},Xe=e=>{let t=e.unwrap();We=t,Ge=new globalThis.DataView(t.buffer,t.byteOffset,t.byteLength),W=0;try{let t=rt();return e.shiftN(W),t}catch(e){throw e instanceof Le?e:new Le(`Invalid MessagePack data`)}finally{We=He,Ge=Ue,W=0,Ke=0}},Ze=e=>{if(e===null){et(192);return}switch(typeof e){case`string`:Qe(e);return;case`number`:if(globalThis.Object.is(e,-0)){tt(9),H[U++]=203,ze.setFloat64(U,e),U+=8;return}if(e>>>0===e){e<128?et(e):e<256?(tt(2),H[U++]=204,H[U++]=e):e<65536?(tt(3),H[U++]=205,ze.setUint16(U,e),U+=2):(tt(5),H[U++]=206,ze.setUint32(U,e),U+=4);return}if(globalThis.Number.isInteger(e)&&e>=-2147483648&&e<0){e>=-32?et(256+e):e>=-128?(tt(2),H[U++]=208,ze.setInt8(U++,e)):e>=-32768?(tt(3),H[U++]=209,ze.setInt16(U,e),U+=2):(tt(5),H[U++]=210,ze.setInt32(U,e),U+=4);return}tt(9),H[U++]=203,ze.setFloat64(U,e),U+=8;return;case`boolean`:et(e?195:194);return;case`object`:{if(Be>=Re)throw new Le(`JSON nesting exceeds the maximum depth of ${Re}.`);if(Be++,globalThis.Array.isArray(e)){let t=e,n=t.length;$e(n,144,220,221);for(let e of t)Ze(e);Be--;return}let t=e,n=globalThis.Object.keys(t);$e(n.length,128,222,223);for(let e of n)Qe(e),Ze(t[e]);Be--}}},Qe=e=>{let t=e.length,n=t<32?1:t<256?2:t<65536?3:5;tt(5+t*3);let r=U;U+=n;for(let n=0;n<t;n++){let t=e.charCodeAt(n);if(t<128)H[U++]=t;else if(t<2048)H[U++]=t>>6|192,H[U++]=t&63|128;else if((t&64512)==55296&&(e.charCodeAt(n+1)&64512)==56320){let r=e.charCodeAt(++n);t=65536+((t&1023)<<10)+(r&1023),H[U++]=t>>18|240,H[U++]=t>>12&63|128,H[U++]=t>>6&63|128,H[U++]=t&63|128}else H[U++]=t>>12|224,H[U++]=t>>6&63|128,H[U++]=t&63|128}let i=U-r-n;if(nt(i,`String byte length`),i<32){H[r]=160|i;return}if(i<256){n===1&&(H.copyWithin(r+2,r+1,U),U++),H[r]=217,H[r+1]=i;return}if(i<65536){if(n<3){let e=3-n;H.copyWithin(r+3,r+n,U),U+=e}H[r]=218,ze.setUint16(r+1,i);return}if(n<5){let e=5-n;H.copyWithin(r+5,r+n,U),U+=e}H[r]=219,ze.setUint32(r+1,i)},$e=(e,t,n,r)=>{nt(e,`Collection length`),e<16?et(t|e):e<65536?(tt(3),H[U++]=n,ze.setUint16(U,e),U+=2):(tt(5),H[U++]=r,ze.setUint32(U,e),U+=4)},et=e=>{tt(1),H[U++]=e},tt=e=>{let t=U+e;if(ht(t,`Encoded JSON value length`),t<=H.length)return;let n=globalThis.Math.max(H.length*2,t);ht(n,`JSON encoder capacity`);let r=H;H=new globalThis.Uint8Array(n),H.set(r.subarray(0,U)),ze=new globalThis.DataView(H.buffer)},nt=(e,t)=>{if(e>4294967295)throw new Le(`${t} exceeds the MessagePack uint32 limit.`)},rt=()=>{let e=dt();if(e<=127)return e;if(e<=143)return st(e-128);if(e<=159)return ot(e-144);if(e<=191)return at(e-160);if(e>=224)return e-256;switch(e){case 192:return null;case 194:return!1;case 195:return!0;case 202:return it(4);case 203:return it(8);case 204:return dt();case 205:return ft();case 206:return pt();case 208:return mt(1),Ge.getInt8(W++);case 209:{mt(2);let e=Ge.getInt16(W);return W+=2,e}case 210:{mt(4);let e=Ge.getInt32(W);return W+=4,e}case 217:return at(dt());case 218:return at(ft());case 219:return at(pt());case 220:return ot(ft());case 221:return ot(pt());case 222:return st(ft());case 223:return st(pt());default:throw new Le(`Unsupported MessagePack marker 0x${e.toString(16).padStart(2,`0`)}.`)}},it=e=>{mt(e);let t=e===4?Ge.getFloat32(W):Ge.getFloat64(W);if(W+=e,!globalThis.Number.isFinite(t))throw new Le(`A decoded JSON number must be finite.`);return t},at=e=>{mt(e);shortAscii:if(e<16){if(e===0)return``;let t=W,n=We[W++];if(n&128){W=t;break shortAscii}if(e===1)return qe(n);let r=We[W++];if(r&128){W=t;break shortAscii}if(e===2)return qe(n,r);let i=We[W++];if(i&128){W=t;break shortAscii}if(e===3)return qe(n,r,i);let a=We[W++];if(a&128){W=t;break shortAscii}if(e===4)return qe(n,r,i,a);let o=We[W++];if(o&128){W=t;break shortAscii}if(e===5)return qe(n,r,i,a,o);let s=We[W++];if(s&128){W=t;break shortAscii}if(e===6)return qe(n,r,i,a,o,s);let c=We[W++];if(c&128){W=t;break shortAscii}if(e===7)return qe(n,r,i,a,o,s,c);let l=We[W++];if(l&128){W=t;break shortAscii}if(e===8)return qe(n,r,i,a,o,s,c,l);let u=We[W++];if(u&128){W=t;break shortAscii}if(e===9)return qe(n,r,i,a,o,s,c,l,u);let d=We[W++];if(d&128){W=t;break shortAscii}if(e===10)return qe(n,r,i,a,o,s,c,l,u,d);let f=We[W++];if(f&128){W=t;break shortAscii}if(e===11)return qe(n,r,i,a,o,s,c,l,u,d,f);let p=We[W++];if(p&128){W=t;break shortAscii}if(e===12)return qe(n,r,i,a,o,s,c,l,u,d,f,p);let m=We[W++];if(m&128){W=t;break shortAscii}if(e===13)return qe(n,r,i,a,o,s,c,l,u,d,f,p,m);let h=We[W++];if(h&128){W=t;break shortAscii}if(e===14)return qe(n,r,i,a,o,s,c,l,u,d,f,p,m,h);let g=We[W++];if(g&128){W=t;break shortAscii}return qe(n,r,i,a,o,s,c,l,u,d,f,p,m,h,g)}let t=W+e,n=[],r=``;for(;W<t;){let e=We[W++];if(e<128)n.push(e);else if(e>=194&&e<=223){ut(t,1);let r=lt();n.push((e&31)<<6|r)}else if(e>=224&&e<=239){ut(t,2);let r=We[W];if(e===224&&r<160)throw new Le(`Invalid UTF-8 string encoding.`);let i=lt(),a=lt();n.push((e&15)<<12|i<<6|a)}else if(e>=240&&e<=244){ut(t,3);let r=We[W];if(e===240&&r<144||e===244&&r>143)throw new Le(`Invalid UTF-8 string encoding.`);let i=lt(),a=lt(),o=lt(),s=((e&7)<<18|i<<12|a<<6|o)-65536;n.push(55296|s>>10,56320|s&1023)}else throw new Le(`Invalid UTF-8 string encoding.`);n.length>=4096&&(r+=qe(...n),n.length=0)}return n.length>0&&(r+=qe(...n)),r},ot=e=>{if(Ke>=Re)throw new Le(`JSON nesting exceeds the maximum depth of ${Re}.`);if(e>We.length-W)throw new Le(`Buffer parse ended prematurely`);let t=Array(e);Ke++;for(let n=0;n<e;n++)t[n]=rt();return Ke--,t},st=e=>{if(Ke>=Re)throw new Le(`JSON nesting exceeds the maximum depth of ${Re}.`);if(e>(We.length-W)/2)throw new Le(`Buffer parse ended prematurely`);let t={};Ke++;for(let n=0;n<e;n++){let e=dt(),n;if(e>=160&&e<=191)n=ct(e-160);else if(e===217)n=ct(dt());else if(e===218)n=ct(ft());else if(e===219)n=ct(pt());else throw W--,rt(),new Le(`A decoded JSON object key must be a string.`);let r=rt();n===`__proto__`?globalThis.Object.defineProperty(t,n,{value:r,configurable:!0,enumerable:!0,writable:!0}):t[n]=r}return Ke--,t},ct=e=>{if(e>32)return at(e);mt(e);let t=W,n=t+e,r=e>1?Ge.getUint16(t):e===1?We[t]:0,i=(e<<5^r)&4095,a=Je[i];if(a?.bytes.length===e){let r=0;for(;r<e&&a.bytes[r]===We[t+r];)r++;if(r===e)return W=n,a.value}let o=at(e);return Je[i]={bytes:We.slice(t,n),value:o},o},lt=()=>{let e=We[W++];if((e&192)!=128)throw new Le(`Invalid UTF-8 string encoding.`);return e&63},ut=(e,t)=>{if(e-W<t)throw new Le(`Invalid UTF-8 string encoding.`)},dt=()=>(mt(1),We[W++]),ft=()=>{mt(2);let e=Ge.getUint16(W);return W+=2,e},pt=()=>{mt(4);let e=Ge.getUint32(W);return W+=4,e},mt=e=>{if(We.length-W<e)throw new Le(`Buffer parse ended prematurely`)},ht=(e,t)=>{if(!globalThis.Number.isSafeInteger(e)||e<0)throw new Le(`${t} must be a non-negative safe integer.`)},gt=(e,t)=>{if(e<t)throw new Le(`Buffer parse ended prematurely`)},_t=BigInt(2**32-1),vt=BigInt(32);function yt(e,t=!1){return t?{h:Number(e&_t),l:Number(e>>vt&_t)}:{h:Number(e>>vt&_t)|0,l:Number(e&_t)|0}}function bt(e,t=!1){let n=e.length,r=new Uint32Array(n),i=new Uint32Array(n);for(let a=0;a<n;a++){let{h:n,l:o}=yt(e[a],t);[r[a],i[a]]=[n,o]}return[r,i]}const xt=e=>e/2**32|0,St=e=>e>>>0;function Ct(e,t,n,r){let i=xt(n),a=St(n);e.setUint32(t,r?a:i,r),e.setUint32(t+4,r?i:a,r)}function wt(e){return e instanceof Uint8Array||ArrayBuffer.isView(e)&&e.constructor.name===`Uint8Array`&&`BYTES_PER_ELEMENT`in e&&e.BYTES_PER_ELEMENT===1}const Tt=e=>e?`"${e}" `:``;function Et(e,t=``){if(typeof e!=`number`)throw TypeError(Tt(t)+`expected number, got `+typeof e);if(!Number.isSafeInteger(e)||e<0)throw RangeError(Tt(t)+`expected integer >= 0, got `+e);return e}function Dt(e,t,n=``){if(wt(e)&&(t===void 0||e.length===t))return e;t!==void 0&&Et(t,`length`);let r=wt(e),i=t===void 0?``:` of length ${t}`,a=r?`length=${e.length}`:`type=${typeof e}`,o=Tt(n)+`expected Uint8Array`+i+`, got `+a;throw r?RangeError(o):TypeError(o)}const Ot=(e,t)=>{if(typeof e!=`object`||!e||Array.isArray(e))throw TypeError((t===`object`?``:`"${t}" `)+`expected object, got type=`+typeof e)},kt=(e,t)=>{Ot(e,t);let n=Object.getPrototypeOf(e);if(n!==Object.prototype&&n!==null)throw TypeError(`"${t}" expected plain object`);if(Object.hasOwn(e,`__proto__`))throw TypeError(`"${t}.__proto__" is not allowed`)};function At(e,t=!0){if(e.destroyed)throw Error(`hash was destroyed`);if(t&&e.finished)throw Error(`digest() was already called`)}function jt(e,t){Dt(e,void 0,`output`);let n=t.outputLen;if(!(e.length>=n))throw RangeError(`"output" expected length >= `+n)}function Mt(...e){for(let t=0;t<e.length;t++)e[t].fill(0)}function Nt(e){return new DataView(e.buffer,e.byteOffset,e.byteLength)}function Pt(e,t){return e<<32-t|e>>>t}new Uint8Array(new Uint32Array([287454020]).buffer)[0],typeof Uint8Array.from([]).toHex==`function`&&Uint8Array.fromHex;function Ft(e,t,n=`opts`){return kt(e,`defaults`),t!==void 0&&kt(t,n),Object.assign(Object.create(null),e,t)}function It(e,t={}){if(typeof e!=`function`)throw TypeError(`"hashCons" expected function, got type=`+typeof e);t=Ft({},t,`info`);let n=(t,n)=>e(n).update(t).digest(),r=e(void 0);return n.outputLen=r.outputLen,n.blockLen=r.blockLen,n.canXOF=r.canXOF,n.create=t=>e(t),Object.assign(n,t),Object.freeze(n)}function Lt(e=32){Et(e,`bytesLength`);let t=typeof globalThis==`object`?globalThis.crypto:null;if(typeof t?.getRandomValues!=`function`)throw Error(`crypto.getRandomValues must be defined`);if(e>65536)throw RangeError(`"bytesLength" expected <= 65536, got ${e}`);return t.getRandomValues(new Uint8Array(e))}const Rt=e=>({oid:Uint8Array.from([6,9,96,134,72,1,101,3,4,2,e])});function zt(e,t,n){return e&t^~e&n}function Bt(e,t,n){return e&t^e&n^t&n}var Vt=class{blockLen;outputLen;canXOF=!1;padOffset;isLE;buffer;view;finished=!1;length=0;pos=0;destroyed=!1;constructor(e,t,n,r){this.blockLen=e,this.outputLen=t,this.padOffset=n,this.isLE=r,this.buffer=new Uint8Array(e),this.view=Nt(this.buffer)}update(e){At(this),Dt(e);let{view:t,buffer:n,blockLen:r}=this,i=e.length,a=!1;for(let o=0;o<i;){let s=Math.min(r-this.pos,i-o);if(s===r){let t=Nt(e);for(;r<=i-o;o+=r)this.process(t,o);a=!0;continue}n.set(o===0&&s===i?e:e.subarray(o,o+s),this.pos),this.pos+=s,o+=s,this.pos===r&&(this.process(t,0),this.pos=0,a=!0)}return this.length+=e.length,a&&this.roundClean(),this}digestInto(e){At(this),jt(e,this),this.finished=!0;let{buffer:t,view:n,blockLen:r,isLE:i}=this,{pos:a}=this;t[a++]=128,t.fill(0,a),this.padOffset>r-a&&(this.process(n,0),t.fill(0)),Ct(n,r-8,this.length*8,i),this.process(n,0),this.roundClean();let o=e===t?n:Nt(e),s=this.outputLen,c=s/4,l=this.get();if(s%4||c>l.length)throw Error(`invalid outputLen`);for(let e=0;e<c;e++)o.setUint32(4*e,l[e],i)}digest(){let{buffer:e,outputLen:t}=this;this.digestInto(e);let n=e.slice(0,t);return this.destroy(),n}_cloneIntoMeta(e){let{buffer:t,length:n,finished:r,destroyed:i,pos:a}=this;return e.destroyed=i,e.finished=r,e.length=n,e.pos=a,a&&e.buffer.set(t),e}clone(){return this._cloneInto()}};const Ht=Uint32Array.from([1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225]),Ut=Uint32Array.from([1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298]),Wt=new Uint32Array(64);var Gt=class extends Vt{A=0;B=0;C=0;D=0;E=0;F=0;G=0;H=0;constructor(e,t){super(64,e,8,!1),this.A=t[0]|0,this.B=t[1]|0,this.C=t[2]|0,this.D=t[3]|0,this.E=t[4]|0,this.F=t[5]|0,this.G=t[6]|0,this.H=t[7]|0}get(){let{A:e,B:t,C:n,D:r,E:i,F:a,G:o,H:s}=this;return[e,t,n,r,i,a,o,s]}set(e,t,n,r,i,a,o,s){this.A=e|0,this.B=t|0,this.C=n|0,this.D=r|0,this.E=i|0,this.F=a|0,this.G=o|0,this.H=s|0}_cloneInto(e){return(e||=new this.constructor).set(...this.get()),this._cloneIntoMeta(e)}process(e,t){for(let n=0;n<16;n++,t+=4)Wt[n]=e.getUint32(t,!1);for(let e=16;e<64;e++){let t=Wt[e-15],n=Wt[e-2],r=Pt(t,7)^Pt(t,18)^t>>>3,i=Pt(n,17)^Pt(n,19)^n>>>10;Wt[e]=i+Wt[e-7]+r+Wt[e-16]|0}let{A:n,B:r,C:i,D:a,E:o,F:s,G:c,H:l}=this;for(let e=0;e<64;e++){let t=Pt(o,6)^Pt(o,11)^Pt(o,25),u=l+t+zt(o,s,c)+Ut[e]+Wt[e]|0,d=(Pt(n,2)^Pt(n,13)^Pt(n,22))+Bt(n,r,i)|0;l=c,c=s,s=o,o=a+u|0,a=i,i=r,r=n,n=u+d|0}n=n+this.A|0,r=r+this.B|0,i=i+this.C|0,a=a+this.D|0,o=o+this.E|0,s=s+this.F|0,c=c+this.G|0,l=l+this.H|0,this.set(n,r,i,a,o,s,c,l)}roundClean(){Mt(Wt)}destroy(){this.destroyed=!0,this.set(0,0,0,0,0,0,0,0),Mt(this.buffer)}},Kt=class extends Gt{constructor(){super(32,Ht)}};const qt=bt(`0x428a2f98d728ae22.0x7137449123ef65cd.0xb5c0fbcfec4d3b2f.0xe9b5dba58189dbbc.0x3956c25bf348b538.0x59f111f1b605d019.0x923f82a4af194f9b.0xab1c5ed5da6d8118.0xd807aa98a3030242.0x12835b0145706fbe.0x243185be4ee4b28c.0x550c7dc3d5ffb4e2.0x72be5d74f27b896f.0x80deb1fe3b1696b1.0x9bdc06a725c71235.0xc19bf174cf692694.0xe49b69c19ef14ad2.0xefbe4786384f25e3.0x0fc19dc68b8cd5b5.0x240ca1cc77ac9c65.0x2de92c6f592b0275.0x4a7484aa6ea6e483.0x5cb0a9dcbd41fbd4.0x76f988da831153b5.0x983e5152ee66dfab.0xa831c66d2db43210.0xb00327c898fb213f.0xbf597fc7beef0ee4.0xc6e00bf33da88fc2.0xd5a79147930aa725.0x06ca6351e003826f.0x142929670a0e6e70.0x27b70a8546d22ffc.0x2e1b21385c26c926.0x4d2c6dfc5ac42aed.0x53380d139d95b3df.0x650a73548baf63de.0x766a0abb3c77b2a8.0x81c2c92e47edaee6.0x92722c851482353b.0xa2bfe8a14cf10364.0xa81a664bbc423001.0xc24b8b70d0f89791.0xc76c51a30654be30.0xd192e819d6ef5218.0xd69906245565a910.0xf40e35855771202a.0x106aa07032bbd1b8.0x19a4c116b8d2d0c8.0x1e376c085141ab53.0x2748774cdf8eeb99.0x34b0bcb5e19b48a8.0x391c0cb3c5c95a63.0x4ed8aa4ae3418acb.0x5b9cca4f7763e373.0x682e6ff3d6b2b8a3.0x748f82ee5defb2fc.0x78a5636f43172f60.0x84c87814a1f0ab72.0x8cc702081a6439ec.0x90befffa23631e28.0xa4506cebde82bde9.0xbef9a3f7b2c67915.0xc67178f2e372532b.0xca273eceea26619c.0xd186b8c721c0c207.0xeada7dd6cde0eb1e.0xf57d4f7fee6ed178.0x06f067aa72176fba.0x0a637dc5a2c898a6.0x113f9804bef90dae.0x1b710b35131c471b.0x28db77f523047d84.0x32caab7b40c72493.0x3c9ebe0a15c9bebc.0x431d67c49c100d4c.0x4cc5d4becb3e42b6.0x597f299cfc657e2a.0x5fcb6fab3ad6faec.0x6c44198c4a475817`.split(`.`).map(e=>BigInt(e)));qt[0],qt[1];const Jt=It(()=>new Kt,Rt(1));new Uint8Array(new Uint32Array([287454020]).buffer)[0],typeof Uint8Array.from([]).toHex==`function`&&Uint8Array.fromHex;const Yt=BigInt(2**32-1),Xt=BigInt(32);function Zt(e,t=!1){return t?{h:Number(e&Yt),l:Number(e>>Xt&Yt)}:{h:Number(e>>Xt&Yt)|0,l:Number(e&Yt)|0}}function Qt(e,t=!1){let n=e.length,r=new Uint32Array(n),i=new Uint32Array(n);for(let a=0;a<n;a++){let{h:n,l:o}=Zt(e[a],t);[r[a],i[a]]=[n,o]}return[r,i]}const $t=Qt(`0x428a2f98d728ae22.0x7137449123ef65cd.0xb5c0fbcfec4d3b2f.0xe9b5dba58189dbbc.0x3956c25bf348b538.0x59f111f1b605d019.0x923f82a4af194f9b.0xab1c5ed5da6d8118.0xd807aa98a3030242.0x12835b0145706fbe.0x243185be4ee4b28c.0x550c7dc3d5ffb4e2.0x72be5d74f27b896f.0x80deb1fe3b1696b1.0x9bdc06a725c71235.0xc19bf174cf692694.0xe49b69c19ef14ad2.0xefbe4786384f25e3.0x0fc19dc68b8cd5b5.0x240ca1cc77ac9c65.0x2de92c6f592b0275.0x4a7484aa6ea6e483.0x5cb0a9dcbd41fbd4.0x76f988da831153b5.0x983e5152ee66dfab.0xa831c66d2db43210.0xb00327c898fb213f.0xbf597fc7beef0ee4.0xc6e00bf33da88fc2.0xd5a79147930aa725.0x06ca6351e003826f.0x142929670a0e6e70.0x27b70a8546d22ffc.0x2e1b21385c26c926.0x4d2c6dfc5ac42aed.0x53380d139d95b3df.0x650a73548baf63de.0x766a0abb3c77b2a8.0x81c2c92e47edaee6.0x92722c851482353b.0xa2bfe8a14cf10364.0xa81a664bbc423001.0xc24b8b70d0f89791.0xc76c51a30654be30.0xd192e819d6ef5218.0xd69906245565a910.0xf40e35855771202a.0x106aa07032bbd1b8.0x19a4c116b8d2d0c8.0x1e376c085141ab53.0x2748774cdf8eeb99.0x34b0bcb5e19b48a8.0x391c0cb3c5c95a63.0x4ed8aa4ae3418acb.0x5b9cca4f7763e373.0x682e6ff3d6b2b8a3.0x748f82ee5defb2fc.0x78a5636f43172f60.0x84c87814a1f0ab72.0x8cc702081a6439ec.0x90befffa23631e28.0xa4506cebde82bde9.0xbef9a3f7b2c67915.0xc67178f2e372532b.0xca273eceea26619c.0xd186b8c721c0c207.0xeada7dd6cde0eb1e.0xf57d4f7fee6ed178.0x06f067aa72176fba.0x0a637dc5a2c898a6.0x113f9804bef90dae.0x1b710b35131c471b.0x28db77f523047d84.0x32caab7b40c72493.0x3c9ebe0a15c9bebc.0x431d67c49c100d4c.0x4cc5d4becb3e42b6.0x597f299cfc657e2a.0x5fcb6fab3ad6faec.0x6c44198c4a475817`.split(`.`).map(e=>BigInt(e)))
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
;$t[0],$t[1],`abandon
ability
able
about
above
absent
absorb
abstract
absurd
abuse
access
accident
account
accuse
achieve
acid
acoustic
acquire
across
act
action
actor
actress
actual
adapt
add
addict
address
adjust
admit
adult
advance
advice
aerobic
affair
afford
afraid
again
age
agent
agree
ahead
aim
air
airport
aisle
alarm
album
alcohol
alert
alien
all
alley
allow
almost
alone
alpha
already
also
alter
always
amateur
amazing
among
amount
amused
analyst
anchor
ancient
anger
angle
angry
animal
ankle
announce
annual
another
answer
antenna
antique
anxiety
any
apart
apology
appear
apple
approve
april
arch
arctic
area
arena
argue
arm
armed
armor
army
around
arrange
arrest
arrive
arrow
art
artefact
artist
artwork
ask
aspect
assault
asset
assist
assume
asthma
athlete
atom
attack
attend
attitude
attract
auction
audit
august
aunt
author
auto
autumn
average
avocado
avoid
awake
aware
away
awesome
awful
awkward
axis
baby
bachelor
bacon
badge
bag
balance
balcony
ball
bamboo
banana
banner
bar
barely
bargain
barrel
base
basic
basket
battle
beach
bean
beauty
because
become
beef
before
begin
behave
behind
believe
below
belt
bench
benefit
best
betray
better
between
beyond
bicycle
bid
bike
bind
biology
bird
birth
bitter
black
blade
blame
blanket
blast
bleak
bless
blind
blood
blossom
blouse
blue
blur
blush
board
boat
body
boil
bomb
bone
bonus
book
boost
border
boring
borrow
boss
bottom
bounce
box
boy
bracket
brain
brand
brass
brave
bread
breeze
brick
bridge
brief
bright
bring
brisk
broccoli
broken
bronze
broom
brother
brown
brush
bubble
buddy
budget
buffalo
build
bulb
bulk
bullet
bundle
bunker
burden
burger
burst
bus
business
busy
butter
buyer
buzz
cabbage
cabin
cable
cactus
cage
cake
call
calm
camera
camp
can
canal
cancel
candy
cannon
canoe
canvas
canyon
capable
capital
captain
car
carbon
card
cargo
carpet
carry
cart
case
cash
casino
castle
casual
cat
catalog
catch
category
cattle
caught
cause
caution
cave
ceiling
celery
cement
census
century
cereal
certain
chair
chalk
champion
change
chaos
chapter
charge
chase
chat
cheap
check
cheese
chef
cherry
chest
chicken
chief
child
chimney
choice
choose
chronic
chuckle
chunk
churn
cigar
cinnamon
circle
citizen
city
civil
claim
clap
clarify
claw
clay
clean
clerk
clever
click
client
cliff
climb
clinic
clip
clock
clog
close
cloth
cloud
clown
club
clump
cluster
clutch
coach
coast
coconut
code
coffee
coil
coin
collect
color
column
combine
come
comfort
comic
common
company
concert
conduct
confirm
congress
connect
consider
control
convince
cook
cool
copper
copy
coral
core
corn
correct
cost
cotton
couch
country
couple
course
cousin
cover
coyote
crack
cradle
craft
cram
crane
crash
crater
crawl
crazy
cream
credit
creek
crew
cricket
crime
crisp
critic
crop
cross
crouch
crowd
crucial
cruel
cruise
crumble
crunch
crush
cry
crystal
cube
culture
cup
cupboard
curious
current
curtain
curve
cushion
custom
cute
cycle
dad
damage
damp
dance
danger
daring
dash
daughter
dawn
day
deal
debate
debris
decade
december
decide
decline
decorate
decrease
deer
defense
define
defy
degree
delay
deliver
demand
demise
denial
dentist
deny
depart
depend
deposit
depth
deputy
derive
describe
desert
design
desk
despair
destroy
detail
detect
develop
device
devote
diagram
dial
diamond
diary
dice
diesel
diet
differ
digital
dignity
dilemma
dinner
dinosaur
direct
dirt
disagree
discover
disease
dish
dismiss
disorder
display
distance
divert
divide
divorce
dizzy
doctor
document
dog
doll
dolphin
domain
donate
donkey
donor
door
dose
double
dove
draft
dragon
drama
drastic
draw
dream
dress
drift
drill
drink
drip
drive
drop
drum
dry
duck
dumb
dune
during
dust
dutch
duty
dwarf
dynamic
eager
eagle
early
earn
earth
easily
east
easy
echo
ecology
economy
edge
edit
educate
effort
egg
eight
either
elbow
elder
electric
elegant
element
elephant
elevator
elite
else
embark
embody
embrace
emerge
emotion
employ
empower
empty
enable
enact
end
endless
endorse
enemy
energy
enforce
engage
engine
enhance
enjoy
enlist
enough
enrich
enroll
ensure
enter
entire
entry
envelope
episode
equal
equip
era
erase
erode
erosion
error
erupt
escape
essay
essence
estate
eternal
ethics
evidence
evil
evoke
evolve
exact
example
excess
exchange
excite
exclude
excuse
execute
exercise
exhaust
exhibit
exile
exist
exit
exotic
expand
expect
expire
explain
expose
express
extend
extra
eye
eyebrow
fabric
face
faculty
fade
faint
faith
fall
false
fame
family
famous
fan
fancy
fantasy
farm
fashion
fat
fatal
father
fatigue
fault
favorite
feature
february
federal
fee
feed
feel
female
fence
festival
fetch
fever
few
fiber
fiction
field
figure
file
film
filter
final
find
fine
finger
finish
fire
firm
first
fiscal
fish
fit
fitness
fix
flag
flame
flash
flat
flavor
flee
flight
flip
float
flock
floor
flower
fluid
flush
fly
foam
focus
fog
foil
fold
follow
food
foot
force
forest
forget
fork
fortune
forum
forward
fossil
foster
found
fox
fragile
frame
frequent
fresh
friend
fringe
frog
front
frost
frown
frozen
fruit
fuel
fun
funny
furnace
fury
future
gadget
gain
galaxy
gallery
game
gap
garage
garbage
garden
garlic
garment
gas
gasp
gate
gather
gauge
gaze
general
genius
genre
gentle
genuine
gesture
ghost
giant
gift
giggle
ginger
giraffe
girl
give
glad
glance
glare
glass
glide
glimpse
globe
gloom
glory
glove
glow
glue
goat
goddess
gold
good
goose
gorilla
gospel
gossip
govern
gown
grab
grace
grain
grant
grape
grass
gravity
great
green
grid
grief
grit
grocery
group
grow
grunt
guard
guess
guide
guilt
guitar
gun
gym
habit
hair
half
hammer
hamster
hand
happy
harbor
hard
harsh
harvest
hat
have
hawk
hazard
head
health
heart
heavy
hedgehog
height
hello
helmet
help
hen
hero
hidden
high
hill
hint
hip
hire
history
hobby
hockey
hold
hole
holiday
hollow
home
honey
hood
hope
horn
horror
horse
hospital
host
hotel
hour
hover
hub
huge
human
humble
humor
hundred
hungry
hunt
hurdle
hurry
hurt
husband
hybrid
ice
icon
idea
identify
idle
ignore
ill
illegal
illness
image
imitate
immense
immune
impact
impose
improve
impulse
inch
include
income
increase
index
indicate
indoor
industry
infant
inflict
inform
inhale
inherit
initial
inject
injury
inmate
inner
innocent
input
inquiry
insane
insect
inside
inspire
install
intact
interest
into
invest
invite
involve
iron
island
isolate
issue
item
ivory
jacket
jaguar
jar
jazz
jealous
jeans
jelly
jewel
job
join
joke
journey
joy
judge
juice
jump
jungle
junior
junk
just
kangaroo
keen
keep
ketchup
key
kick
kid
kidney
kind
kingdom
kiss
kit
kitchen
kite
kitten
kiwi
knee
knife
knock
know
lab
label
labor
ladder
lady
lake
lamp
language
laptop
large
later
latin
laugh
laundry
lava
law
lawn
lawsuit
layer
lazy
leader
leaf
learn
leave
lecture
left
leg
legal
legend
leisure
lemon
lend
length
lens
leopard
lesson
letter
level
liar
liberty
library
license
life
lift
light
like
limb
limit
link
lion
liquid
list
little
live
lizard
load
loan
lobster
local
lock
logic
lonely
long
loop
lottery
loud
lounge
love
loyal
lucky
luggage
lumber
lunar
lunch
luxury
lyrics
machine
mad
magic
magnet
maid
mail
main
major
make
mammal
man
manage
mandate
mango
mansion
manual
maple
marble
march
margin
marine
market
marriage
mask
mass
master
match
material
math
matrix
matter
maximum
maze
meadow
mean
measure
meat
mechanic
medal
media
melody
melt
member
memory
mention
menu
mercy
merge
merit
merry
mesh
message
metal
method
middle
midnight
milk
million
mimic
mind
minimum
minor
minute
miracle
mirror
misery
miss
mistake
mix
mixed
mixture
mobile
model
modify
mom
moment
monitor
monkey
monster
month
moon
moral
more
morning
mosquito
mother
motion
motor
mountain
mouse
move
movie
much
muffin
mule
multiply
muscle
museum
mushroom
music
must
mutual
myself
mystery
myth
naive
name
napkin
narrow
nasty
nation
nature
near
neck
need
negative
neglect
neither
nephew
nerve
nest
net
network
neutral
never
news
next
nice
night
noble
noise
nominee
noodle
normal
north
nose
notable
note
nothing
notice
novel
now
nuclear
number
nurse
nut
oak
obey
object
oblige
obscure
observe
obtain
obvious
occur
ocean
october
odor
off
offer
office
often
oil
okay
old
olive
olympic
omit
once
one
onion
online
only
open
opera
opinion
oppose
option
orange
orbit
orchard
order
ordinary
organ
orient
original
orphan
ostrich
other
outdoor
outer
output
outside
oval
oven
over
own
owner
oxygen
oyster
ozone
pact
paddle
page
pair
palace
palm
panda
panel
panic
panther
paper
parade
parent
park
parrot
party
pass
patch
path
patient
patrol
pattern
pause
pave
payment
peace
peanut
pear
peasant
pelican
pen
penalty
pencil
people
pepper
perfect
permit
person
pet
phone
photo
phrase
physical
piano
picnic
picture
piece
pig
pigeon
pill
pilot
pink
pioneer
pipe
pistol
pitch
pizza
place
planet
plastic
plate
play
please
pledge
pluck
plug
plunge
poem
poet
point
polar
pole
police
pond
pony
pool
popular
portion
position
possible
post
potato
pottery
poverty
powder
power
practice
praise
predict
prefer
prepare
present
pretty
prevent
price
pride
primary
print
priority
prison
private
prize
problem
process
produce
profit
program
project
promote
proof
property
prosper
protect
proud
provide
public
pudding
pull
pulp
pulse
pumpkin
punch
pupil
puppy
purchase
purity
purpose
purse
push
put
puzzle
pyramid
quality
quantum
quarter
question
quick
quit
quiz
quote
rabbit
raccoon
race
rack
radar
radio
rail
rain
raise
rally
ramp
ranch
random
range
rapid
rare
rate
rather
raven
raw
razor
ready
real
reason
rebel
rebuild
recall
receive
recipe
record
recycle
reduce
reflect
reform
refuse
region
regret
regular
reject
relax
release
relief
rely
remain
remember
remind
remove
render
renew
rent
reopen
repair
repeat
replace
report
require
rescue
resemble
resist
resource
response
result
retire
retreat
return
reunion
reveal
review
reward
rhythm
rib
ribbon
rice
rich
ride
ridge
rifle
right
rigid
ring
riot
ripple
risk
ritual
rival
river
road
roast
robot
robust
rocket
romance
roof
rookie
room
rose
rotate
rough
round
route
royal
rubber
rude
rug
rule
run
runway
rural
sad
saddle
sadness
safe
sail
salad
salmon
salon
salt
salute
same
sample
sand
satisfy
satoshi
sauce
sausage
save
say
scale
scan
scare
scatter
scene
scheme
school
science
scissors
scorpion
scout
scrap
screen
script
scrub
sea
search
season
seat
second
secret
section
security
seed
seek
segment
select
sell
seminar
senior
sense
sentence
series
service
session
settle
setup
seven
shadow
shaft
shallow
share
shed
shell
sheriff
shield
shift
shine
ship
shiver
shock
shoe
shoot
shop
short
shoulder
shove
shrimp
shrug
shuffle
shy
sibling
sick
side
siege
sight
sign
silent
silk
silly
silver
similar
simple
since
sing
siren
sister
situate
six
size
skate
sketch
ski
skill
skin
skirt
skull
slab
slam
sleep
slender
slice
slide
slight
slim
slogan
slot
slow
slush
small
smart
smile
smoke
smooth
snack
snake
snap
sniff
snow
soap
soccer
social
sock
soda
soft
solar
soldier
solid
solution
solve
someone
song
soon
sorry
sort
soul
sound
soup
source
south
space
spare
spatial
spawn
speak
special
speed
spell
spend
sphere
spice
spider
spike
spin
spirit
split
spoil
sponsor
spoon
sport
spot
spray
spread
spring
spy
square
squeeze
squirrel
stable
stadium
staff
stage
stairs
stamp
stand
start
state
stay
steak
steel
stem
step
stereo
stick
still
sting
stock
stomach
stone
stool
story
stove
strategy
street
strike
strong
struggle
student
stuff
stumble
style
subject
submit
subway
success
such
sudden
suffer
sugar
suggest
suit
summer
sun
sunny
sunset
super
supply
supreme
sure
surface
surge
surprise
surround
survey
suspect
sustain
swallow
swamp
swap
swarm
swear
sweet
swift
swim
swing
switch
sword
symbol
symptom
syrup
system
table
tackle
tag
tail
talent
talk
tank
tape
target
task
taste
tattoo
taxi
teach
team
tell
ten
tenant
tennis
tent
term
test
text
thank
that
theme
then
theory
there
they
thing
this
thought
three
thrive
throw
thumb
thunder
ticket
tide
tiger
tilt
timber
time
tiny
tip
tired
tissue
title
toast
tobacco
today
toddler
toe
together
toilet
token
tomato
tomorrow
tone
tongue
tonight
tool
tooth
top
topic
topple
torch
tornado
tortoise
toss
total
tourist
toward
tower
town
toy
track
trade
traffic
tragic
train
transfer
trap
trash
travel
tray
treat
tree
trend
trial
tribe
trick
trigger
trim
trip
trophy
trouble
truck
true
truly
trumpet
trust
truth
try
tube
tuition
tumble
tuna
tunnel
turkey
turn
turtle
twelve
twenty
twice
twin
twist
two
type
typical
ugly
umbrella
unable
unaware
uncle
uncover
under
undo
unfair
unfold
unhappy
uniform
unique
unit
universe
unknown
unlock
until
unusual
unveil
update
upgrade
uphold
upon
upper
upset
urban
urge
usage
use
used
useful
useless
usual
utility
vacant
vacuum
vague
valid
valley
valve
van
vanish
vapor
various
vast
vault
vehicle
velvet
vendor
venture
venue
verb
verify
version
very
vessel
veteran
viable
vibrant
vicious
victory
video
view
village
vintage
violin
virtual
virus
visa
visit
visual
vital
vivid
vocal
voice
void
volcano
volume
vote
voyage
wage
wagon
wait
walk
wall
walnut
want
warfare
warm
warrior
wash
wasp
waste
water
wave
way
wealth
weapon
wear
weasel
weather
web
wedding
weekend
weird
welcome
west
wet
whale
what
wheat
wheel
when
where
whip
whisper
wide
width
wife
wild
will
win
window
wine
wing
wink
winner
winter
wire
wisdom
wise
wish
witness
wolf
woman
wonder
wood
wool
word
work
world
worry
worth
wrap
wreck
wrestle
wrist
write
wrong
yard
year
yellow
you
young
youth
zebra
zero
zone
zoo`.split(`
`);const en=!(`HermesInternal`in globalThis)&&globalThis.Buffer!==void 0;function G(e){return e===void 0?tn:{ok:!0,value:e}}const tn={ok:!0,value:void 0},K=e=>({ok:!1,error:e}),nn=e=>{if(e.ok)return e.value;throw Error(`getOrThrow`,{cause:e.error})},rn=e=>e.ok?e.value:null,an=e=>(A(e.ok,`Expected Ok result.`),e.value);function on(e,t){try{return G(e())}catch(e){return K(t?t(e):e)}}const sn=(e,t)=>e.ok?t(e.value):e,cn=e=>{if(typeof e==`string`)return JSON.stringify(e);if(typeof e!=`object`||!e)return globalThis.String(e);try{let t=JSON.stringify(e);if(typeof t==`string`)return t}catch{}try{return globalThis.String(e)}catch{return`[Unserializable value]`}},ln=e=>({"~evolu/instance":e}),un=globalThis.Symbol(),dn=globalThis.Symbol(),fn=(e,t,n,r=[])=>[{name:e,error:t,path:r,formatError:n}],pn=(e,t)=>t.map(t=>({...t,path:[e,...t.path]})),mn=(e,t,n,r)=>(i,a)=>{let o=i.reason;if(o.kind!==t)return fn(e,i,n);let s=o.issues;return(a===`first`?[s[0]]:s).flatMap(o=>{let s=`key`in o?o.key:o.index;return o.error===void 0?fn(e,a===`first`?i:{type:e,reason:{kind:t,issues:[o]}},n,[s]):pn(s,r(o)[dn](o.error,a))})},hn=e=>e.formatError(e.error);function gn(e,t){if(e===void 0)return;let n=e,r=n[un](t);if(!r.ok)throw Error(`Expected ${n.name}.`,{cause:r.error})}const _n=(e,t,n,r,i=Sn)=>{if(t(r))return;let a=n(r,i).error;throw Error(`Expected ${e}.`,{cause:a})},vn=(e,t,n)=>{let r=n.get(e);if(r)return r;let i=e.parent?vn(e.parent,t,n):null,a=Mn(e.name,i,e.fromUnknown,e.is,e[un],e[Tn],e[wn].parent??e[wn],(n,r)=>e[dn](n,r).map(e=>({...e,formatError:()=>t(e)})),void 0,t);globalThis.Object.assign(a,{from:e.from,orThrow:e.orThrow,orNull:e.orNull}),n.set(e,a),Ar.has(e)&&Ar.add(a);for(let r of Reflect.ownKeys(e)){if(globalThis.Object.hasOwn(a,r))continue;let i=globalThis.Object.getOwnPropertyDescriptor(e,r);`value`in i&&(i.value=yn(i.value,t,n)),globalThis.Object.defineProperty(a,r,i)}return a},yn=(e,t,n)=>{if(typeof e==`object`&&e&&globalThis.Object.hasOwn(e,`~evolu/instance`)&&e[`~evolu/instance`]===`Type`)return vn(e,t,n);if(Array.isArray(e))return e.map(e=>yn(e,t,n));if(!h(e))return e;let r=globalThis.Object.create(globalThis.Object.getPrototypeOf(e));for(let i of Reflect.ownKeys(e))r[i]=yn(e[i],t,n);return r},bn=(e,t,n,r)=>{let i=n,a=r??(t=>fn(t.type===`TypeOf`?e:t.type,t,i)),o=e=>t(e).ok,s=(n,r=Sn)=>(_n(e,o,t,n,r),G(n)),c=n=>(_n(e,o,t,n),n),l=(n,r=Sn)=>(_n(e,o,t,n,r),n);return{...ln(`Type`),name:e,parent:null,fromUnknown:t,formatError:n,is:o,from:s,to:c,orThrow:l,orNull:c,"~standard":Nn(t,a,hn),[un]:t,[Tn]:G,[wn]:I,[dn]:a}},xn=(e,t,n,r,i)=>{let a=t,o=r,s=i??(r?(t,n)=>t.type===e?fn(e,t,o):a[dn](t,n):a[dn]),c=n,l=(e,t)=>e.ok?c(e.value,t):e,u=On(a[Tn],e=>Dn(e,l)),d=kn(u);return Mn(e,a,(e,t=Sn)=>l(a.fromUnknown(e,t),t),e=>a.is(e)&&c(e,Sn).ok,(e,t=Sn)=>l(a[un](e,t),t),d,I,s)},Sn={errors:`first`},Cn={errors:`all`},wn=globalThis.Symbol(),Tn=globalThis.Symbol(),En=globalThis.Symbol(),Dn=(e,t)=>(n,r=Sn)=>t(e(n,r),r),On=(e,t)=>{let n=t(e);return e.parent&&(n.parent=On(e.parent,t)),n},kn=e=>{if(!e)return G;let t=e=>G(e);return t.parent=e,t},An=(e,t)=>{let n=e=>n=>e(t(n)),r=n(e),i=Dn(t,I);return e.parent&&(i.parent=On(e.parent,n)),r.parent=i,r};function jn(e){for(;e.parent!=null;)e=e.parent;return e}const Mn=(e,t,n,r,i,a,o,s,c,l=hn)=>{let u=t,d=u?An(u[wn],o):o,f=u?.[dn]===s?u.formatError:e=>l(s(e,`first`)[0]),p=Pn(e,r,i,t,a),m=jn(p),h=On(d,t=>n=>(_n(e,r,i,n),t(n)));return{...ln(`Type`),name:e,parent:t,fromUnknown:n,formatError:f,is:r,from:p,to:h,orThrow:Dn(m,nn),orNull:Dn(m,rn),"~standard":Nn(n,s,l),...c,[un]:i,[Tn]:a,[wn]:d,[dn]:s}},Nn=(e,t,n)=>({version:1,vendor:`evolu`,validate:r=>{let i=e(r,Cn);return i.ok?{value:i.value}:{issues:t(i.error,`all`).map(e=>({message:n(e),path:e.path}))}}}),Pn=(e,t,n,r,i)=>{let a=(r,a=Sn)=>(_n(e,t,n,r,a),i(r,a));if(i.parent){let e=r;a.parent=Pn(e.name,e.is,e[un],e.parent,i.parent)}return a},Fn=bn(`Unknown`,G,I),In=e=>{let t=e.toLowerCase();return bn(e,n=>typeof n===t?G(n):K({type:`TypeOf`,expected:e,value:n}),e=>`A value ${cn(e.value)} is not a ${t}.`)},Ln=In(`String`),Rn=In(`Number`),zn=In(`BigInt`),Bn=In(`Boolean`);function Vn(e,t){let n=e=>`A value ${cn(e.value)} does not have the expected object tag ${cn(e.expected)}.`;return t===void 0?bn(e,t=>Hn(t,e)?G(t):K({type:`ObjectTag`,expected:e,value:t}),n):globalThis.Object.assign(xn(`ObjectTag`,t,t=>Hn(t,e)?G(t):K({type:`ObjectTag`,expected:e,value:t}),n),{expected:e})}const Hn=(e,t)=>e!==null&&(typeof e==`object`||typeof e==`function`)&&globalThis.Object.prototype.toString.call(e)===`[object ${t}]`,Un=Vn(`Uint8Array`),Wn=e=>{let t=e,n=e=>e===t?G(e):K({type:`Literal`,expected:t,value:e}),r=typeof t==`string`?Ln:typeof t==`number`?Rn:typeof t==`bigint`?zn:typeof t==`boolean`?Bn:null,i=e=>`The value ${cn(e.value)} is not strictly equal to the expected literal: ${globalThis.String(e.expected)}.`;return globalThis.Object.assign(r?xn(`Literal`,r,n,i):bn(`Literal`,n,i),{expected:t,[En]:!0})},Gn=Wn(null);function Kn(...e){let t=e.map(e=>typeof e==`object`&&e?e:Wn(e)),n=t.map(jn),r=qn(n,(e,t,n)=>e.fromUnknown(t,n)),i=qn(n,(e,t,n)=>e[un](t,n)),a=(()=>`A value does not match any allowed variant.`),o=e=>fn(`Union`,e,a),s=Mn(`Union`,null,r,e=>n.some(t=>t.is(e)),i,G,I,o),c=qn(t,(e,t,n)=>e.fromUnknown(t,n)),l=qn(t,(e,t,n)=>e[un](t,n)),u=t.map(e=>jn(e[Tn])),d=qn(t,(e,t,r,i)=>n[i].is(t)?u[i](t,r):void 0),f=e=>t.find(t=>t.is(e)),p=kn(d);return Mn(`Union`,s,c,e=>t.some(t=>t.is(e)),l,p,e=>{let t=f(e);return j(t),t[wn](e)},o,{members:t,[En]:!0})}const qn=(e,t)=>(n,r=Sn)=>{let i;for(let a=0;a<e.length;a++){let o=t(e[a],n,r,a);if(o!==void 0){if(o.ok)return o;(i===void 0||r.errors===`all`)&&(i??=[]).push({index:a,error:o.error})}}return j(i),K({type:`Union`,errors:i})},Jn=e=>Kn(e,Gn);function Yn(e,t,n,r){return xn(e,t,n?e=>sn(n(e),()=>G(e)):G,r)}const Xn=Yn(`DateIso`,Ln,e=>e.length===24&&new globalThis.Date(e).toJSON()===e?G():K({type:`DateIso`,value:e}),e=>`The value ${cn(e.value)} is not a canonical ISO date-time string.`),Zn=e=>t=>{let n=`Length${e}`;return Yn(n,t,t=>t.length===e?G():K({type:n,value:t,exact:e}),e=>`The value ${cn(e.value)} does not have the required length of ${e.exact}.`)},Qn={alphabet:`base64url`,omitPadding:!0},$n=e=>{if(en)return globalThis.Buffer.from(e).toString(`base64url`);if(`toBase64`in globalThis.Uint8Array.prototype)return e.toBase64(Qn);let t=Array.from(e,e=>globalThis.String.fromCodePoint(e)).join(``);return btoa(t).replaceAll(`+`,`-`).replaceAll(`/`,`_`).replaceAll(`=`,``)},er=e=>{if(en){let t=globalThis.Buffer.from(e,`base64url`);return new globalThis.Uint8Array(t)}if(`fromBase64`in globalThis.Uint8Array)return globalThis.Uint8Array.fromBase64(e,Qn);let t=e.replaceAll(`-`,`+`).replaceAll(`_`,`/`);for(;t.length%4!=0;)t+=`=`;let n=atob(t);return globalThis.Uint8Array.from(n,e=>e.charCodeAt(0))},tr=Yn(`Base64Url`,Ln,e=>{let t=on(()=>er(e));return t.ok&&$n(t.value)===e?G():K({type:`Base64Url`,value:e})},e=>`The value ${cn(e.value)} is not a valid Base64Url string.`),nr=e=>$n(e),rr=e=>er(e),ir=Yn(`Id`,Ln,e=>e.length===22&&tr.from.parent(e).ok?G():K({type:`Id`,value:e}),e=>`The value ${cn(e.value)} is not a valid Id.`),ar=(e,...t)=>nr(e.randomBytes.create(16)),or=e=>rr(e),sr=e=>nr(e),cr=e=>Yn(`NonNegative`,e,e=>e>=0?G():K({type:`NonNegative`,value:e}),e=>`The value ${cn(e.value)} must be non-negative (>= 0).`),lr=e=>Yn(`Positive`,e,e=>e>0?G():K({type:`Positive`,value:e}),e=>`The value ${cn(e.value)} must be positive (> 0).`),ur=(e=>Yn(`Finite`,e,e=>globalThis.Number.isFinite(e)?G():K({type:`Finite`,value:e}),e=>`The value ${cn(e.value)} must be finite.`))((e=>Yn(`NonNaN`,e,e=>globalThis.Number.isNaN(e)?K({type:`NonNaN`,value:e}):G(),()=>`The value must not be NaN.`))(Rn)),q=cr((e=>Yn(`Int`,e,e=>globalThis.Number.isSafeInteger(e)?G():K({type:`Int`,value:e}),e=>`The value ${cn(e.value)} must be a safe integer.`))(ur)),dr=q.orThrow(0),fr=lr(q),pr=fr.orThrow(1),mr=e=>t=>{let n=`LessThan${e}`;return Yn(n,t,t=>t<e?G():K({type:n,value:t,max:e}),e=>`The value ${cn(e.value)} must be less than ${e.max}.`)},hr=e=>t=>{let n=`LessThanOrEqualTo${e}`;return Yn(n,t,t=>t<=e?G():K({type:n,value:t,max:e}),e=>`The value ${cn(e.value)} must be less than or equal to ${e.max}.`)},gr=(e,t,n)=>(r,i)=>{let a=r;if(a.reason.kind!==`Properties`)return fn(`Object`,r,e);let o=a.reason.errors,s=Reflect.ownKeys(o),c=s[0];return j(c),(i===`first`?[c]:s).flatMap(a=>{let s=o[a],c=typeof a==`string`&&t!==void 0&&globalThis.Object.hasOwn(t,a)?t[a]:void 0;if(s.type===`ObjectPropertyAccess`||s.type===`ObjectMissingProperty`||s.type===`ObjectExcessProperty`||c===void 0&&n===void 0){let t=r;if(i===`all`){let e=b();e[a]=s,t={type:`Object`,reason:{kind:`Properties`,errors:e}}}return fn(`Object`,t,e,[a])}return c===void 0?n[dn](s,i):pn(a,Dr(c)[dn](s,i))})},_r=e=>e.kind===`NotObject`?`A value ${cn(e.value)} is not an object.`:`The value is an object, but an Object Output must be a plain object or have a null prototype.`,vr=(e,t)=>{let n=e,r=t,i=(e,t,n,r)=>typeof e!=`object`||!e?K({type:`Record`,reason:{kind:`NotRecord`,value:e}}):h(e)?yr(e,t,n,r):K({type:`Record`,reason:{kind:`NotPlainRecord`,value:e}}),a=(e,t=Sn)=>i(e,n.fromUnknown,r.fromUnknown,t),o=(e,t=Sn)=>i(e,n[un],r[un],t),s=e=>{if(e.reason.kind===`NotRecord`)return`A value ${cn(e.reason.value)} is not a Record.`;if(e.reason.kind===`NotPlainRecord`)return`The value is an object, but a Record Output must be a plain object or have a null prototype.`;let t=e.reason.issues[0];switch(t.kind){case`Key`:return`Property key ${cn(t.key)} is invalid.`;case`Value`:return`The value of property ${cn(t.key)} is invalid.`;case`Accessor`:return`A Record property ${cn(t.key)} must be a data property.`;case`NonEnumerable`:return`A Record property ${cn(t.key)} must be enumerable.`;case`Collision`:return`Record keys ${cn(t.previousKey)} and ${cn(t.key)} decode to the same key ${cn(t.outputKey)}.`}},c=jn(n),l=jn(r),u=c!==n||l!==r?vr(c,l):null,d=kn(u?(e,t=Sn)=>yr(e,jn(n[Tn]),jn(r[Tn]),t):void 0),f=n[wn],p=r[wn],m=f===I&&p===I?I:e=>{let t=b(),n=!1;for(let r of globalThis.Object.keys(e)){let i=e[r],a=f(r),o=p(i);A(!globalThis.Object.hasOwn(t,a),`Record key Type encoding must not produce duplicate keys.`),t[a]=o,(r!==a||!globalThis.Object.is(i,o))&&(n=!0)}return n?t:e},g=e=>{if(typeof e!=`object`||!e||!h(e))return!1;for(let t of Reflect.ownKeys(e)){if(typeof t!=`string`||!n.is(t))return!1;let i=globalThis.Object.getOwnPropertyDescriptor(e,t);if(i===void 0||!(`value`in i)||!i.enumerable||!r.is(i.value))return!1}return!0},_=mn(`Record`,`Entries`,s,e=>e.kind===`Key`?n:r);return Mn(`Record`,u,a,g,o,d,m,_,{key:n,value:r})},yr=(e,t,n,r)=>{let i,a=b(),o=b(),s=!1;for(let c of Reflect.ownKeys(e)){let l=t(c,r);if(!l.ok&&((i??=[]).push({kind:`Key`,key:c,error:l.error}),r.errors===`first`))break;let u=globalThis.Object.getOwnPropertyDescriptor(e,c);A(u!==void 0,`Record property descriptor is missing.`);let d,f=!1;if(!(`value`in u)){if((i??=[]).push({kind:`Accessor`,key:c}),r.errors===`first`)break}else if(u.enumerable)d=u.value,f=!0;else if((i??=[]).push({kind:`NonEnumerable`,key:c}),r.errors===`first`)break;let p=f?n(d,r):void 0;if(p!==void 0&&!p.ok&&((i??=[]).push({kind:`Value`,key:c,error:p.error}),r.errors===`first`))break;if(!l.ok)continue;let m=l.value;if(globalThis.Object.hasOwn(o,m)){if((i??=[]).push({kind:`Collision`,key:c,previousKey:o[m],outputKey:m}),r.errors===`first`)break;continue}o[m]=c,!(!f||!p?.ok)&&(a[m]=p.value,(c!==m||!globalThis.Object.is(d,p.value))&&(s=!0))}return i==null?G(s?a:e):K({type:`Record`,reason:{kind:`Entries`,issues:i}})},br=e=>Sr(e),xr=globalThis.Symbol(),Sr=e=>({type:e,[xr]:!0});function Cr(e,t){return wr(Tr(e),t)}const wr=(e,t)=>{let n=e,r=globalThis.Object.keys(n),i=(e,i,a)=>{if(typeof e!=`object`||!e)return K({type:`Object`,reason:{kind:`NotObject`,value:e}});let o=e;if(!h(o))return K({type:`Object`,reason:{kind:`UnexpectedPrototype`,value:o}});let s,c,l=new Map;for(let e of r)l.set(e,void 0);for(let e of Reflect.ownKeys(o))l.set(e,void 0);let u=(e,t)=>{s??=b(),s[e]=t};for(let[e]of l){let r=typeof e==`string`&&globalThis.Object.hasOwn(n,e)?n[e]:void 0,d=globalThis.Object.getOwnPropertyDescriptor(o,e);if(l.set(e,d),d===void 0){if(A(r!==void 0,`Object property is missing.`),Er(r))continue;if(u(e,{type:`ObjectMissingProperty`}),i.errors===`first`)break;continue}if(r===void 0&&t===void 0){if(u(e,{type:`ObjectExcessProperty`}),i.errors===`first`)break;continue}if(r===void 0&&typeof e!=`string`){if(u(e,Or({kind:`Key`,key:e,error:{type:`TypeOf`,expected:`String`,value:e}})),i.errors===`first`)break;continue}if(!(`value`in d)){if(u(e,{type:`ObjectPropertyAccess`,reason:`Accessor`}),i.errors===`first`)break;continue}if(!d.enumerable){if(u(e,{type:`ObjectPropertyAccess`,reason:`NonEnumerable`}),i.errors===`first`)break;continue}let f=d.value,p=r===void 0?t.value:Dr(r),m=a?p[un](f,i):p.fromUnknown(f,i);if(!m.ok){if(u(e,r===void 0?Or({kind:`Value`,key:e,error:m.error}):m.error),i.errors===`first`)break;continue}if(s===void 0&&!a&&!(c===void 0&&globalThis.Object.is(m.value,f))){if(c===void 0){c=globalThis.Object.create(null);for(let[t,n]of l){if(t===e)break;n!==void 0&&`value`in n&&n.enumerable&&(c[t]=n.value)}}c[e]=m.value}}return s===void 0?G(c===void 0?o:c):K({type:`Object`,reason:{kind:`Properties`,errors:s}})},a=(e,t=Sn)=>i(e,t,!1),o=(e,t=Sn)=>i(e,t,!0),s=e=>{if(e.reason.kind!==`Properties`)return _r(e.reason);let t=Reflect.ownKeys(e.reason.errors).at(0);j(t);let n=e.reason.errors[t];if(j(n),n.type===`ObjectPropertyAccess`)switch(n.reason){case`Accessor`:return`An Object property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.`;case`NonEnumerable`:return`An Object property must be enumerable. Make it enumerable or use a different Type.`}return n.type===`ObjectMissingProperty`?`The required property ${cn(t)} is missing.`:typeof t==`symbol`?`An Object property key must be a string. Remove the symbol property or use a different Type.`:n.type===`ObjectExcessProperty`?`The property ${cn(t)} is not allowed. Remove it or use a different Type.`:`The property ${cn(t)} is invalid.`},c=b(),l=!1,u=t===void 0||t.value[wn]===I;for(let e of r){let t=n[e],r=Dr(t);r[wn]!==I&&(u=!1);let i=jn(r);i!==r&&(l=!0),c[e]=Er(t)?br(i):i}let d=l||t?.parent?wr(c,t?.parent??t):null,f=b();for(let e of r)f[e]=jn(Dr(n[e])[Tn]);let p=t?jn(t.value[Tn]):void 0,m=kn(d?(e,t=Sn)=>{let i,a;for(let n of r){if(!globalThis.Object.hasOwn(e,n))continue;let r=e[n],o=f[n](r,t);if(o.ok){globalThis.Object.is(o.value,r)||((a??=b(e))[n]=o.value);continue}if((i??=b())[n]=o.error,t.errors===`first`)break}if(p!==void 0&&(i===void 0||t.errors===`all`))for(let r of globalThis.Object.keys(e)){if(globalThis.Object.hasOwn(n,r))continue;let o=e[r],s=p(o,t);if(s.ok){globalThis.Object.is(s.value,o)||((a??=b(e))[r]=s.value);continue}if((i??=b())[r]=Or({kind:`Value`,key:r,error:s.error}),t.errors===`first`)break}return i===void 0?G(a??e):K({type:`Object`,reason:{kind:`Properties`,errors:i}})}:void 0),g=u?I:e=>{let i;for(let t of r){if(!globalThis.Object.hasOwn(e,t))continue;let r=e[t],a=Dr(n[t])[wn](r);globalThis.Object.is(a,r)||((i??=b(e))[t]=a)}if(t)for(let r of globalThis.Object.keys(e)){if(globalThis.Object.hasOwn(n,r))continue;let a=e[r],o=t.value[wn](a);globalThis.Object.is(a,o)||((i??=b(e))[r]=o)}return i??e},_=e=>{if(typeof e!=`object`||!e||!h(e))return!1;for(let t of r){let r=n[t],i=globalThis.Object.getOwnPropertyDescriptor(e,t);if(i===void 0){if(!Er(r))return!1;continue}if(!(`value`in i)||!i.enumerable||!Dr(r).is(i.value))return!1}for(let r of Reflect.ownKeys(e)){if(typeof r==`string`&&globalThis.Object.hasOwn(n,r))continue;if(t===void 0||typeof r!=`string`)return!1;let i=globalThis.Object.getOwnPropertyDescriptor(e,r);if(i===void 0||!(`value`in i)||!i.enumerable||!t.value.is(i.value))return!1}return!0},y=gr(s,n,t);return Mn(`Object`,d,a,_,o,m,g,y,t?{props:n,record:t}:{props:n})},Tr=(e,t=b())=>{let n=`Object schema properties must be own string-keyed data properties.`;A(h(e),n);for(let r of Reflect.ownKeys(e)){let i=globalThis.Object.getOwnPropertyDescriptor(e,r);A(typeof r==`string`&&i!==void 0&&`value`in i,n),t[r]=i.value}return t},Er=e=>xr in e,Dr=e=>Er(e)?e.type:e,Or=e=>({type:`Record`,reason:{kind:`Entries`,issues:[e]}});function kr(e,t={},n){A(!globalThis.Object.hasOwn(t,`type`),`The "type" schema property is reserved by typed.`);let r=b();return r.type=Wn(e),wr(Tr(t,r),n)}const Ar=new WeakSet,jr=globalThis.Object.freeze([]),Mr=e=>{if(e===null)return jr;let t=[],n=e;for(;n!==null;)t.push(n.key),n=n.parent;return t.reverse(),globalThis.Object.freeze(t)},Nr=(e,t)=>({parent:e,key:t}),Pr=(e,t=Sn)=>{let n=[{kind:`Value`,value:e,path:null}],r=new WeakMap,i,a=e=>((i??=[]).push(e),t.errors===`first`);for(;n.length>0;){let e=n.pop();if(e.kind===`Leave`){r.delete(e.value);continue}let{path:o,value:s}=e;if(s===null||typeof s==`string`||typeof s==`boolean`)continue;if(typeof s==`number`){if(!globalThis.Number.isFinite(s)&&a({kind:`NonFiniteNumber`,path:Mr(o),value:s}))break;continue}if(typeof s!=`object`){if(a({kind:`InvalidType`,path:Mr(o),value:s}))break;continue}let c=Array.isArray(s);if(!c&&!h(s)){if(a({kind:`UnexpectedPrototype`,path:Mr(o),container:`Object`,value:s}))break;continue}if(r.has(s)){if(a({kind:`CircularReference`,path:Mr(o),ancestorPath:Mr(r.get(s))}))break;continue}let l=[];if(c){for(let e of Reflect.ownKeys(s))if(e!==`length`){if(typeof e==`string`){let t=globalThis.Number(e)>>>0;if(t<s.length&&globalThis.String(t)===e)continue}if(a({kind:`ExcessProperty`,path:Mr(Nr(o,e))}))break}if(i!==void 0&&t.errors===`first`)break;for(let e=0;e<s.length;e++){let t=Nr(o,e),n=globalThis.Object.getOwnPropertyDescriptor(s,e);if(n===void 0){if(a({kind:`Hole`,path:Mr(t)}))break;continue}if(!(`value`in n)){if(a({kind:`Accessor`,path:Mr(t)}))break;continue}l.push({kind:`Value`,value:n.value,path:t})}}else for(let e of Reflect.ownKeys(s)){let t=Nr(o,e);if(typeof e==`symbol`){if(a({kind:`SymbolProperty`,path:Mr(t)}))break;continue}let n=globalThis.Object.getOwnPropertyDescriptor(s,e);if(!(`value`in n)){if(a({kind:`Accessor`,path:Mr(t)}))break;continue}if(!n.enumerable){if(a({kind:`NonEnumerable`,path:Mr(t)}))break;continue}l.push({kind:`Value`,value:n.value,path:t})}if(i!==void 0&&t.errors===`first`)break;r.set(s,o),n.push({kind:`Leave`,value:s});for(let e=l.length-1;e>=0;e--)n.push(l[e])}return i===void 0?G(e):K({type:`JsonValue`,reason:{kind:`Issues`,issues:globalThis.Object.freeze(i)}})},Fr=e=>JSON.parse(e),Ir=e=>{let t=on(()=>Fr(e));return t.ok&&Pr(t.value).ok?G(t.value):K({type:`Json`,value:e})},Lr=Yn(`Json`,Ln,e=>{let t=Ir(e);return t.ok?G():t},e=>`The value ${cn(e.value)} cannot be parsed into a JsonValue.`),Rr=e=>Fr(e),zr=e=>{let t=e;return{get:()=>t,set:e=>{t=e},getAndSet:e=>{let n=t;return t=e,n},setAndGet:e=>(t=e,t),update:e=>{t=e(t)},getAndUpdate:e=>{let n=t;return t=e(t),n},updateAndGet:e=>(t=e(t),t),modify:e=>{let[n,r]=e(t);return t=r,n}}},Br=(e,t)=>{let n=t??C,r=zr(e),i=new Set,a=e=>{if(!n(e,r.get()))for(let e of i)e()};return{get:r.get,subscribe:e=>(i.add(e),()=>{i.delete(e)}),set:e=>{let t=r.get();r.set(e),a(t)},getAndSet:e=>{let t=r.getAndSet(e);return a(t),t},setAndGet:e=>{let t=r.get();return r.set(e),a(t),r.get()},update:e=>{let t=r.get();r.update(e),a(t)},getAndUpdate:e=>{let t=r.getAndUpdate(e);return a(t),t},updateAndGet:e=>{let t=r.get();return r.updateAndGet(e),a(t),r.get()},modify:e=>{let t=r.get(),n=r.modify(e);return a(t),n},[Symbol.dispose]:()=>{i.clear()}}},Vr=()=>{let e=Symbol(`Time`);function t(e){let t=Wr();return e===`DateIso`?qr(t):t}return{now:t,performance:{timeOrigin:globalThis.performance.timeOrigin,now:()=>globalThis.performance.now()},setTimeout:(t,n)=>Hr(e,t,n),clearTimeout:t=>{Gr(e,t)}}},Hr=(e,t,n)=>{let r=Jr(n),i=!1,a;if(r<=Ur)a=globalThis.setTimeout(()=>{i||(i=!0,t())},r);else{let e=Wr()+r,n=()=>{if(i)return;let r=e-Wr();if(r>0){a=globalThis.setTimeout(n,Math.min(r,Ur));return}i=!0,t()};a=globalThis.setTimeout(n,Ur)}return{owner:e,clear:()=>{i=!0,globalThis.clearTimeout(a)}}},Ur=2**31-1,Wr=()=>Kr.orThrow(globalThis.Date.now()),Gr=(e,t)=>{let n=t;A(n.owner===e,`TimeoutId was created by another Time instance`),n.clear()},Kr=Yn(`Millis`,mr(0xffffffffffff)(q)),qr=e=>new globalThis.Date(e).toISOString();function Jr(e){if(typeof e==`number`)return e;let t=parseFloat(e),n=e.endsWith(`ms`)?`ms`:e.at(-1);return A(n in Yr,`Unknown duration unit: ${n}`),Kr.orThrow(Math.round(t*Yr[n]))}const Yr={ms:1,s:1e3,m:6e4,h:36e5,d:864e5,w:6048e5,y:31536e6},Xr={trace:0,debug:1,log:2,info:3,warn:4,error:5,silent:6},Zr=({name:e=``,level:t=`log`,output:n=Qr(),path:r=[],formatter:i}={})=>{let a=new Set,o=null,s=()=>o??t,c=(e,t,i)=>(...a)=>{Xr[t]>=Xr[s()]&&n.write({method:e,path:r,args:a},i)},l=e=>c(e,e,i),u=e=>c(e,`debug`);return{name:e,children:a,getLevel:s,setLevel:e=>{o=e},hasOwnLevel:()=>o!==null,child:e=>{let o=Zr({name:e,level:t,output:n,path:[...r,e],...i&&{formatter:i}});return a.add(o),o},...y([`trace`,`debug`,`log`,`info`,`warn`,`error`],l),...y([`dir`,`table`,`time`,`timeLog`,`timeEnd`,`count`,`countReset`],u),write:e=>{n.write(e,i)}}},Qr=()=>({write:(e,t)=>{let n=t?t(e):e.args;globalThis.console[e.method](...n)}}),$r=()=>{let e=Br(null);return{write:e.set,entry:e}},ei=e=>Uint8Array.from(e.split(``),e=>e.charCodeAt(0)),ti=be(R(ei(`expand 16-byte k`))),ni=be(R(ei(`expand 32-byte k`)));function J(e,t){return e<<t|e>>>32-t}const ri=2**32-1,ii=Uint32Array.of();function ai(e,t,n,r,i,a,o,s){let c=i.length,l=new Uint8Array(64),u=R(l),d=_e&&Ie(i)&&Ie(a),f=d?R(i):ii,p=d?R(a):ii;if(!_e){for(let d=0;d<c;o++){if(e(t,n,r,u,o,s),be(u),o>=ri)throw Error(`arx: counter overflow`);let f=Math.min(64,c-d);for(let e=0,t;e<f;e++)t=d+e,a[t]=i[t]^l[e];d+=f}return}for(let m=0;m<c;o++){if(e(t,n,r,u,o,s),o>=ri)throw Error(`arx: counter overflow`);let h=Math.min(64,c-m);if(d&&h===64){let e=m/4;if(m%4!=0)throw Error(`arx: invalid block position`);for(let t=0,n;t<16;t++)n=e+t,p[n]=f[n]^u[t];m+=64;continue}for(let e=0,t;e<h;e++)t=m+e,a[t]=i[t]^l[e];m+=h}}function oi(e,t){let{allowShortKeys:n,extendNonceFn:r,counterLength:i,counterRight:a,rounds:o}=Ae({allowShortKeys:!1,counterLength:8,counterRight:!1,rounds:20},t);if(typeof e!=`function`)throw Error(`core must be a function`);return ue(i),ue(o),le(a),le(n),(t,s,c,l,u=0)=>{de(t,void 0,`key`),de(s,void 0,`nonce`),de(c,void 0,`data`);let d=c.length,f=l!==void 0;if(l=Pe(d,l,!1),f&&z(c,l),ue(u),u<0||u>=ri)throw Error(`arx: counter overflow`);let p=[],m=t.length,h,g;if(m===32)p.push(h=B(t)),g=ni;else if(m===16&&n)h=new Uint8Array(32),h.set(t),h.set(t,16),g=ti,p.push(h);else throw de(t,32,`arx key`),Error(`invalid key size`);(!_e||!Ie(s))&&p.push(s=B(s));let _=R(h);if(r){if(s.length!==24)throw Error(`arx: extended nonce must be 24 bytes`);let e=s.subarray(0,16);if(_e)r(g,_,R(e),_);else{let t=be(Uint32Array.from(g));r(t,_,R(e),_),he(t),be(_)}s=s.subarray(16)}else _e||be(_);let y=16-i;if(y!==s.length)throw Error(`arx: nonce must be ${y} or 16 bytes`);if(y!==12){let e=new Uint8Array(12);e.set(s,a?0:12-s.length),s=e,p.push(s)}let b=be(R(s));try{return ai(e,g,_,b,c,l,u,o),l}finally{he(...p)}}}function si(e,t){return e[t++]&255|(e[t++]&255)<<8}var ci=class{blockLen=16;outputLen=16;buffer=new Uint8Array(16);r=new Uint16Array(10);h=new Uint16Array(10);pad=new Uint16Array(8);pos=0;finished=!1;destroyed=!1;constructor(e){e=B(de(e,32,`key`));let t=si(e,0),n=si(e,2),r=si(e,4),i=si(e,6),a=si(e,8),o=si(e,10),s=si(e,12),c=si(e,14);this.r[0]=t&8191,this.r[1]=(t>>>13|n<<3)&8191,this.r[2]=(n>>>10|r<<6)&7939,this.r[3]=(r>>>7|i<<9)&8191,this.r[4]=(i>>>4|a<<12)&255,this.r[5]=a>>>1&8190,this.r[6]=(a>>>14|o<<2)&8191,this.r[7]=(o>>>11|s<<5)&8065,this.r[8]=(s>>>8|c<<8)&8191,this.r[9]=c>>>5&127;for(let t=0;t<8;t++)this.pad[t]=si(e,16+2*t)}process(e,t,n=!1){let r=n?0:2048,{h:i,r:a}=this,o=a[0],s=a[1],c=a[2],l=a[3],u=a[4],d=a[5],f=a[6],p=a[7],m=a[8],h=a[9],g=si(e,t+0),_=si(e,t+2),y=si(e,t+4),b=si(e,t+6),x=si(e,t+8),S=si(e,t+10),C=si(e,t+12),w=si(e,t+14),T=i[0]+(g&8191),E=i[1]+((g>>>13|_<<3)&8191),D=i[2]+((_>>>10|y<<6)&8191),O=i[3]+((y>>>7|b<<9)&8191),k=i[4]+((b>>>4|x<<12)&8191),A=i[5]+(x>>>1&8191),j=i[6]+((x>>>14|S<<2)&8191),M=i[7]+((S>>>11|C<<5)&8191),N=i[8]+((C>>>8|w<<8)&8191),P=i[9]+(w>>>5|r),F=0,I=F+T*o+5*h*E+5*m*D+5*p*O+5*f*k;F=I>>>13,I&=8191,I+=5*d*A+5*u*j+5*l*M+5*c*N+5*s*P,F+=I>>>13,I&=8191;let L=F+T*s+E*o+5*h*D+5*m*O+5*p*k;F=L>>>13,L&=8191,L+=5*f*A+5*d*j+5*u*M+5*l*N+5*c*P,F+=L>>>13,L&=8191;let ee=F+T*c+E*s+D*o+5*h*O+5*m*k;F=ee>>>13,ee&=8191,ee+=5*p*A+5*f*j+5*d*M+5*u*N+5*l*P,F+=ee>>>13,ee&=8191;let te=F+T*l+E*c+D*s+O*o+5*h*k;F=te>>>13,te&=8191,te+=5*m*A+5*p*j+5*f*M+5*d*N+5*u*P,F+=te>>>13,te&=8191;let ne=F+T*u+E*l+D*c+O*s+k*o;F=ne>>>13,ne&=8191,ne+=5*h*A+5*m*j+5*p*M+5*f*N+5*d*P,F+=ne>>>13,ne&=8191;let re=F+T*d+E*u+D*l+O*c+k*s;F=re>>>13,re&=8191,re+=A*o+5*h*j+5*m*M+5*p*N+5*f*P,F+=re>>>13,re&=8191;let ie=F+T*f+E*d+D*u+O*l+k*c;F=ie>>>13,ie&=8191,ie+=A*s+j*o+5*h*M+5*m*N+5*p*P,F+=ie>>>13,ie&=8191;let ae=F+T*p+E*f+D*d+O*u+k*l;F=ae>>>13,ae&=8191,ae+=A*c+j*s+M*o+5*h*N+5*m*P,F+=ae>>>13,ae&=8191;let oe=F+T*m+E*p+D*f+O*d+k*u;F=oe>>>13,oe&=8191,oe+=A*l+j*c+M*s+N*o+5*h*P,F+=oe>>>13,oe&=8191;let se=F+T*h+E*m+D*p+O*f+k*d;F=se>>>13,se&=8191,se+=A*u+j*l+M*c+N*s+P*o,F+=se>>>13,se&=8191,F=(F<<2)+F|0,F=F+I|0,I=F&8191,F>>>=13,L+=F,i[0]=I,i[1]=L,i[2]=ee,i[3]=te,i[4]=ne,i[5]=re,i[6]=ie,i[7]=ae,i[8]=oe,i[9]=se}finalize(){let{h:e,pad:t}=this,n=new Uint16Array(10),r=e[1]>>>13;e[1]&=8191;for(let t=2;t<10;t++)e[t]+=r,r=e[t]>>>13,e[t]&=8191;e[0]+=r*5,r=e[0]>>>13,e[0]&=8191,e[1]+=r,r=e[1]>>>13,e[1]&=8191,e[2]+=r,n[0]=e[0]+5,r=n[0]>>>13,n[0]&=8191;for(let t=1;t<10;t++)n[t]=e[t]+r,r=n[t]>>>13,n[t]&=8191;n[9]-=8192;let i=(r^1)-1;for(let e=0;e<10;e++)n[e]&=i;i=~i;for(let t=0;t<10;t++)e[t]=e[t]&i|n[t];e[0]=(e[0]|e[1]<<13)&65535,e[1]=(e[1]>>>3|e[2]<<10)&65535,e[2]=(e[2]>>>6|e[3]<<7)&65535,e[3]=(e[3]>>>9|e[4]<<4)&65535,e[4]=(e[4]>>>12|e[5]<<1|e[6]<<14)&65535,e[5]=(e[6]>>>2|e[7]<<11)&65535,e[6]=(e[7]>>>5|e[8]<<8)&65535,e[7]=(e[8]>>>8|e[9]<<5)&65535;let a=e[0]+t[0];e[0]=a&65535;for(let n=1;n<8;n++)a=(e[n]+t[n]|0)+(a>>>16)|0,e[n]=a&65535;he(n)}update(e){pe(this),de(e),e=B(e);let{buffer:t,blockLen:n}=this,r=e.length;for(let i=0;i<r;){let a=Math.min(n-this.pos,r-i);if(a===n){for(;n<=r-i;i+=n)this.process(e,i);continue}t.set(e.subarray(i,i+a),this.pos),this.pos+=a,i+=a,this.pos===n&&(this.process(t,0,!1),this.pos=0)}return this}destroy(){this.destroyed=!0,he(this.h,this.r,this.buffer,this.pad)}digestInto(e){pe(this),me(e,this),this.finished=!0;let{buffer:t,h:n}=this,{pos:r}=this;if(r){for(t[r++]=1;r<16;r++)t[r]=0;this.process(t,0,!0)}this.finalize();let i=0;for(let t=0;t<8;t++)e[i++]=n[t]>>>0,e[i++]=n[t]>>>8}digest(){let{buffer:e,outputLen:t}=this;this.digestInto(e);let n=e.slice(0,t);return this.destroy(),n}};const li=Me(32,e=>new ci(e));function ui(e,t,n,r,i,a=20){let o=e[0],s=e[1],c=e[2],l=e[3],u=t[0],d=t[1],f=t[2],p=t[3],m=t[4],h=t[5],g=t[6],_=t[7],y=i,b=n[0],x=n[1],S=n[2],C=o,w=s,T=c,E=l,D=u,O=d,k=f,A=p,j=m,M=h,N=g,P=_,F=y,I=b,L=x,ee=S;for(let e=0;e<a;e+=2)C=C+D|0,F=J(F^C,16),j=j+F|0,D=J(D^j,12),C=C+D|0,F=J(F^C,8),j=j+F|0,D=J(D^j,7),w=w+O|0,I=J(I^w,16),M=M+I|0,O=J(O^M,12),w=w+O|0,I=J(I^w,8),M=M+I|0,O=J(O^M,7),T=T+k|0,L=J(L^T,16),N=N+L|0,k=J(k^N,12),T=T+k|0,L=J(L^T,8),N=N+L|0,k=J(k^N,7),E=E+A|0,ee=J(ee^E,16),P=P+ee|0,A=J(A^P,12),E=E+A|0,ee=J(ee^E,8),P=P+ee|0,A=J(A^P,7),C=C+O|0,ee=J(ee^C,16),N=N+ee|0,O=J(O^N,12),C=C+O|0,ee=J(ee^C,8),N=N+ee|0,O=J(O^N,7),w=w+k|0,F=J(F^w,16),P=P+F|0,k=J(k^P,12),w=w+k|0,F=J(F^w,8),P=P+F|0,k=J(k^P,7),T=T+A|0,I=J(I^T,16),j=j+I|0,A=J(A^j,12),T=T+A|0,I=J(I^T,8),j=j+I|0,A=J(A^j,7),E=E+D|0,L=J(L^E,16),M=M+L|0,D=J(D^M,12),E=E+D|0,L=J(L^E,8),M=M+L|0,D=J(D^M,7);let te=0;r[te++]=o+C|0,r[te++]=s+w|0,r[te++]=c+T|0,r[te++]=l+E|0,r[te++]=u+D|0,r[te++]=d+O|0,r[te++]=f+k|0,r[te++]=p+A|0,r[te++]=m+j|0,r[te++]=h+M|0,r[te++]=g+N|0,r[te++]=_+P|0,r[te++]=y+F|0,r[te++]=b+I|0,r[te++]=x+L|0,r[te++]=S+ee|0}function di(e,t,n,r){let i=_e?e:be(e.slice(0,4)),a=_e?t:be(t.slice(0,8)),o=_e?n:be(n.slice(0,4)),s=new Uint32Array(16);ui(i,a,o.subarray(1),s,o[0]);let c=0;r[c++]=s[0]-i[0]|0,r[c++]=s[1]-i[1]|0,r[c++]=s[2]-i[2]|0,r[c++]=s[3]-i[3]|0,r[c++]=s[12]-o[0]|0,r[c++]=s[13]-o[1]|0,r[c++]=s[14]-o[2]|0,r[c++]=s[15]-o[3]|0,be(r),_e||he(i,a,o),he(s)}const fi=oi(ui,{counterRight:!1,counterLength:8,extendNonceFn:di,allowShortKeys:!1}),pi=new Uint8Array(16),mi=(e,t)=>{e.update(t);let n=t.length%16;n&&e.update(pi.subarray(n))},hi=new Uint8Array(32);function gi(e,t,n,r,i){i!==void 0&&de(i,void 0,`AAD`);let a=e(t,n,hi),o=Fe(r.length,i?i.length:0,!0),s=li.create(a);i&&mi(s,i),mi(s,r),s.update(o);let c=s.digest();return he(a,o),c}const _i=Ne({blockSize:64,nonceLength:24,tagLength:16,withAAD:!0},(e=>(t,n,r)=>({encrypt(i,a){let o=i.length;a=Pe(o+16,a,!1),a.set(i);let s=a.subarray(0,-16);e(t,n,s,s,1);let c=gi(e,t,n,s,r);return a.set(c,o),he(c),a},decrypt(i,a){a=Pe(i.length-16,a,!1);let o=i.subarray(0,-16),s=i.subarray(-16),c=gi(e,t,n,o,r);if(!je(s,c))throw he(c),Error(`invalid tag`);return a.set(i.subarray(0,-16)),e(t,n,a,a,1),he(c),a}}))(fi)),vi=Yn(`Entropy`,Un),yi=Zn(24)(vi),bi=()=>({create:Lt}),xi=Yn(`XChaCha20Poly1305Ciphertext`,Un),Si=e=>(t,n)=>{let r=e.randomBytes.create(24);return[xi.orThrow(_i(n,r).encrypt(t)),r]},Ci=(e,t,n)=>on(()=>_i(n,t).decrypt(e),e=>({type:`DecryptWithXChaCha20Poly1305Error`,error:e})),wi=e=>{if(e<=0)return dr;let t=31-Math.clz32(e>>>0),n=32-Math.clz32(t>>>0),r=(1<<Math.max(0,t-n))-1;return q.orThrow(e+r&~r)},Ti=e=>{let t=wi(e),n=q.orThrow(t-e);return new globalThis.Uint8Array(n)},Ei=Uint8Array.from([7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8]),Di=Uint8Array.from(Array(16).fill(0).map((e,t)=>t)),Oi=Di.map(e=>(9*e+5)%16),ki=(()=>{let e=[[Di],[Oi]];for(let t=0;t<4;t++)for(let n of e)n.push(n[t].map(e=>Ei[e]));return e})();ki[0],ki[1];const Ai={track:ne,untrack:ne},ji=e=>async t=>{let n=Promise.withResolvers(),r=Promise.withResolvers(),i=t.deps.lockManager.request(Mi(e),{mode:`exclusive`,signal:t.signal},async()=>{n.resolve(),await r.promise});return i.catch(n.reject),await n.promise,G({[Symbol.asyncDispose]:async()=>{r.resolve(),await i}})},Mi=e=>`evolu-leaderlock-${e}`,Ni=new WeakMap,Pi=(e,t=new Set)=>{switch(typeof e){case`string`:return`s:${JSON.stringify(e)}`;case`number`:return Number.isNaN(e)?`n:NaN`:e===1/0?`n:Infinity`:e===-1/0?`n:-Infinity`:Object.is(e,-0)?`n:0`:`n:${e}`;case`boolean`:return e?`b:true`:`b:false`;case`object`:{if(e===null)return`l:null`;let n=Ni.get(e);if(n)return n;let r;return Array.isArray(e)?(A(!t.has(e),`Structural lookup keys must not contain cycles.`),t.add(e),r=Fi(e,t),t.delete(e)):h(e)?(A(!t.has(e),`Structural lookup keys must not contain cycles.`),t.add(e),r=Ii(e,t),t.delete(e)):Un.is(e)?r=`u:${nr(e)}`:A(!1,`Structural lookup keys must be JSON-like values or Uint8Array.`),Ni.set(e,r),r}default:A(!1,`Structural lookup keys must be JSON-like values or Uint8Array.`)}},Fi=(e,t)=>`a:[${Array.from(e,e=>Pi(e,t)).join(`,`)}]`,Ii=(e,t)=>{let n=e;return`o:{${Object.keys(n).toSorted().map(e=>{let r=n[e];return`${JSON.stringify(e)}:${Pi(r,t)}`}).join(`,`)}}`},Li=e=>e+1,Ri=e=>e-1,zi=(e,t=fr.orThrow(16),n=fr.orThrow(2))=>{let r=t*n;if(e<r)return K(fr.orThrow(r));let i=[],a=Math.floor(e/t),o=e%t,s=0;for(let e=0;e<t;e++){let t=a+ +(e<o);s+=t,i.push(fr.orThrow(s))}return N(i),G(i)},Bi=(e,t)=>{if(e.byteLength>t.byteLength)return 1;if(e.byteLength<t.byteLength)return-1;for(let n=0;n<e.byteLength;n++){if(e[n]<t[n])return-1;if(e[n]>t[n])return 1}return 0};var Vi=class{};function Hi(e){"@babel/helpers - typeof";return Hi=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},Hi(e)}function Ui(e,t){if(Hi(e)!=`object`||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var r=n.call(e,t||`default`);if(Hi(r)!=`object`)return r;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(t===`string`?String:Number)(e)}function Wi(e){var t=Ui(e,`string`);return Hi(t)==`symbol`?t:t+``}function Gi(e,t,n){return(t=Wi(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}var Ki=class e extends Vi{constructor(e){super(),Gi(this,`_name`,void 0),Gi(this,`_rngFn`,void 0),this._name=e.name||`function`,this._rngFn=e}get name(){return this._name}next(){return this._rngFn()}clone(){return new e(this._rngFn)}};function qi(e,t){return e<<t|e>>>32-t}function Ji(e){let t=`${e}`,n=1779033703,r=3144134277,i=1013904242,a=2773480762;for(let e=0;e<t.length;e++){let o=t.charCodeAt(e);n=r^Math.imul(n^o,597399067),r=i^Math.imul(r^o,2869860233),i=a^Math.imul(i^o,951274213),a=n^Math.imul(a^o,2716044179)}return n=Math.imul(i^n>>>18,597399067),r=Math.imul(a^r>>>22,2869860233),i=Math.imul(n^i>>>17,951274213),a=Math.imul(r^a>>>19,2716044179),n^=r^i^a,r^=n,i^=n,a^=n,[n>>>0,r>>>0,i>>>0,a>>>0]}var Yi=class e extends Vi{constructor(e=crypto.randomUUID()){super(),Gi(this,`_seed`,void 0),Gi(this,`s0`,0),Gi(this,`s1`,0),Gi(this,`s2`,0),Gi(this,`s3`,0),this._seed=e,this.setState(Ji(e))}setState(e){this.s0=e[0],this.s1=e[1],this.s2=e[2],this.s3=e[3],(this.s0|this.s1|this.s2|this.s3)===0&&(this.s0=1831565813)}get name(){return`xoshiro128**`}next(){let e=this.nextUint32()>>>5,t=this.nextUint32()>>>6;return(e*67108864+t)/9007199254740992}clone(){let t=new e(this._seed);return t.setState([this.s0,this.s1,this.s2,this.s3]),t}nextUint32(){let e=Math.imul(qi(Math.imul(this.s1,5),7),9)>>>0,t=this.s1<<9;return this.s2^=this.s0,this.s3^=this.s1,this.s1^=this.s2,this.s0^=this.s3,this.s2^=t,this.s3=qi(this.s3,11),e}};function Xi(e){switch(typeof e){case`object`:if(e instanceof Vi)return e;break;case`function`:return new Ki(e);case`number`:case`string`:case`undefined`:return new Yi(e)}throw TypeError(`Invalid seed or RNG: ${String(e)}`)}function Zi(e,t){for(let n=t.length-1;n>0;--n){let r=Math.floor(e.next()*(n+1)),i=t[n];t[n]=t[r],t[r]=i}}function Qi(e,t,n){let r=new Map,i=t.length-1,a=Array.from({length:n});for(let o=0;o<n;o++){let n=i-o+1,s=Math.floor(e.next()*n);a[o]=t[r.get(s)??s],r.set(s,r.get(i-o)??i-o)}return a}var $i=class e extends Vi{get name(){return`Math.random`}next(){return Math.random()}clone(){return new e}};function ea(e){return new ta(e)}var ta=class{constructor(e){Gi(this,`n`,void 0),Gi(this,`isInt`,()=>{if(Number.isInteger(this.n))return this;throw Error(`Expected number to be an integer, got ${this.n}`)}),Gi(this,`isPositive`,()=>{if(this.n>0)return this;throw Error(`Expected number to be positive, got ${this.n}`)}),Gi(this,`lessThan`,e=>{if(this.n<e)return this;throw Error(`Expected number to be less than ${e}, got ${this.n}`)}),Gi(this,`lessThanOrEqual`,e=>{if(this.n<=e)return this;throw Error(`Expected number to be less than or equal to ${e}, got ${this.n}`)}),Gi(this,`greaterThanOrEqual`,e=>{if(this.n>=e)return this;throw Error(`Expected number to be greater than or equal to ${e}, got ${this.n}`)}),Gi(this,`greaterThan`,e=>{if(this.n>e)return this;throw Error(`Expected number to be greater than ${e}, got ${this.n}`)}),this.n=e}};function na(e,t=1){ea(t).isInt().isPositive();let n=e.irwinHall(t);return()=>n()/t}function ra(e,t=.5){return ea(t).greaterThanOrEqual(0).lessThanOrEqual(1),()=>Math.min(1,Math.floor(e.next()+t))}function ia(e,t=1,n=.5){return ea(t).isInt().isPositive(),ea(n).greaterThanOrEqual(0).lessThan(1),()=>{let r=0,i=0;for(;r++<t;)e.next()<n&&i++;return i}}function aa(e,t=1){return ea(t).isPositive(),()=>-Math.log(1-e.next())/t}function oa(e,t=.5){ea(t).greaterThan(0).lessThan(1);let n=1/Math.log(1-t);return()=>Math.floor(1+Math.log(e.next())*n)}function sa(e,t=1){return ea(t).isInt().greaterThanOrEqual(0),()=>{let n=0;for(let r=0;r<t;++r)n+=e.next();return n}}function ca(e,t=0,n=1){let r=e.normal(t,n);return()=>Math.exp(r())}function la(e,t=0,n=1){return()=>{let r,i,a;do r=e.next()*2-1,i=e.next()*2-1,a=r*r+i*i;while(!a||a>1);return t+n*i*Math.sqrt(-2*Math.log(a)/a)}}function ua(e,t=1){ea(t).greaterThanOrEqual(0);let n=1/t;return()=>1/(1-e.next())**n}const da=[0,0,.6931471805599453,1.791759469228055,3.1780538303479458,4.787491742782046,6.579251212010101,8.525161361065415,10.60460290274525,12.801827480081469],fa=e=>da[e];function pa(e,t=1){if(ea(t).isPositive(),t<10){let n=Math.exp(-t);return()=>{let r=n,i=0,a=e.next();for(;a>r;)a-=r,r=t*r/++i;return i}}{let n=Math.sqrt(t),r=.931+2.53*n,i=-.059+.02483*r,a=1.1239+1.1328/(r-3.4),o=.9277-3.6224/(r-2);return()=>{for(;;){let s,c=e.next();if(c<=.86*o)return s=c/o-.43,Math.floor((2*i/(.5-Math.abs(s))+r)*s+t+.445);c>=o?s=e.next()-.5:(s=c/o-.93,s=(s<0?-.5:.5)-s,c=e.next()*o);let l=.5-Math.abs(s);if(l<.013&&c>l)continue;let u=Math.floor((2*i/l+r)*s+t+.445);if(c=c*a/(i/(l*l)+r),u>=10){let e=(u+.5)*Math.log(t/u)-t-.9189385332046727+u-(1/12-(1/360-1/(1260*u*u))/(u*u))/u;if(Math.log(c*n)<=e)return u}else if(u>=0){let e=fa(u)??0;if(Math.log(c)<=u*Math.log(t)-t-e)return u}}}}}function ma(e,t,n){return n===void 0&&(n=t===void 0?1:t,t=0),t??=0,()=>e.next()*(n-t)+t}function ha(e){return()=>e.next()>=.5}function ga(e,t,n){return n===void 0&&(n=t===void 0?1:t,t=0),t??=0,ea(t).isInt(),ea(n).isInt(),()=>Math.floor(e.next()*(n-t+1)+t)}function _a(e,t,n){return ea(t).greaterThan(0),ea(n).greaterThan(0),()=>{let r=1-e.next();return t*(-Math.log(r))**(1/n)}}new class e{constructor(e=new $i){Gi(this,`_rng`,void 0),Gi(this,`_cache`,{}),this._rng=Xi(e)}get rng(){return this._rng}clone(t=this.rng.clone()){return new e(t)}use(e){this._rng=Xi(e),this._cache={}}next(){return this._rng.next()}float(e,t){return this.uniform(e,t)()}int(e,t){return this.uniformInt(e,t)()}integer(e,t){return this.uniformInt(e,t)()}bool(){return this.uniformBoolean()()}boolean(){return this.uniformBoolean()()}choice(e,t){if(!Array.isArray(e))throw TypeError(`Random.choice expected input to be an array, got ${typeof e}`);let n=e.length;if(n===0)return;if(!t)return e[this.uniformInt(0,n-1)()];if(!Array.isArray(t))throw TypeError(`Random.choice expected weights to be an array, got ${typeof t}`);if(t.length!==n)throw Error(`Random.choice expected weights array length (${t.length}) to match array length (${n})`);for(let[e,n]of t.entries())if(typeof n!=`number`||n<0||!Number.isFinite(n))throw Error(`Random.choice expected all weights to be non-negative finite numbers, got ${n} at index ${e}`);let r=t.reduce((e,t)=>e+t,0);if(r===0)throw Error(`Random.choice expected at least one positive weight, got all zeros`);let i=this.float(0,r),a=0;for(let r=0;r<n;r++)if(a+=t[r],i<=a)return e[r];return e[n-1]}sample(e,t){if(!Array.isArray(e))throw TypeError(`Random.sample expected input to be an array, got ${typeof e}`);if(t<0||t>e.length)throw Error(`Random.sample: k must be between 0 and array.length (${e.length}), got ${t}`);return Qi(this.rng,e,t)}sampler(e,t){if(!Array.isArray(e))throw TypeError(`Random.sampler expected input to be an array, got ${typeof e}`);if(t<0||t>e.length)throw Error(`Random.sampler: k must be between 0 and array.length (${e.length}), got ${t}`);let n=this.rng;return()=>Qi(n,e,t)}shuffle(e){if(!Array.isArray(e))throw TypeError(`Random.shuffle expected input to be an array, got ${typeof e}`);let t=[...e];return Zi(this.rng,t),t}shuffler(e){if(!Array.isArray(e))throw TypeError(`Random.shuffler expected input to be an array, got ${typeof e}`);let t=this.rng,n=[...e];return()=>(Zi(t,n),[...n])}uniform(e,t){return this._memoize(`uniform`,ma,e,t)}uniformInt(e,t){return this._memoize(`uniformInt`,ga,e,t)}uniformBoolean(){return this._memoize(`uniformBoolean`,ha)}normal(e,t){return la(this,e,t)}logNormal(e,t){return ca(this,e,t)}bernoulli(e){return ra(this,e)}binomial(e,t){return ia(this,e,t)}geometric(e){return oa(this,e)}poisson(e){return pa(this,e)}exponential(e){return aa(this,e)}irwinHall(e){return sa(this,e)}bates(e){return na(this,e)}pareto(e){return ua(this,e)}weibull(e,t){return _a(this,e,t)}_memoize(e,t,...n){let r=`${n.join(`;`)}`,i=this._cache[e];return(i===void 0||i.key!==r)&&(i={key:r,distribution:t(this,...n)},this._cache[e]=i),i.distribution}};const va=()=>({next:()=>Math.random()}),ya=new Set;var ba=function(e,t,n){if(t!=null){if(typeof t!=`object`&&typeof t!=`function`)throw TypeError(`Object expected.`);var r,i;if(n){if(!Symbol.asyncDispose)throw TypeError(`Symbol.asyncDispose is not defined.`);r=t[Symbol.asyncDispose]}if(r===void 0){if(!Symbol.dispose)throw TypeError(`Symbol.dispose is not defined.`);r=t[Symbol.dispose],n&&(i=r)}if(typeof r!=`function`)throw TypeError(`Object not disposable.`);i&&(r=function(){try{i.call(this)}catch(e){return Promise.reject(e)}}),e.stack.push({value:t,dispose:r,async:n})}else n&&e.stack.push({async:!0});return t},xa=(function(e){return function(t){function n(n){t.error=t.hasError?new e(n,t.error,`An error was suppressed during disposal.`):n,t.hasError=!0}var r,i=0;function a(){for(;r=t.stack.pop();)try{if(!r.async&&i===1)return i=0,t.stack.push(r),Promise.resolve().then(a);if(r.dispose){var e=r.dispose.call(r.value);if(r.async)return i|=2,Promise.resolve(e).then(a,function(e){return n(e),a()})}else i|=1}catch(e){n(e)}if(i===1)return t.hasError?Promise.reject(t.error):Promise.resolve();if(t.hasError)throw t.error}return a()}})(typeof SuppressedError==`function`?SuppressedError:function(e,t,n){var r=Error(n);return r.name=`SuppressedError`,r.error=e,r.suppressed=t,r});const Sa=kr(`AbortError`,{reason:Cr({type:Ln},vr(Ln,Fn))}),Ca=e=>({type:`AbortError`,reason:e}),wa=Ca({type:`RunDisposedAbortReason`}),Ta={type:`ExplicitAbortReason`},Ea=e=>({type:`PanicAbortReason`,defect:e}),Da=e=>{queueMicrotask(()=>{throw e})},Oa=()=>({console:Zr(),leakDetector:Ai,nativeFetch:globalThis.fetch.bind(globalThis),randomBytes:bi(),random:va(),reportDefect:Da,time:Vr()}),ka=e=>Na({...Oa(),...e}),Aa=globalThis,ja=Symbol(`evolu.Task.meta`),Ma={type:`Running`},Na=(e,t,n,r)=>{let i=r?.abortBehavior;i!==void 0&&i!==`unabortable`&&A(t?.restoreTokens.has(i.restoreToken)===!0,`restore is only valid inside the unabortableMask that created it`);let a=t?.abortMask??0,o=i===void 0?a:i===`unabortable`?Li(a):i.abortMask,s=Ma,c,l,u=new Map,d=new AbortController,f=new AbortController,p,m,h,g=t=>{try{e.reportDefect(t)}catch(e){Da(AggregateError([t,e],`ReportDefect failed while reporting a defect`))}},_=t=>{try{if(!e.runConfig?.eventsEnabled.get())return;let n={id:w.id,timestamp:T.deps.time.now(),data:t};for(let e=w;e;e=e.parent)try{e.onEvent?.(n)}catch(e){g(e)}}catch(e){g(e)}},y=()=>({request:d.signal.reason.reason,observed:f.signal.aborted?f.signal.reason.reason:null}),b=e=>{s=e,_({type:`StateChanged`,state:s})},x=(e=Ta)=>{if(d.signal.aborted)return;let t=Ca(e);d.abort(t),o===0&&f.abort(t),b({type:`Aborted`,abort:y()})},S=e=>{if(c??=e,p)return p;let t=()=>(c??=G(G()),b({type:`Settled`,abort:y(),exit:c}),c),n=m;p=n?Promise.all(u.values()).then(async()=>{try{await n.disposeAsync()}catch(e){h=T.panic(e),c??=K(h)}return t()}):Promise.all(u.values()).then(t);let r=c?.ok===!1?c.error:wa,{aborted:i}=f.signal;return d.abort(r),f.abort(r),i||b({type:`Aborted`,abort:y()}),p},C=t=>t===void 0?e:{console:e.console,leakDetector:e.leakDetector,nativeFetch:e.nativeFetch,randomBytes:e.randomBytes,random:e.random,reportDefect:e.reportDefect,time:e.time,...e.runConfig&&{runConfig:e.runConfig},...t},w=((e,t,{abortable:n=!1}={})=>{P({disposed:!!p});let r=e[ja],i=Na(C(t),w,T,r),a=Promise.withResolvers();u.set(i,a.promise),_({type:`ChildAdded`,childId:i.id});let o=()=>{i.requestAbort(w.requestAbortSignal.reason.reason)};w.requestAbortSignal.aborted?o():w.requestAbortSignal.addEventListener(`abort`,o,{once:!0,signal:i.requestAbortSignal});let s=(async()=>{let t;try{let n=r?.abortBehavior===`unabortable`?i.requestAbortSignal:i.signal,a=Aa.scheduler,o;r?.priority&&a?.postTask?o=await a.postTask(()=>(n.throwIfAborted(),e(i)),{priority:r.priority,signal:n}):(n.throwIfAborted(),o=await e(i)),A(typeof o?.ok==`boolean`,`Task must return Result.`),t=G(o)}catch(e){t=K(Sa.is(e)?e:T.panic(e))}let o=await i.dispose(t);if(u.delete(i),_({type:`ChildRemoved`,childId:i.id}),a.resolve(),o.ok)return o.value;if(n)return K(o.error);throw s.catch(ne),o.error})();if(s.run=i,n){let e=s;e.abort=i.requestAbort,e[Symbol.asyncDispose]=async()=>{e.abort(),await e}}return s}),T=n??w;return w.orThrow=(async(e,t)=>nn(await w(e,t))),w.ok=(async(e,t)=>an(await w(e,t))),w.abortable=((e,t)=>w(e,t,{abortable:!0})),w.daemon=((e,t)=>(P({disposed:!!p}),w.requestAbortSignal.throwIfAborted(),T.abortable(e,C(t)))),w.create=(e=>w.daemon(async e=>(await e.abortable(Fa),G()),e).run),w.id=ar(e),w.parent=t??null,w.deps=e,w.signal=f.signal,w.requestAbortSignal=d.signal,w.onAbort=e=>{let t=()=>{try{e(w.signal.reason)}catch(e){T.panic(e)}};return w.signal.aborted?(t(),null):(w.signal.addEventListener(`abort`,t,{once:!0}),{[Symbol.dispose]:()=>{w.signal.removeEventListener(`abort`,t)}})},w.getState=()=>s,w.snapshot=()=>{let e=Array.from(u.keys(),e=>e.snapshot());return(l?.state!==s||!D(l.children,e))&&(l={id:w.id,state:s,children:e,abortMask:o}),l},w.onEvent=void 0,w.defer=e=>{P({disposed:!!p}),(m??=new AsyncDisposableStack).defer(e)},w.abort=(e=Ta)=>{p||S(K(Ca(e)))},w.panic=e=>{let t=Ca(Ea(e));return g(t),T.dispose(K(t)),t},w[Symbol.dispose]=()=>{S()},w[Symbol.asyncDispose]=async()=>{if(await S(),h)throw h},w.abortMask=o,w.restoreTokens=t?.restoreTokens??ya,w.requestAbort=x,w.dispose=S,w},Pa=e=>t=>{let{promise:n,resolve:r,reject:i}=Promise.withResolvers(),a=e({run:t,resolve:r,reject:i});return t.onAbort(e=>{i(e),a?.()}),n},Fa=async e=>{let t={stack:[],error:void 0,hasError:!1};try{let n=Promise.withResolvers();return ba(t,e.onAbort(n.reject),!1),await n.promise}catch(e){t.error=e,t.hasError=!0}finally{xa(t)}};var Ia=function(e,t,n){if(t!=null){if(typeof t!=`object`&&typeof t!=`function`)throw TypeError(`Object expected.`);var r,i;if(n){if(!Symbol.asyncDispose)throw TypeError(`Symbol.asyncDispose is not defined.`);r=t[Symbol.asyncDispose]}if(r===void 0){if(!Symbol.dispose)throw TypeError(`Symbol.dispose is not defined.`);r=t[Symbol.dispose],n&&(i=r)}if(typeof r!=`function`)throw TypeError(`Object not disposable.`);i&&(r=function(){try{i.call(this)}catch(e){return Promise.reject(e)}}),e.stack.push({value:t,dispose:r,async:n})}else n&&e.stack.push({async:!0});return t},La=(function(e){return function(t){function n(n){t.error=t.hasError?new e(n,t.error,`An error was suppressed during disposal.`):n,t.hasError=!0}var r,i=0;function a(){for(;r=t.stack.pop();)try{if(!r.async&&i===1)return i=0,t.stack.push(r),Promise.resolve().then(a);if(r.dispose){var e=r.dispose.call(r.value);if(r.async)return i|=2,Promise.resolve(e).then(a,function(e){return n(e),a()})}else i|=1}catch(e){n(e)}if(i===1)return t.hasError?Promise.reject(t.error):Promise.resolve();if(t.hasError)throw t.error}return a()}})(typeof SuppressedError==`function`?SuppressedError:function(e,t,n){var r=Error(n);return r.name=`SuppressedError`,r.error=e,r.suppressed=t,r});const Ra=Kn(ur,Gn,Ln,Un),za=e=>{let[t,n,r]=JSON.parse(e),i=n.map(([e,t])=>e===`b`?Te(t):t),a=r.length?Object.fromEntries(r):void 0;return{sql:t,parameters:i,...a!==void 0&&{options:a}}},Ba=(e,t)=>async n=>{let r={stack:[],error:void 0,hasError:!1};try{let{createSqliteDriver:i}=n.deps,a=n.deps.console.child(`sql`),o=Ia(r,new AsyncDisposableStack,!0),s=o.use(await n.ok(i(e,t)));return a.debug(`SQLite driver created`),G(L({exec:e=>{a.debug({query:e});let t=e.options?.logQueryExecutionTime===!0?`SqliteQueryExecutionTime ${e.sql}`:null;t!==null&&a.time(t);let n=s.exec(e);if(t!==null&&a.timeEnd(t),e.options?.logExplainQueryPlan){let t=s.exec({...e,sql:`EXPLAIN QUERY PLAN ${e.sql}`});a.log(`[logExplainQueryPlan]`,e),a.log(Va(t.rows))}return a.debug({result:n}),n},transaction:(e=>{let t={stack:[],error:void 0,hasError:!1};try{a.debug(`begin`),s.exec(Y`begin;`);let n=Ia(t,new DisposableStack,!1),r=!0;n.defer(()=>{r&&(a.debug(`rollback`),s.exec(Y`rollback;`))});let i=e();return i!=null&&!i.ok?i:(a.debug(`commit`),s.exec(Y`commit;`),r=!1,i)}catch(e){t.error=e,t.hasError=!0}finally{La(t)}}),export:()=>s.export()},o))}catch(e){r.error=e,r.hasError=!0}finally{let e=La(r);e&&await e}},Va=e=>e.map(t=>{let n=t.parent,r=0;do{let t=e.find(e=>e.id===n);if(!t)break;n=t.parent,r++}while(!0);return`${`  `.repeat(r)}${t.detail}`}).join(`
`),Ha=(e,t)=>{let n={stack:[],error:void 0,hasError:!1};try{let r=Ia(n,new DisposableStack,!1),i=new Map;return r.defer(()=>{let e={stack:[],error:void 0,hasError:!1};try{let n=Ia(e,new DisposableStack,!1);n.defer(()=>{i.clear()});for(let e of i.values())n.adopt(e,t)}catch(t){e.error=t,e.hasError=!0}finally{La(e)}}),L({get:(t,n)=>{if(n!==!0&&!t.options?.prepare)return null;let r=i.get(t.sql);return r===void 0&&(r=e(t.sql),i.set(t.sql,r)),r}},r)}catch(e){n.error=e,n.hasError=!0}finally{La(n)}},Y=(e,...t)=>{let n=``,r=[];for(let i=0;i<e.length;i++)if(n+=e[i],i<t.length){let e=t[i];typeof e==`object`&&e&&`type`in e?n+=e.sql:(n+=`?`,r.push(Ra.orThrow(e)))}return{sql:n.trim(),parameters:r}};Y.identifier=e=>({type:`SqlIdentifier`,sql:`"${e.replaceAll(`"`,`""`)}"`}),Y.raw=e=>({type:`RawSql`,sql:e}),Y.prepared=(e,...t)=>({...Y(e,...t),options:{prepare:!0}});const Ua=k({name:w,sql:w}),Wa=e=>({excludeIndexNamePrefix:t}={})=>{let n=b();e.sqlite.exec(Y`
      select
        sqlite_master.name as tableName,
        table_info.name as columnName
      from
        sqlite_master
        join pragma_table_info(sqlite_master.name) as table_info;
    `).rows.forEach(({tableName:e,columnName:t})=>{(n[e]??=new Set).add(t)});let r=t==null?``:` and name not like '${t.replaceAll(`'`,`''`)}%'`;return{tables:n,indexes:e.sqlite.exec(Y`
        select name, sql
        from sqlite_master
        where
          type = 'index'
          and name not like 'sqlite_%'
          ${Y.raw(r)};
      `).rows.map(e=>({name:e.name,sql:e.sql.replace(`CREATE INDEX`,`create index`).replace(`CREATE UNIQUE INDEX`,`create unique index`)}))}},Ga=Kn(0,1),Ka=e=>+!!e,qa=e=>e===1;globalThis.WebSocket.CONNECTING,globalThis.WebSocket.OPEN,globalThis.WebSocket.CLOSING,globalThis.WebSocket.CLOSED;const Ja=Yn(`Counter`,hr(65535)(q)),Ya=k({millis:T,counter:T,nodeId:w}),Xa=({millis:e=0,counter:t=0,nodeId:n=`0000000000000000`}={})=>({millis:e,counter:t,nodeId:n}),Za=e=>{let t=Ce(e.randomBytes.create(8));return Xa({nodeId:t})},Qa=e=>t=>{let n=Kr.fromUnknown(e.time.now());if(!n.ok)return K({type:`TimestampTimeOutOfRangeError`});let r=Math.max(n.value,...t);return r-n.value>e.timestampConfig.maxDrift?K({type:`TimestampDriftError`,now:n.value,next:r}):G(r)},$a=e=>{let t=Ja.fromUnknown(Li(e));return t.ok?G(t.value):K({type:`TimestampCounterOverflowError`})},eo=e=>t=>{let n=Qa(e)([t.millis]);if(!n.ok)return n;let r=n.value===t.millis?$a(t.counter):G(0);return r.ok?G({millis:n.value,counter:r.value,nodeId:t.nodeId}):r},to=e=>(t,n)=>{let r=Qa(e)([t.millis,n.millis]);if(!r.ok)return r;let i=r.value===t.millis&&r.value===n.millis?$a(Math.max(t.counter,n.counter)):r.value===t.millis?$a(t.counter):r.value===n.millis?$a(n.counter):G(0);return i.ok?G({millis:r.value,counter:i.value,nodeId:t.nodeId}):i},no=Yn(`TimestampBytes`,Zn(16)(Un)),ro=q.orThrow(16),io=e=>{let{millis:t,counter:n,nodeId:r}=e,i=new globalThis.Uint8Array(16),a=BigInt(t);i[0]=Number(a>>40n&255n),i[1]=Number(a>>32n&255n),i[2]=Number(a>>24n&255n),i[3]=Number(a>>16n&255n),i[4]=Number(a>>8n&255n),i[5]=Number(a&255n),i[6]=n>>8&255,i[7]=n&255;for(let e=0;e<8;e++){let t=parseInt(r.slice(e*2,e*2+2),16);i[8+e]=t}return i},ao=e=>{let t=BigInt(e[0])<<40n|BigInt(e[1])<<32n|BigInt(e[2])<<24n|BigInt(e[3])<<16n|BigInt(e[4])<<8n|BigInt(e[5]),n=e[6]<<8|e[7],r=``;for(let t=8;t<16;t++)r+=e[t].toString(16).padStart(2,`0`);return{millis:Number(t),counter:n,nodeId:r}},oo=Bi,so=Yn(`OwnerId`,ir),co=e=>or(e),lo=e=>sr(e);function uo(e){return e===void 0||e===void 0}function fo(e){return typeof e==`string`}function po(e){return typeof e==`number`}function mo(e){return typeof e==`boolean`}function ho(e){return e===null}function go(e){return e instanceof Date}function _o(e){return typeof e==`bigint`}function vo(e){return typeof e==`function`}function yo(e){return typeof e==`object`&&!!e}function X(e){return Object.freeze(e)}function bo(e){return xo(e)?e:[e]}function xo(e){return Array.isArray(e)}function So(e){return e}function Co(e){return e instanceof Error?e.message:String(e)}const wo=X({is(e){return e.kind===`AlterTableNode`},create(e){return X({kind:`AlterTableNode`,table:e})},cloneWithTableProps(e,t){return X({...e,...t})},cloneWithColumnAlteration(e,t){return X({...e,columnAlterations:e.columnAlterations?[...e.columnAlterations,t]:[t]})}}),To=X({is(e){return e.kind===`IdentifierNode`},create(e){return X({kind:`IdentifierNode`,name:e})}}),Eo=X({is(e){return e.kind===`CreateIndexNode`},create(e){return X({kind:`CreateIndexNode`,name:To.create(e)})},cloneWith(e,t){return X({...e,...t})},cloneWithColumns(e,t){return X({...e,columns:[...e.columns||[],...t]})}}),Do=X({is(e){return e.kind===`CreateSchemaNode`},create(e,t){return X({kind:`CreateSchemaNode`,schema:To.create(e),...t})},cloneWith(e,t){return X({...e,...t})}}),Oo=[`preserve rows`,`delete rows`,`drop`],ko=X({is(e){return e.kind===`CreateTableNode`},create(e){return X({kind:`CreateTableNode`,table:e,columns:X([])})},cloneWithColumn(e,t){return X({...e,columns:X([...e.columns,t])})},cloneWithConstraint(e,t){return X({...e,constraints:e.constraints?X([...e.constraints,t]):X([t])})},cloneWithIndex(e,t){return X({...e,indexes:e.indexes?X([...e.indexes,t]):X([t])})},cloneWithFrontModifier(e,t){return X({...e,frontModifiers:e.frontModifiers?X([...e.frontModifiers,t]):X([t])})},cloneWithEndModifier(e,t){return X({...e,endModifiers:e.endModifiers?X([...e.endModifiers,t]):X([t])})},cloneWith(e,t){return X({...e,...t})}}),Ao=X({is(e){return e.kind===`SchemableIdentifierNode`},create(e){return X({kind:`SchemableIdentifierNode`,identifier:To.create(e)})},createWithSchema(e,t){return X({kind:`SchemableIdentifierNode`,schema:To.create(e),identifier:To.create(t)})}}),jo=X({is(e){return e.kind===`DropIndexNode`},create(e,t){return X({kind:`DropIndexNode`,name:Ao.create(e),...t})},cloneWith(e,t){return X({...e,...t})}}),Mo=X({is(e){return e.kind===`DropSchemaNode`},create(e,t){return X({kind:`DropSchemaNode`,schema:To.create(e),...t})},cloneWith(e,t){return X({...e,...t})}}),No=X({is(e){return e.kind===`DropTableNode`},create(e,t){return X({kind:`DropTableNode`,table:e,...t})},cloneWith(e,t){return X({...e,...t})}}),Po=X({is(e){return e.kind===`AliasNode`},create(e,t){return X({kind:`AliasNode`,node:e,alias:t})}}),Fo=X({is(e){return e.kind===`TableNode`},create(e){return X({kind:`TableNode`,table:Ao.create(e)})},createWithSchema(e,t){return X({kind:`TableNode`,table:Ao.createWithSchema(e,t)})}});function Io(e){return yo(e)&&vo(e.toOperationNode)}function Lo(e){return yo(e)&&`expressionType`in e&&Io(e)}function Ro(e){return yo(e)&&`expression`in e&&fo(e.alias)&&Io(e)}const zo=X({is(e){return e.kind===`SelectModifierNode`},create(e,t){return X({kind:`SelectModifierNode`,modifier:e,of:t})},createWithExpression(e){return X({kind:`SelectModifierNode`,rawModifier:e})}}),Bo=X({is(e){return e.kind===`AndNode`},create(e,t){return X({kind:`AndNode`,left:e,right:t})}}),Vo=X({is(e){return e.kind===`OrNode`},create(e,t){return X({kind:`OrNode`,left:e,right:t})}}),Ho=X({is(e){return e.kind===`OnNode`},create(e){return X({kind:`OnNode`,on:e})},cloneWithOperation(e,t,n){return X({...e,on:t===`And`?Bo.create(e.on,n):Vo.create(e.on,n)})}}),Uo=X({is(e){return e.kind===`JoinNode`},create(e,t){return X({kind:`JoinNode`,joinType:e,table:t,on:void 0})},createWithOn(e,t,n){return X({kind:`JoinNode`,joinType:e,table:t,on:Ho.create(n)})},cloneWithOn(e,t){return X({...e,on:e.on?Ho.cloneWithOperation(e.on,`And`,t):Ho.create(t)})}}),Wo=X({is(e){return e.kind===`BinaryOperationNode`},create(e,t,n){return X({kind:`BinaryOperationNode`,leftOperand:e,operator:t,rightOperand:n})}}),Go=X({"=":!0,"==":!0,"!=":!0,"<>":!0,">":!0,">=":!0,"<":!0,"<=":!0,in:!0,"not in":!0,is:!0,"is not":!0,like:!0,"not like":!0,match:!0,ilike:!0,"not ilike":!0,"@>":!0,"<@":!0,"^@":!0,"&&":!0,"?":!0,"?&":!0,"?|":!0,"!<":!0,"!>":!0,"<=>":!0,"!~":!0,"~":!0,"~*":!0,"!~*":!0,"@@":!0,"@@@":!0,"!!":!0,"<->":!0,regexp:!0,"is distinct from":!0,"is not distinct from":!0});Object.keys(Go);const Ko=X({"+":!0,"-":!0,"*":!0,"/":!0,"%":!0,"^":!0,"&":!0,"|":!0,"#":!0,"<<":!0,">>":!0});Object.keys(Ko);const qo=X({"->":!0,"->>":!0}),Jo=Object.keys(qo),Yo=X({...Go,...Ko,"||":!0}),Xo=Object.keys(Yo),Zo=X({exists:!0,"not exists":!0});Object.keys(Zo);const Qo=X({...Zo,"-":!0,not:!0}),$o=Object.keys(Qo);[...Xo,...Jo,...$o];const es=X({is(e){return e.kind===`OperatorNode`},create(e){return X({kind:`OperatorNode`,operator:e})}});function ts(e){return fo(e)&&Yo[e]}function ns(e){return fo(e)&&qo[e]}function rs(e){return fo(e)&&Qo[e]}const is=X({is(e){return e.kind===`ColumnNode`},create(e){return X({kind:`ColumnNode`,column:To.create(e)})}}),as=X({is(e){return e.kind===`SelectAllNode`},create(){return X({kind:`SelectAllNode`})}}),os=X({is(e){return e.kind===`ReferenceNode`},create(e,t){return X({kind:`ReferenceNode`,table:t,column:e})},createSelectAll(e){return X({kind:`ReferenceNode`,table:e,column:as.create()})}});var ss=class{#e;get dynamicReference(){return this.#e}get refType(){}constructor(e){this.#e=e}toOperationNode(){return Cs(this.#e)}};function cs(e){return yo(e)&&Io(e)&&fo(e.dynamicReference)}const ls=X({is(e){return e.kind===`OrderByItemNode`},create(e,t){return X({kind:`OrderByItemNode`,orderBy:e,direction:t})},cloneWith(e,t){return X({...e,...t})}}),us=X({is(e){return e.kind===`RawNode`},create(e,t){return X({kind:`RawNode`,sqlFragments:X(e),parameters:X(t)})},createWithSql(e){return us.create([e],[])},createWithChild(e){return us.create([``,``],[e])},createWithChildren(e){return us.create(Array(e.length+1).fill(``),e)}}),ds=X({is(e){return e.kind===`CollateNode`},create(e){return X({kind:`CollateNode`,collation:To.create(e)})}});var fs=class e{#e;constructor(e){this.#e=X(e)}desc(){return new e({node:ls.cloneWith(this.#e.node,{direction:us.createWithSql(`desc`)})})}asc(){return new e({node:ls.cloneWith(this.#e.node,{direction:us.createWithSql(`asc`)})})}nullsLast(){return new e({node:ls.cloneWith(this.#e.node,{nulls:`last`})})}nullsFirst(){return new e({node:ls.cloneWith(this.#e.node,{nulls:`first`})})}collate(t){return new e({node:ls.cloneWith(this.#e.node,{collation:ds.create(t)})})}toOperationNode(){return this.#e.node}};const ps=new Set;function ms(e){ps.has(e)||(ps.add(e),console.log(e))}function hs(e){return e===`asc`||e===`desc`}function gs(e){if(e.length===2)return[_s(e[0],e[1])];if(e.length===1){let[t]=e;return Array.isArray(t)?(ms(`orderBy(array) is deprecated, use multiple orderBy calls instead.`),t.map(e=>_s(e))):[_s(t)]}throw Error(`Invalid number of arguments at order by! expected 1-2, received ${e.length}`)}function _s(e,t){let n=vs(e);if(ls.is(n)){if(t)throw Error(`Cannot specify direction twice!`);return n}return ys(n,t)}function vs(e){if(Iu(e))return Pu(e);if(cs(e))return e.toOperationNode();let[t,n]=e.split(` `);return n?(ms("`orderBy('column asc')` is deprecated. Use `orderBy('column', 'asc')` instead."),ys(Ds(t),n)):Ds(e)}function ys(e,t){if(typeof t==`string`){if(!hs(t))throw Error(`Invalid order by direction: ${t}`);return ls.create(e,us.createWithSql(t))}if(Lo(t))return ms("`orderBy(..., expr)` is deprecated. Use `orderBy(..., 'asc')` or `orderBy(..., (ob) => ...)` instead."),ls.create(e,t.toOperationNode());let n=ls.create(e);return t?t(new fs({node:n})).toOperationNode():n}const bs=X({is(e){return e.kind===`JSONReferenceNode`},create(e,t){return X({kind:`JSONReferenceNode`,reference:e,traversal:t})},cloneWithTraversal(e,t){return X({...e,traversal:t})}}),xs=X({is(e){return e.kind===`JSONOperatorChainNode`},create(e){return X({kind:`JSONOperatorChainNode`,operator:e,values:X([])})},cloneWithValue(e,t){return X({...e,values:X([...e.values,t])})}}),Ss=X({is(e){return e.kind===`JSONPathNode`},create(e){return X({kind:`JSONPathNode`,inOperator:e,pathLegs:X([])})},cloneWithLeg(e,t){return X({...e,pathLegs:X([...e.pathLegs,t])})}});function Cs(e){return fo(e)?Ds(e):e.toOperationNode()}function ws(e){return xo(e)?e.map(e=>Ts(e)):[Ts(e)]}function Ts(e){return Iu(e)?Pu(e):Cs(e)}function Es(e,t){if(ns(t))return bs.create(Ds(e),xs.create(es.create(t)));if(t===`->$`||t===`->>$`)return bs.create(Ds(e),Ss.create(es.create(t.slice(0,-1))));throw Error(`Invalid JSON operator: ${t}`)}function Ds(e){if(!e.includes(`.`))return os.create(is.create(e));let t=e.split(`.`).map(Ns);if(t.length===3)return js(t);if(t.length===2)return Ms(t);throw Error(`invalid column reference ${e}`)}function Os(e){let t=` as `;if(e.includes(t)){let[n,r]=e.split(t).map(Ns);return Po.create(Ds(n),To.create(r))}return Ds(e)}function ks(e){return is.create(e)}function As(e){if(e.includes(` `)){let[t,n]=e.split(` `).map(Ns);if(!hs(n))throw Error(`invalid order direction "${n}" next to "${t}"`);return gs([t,n])[0]}return ks(e)}function js(e){let[t,n,r]=e;return os.create(is.create(r),Fo.createWithSchema(t,n))}function Ms(e){let[t,n]=e;return os.create(is.create(n),Fo.create(t))}function Ns(e){return e.trim()}const Ps=X({is(e){return e.kind===`PrimitiveValueListNode`},create(e){return X({kind:`PrimitiveValueListNode`,values:X([...e])})}}),Fs=X({is(e){return e.kind===`ValueListNode`},create(e){return X({kind:`ValueListNode`,values:X(e)})}}),Is=X({is(e){return e.kind===`ValueNode`},create(e){return X({kind:`ValueNode`,value:e})},createImmediate(e){return X({kind:`ValueNode`,value:e,immediate:!0})}});function Ls(e){return xo(e)?Vs(e):Rs(e)}function Rs(e){return Iu(e)?Pu(e):Is.create(e)}function zs(e){return po(e)||mo(e)||ho(e)}function Bs(e){if(!zs(e))throw Error(`unsafe immediate value ${JSON.stringify(e)}`);return Is.createImmediate(e)}function Vs(e){return e.some(Iu)?Fs.create(e.map(e=>Rs(e))):Ps.create(e)}const Hs=X({is(e){return e.kind===`ParensNode`},create(e){return X({kind:`ParensNode`,node:e})}});function Us(e){if(e.length===3)return Ws(e[0],e[1],e[2]);if(e.length===1)return Rs(e[0]);throw Error(`invalid arguments: ${JSON.stringify(e)}`)}function Ws(e,t,n){return Js(t)&&Ys(n)?Wo.create(Ts(e),Xs(t),Is.createImmediate(n)):Wo.create(Ts(e),Xs(t),Ls(n))}function Gs(e,t,n){return Wo.create(Ts(e),Xs(t),Ts(n))}function Ks(e,t){return qs(Object.entries(e).filter(([,e])=>!uo(e)).map(([e,t])=>Ws(e,Ys(t)?`is`:`=`,t)),t)}function qs(e,t,n=!0){let r=t===`and`?Bo.create:Vo.create;if(e.length===0)return Wo.create(Is.createImmediate(1),es.create(`=`),Is.createImmediate(+(t===`and`)));let i=Zs(e[0]);for(let t=1;t<e.length;++t)i=r(i,Zs(e[t]));return e.length>1&&n?Hs.create(i):i}function Js(e){return e===`is`||e===`is not`}function Ys(e){return ho(e)||mo(e)}function Xs(e){if(ts(e))return es.create(e);if(Io(e))return e.toOperationNode();throw Error(`invalid operator ${JSON.stringify(e)}`)}function Zs(e){return Io(e)?e.toOperationNode():e}const Qs=X({is(e){return e.kind===`OrderByNode`},create(e){return X({kind:`OrderByNode`,items:X([...e])})},cloneWithItems(e,t){return X({...e,items:X([...e.items,...t])})}}),$s=X({is(e){return e.kind===`PartitionByNode`},create(e){return X({kind:`PartitionByNode`,items:X(e)})},cloneWithItems(e,t){return X({...e,items:X([...e.items,...t])})}}),ec=X({is(e){return e.kind===`OverNode`},create(){return X({kind:`OverNode`})},cloneWithOrderByItems(e,t){return X({...e,orderBy:e.orderBy?Qs.cloneWithItems(e.orderBy,t):Qs.create(t)})},cloneWithPartitionByItems(e,t){return X({...e,partitionBy:e.partitionBy?$s.cloneWithItems(e.partitionBy,t):$s.create(t)})}}),tc=X({is(e){return e.kind===`FromNode`},create(e){return X({kind:`FromNode`,froms:X(e)})},cloneWithFroms(e,t){return X({...e,froms:X([...e.froms,...t])})}}),nc=X({is(e){return e.kind===`GroupByNode`},create(e){return X({kind:`GroupByNode`,items:X(e)})},cloneWithItems(e,t){return X({...e,items:X([...e.items,...t])})}}),rc=X({is(e){return e.kind===`HavingNode`},create(e){return X({kind:`HavingNode`,having:e})},cloneWithOperation(e,t,n){return X({...e,having:t===`And`?Bo.create(e.having,n):Vo.create(e.having,n)})}}),ic=X({is(e){return e.kind===`InsertQueryNode`},create(e,t,n){return X({kind:`InsertQueryNode`,into:e,...t&&{with:t},replace:n})},createWithoutInto(){return X({kind:`InsertQueryNode`})},cloneWith(e,t){return X({...e,...t})}}),ac=X({is(e){return e.kind===`ListNode`},create(e){return X({kind:`ListNode`,items:X(e)})}}),oc=X({is(e){return e.kind===`UpdateQueryNode`},create(e,t){return X({kind:`UpdateQueryNode`,table:e.length===1?e[0]:ac.create(e),...t&&{with:t}})},createWithoutTable(){return X({kind:`UpdateQueryNode`})},cloneWithFromItems(e,t){return X({...e,from:e.from?tc.cloneWithFroms(e.from,t):tc.create(t)})},cloneWithUpdates(e,t){return X({...e,updates:e.updates?X([...e.updates,...t]):t})},cloneWithLimit(e,t){return X({...e,limit:t})}}),sc=X({is(e){return e.kind===`UsingNode`},create(e){return X({kind:`UsingNode`,tables:X(e)})},cloneWithTables(e,t){return X({...e,tables:X([...e.tables,...t])})}}),cc=X({is(e){return e.kind===`DeleteQueryNode`},create(e,t){return X({kind:`DeleteQueryNode`,from:tc.create(e),...t&&{with:t}})},cloneWithOrderByItems:(e,t)=>Z.cloneWithOrderByItems(e,t),cloneWithoutOrderBy:e=>Z.cloneWithoutOrderBy(e),cloneWithLimit(e,t){return X({...e,limit:t})},cloneWithoutLimit(e){return X({...e,limit:void 0})},cloneWithUsing(e,t){return X({...e,using:e.using===void 0?sc.create(t):sc.cloneWithTables(e.using,t)})}}),lc=X({is(e){return e.kind===`WhereNode`},create(e){return X({kind:`WhereNode`,where:e})},cloneWithOperation(e,t,n){return X({...e,where:t===`And`?Bo.create(e.where,n):Vo.create(e.where,n)})}}),uc=X({is(e){return e.kind===`ReturningNode`},create(e){return X({kind:`ReturningNode`,selections:X(e)})},cloneWithSelections(e,t){return X({...e,selections:e.selections?X([...e.selections,...t]):X(t)})}}),dc=X({is(e){return e.kind===`ExplainNode`},create(e,t){return X({kind:`ExplainNode`,format:e,options:t})}}),fc=X({is(e){return e.kind===`WhenNode`},create(e){return X({kind:`WhenNode`,condition:e})},cloneWithResult(e,t){return X({...e,result:t})}}),pc=X({is(e){return e.kind===`MergeQueryNode`},create(e,t){return X({kind:`MergeQueryNode`,into:e,...t&&{with:t}})},cloneWithUsing(e,t){return X({...e,using:t})},cloneWithWhen(e,t){return X({...e,whens:e.whens?X([...e.whens,t]):X([t])})},cloneWithThen(e,t){return X({...e,whens:e.whens?X([...e.whens.slice(0,-1),fc.cloneWithResult(e.whens[e.whens.length-1],t)]):void 0})}}),mc=X({is(e){return e.kind===`OutputNode`},create(e){return X({kind:`OutputNode`,selections:X(e)})},cloneWithSelections(e,t){return X({...e,selections:e.selections?X([...e.selections,...t]):X(t)})}}),Z=X({is(e){return hc.is(e)||ic.is(e)||oc.is(e)||cc.is(e)||pc.is(e)},cloneWithEndModifier(e,t){return X({...e,endModifiers:e.endModifiers?X([...e.endModifiers,t]):X([t])})},cloneWithWhere(e,t){return X({...e,where:e.where?lc.cloneWithOperation(e.where,`And`,t):lc.create(t)})},cloneWithJoin(e,t){return X({...e,joins:e.joins?X([...e.joins,t]):X([t])})},cloneWithReturning(e,t){return X({...e,returning:e.returning?uc.cloneWithSelections(e.returning,t):uc.create(t)})},cloneWithoutReturning(e){return X({...e,returning:void 0})},cloneWithoutWhere(e){return X({...e,where:void 0})},cloneWithExplain(e,t,n){return X({...e,explain:dc.create(t,n?.toOperationNode())})},cloneWithTop(e,t){return X({...e,top:t})},cloneWithOutput(e,t){return X({...e,output:e.output?mc.cloneWithSelections(e.output,t):mc.create(t)})},cloneWithOrderByItems(e,t){return X({...e,orderBy:e.orderBy?Qs.cloneWithItems(e.orderBy,t):Qs.create(t)})},cloneWithoutOrderBy(e){return X({...e,orderBy:void 0})}}),hc=X({is(e){return e.kind===`SelectQueryNode`},create(e){return X({kind:`SelectQueryNode`,...e&&{with:e}})},createFrom(e,t){return X({kind:`SelectQueryNode`,from:tc.create(e),...t&&{with:t}})},cloneWithSelections(e,t){return X({...e,selections:e.selections?X([...e.selections,...t]):X(t)})},cloneWithDistinctOn(e,t){return X({...e,distinctOn:e.distinctOn?X([...e.distinctOn,...t]):X(t)})},cloneWithFrontModifier(e,t){return X({...e,frontModifiers:e.frontModifiers?X([...e.frontModifiers,t]):X([t])})},cloneWithOrderByItems:(e,t)=>Z.cloneWithOrderByItems(e,t),cloneWithGroupByItems(e,t){return X({...e,groupBy:e.groupBy?nc.cloneWithItems(e.groupBy,t):nc.create(t)})},cloneWithLimit(e,t){return X({...e,limit:t})},cloneWithOffset(e,t){return X({...e,offset:t})},cloneWithFetch(e,t){return X({...e,fetch:t})},cloneWithHaving(e,t){return X({...e,having:e.having?rc.cloneWithOperation(e.having,`And`,t):rc.create(t)})},cloneWithSetOperations(e,t){return X({...e,setOperations:e.setOperations?X([...e.setOperations,...t]):X([...t])})},cloneWithoutSelections(e){return X({...e,selections:[]})},cloneWithoutLimit(e){return X({...e,limit:void 0})},cloneWithoutOffset(e){return X({...e,offset:void 0})},cloneWithoutOrderBy:e=>Z.cloneWithoutOrderBy(e),cloneWithoutGroupBy(e){return X({...e,groupBy:void 0})}});var gc=class e{#e;constructor(e){this.#e=X(e)}on(...t){return new e({...this.#e,joinNode:Uo.cloneWithOn(this.#e.joinNode,Us(t))})}onRef(t,n,r){return new e({...this.#e,joinNode:Uo.cloneWithOn(this.#e.joinNode,Gs(t,n,r))})}onTrue(){return new e({...this.#e,joinNode:Uo.cloneWithOn(this.#e.joinNode,us.createWithSql(`true`))})}$call(e){return e(this)}toOperationNode(){return this.#e.joinNode}};const _c=X({is(e){return e.kind===`PartitionByItemNode`},create(e){return X({kind:`PartitionByItemNode`,partitionBy:e})}});function vc(e){return ws(e).map(_c.create)}var yc=class e{#e;constructor(e){this.#e=X(e)}orderBy(...t){return new e({overNode:ec.cloneWithOrderByItems(this.#e.overNode,gs(t))})}clearOrderBy(){return new e({overNode:Z.cloneWithoutOrderBy(this.#e.overNode)})}partitionBy(t){return new e({overNode:ec.cloneWithPartitionByItems(this.#e.overNode,vc(t))})}$call(e){return e(this)}toOperationNode(){return this.#e.overNode}};const bc=X({is(e){return e.kind===`SelectionNode`},create(e){return X({kind:`SelectionNode`,selection:e})},createSelectAll(){return X({kind:`SelectionNode`,selection:as.create()})},createSelectAllFromTable(e){return X({kind:`SelectionNode`,selection:os.createSelectAll(e)})}});function xc(e){return vo(e)?xc(e(Nu())):xo(e)?e.map(e=>Sc(e)):[Sc(e)]}function Sc(e){return fo(e)?bc.create(Os(e)):cs(e)?bc.create(e.toOperationNode()):bc.create(Fu(e))}function Cc(e){return e?Array.isArray(e)?e.map(wc):[wc(e)]:[bc.createSelectAll()]}function wc(e){if(fo(e))return bc.createSelectAllFromTable(Uu(e));throw Error(`invalid value selectAll expression: ${JSON.stringify(e)}`)}const Tc=X({is(e){return e.kind===`ValuesNode`},create(e){return X({kind:`ValuesNode`,values:X(e)})}}),Ec=X({is(e){return e.kind===`DefaultInsertValueNode`},create(){return X({kind:`DefaultInsertValueNode`})}});function Dc(e){let t=vo(e)?e(Nu()):e;return Oc(xo(t)?t:X([t]))}function Oc(e){let t=kc(e);return[X([...t.keys()].map(is.create)),Tc.create(e.map(e=>Ac(e,t)))]}function kc(e){let t=new Map;for(let n of e){let e=Object.keys(n);for(let r of e)!t.has(r)&&n[r]!==void 0&&t.set(r,t.size)}return t}function Ac(e,t){let n=Object.keys(e),r=Array.from({length:t.size}),i=!1,a=n.length;for(let o of n){let n=t.get(o);if(uo(n)){a--;continue}let s=e[o];(uo(s)||Iu(s))&&(i=!0),r[n]=s}if(a<t.size||i){let e=Ec.create();return Fs.create(r.map(t=>uo(t)?e:Rs(t)))}return Ps.create(r)}const jc=X({is(e){return e.kind===`ColumnUpdateNode`},create(e,t){return X({kind:`ColumnUpdateNode`,column:e,value:t})}});function Mc(...e){return e.length===2?[jc.create(Ts(e[0]),Rs(e[1]))]:Nc(e[0])}function Nc(e){let t=vo(e)?e(Nu()):e;return Object.entries(t).filter(([e,t])=>t!==void 0).map(([e,t])=>jc.create(is.create(e),Rs(t)))}const Pc=X({is(e){return e.kind===`OnDuplicateKeyNode`},create(e){return X({kind:`OnDuplicateKeyNode`,updates:e})}});var Fc=class{insertId;numInsertedOrUpdatedRows;constructor(e,t){this.insertId=e,this.numInsertedOrUpdatedRows=t}},Ic=class extends Error{node;constructor(e){super(`no result`),this.node=e}};function Lc(e){return Object.prototype.hasOwnProperty.call(e,`prototype`)}const Rc=X({is(e){return e.kind===`OnConflictNode`},create(){return X({kind:`OnConflictNode`})},cloneWith(e,t){return X({...e,...t})},cloneWithIndexWhere(e,t){return X({...e,indexWhere:e.indexWhere?lc.cloneWithOperation(e.indexWhere,`And`,t):lc.create(t)})},cloneWithIndexOrWhere(e,t){return X({...e,indexWhere:e.indexWhere?lc.cloneWithOperation(e.indexWhere,`Or`,t):lc.create(t)})},cloneWithUpdateWhere(e,t){return X({...e,updateWhere:e.updateWhere?lc.cloneWithOperation(e.updateWhere,`And`,t):lc.create(t)})},cloneWithUpdateOrWhere(e,t){return X({...e,updateWhere:e.updateWhere?lc.cloneWithOperation(e.updateWhere,`Or`,t):lc.create(t)})},cloneWithoutIndexWhere(e){return X({...e,indexWhere:void 0})},cloneWithoutUpdateWhere(e){return X({...e,updateWhere:void 0})}});var zc=class e{#e;constructor(e){this.#e=X(e)}column(t){let n=is.create(t);return new e({...this.#e,onConflictNode:Rc.cloneWith(this.#e.onConflictNode,{columns:this.#e.onConflictNode.columns?X([...this.#e.onConflictNode.columns,n]):X([n])})})}columns(t){let n=t.map(is.create);return new e({...this.#e,onConflictNode:Rc.cloneWith(this.#e.onConflictNode,{columns:this.#e.onConflictNode.columns?X([...this.#e.onConflictNode.columns,...n]):X(n)})})}constraint(t){return new e({...this.#e,onConflictNode:Rc.cloneWith(this.#e.onConflictNode,{constraint:To.create(t)})})}expression(t){return new e({...this.#e,onConflictNode:Rc.cloneWith(this.#e.onConflictNode,{indexExpression:t.toOperationNode()})})}where(...t){return new e({...this.#e,onConflictNode:Rc.cloneWithIndexWhere(this.#e.onConflictNode,Us(t))})}whereRef(t,n,r){return new e({...this.#e,onConflictNode:Rc.cloneWithIndexWhere(this.#e.onConflictNode,Gs(t,n,r))})}clearWhere(){return new e({...this.#e,onConflictNode:Rc.cloneWithoutIndexWhere(this.#e.onConflictNode)})}doNothing(){return new Bc({...this.#e,onConflictNode:Rc.cloneWith(this.#e.onConflictNode,{doNothing:!0})})}doUpdateSet(e){return new Vc({...this.#e,onConflictNode:Rc.cloneWith(this.#e.onConflictNode,{updates:Nc(e)})})}$call(e){return e(this)}},Bc=class{#e;constructor(e){this.#e=X(e)}toOperationNode(){return this.#e.onConflictNode}},Vc=class e{#e;constructor(e){this.#e=X(e)}where(...t){return new e({...this.#e,onConflictNode:Rc.cloneWithUpdateWhere(this.#e.onConflictNode,Us(t))})}whereRef(t,n,r){return new e({...this.#e,onConflictNode:Rc.cloneWithUpdateWhere(this.#e.onConflictNode,Gs(t,n,r))})}clearWhere(){return new e({...this.#e,onConflictNode:Rc.cloneWithoutUpdateWhere(this.#e.onConflictNode)})}$call(e){return e(this)}toOperationNode(){return this.#e.onConflictNode}};const Hc=X({is(e){return e.kind===`TopNode`},create(e,t){return X({kind:`TopNode`,expression:e,modifiers:t})}});function Uc(e,t){if(!po(e)&&!_o(e))throw Error(`Invalid top expression: ${e}`);if(!uo(t)&&!Wc(t))throw Error(`Invalid top modifiers: ${t}`);return Hc.create(e,t)}function Wc(e){return e===`percent`||e===`with ties`||e===`percent with ties`}const Gc=X({is(e){return e.kind===`OrActionNode`},create(e){return X({kind:`OrActionNode`,action:e})}});var Kc=class e{#e;constructor(e){this.#e=X(e)}values(t){let[n,r]=Dc(t);return new e({...this.#e,queryNode:ic.cloneWith(this.#e.queryNode,{columns:n,values:r})})}columns(t){return new e({...this.#e,queryNode:ic.cloneWith(this.#e.queryNode,{columns:X(t.map(is.create))})})}expression(t){return new e({...this.#e,queryNode:ic.cloneWith(this.#e.queryNode,{values:Pu(t)})})}defaultValues(){return new e({...this.#e,queryNode:ic.cloneWith(this.#e.queryNode,{defaultValues:!0})})}modifyEnd(t){return new e({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,t.toOperationNode())})}ignore(){return new e({...this.#e,queryNode:ic.cloneWith(this.#e.queryNode,{orAction:Gc.create(`ignore`)})})}orIgnore(){return new e({...this.#e,queryNode:ic.cloneWith(this.#e.queryNode,{orAction:Gc.create(`ignore`)})})}orAbort(){return new e({...this.#e,queryNode:ic.cloneWith(this.#e.queryNode,{orAction:Gc.create(`abort`)})})}orFail(){return new e({...this.#e,queryNode:ic.cloneWith(this.#e.queryNode,{orAction:Gc.create(`fail`)})})}orReplace(){return new e({...this.#e,queryNode:ic.cloneWith(this.#e.queryNode,{orAction:Gc.create(`replace`)})})}orRollback(){return new e({...this.#e,queryNode:ic.cloneWith(this.#e.queryNode,{orAction:Gc.create(`rollback`)})})}top(t,n){return new e({...this.#e,queryNode:Z.cloneWithTop(this.#e.queryNode,Uc(t,n))})}onConflict(t){return new e({...this.#e,queryNode:ic.cloneWith(this.#e.queryNode,{onConflict:t(new zc({onConflictNode:Rc.create()})).toOperationNode()})})}onDuplicateKeyUpdate(t){return new e({...this.#e,queryNode:ic.cloneWith(this.#e.queryNode,{onDuplicateKey:Pc.create(Nc(t))})})}returning(t){return new e({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,xc(t))})}returningAll(){return new e({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,Cc())})}output(t){return new e({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,xc(t))})}outputAll(t){return new e({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,Cc(t))})}clearReturning(){return new e({...this.#e,queryNode:Z.cloneWithoutReturning(this.#e.queryNode)})}$call(e){return e(this)}$if(t,n){return t?n(this):new e({...this.#e})}$castTo(){return new e(this.#e)}$narrowType(){return new e(this.#e)}$assertType(){return new e(this.#e)}withPlugin(t){return new e({...this.#e,executor:this.#e.executor.withPlugin(t)})}toOperationNode(){return this.#e.executor.transformQuery(this.#e.queryNode,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){let t=this.compile(),n=await this.#e.executor.executeQuery(t,e),{adapter:r}=this.#e.executor,i=t.query;return i.returning&&r.supportsReturning||i.output&&r.supportsOutput?n.rows:[new Fc(n.insertId,n.numAffectedRows??BigInt(0))]}async executeTakeFirst(e){let[t]=await this.execute(e);return t}async executeTakeFirstOrThrow(e){typeof e==`function`&&(e={errorConstructor:e});let t=await this.executeTakeFirst(e);if(t===void 0){let t=e?.errorConstructor??Ic;throw Lc(t)?new t(this.toOperationNode()):t(this.toOperationNode())}return t}async*stream(e){typeof e!=`object`&&(e={chunkSize:e});let t=this.compile(),n=this.#e.executor.stream(t,e.chunkSize??100,e);for await(let e of n)yield*e.rows}async explain(t,n){return await new e({...this.#e,queryNode:Z.cloneWithExplain(this.#e.queryNode,t,n)}).execute()}},qc=class{numDeletedRows;constructor(e){this.numDeletedRows=e}};const Jc=X({is(e){return e.kind===`LimitNode`},create(e){return X({kind:`LimitNode`,limit:e})}});var Yc,Xc=class{#e;constructor(e){this.#e=X(e)}where(...e){return new Yc({...this.#e,queryNode:Z.cloneWithWhere(this.#e.queryNode,Us(e))})}whereRef(e,t,n){return new Yc({...this.#e,queryNode:Z.cloneWithWhere(this.#e.queryNode,Gs(e,t,n))})}clearWhere(){return new Yc({...this.#e,queryNode:Z.cloneWithoutWhere(this.#e.queryNode)})}top(e,t){return new Yc({...this.#e,queryNode:Z.cloneWithTop(this.#e.queryNode,Uc(e,t))})}using(e){return new Yc({...this.#e,queryNode:cc.cloneWithUsing(this.#e.queryNode,Bu(e))})}innerJoin(...e){return this.#t(`InnerJoin`,e)}leftJoin(...e){return this.#t(`LeftJoin`,e)}rightJoin(...e){return this.#t(`RightJoin`,e)}fullJoin(...e){return this.#t(`FullJoin`,e)}#t(e,t){return new Yc({...this.#e,queryNode:Z.cloneWithJoin(this.#e.queryNode,Ul(e,t))})}returning(e){return new Yc({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,xc(e))})}returningAll(e){return new Yc({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,Cc(e))})}output(e){return new Yc({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,xc(e))})}outputAll(e){return new Yc({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,Cc(e))})}clearReturning(){return new Yc({...this.#e,queryNode:Z.cloneWithoutReturning(this.#e.queryNode)})}clearLimit(){return new Yc({...this.#e,queryNode:cc.cloneWithoutLimit(this.#e.queryNode)})}orderBy(...e){return new Yc({...this.#e,queryNode:Z.cloneWithOrderByItems(this.#e.queryNode,gs(e))})}clearOrderBy(){return new Yc({...this.#e,queryNode:Z.cloneWithoutOrderBy(this.#e.queryNode)})}limit(e){return new Yc({...this.#e,queryNode:cc.cloneWithLimit(this.#e.queryNode,Jc.create(Rs(e)))})}modifyEnd(e){return new Yc({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,e.toOperationNode())})}$call(e){return e(this)}$if(e,t){return e?t(this):new Yc({...this.#e})}$castTo(){return new Yc(this.#e)}$narrowType(){return new Yc(this.#e)}$assertType(){return new Yc(this.#e)}withPlugin(e){return new Yc({...this.#e,executor:this.#e.executor.withPlugin(e)})}toOperationNode(){return this.#e.executor.transformQuery(this.#e.queryNode,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){let t=this.compile(),n=await this.#e.executor.executeQuery(t,e),{adapter:r}=this.#e.executor,i=t.query;return i.returning&&r.supportsReturning||i.output&&r.supportsOutput?n.rows:[new qc(n.numAffectedRows??BigInt(0))]}async executeTakeFirst(e){let[t]=await this.execute(e);return t}async executeTakeFirstOrThrow(e){typeof e==`function`&&(e={errorConstructor:e});let t=await this.executeTakeFirst(e);if(t===void 0){let t=e?.errorConstructor??Ic;throw Lc(t)?new t(this.toOperationNode()):t(this.toOperationNode())}return t}async*stream(e){typeof e!=`object`&&(e={chunkSize:e});let t=this.compile(),n=this.#e.executor.stream(t,e.chunkSize??100,e);for await(let e of n)yield*e.rows}async explain(e,t){return await new Yc({...this.#e,queryNode:Z.cloneWithExplain(this.#e.queryNode,e,t)}).execute()}};Yc=Xc;var Zc=class{numUpdatedRows;numChangedRows;constructor(e,t){this.numUpdatedRows=e,this.numChangedRows=t}},Qc,$c=class{#e;constructor(e){this.#e=X(e)}where(...e){return new Qc({...this.#e,queryNode:Z.cloneWithWhere(this.#e.queryNode,Us(e))})}whereRef(e,t,n){return new Qc({...this.#e,queryNode:Z.cloneWithWhere(this.#e.queryNode,Gs(e,t,n))})}clearWhere(){return new Qc({...this.#e,queryNode:Z.cloneWithoutWhere(this.#e.queryNode)})}top(e,t){return new Qc({...this.#e,queryNode:Z.cloneWithTop(this.#e.queryNode,Uc(e,t))})}from(e){return new Qc({...this.#e,queryNode:oc.cloneWithFromItems(this.#e.queryNode,Bu(e))})}innerJoin(...e){return this.#t(`InnerJoin`,e)}leftJoin(...e){return this.#t(`LeftJoin`,e)}rightJoin(...e){return this.#t(`RightJoin`,e)}fullJoin(...e){return this.#t(`FullJoin`,e)}#t(e,t){return new Qc({...this.#e,queryNode:Z.cloneWithJoin(this.#e.queryNode,Ul(e,t))})}orderBy(...e){return new Qc({...this.#e,queryNode:Z.cloneWithOrderByItems(this.#e.queryNode,gs(e))})}clearOrderBy(){return new Qc({...this.#e,queryNode:Z.cloneWithoutOrderBy(this.#e.queryNode)})}limit(e){return new Qc({...this.#e,queryNode:oc.cloneWithLimit(this.#e.queryNode,Jc.create(Rs(e)))})}set(...e){return new Qc({...this.#e,queryNode:oc.cloneWithUpdates(this.#e.queryNode,Mc(...e))})}returning(e){return new Qc({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,xc(e))})}returningAll(e){return new Qc({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,Cc(e))})}output(e){return new Qc({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,xc(e))})}outputAll(e){return new Qc({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,Cc(e))})}modifyEnd(e){return new Qc({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,e.toOperationNode())})}clearReturning(){return new Qc({...this.#e,queryNode:Z.cloneWithoutReturning(this.#e.queryNode)})}$call(e){return e(this)}$if(e,t){return e?t(this):new Qc({...this.#e})}$castTo(){return new Qc(this.#e)}$narrowType(){return new Qc(this.#e)}$assertType(){return new Qc(this.#e)}withPlugin(e){return new Qc({...this.#e,executor:this.#e.executor.withPlugin(e)})}toOperationNode(){return this.#e.executor.transformQuery(this.#e.queryNode,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){let t=this.compile(),n=await this.#e.executor.executeQuery(t,e),{adapter:r}=this.#e.executor,i=t.query;return i.returning&&r.supportsReturning||i.output&&r.supportsOutput?n.rows:[new Zc(n.numAffectedRows??BigInt(0),n.numChangedRows)]}async executeTakeFirst(e){let[t]=await this.execute(e);return t}async executeTakeFirstOrThrow(e){typeof e==`function`&&(e={errorConstructor:e});let t=await this.executeTakeFirst(e);if(t===void 0){let t=e?.errorConstructor??Ic;throw Lc(t)?new t(this.toOperationNode()):t(this.toOperationNode())}return t}async*stream(e){typeof e!=`object`&&(e={chunkSize:e});let t=this.compile(),n=this.#e.executor.stream(t,e.chunkSize??100,e);for await(let e of n)yield*e.rows}async explain(e,t){return await new Qc({...this.#e,queryNode:Z.cloneWithExplain(this.#e.queryNode,e,t)}).execute()}};Qc=$c;const el=X({is(e){return e.kind===`CommonTableExpressionNameNode`},create(e,t){return X({kind:`CommonTableExpressionNameNode`,table:Fo.create(e),columns:t?X(t.map(is.create)):void 0})}}),tl=X({is(e){return e.kind===`CommonTableExpressionNode`},create(e,t){return X({kind:`CommonTableExpressionNode`,name:e,expression:t})},cloneWith(e,t){return X({...e,...t})}});var nl=class e{#e;constructor(e){this.#e=X(e)}materialized(){return new e({...this.#e,node:tl.cloneWith(this.#e.node,{materialized:!0})})}notMaterialized(){return new e({...this.#e,node:tl.cloneWith(this.#e.node,{materialized:!1})})}toOperationNode(){return this.#e.node}};function rl(e,t){let n=Io(t)?t.toOperationNode():t(Bl()).toOperationNode();return vo(e)?e(il(n)).toOperationNode():tl.create(al(e),n)}function il(e){return t=>new nl({node:tl.create(al(t),e)})}function al(e){if(e.includes(`(`)){let t=e.split(/[\(\)]/),n=t[0],r=t[1].split(`,`).map(e=>e.trim());return el.create(n,r)}return el.create(e)}const ol=X({is(e){return e.kind===`WithNode`},create(e,t){return X({kind:`WithNode`,expressions:X([e]),...t})},cloneWithExpression(e,t){return X({...e,expressions:X([...e.expressions,t])})}}),sl=`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`.split(``);function cl(e){let t=``;for(let n=0;n<e;++n)t+=ll();return t}function ll(){return sl[~~(Math.random()*sl.length)]}function Q(){return new ul}var ul=class{#e;get queryId(){return this.#e===void 0&&(this.#e=cl(8)),this.#e}},dl=class{nodeStack=[];#e=X({AliasNode:this.transformAlias.bind(this),ColumnNode:this.transformColumn.bind(this),IdentifierNode:this.transformIdentifier.bind(this),SchemableIdentifierNode:this.transformSchemableIdentifier.bind(this),RawNode:this.transformRaw.bind(this),ReferenceNode:this.transformReference.bind(this),SelectQueryNode:this.transformSelectQuery.bind(this),SelectionNode:this.transformSelection.bind(this),TableNode:this.transformTable.bind(this),FromNode:this.transformFrom.bind(this),SelectAllNode:this.transformSelectAll.bind(this),AndNode:this.transformAnd.bind(this),OrNode:this.transformOr.bind(this),ValueNode:this.transformValue.bind(this),ValueListNode:this.transformValueList.bind(this),PrimitiveValueListNode:this.transformPrimitiveValueList.bind(this),ParensNode:this.transformParens.bind(this),JoinNode:this.transformJoin.bind(this),OperatorNode:this.transformOperator.bind(this),WhereNode:this.transformWhere.bind(this),InsertQueryNode:this.transformInsertQuery.bind(this),DeleteQueryNode:this.transformDeleteQuery.bind(this),ReturningNode:this.transformReturning.bind(this),CreateTableNode:this.transformCreateTable.bind(this),AddColumnNode:this.transformAddColumn.bind(this),ColumnDefinitionNode:this.transformColumnDefinition.bind(this),DropTableNode:this.transformDropTable.bind(this),DataTypeNode:this.transformDataType.bind(this),OrderByNode:this.transformOrderBy.bind(this),OrderByItemNode:this.transformOrderByItem.bind(this),GroupByNode:this.transformGroupBy.bind(this),GroupByItemNode:this.transformGroupByItem.bind(this),UpdateQueryNode:this.transformUpdateQuery.bind(this),ColumnUpdateNode:this.transformColumnUpdate.bind(this),LimitNode:this.transformLimit.bind(this),OffsetNode:this.transformOffset.bind(this),OnConflictNode:this.transformOnConflict.bind(this),OnDuplicateKeyNode:this.transformOnDuplicateKey.bind(this),CreateIndexNode:this.transformCreateIndex.bind(this),DropIndexNode:this.transformDropIndex.bind(this),ListNode:this.transformList.bind(this),PrimaryKeyConstraintNode:this.transformPrimaryKeyConstraint.bind(this),UniqueConstraintNode:this.transformUniqueConstraint.bind(this),ReferencesNode:this.transformReferences.bind(this),CheckConstraintNode:this.transformCheckConstraint.bind(this),WithNode:this.transformWith.bind(this),CommonTableExpressionNode:this.transformCommonTableExpression.bind(this),CommonTableExpressionNameNode:this.transformCommonTableExpressionName.bind(this),HavingNode:this.transformHaving.bind(this),CreateSchemaNode:this.transformCreateSchema.bind(this),DropSchemaNode:this.transformDropSchema.bind(this),AlterTableNode:this.transformAlterTable.bind(this),DropColumnNode:this.transformDropColumn.bind(this),RenameColumnNode:this.transformRenameColumn.bind(this),AlterColumnNode:this.transformAlterColumn.bind(this),ModifyColumnNode:this.transformModifyColumn.bind(this),AddConstraintNode:this.transformAddConstraint.bind(this),DropConstraintNode:this.transformDropConstraint.bind(this),RenameConstraintNode:this.transformRenameConstraint.bind(this),ForeignKeyConstraintNode:this.transformForeignKeyConstraint.bind(this),CreateViewNode:this.transformCreateView.bind(this),RefreshMaterializedViewNode:this.transformRefreshMaterializedView.bind(this),DropViewNode:this.transformDropView.bind(this),GeneratedNode:this.transformGenerated.bind(this),DefaultValueNode:this.transformDefaultValue.bind(this),OnNode:this.transformOn.bind(this),ValuesNode:this.transformValues.bind(this),SelectModifierNode:this.transformSelectModifier.bind(this),CreateTypeNode:this.transformCreateType.bind(this),DropTypeNode:this.transformDropType.bind(this),ExplainNode:this.transformExplain.bind(this),DefaultInsertValueNode:this.transformDefaultInsertValue.bind(this),AggregateFunctionNode:this.transformAggregateFunction.bind(this),OverNode:this.transformOver.bind(this),PartitionByNode:this.transformPartitionBy.bind(this),PartitionByItemNode:this.transformPartitionByItem.bind(this),SetOperationNode:this.transformSetOperation.bind(this),BinaryOperationNode:this.transformBinaryOperation.bind(this),UnaryOperationNode:this.transformUnaryOperation.bind(this),UsingNode:this.transformUsing.bind(this),FunctionNode:this.transformFunction.bind(this),CaseNode:this.transformCase.bind(this),WhenNode:this.transformWhen.bind(this),JSONReferenceNode:this.transformJSONReference.bind(this),JSONPathNode:this.transformJSONPath.bind(this),JSONPathLegNode:this.transformJSONPathLeg.bind(this),JSONOperatorChainNode:this.transformJSONOperatorChain.bind(this),TupleNode:this.transformTuple.bind(this),MergeQueryNode:this.transformMergeQuery.bind(this),MatchedNode:this.transformMatched.bind(this),AddIndexNode:this.transformAddIndex.bind(this),CastNode:this.transformCast.bind(this),FetchNode:this.transformFetch.bind(this),TopNode:this.transformTop.bind(this),OutputNode:this.transformOutput.bind(this),OrActionNode:this.transformOrAction.bind(this),CollateNode:this.transformCollate.bind(this),AlterTypeNode:this.transformAlterType.bind(this),AddValueNode:this.transformAddValue.bind(this),RenameValueNode:this.transformRenameValue.bind(this)});transformNode(e,t){if(!e)return e;this.nodeStack.push(e);let n=this.transformNodeImpl(e,t);return this.nodeStack.pop(),X(n)}transformNodeImpl(e,t){return this.#e[e.kind](e,t)}transformNodeList(e,t){return e&&X(e.map(e=>this.transformNode(e,t)))}transformSelectQuery(e,t){return{kind:`SelectQueryNode`,from:this.transformNode(e.from,t),selections:this.transformNodeList(e.selections,t),distinctOn:this.transformNodeList(e.distinctOn,t),joins:this.transformNodeList(e.joins,t),groupBy:this.transformNode(e.groupBy,t),orderBy:this.transformNode(e.orderBy,t),where:this.transformNode(e.where,t),frontModifiers:this.transformNodeList(e.frontModifiers,t),endModifiers:this.transformNodeList(e.endModifiers,t),limit:this.transformNode(e.limit,t),offset:this.transformNode(e.offset,t),with:this.transformNode(e.with,t),having:this.transformNode(e.having,t),explain:this.transformNode(e.explain,t),setOperations:this.transformNodeList(e.setOperations,t),fetch:this.transformNode(e.fetch,t),top:this.transformNode(e.top,t)}}transformSelection(e,t){return{kind:`SelectionNode`,selection:this.transformNode(e.selection,t)}}transformColumn(e,t){return{kind:`ColumnNode`,column:this.transformNode(e.column,t)}}transformAlias(e,t){return{kind:`AliasNode`,node:this.transformNode(e.node,t),alias:this.transformNode(e.alias,t)}}transformTable(e,t){return{kind:`TableNode`,table:this.transformNode(e.table,t)}}transformFrom(e,t){return{kind:`FromNode`,froms:this.transformNodeList(e.froms,t)}}transformReference(e,t){return{kind:`ReferenceNode`,column:this.transformNode(e.column,t),table:this.transformNode(e.table,t)}}transformAnd(e,t){return{kind:`AndNode`,left:this.transformNode(e.left,t),right:this.transformNode(e.right,t)}}transformOr(e,t){return{kind:`OrNode`,left:this.transformNode(e.left,t),right:this.transformNode(e.right,t)}}transformValueList(e,t){return{kind:`ValueListNode`,values:this.transformNodeList(e.values,t)}}transformParens(e,t){return{kind:`ParensNode`,node:this.transformNode(e.node,t)}}transformJoin(e,t){return{kind:`JoinNode`,joinType:e.joinType,table:this.transformNode(e.table,t),on:this.transformNode(e.on,t)}}transformRaw(e,t){return{kind:`RawNode`,sqlFragments:X([...e.sqlFragments]),parameters:this.transformNodeList(e.parameters,t)}}transformWhere(e,t){return{kind:`WhereNode`,where:this.transformNode(e.where,t)}}transformInsertQuery(e,t){return{kind:`InsertQueryNode`,into:this.transformNode(e.into,t),columns:this.transformNodeList(e.columns,t),values:this.transformNode(e.values,t),returning:this.transformNode(e.returning,t),onConflict:this.transformNode(e.onConflict,t),onDuplicateKey:this.transformNode(e.onDuplicateKey,t),endModifiers:this.transformNodeList(e.endModifiers,t),with:this.transformNode(e.with,t),orAction:this.transformNode(e.orAction,t),replace:e.replace,explain:this.transformNode(e.explain,t),defaultValues:e.defaultValues,top:this.transformNode(e.top,t),output:this.transformNode(e.output,t)}}transformValues(e,t){return{kind:`ValuesNode`,values:this.transformNodeList(e.values,t)}}transformDeleteQuery(e,t){return{kind:`DeleteQueryNode`,from:this.transformNode(e.from,t),using:this.transformNode(e.using,t),joins:this.transformNodeList(e.joins,t),where:this.transformNode(e.where,t),returning:this.transformNode(e.returning,t),endModifiers:this.transformNodeList(e.endModifiers,t),with:this.transformNode(e.with,t),orderBy:this.transformNode(e.orderBy,t),limit:this.transformNode(e.limit,t),explain:this.transformNode(e.explain,t),top:this.transformNode(e.top,t),output:this.transformNode(e.output,t)}}transformReturning(e,t){return{kind:`ReturningNode`,selections:this.transformNodeList(e.selections,t)}}transformCreateTable(e,t){return{kind:`CreateTableNode`,table:this.transformNode(e.table,t),columns:this.transformNodeList(e.columns,t),constraints:this.transformNodeList(e.constraints,t),indexes:this.transformNodeList(e.indexes,t),temporary:e.temporary,ifNotExists:e.ifNotExists,onCommit:e.onCommit,frontModifiers:this.transformNodeList(e.frontModifiers,t),endModifiers:this.transformNodeList(e.endModifiers,t),selectQuery:this.transformNode(e.selectQuery,t)}}transformColumnDefinition(e,t){return{kind:`ColumnDefinitionNode`,column:this.transformNode(e.column,t),dataType:this.transformNode(e.dataType,t),references:this.transformNode(e.references,t),primaryKey:e.primaryKey,autoIncrement:e.autoIncrement,unique:e.unique,notNull:e.notNull,unsigned:e.unsigned,defaultTo:this.transformNode(e.defaultTo,t),check:this.transformNode(e.check,t),generated:this.transformNode(e.generated,t),frontModifiers:this.transformNodeList(e.frontModifiers,t),endModifiers:this.transformNodeList(e.endModifiers,t),nullsNotDistinct:e.nullsNotDistinct,identity:e.identity,ifNotExists:e.ifNotExists}}transformAddColumn(e,t){return{kind:`AddColumnNode`,column:this.transformNode(e.column,t)}}transformDropTable(e,t){return{kind:`DropTableNode`,table:this.transformNode(e.table,t),ifExists:e.ifExists,cascade:e.cascade,temporary:e.temporary}}transformOrderBy(e,t){return{kind:`OrderByNode`,items:this.transformNodeList(e.items,t)}}transformOrderByItem(e,t){return{kind:`OrderByItemNode`,orderBy:this.transformNode(e.orderBy,t),direction:this.transformNode(e.direction,t),collation:this.transformNode(e.collation,t),nulls:e.nulls}}transformGroupBy(e,t){return{kind:`GroupByNode`,items:this.transformNodeList(e.items,t)}}transformGroupByItem(e,t){return{kind:`GroupByItemNode`,groupBy:this.transformNode(e.groupBy,t)}}transformUpdateQuery(e,t){return{kind:`UpdateQueryNode`,table:this.transformNode(e.table,t),from:this.transformNode(e.from,t),joins:this.transformNodeList(e.joins,t),where:this.transformNode(e.where,t),updates:this.transformNodeList(e.updates,t),returning:this.transformNode(e.returning,t),endModifiers:this.transformNodeList(e.endModifiers,t),with:this.transformNode(e.with,t),explain:this.transformNode(e.explain,t),limit:this.transformNode(e.limit,t),top:this.transformNode(e.top,t),output:this.transformNode(e.output,t),orderBy:this.transformNode(e.orderBy,t)}}transformColumnUpdate(e,t){return{kind:`ColumnUpdateNode`,column:this.transformNode(e.column,t),value:this.transformNode(e.value,t)}}transformLimit(e,t){return{kind:`LimitNode`,limit:this.transformNode(e.limit,t)}}transformOffset(e,t){return{kind:`OffsetNode`,offset:this.transformNode(e.offset,t)}}transformOnConflict(e,t){return{kind:`OnConflictNode`,columns:this.transformNodeList(e.columns,t),constraint:this.transformNode(e.constraint,t),indexExpression:this.transformNode(e.indexExpression,t),indexWhere:this.transformNode(e.indexWhere,t),updates:this.transformNodeList(e.updates,t),updateWhere:this.transformNode(e.updateWhere,t),doNothing:e.doNothing}}transformOnDuplicateKey(e,t){return{kind:`OnDuplicateKeyNode`,updates:this.transformNodeList(e.updates,t)}}transformCreateIndex(e,t){return{kind:`CreateIndexNode`,name:this.transformNode(e.name,t),table:this.transformNode(e.table,t),columns:this.transformNodeList(e.columns,t),unique:e.unique,using:this.transformNode(e.using,t),ifNotExists:e.ifNotExists,where:this.transformNode(e.where,t),nullsNotDistinct:e.nullsNotDistinct}}transformList(e,t){return{kind:`ListNode`,items:this.transformNodeList(e.items,t)}}transformDropIndex(e,t){return{kind:`DropIndexNode`,name:this.transformNode(e.name,t),table:this.transformNode(e.table,t),ifExists:e.ifExists,cascade:e.cascade}}transformPrimaryKeyConstraint(e,t){return{kind:`PrimaryKeyConstraintNode`,columns:this.transformNodeList(e.columns,t),name:this.transformNode(e.name,t),deferrable:e.deferrable,initiallyDeferred:e.initiallyDeferred}}transformUniqueConstraint(e,t){return{kind:`UniqueConstraintNode`,columns:this.transformNodeList(e.columns,t),name:this.transformNode(e.name,t),nullsNotDistinct:e.nullsNotDistinct,deferrable:e.deferrable,initiallyDeferred:e.initiallyDeferred}}transformForeignKeyConstraint(e,t){return{kind:`ForeignKeyConstraintNode`,columns:this.transformNodeList(e.columns,t),references:this.transformNode(e.references,t),name:this.transformNode(e.name,t),onDelete:e.onDelete,onUpdate:e.onUpdate,deferrable:e.deferrable,initiallyDeferred:e.initiallyDeferred}}transformSetOperation(e,t){return{kind:`SetOperationNode`,operator:e.operator,expression:this.transformNode(e.expression,t),all:e.all}}transformReferences(e,t){return{kind:`ReferencesNode`,table:this.transformNode(e.table,t),columns:this.transformNodeList(e.columns,t),onDelete:e.onDelete,onUpdate:e.onUpdate}}transformCheckConstraint(e,t){return{kind:`CheckConstraintNode`,expression:this.transformNode(e.expression,t),name:this.transformNode(e.name,t)}}transformWith(e,t){return{kind:`WithNode`,expressions:this.transformNodeList(e.expressions,t),recursive:e.recursive}}transformCommonTableExpression(e,t){return{kind:`CommonTableExpressionNode`,name:this.transformNode(e.name,t),materialized:e.materialized,expression:this.transformNode(e.expression,t)}}transformCommonTableExpressionName(e,t){return{kind:`CommonTableExpressionNameNode`,table:this.transformNode(e.table,t),columns:this.transformNodeList(e.columns,t)}}transformHaving(e,t){return{kind:`HavingNode`,having:this.transformNode(e.having,t)}}transformCreateSchema(e,t){return{kind:`CreateSchemaNode`,schema:this.transformNode(e.schema,t),ifNotExists:e.ifNotExists}}transformDropSchema(e,t){return{kind:`DropSchemaNode`,schema:this.transformNode(e.schema,t),ifExists:e.ifExists,cascade:e.cascade}}transformAlterTable(e,t){return{kind:`AlterTableNode`,table:this.transformNode(e.table,t),renameTo:this.transformNode(e.renameTo,t),setSchema:this.transformNode(e.setSchema,t),columnAlterations:this.transformNodeList(e.columnAlterations,t),addConstraint:this.transformNode(e.addConstraint,t),dropConstraint:this.transformNode(e.dropConstraint,t),renameConstraint:this.transformNode(e.renameConstraint,t),addIndex:this.transformNode(e.addIndex,t),dropIndex:this.transformNode(e.dropIndex,t)}}transformDropColumn(e,t){return{kind:`DropColumnNode`,column:this.transformNode(e.column,t),ifExists:e.ifExists}}transformRenameColumn(e,t){return{kind:`RenameColumnNode`,column:this.transformNode(e.column,t),renameTo:this.transformNode(e.renameTo,t)}}transformAlterColumn(e,t){return{kind:`AlterColumnNode`,column:this.transformNode(e.column,t),dataType:this.transformNode(e.dataType,t),dataTypeExpression:this.transformNode(e.dataTypeExpression,t),setDefault:this.transformNode(e.setDefault,t),dropDefault:e.dropDefault,setNotNull:e.setNotNull,dropNotNull:e.dropNotNull}}transformModifyColumn(e,t){return{kind:`ModifyColumnNode`,column:this.transformNode(e.column,t)}}transformAddConstraint(e,t){return{kind:`AddConstraintNode`,constraint:this.transformNode(e.constraint,t)}}transformDropConstraint(e,t){return{kind:`DropConstraintNode`,constraintName:this.transformNode(e.constraintName,t),ifExists:e.ifExists,modifier:e.modifier}}transformRenameConstraint(e,t){return{kind:`RenameConstraintNode`,oldName:this.transformNode(e.oldName,t),newName:this.transformNode(e.newName,t)}}transformCreateView(e,t){return{kind:`CreateViewNode`,name:this.transformNode(e.name,t),temporary:e.temporary,orReplace:e.orReplace,ifNotExists:e.ifNotExists,materialized:e.materialized,columns:this.transformNodeList(e.columns,t),as:this.transformNode(e.as,t)}}transformRefreshMaterializedView(e,t){return{kind:`RefreshMaterializedViewNode`,name:this.transformNode(e.name,t),concurrently:e.concurrently,withNoData:e.withNoData}}transformDropView(e,t){return{kind:`DropViewNode`,name:this.transformNode(e.name,t),ifExists:e.ifExists,materialized:e.materialized,cascade:e.cascade}}transformGenerated(e,t){return{kind:`GeneratedNode`,byDefault:e.byDefault,always:e.always,identity:e.identity,stored:e.stored,expression:this.transformNode(e.expression,t)}}transformDefaultValue(e,t){return{kind:`DefaultValueNode`,defaultValue:this.transformNode(e.defaultValue,t)}}transformOn(e,t){return{kind:`OnNode`,on:this.transformNode(e.on,t)}}transformSelectModifier(e,t){return{kind:`SelectModifierNode`,modifier:e.modifier,rawModifier:this.transformNode(e.rawModifier,t),of:this.transformNodeList(e.of,t)}}transformCreateType(e,t){return{kind:`CreateTypeNode`,name:this.transformNode(e.name,t),enum:this.transformNode(e.enum,t)}}transformDropType(e,t){return{kind:`DropTypeNode`,name:this.transformNode(e.name,t),additionalNames:this.transformNodeList(e.additionalNames,t),cascade:e.cascade,ifExists:e.ifExists}}transformExplain(e,t){return{kind:`ExplainNode`,format:e.format,options:this.transformNode(e.options,t)}}transformSchemableIdentifier(e,t){return{kind:`SchemableIdentifierNode`,schema:this.transformNode(e.schema,t),identifier:this.transformNode(e.identifier,t)}}transformAggregateFunction(e,t){return{kind:`AggregateFunctionNode`,func:e.func,aggregated:this.transformNodeList(e.aggregated,t),distinct:e.distinct,orderBy:this.transformNode(e.orderBy,t),withinGroup:this.transformNode(e.withinGroup,t),filter:this.transformNode(e.filter,t),over:this.transformNode(e.over,t)}}transformOver(e,t){return{kind:`OverNode`,orderBy:this.transformNode(e.orderBy,t),partitionBy:this.transformNode(e.partitionBy,t)}}transformPartitionBy(e,t){return{kind:`PartitionByNode`,items:this.transformNodeList(e.items,t)}}transformPartitionByItem(e,t){return{kind:`PartitionByItemNode`,partitionBy:this.transformNode(e.partitionBy,t)}}transformBinaryOperation(e,t){return{kind:`BinaryOperationNode`,leftOperand:this.transformNode(e.leftOperand,t),operator:this.transformNode(e.operator,t),rightOperand:this.transformNode(e.rightOperand,t)}}transformUnaryOperation(e,t){return{kind:`UnaryOperationNode`,operator:this.transformNode(e.operator,t),operand:this.transformNode(e.operand,t)}}transformUsing(e,t){return{kind:`UsingNode`,tables:this.transformNodeList(e.tables,t)}}transformFunction(e,t){return{kind:`FunctionNode`,func:e.func,arguments:this.transformNodeList(e.arguments,t)}}transformCase(e,t){return{kind:`CaseNode`,value:this.transformNode(e.value,t),when:this.transformNodeList(e.when,t),else:this.transformNode(e.else,t),isStatement:e.isStatement}}transformWhen(e,t){return{kind:`WhenNode`,condition:this.transformNode(e.condition,t),result:this.transformNode(e.result,t)}}transformJSONReference(e,t){return{kind:`JSONReferenceNode`,reference:this.transformNode(e.reference,t),traversal:this.transformNode(e.traversal,t)}}transformJSONPath(e,t){return{kind:`JSONPathNode`,inOperator:this.transformNode(e.inOperator,t),pathLegs:this.transformNodeList(e.pathLegs,t)}}transformJSONPathLeg(e,t){return{kind:`JSONPathLegNode`,type:e.type,value:e.value}}transformJSONOperatorChain(e,t){return{kind:`JSONOperatorChainNode`,operator:this.transformNode(e.operator,t),values:this.transformNodeList(e.values,t)}}transformTuple(e,t){return{kind:`TupleNode`,values:this.transformNodeList(e.values,t)}}transformMergeQuery(e,t){return{kind:`MergeQueryNode`,into:this.transformNode(e.into,t),using:this.transformNode(e.using,t),whens:this.transformNodeList(e.whens,t),with:this.transformNode(e.with,t),top:this.transformNode(e.top,t),endModifiers:this.transformNodeList(e.endModifiers,t),output:this.transformNode(e.output,t),returning:this.transformNode(e.returning,t)}}transformMatched(e,t){return{kind:`MatchedNode`,not:e.not,bySource:e.bySource}}transformAddIndex(e,t){return{kind:`AddIndexNode`,name:this.transformNode(e.name,t),columns:this.transformNodeList(e.columns,t),unique:e.unique,using:this.transformNode(e.using,t),ifNotExists:e.ifNotExists}}transformCast(e,t){return{kind:`CastNode`,expression:this.transformNode(e.expression,t),dataType:this.transformNode(e.dataType,t)}}transformFetch(e,t){return{kind:`FetchNode`,rowCount:this.transformNode(e.rowCount,t),modifier:e.modifier}}transformTop(e,t){return{kind:`TopNode`,expression:e.expression,modifiers:e.modifiers}}transformOutput(e,t){return{kind:`OutputNode`,selections:this.transformNodeList(e.selections,t)}}transformAlterType(e,t){return{kind:`AlterTypeNode`,name:this.transformNode(e.name,t),addValue:this.transformNode(e.addValue,t),renameTo:this.transformNode(e.renameTo,t),renameValue:this.transformNode(e.renameValue,t),setSchema:this.transformNode(e.setSchema,t)}}transformAddValue(e,t){return{kind:`AddValueNode`,value:this.transformNode(e.value,t),ifNotExists:e.ifNotExists,isBefore:e.isBefore,neighborValue:this.transformNode(e.neighborValue,t)}}transformRenameValue(e,t){return{kind:`RenameValueNode`,oldValue:this.transformNode(e.oldValue,t),newValue:this.transformNode(e.newValue,t)}}transformDataType(e,t){return e}transformSelectAll(e,t){return e}transformIdentifier(e,t){return e}transformValue(e,t){return e}transformPrimitiveValueList(e,t){return e}transformOperator(e,t){return e}transformDefaultInsertValue(e,t){return e}transformOrAction(e,t){return e}transformCollate(e,t){return e}};function fl(e){return yo(e)&&fo(e.kind)}const pl={AlterTableNode:!0,AlterTypeNode:!0,CreateIndexNode:!0,CreateSchemaNode:!0,CreateTableNode:!0,CreateTypeNode:!0,CreateViewNode:!0,DeleteQueryNode:!0,DropIndexNode:!0,DropSchemaNode:!0,DropTableNode:!0,DropTypeNode:!0,RefreshMaterializedViewNode:!0,DropViewNode:!0,InsertQueryNode:!0,RawNode:!0,SelectQueryNode:!0,UpdateQueryNode:!0,MergeQueryNode:!0};function ml(e){return fl(e)&&pl[e.kind]===!0}const hl=X({json_agg:!0,to_json:!0});var gl=class extends dl{#e;#t=new Set;#n=new Set;constructor(e){super(),this.#e=e}transformNodeImpl(e,t){if(!ml(e))return super.transformNodeImpl(e,t);let n=this.#a(e);for(let e of n)this.#n.add(e);let r=this.#i(e);for(let e of r)this.#t.add(e);let i=super.transformNodeImpl(e,t);for(let e of r)this.#t.delete(e);for(let e of n)this.#n.delete(e);return i}transformSchemableIdentifier(e,t){let n=super.transformSchemableIdentifier(e,t);return n.schema||!this.#t.has(e.identifier.name)?n:{...n,schema:To.create(this.#e)}}transformReferences(e,t){let n=super.transformReferences(e,t);return n.table.table.schema?n:{...n,table:Fo.createWithSchema(this.#e,n.table.table.identifier.name)}}transformAggregateFunction(e,t){return{...super.transformAggregateFunction({...e,aggregated:[]},t),aggregated:this.#r(e,t,`aggregated`)}}transformFunction(e,t){return{...super.transformFunction({...e,arguments:[]},t),arguments:this.#r(e,t,`arguments`)}}transformSelectModifier(e,t){return{...super.transformSelectModifier({...e,of:void 0},t),of:e.of?.map(e=>Fo.is(e)&&!e.table.schema?{...e,table:this.transformIdentifier(e.table.identifier,t)}:this.transformNode(e,t))}}#r(e,t,n){return hl[e.func]?e[n].map(e=>!Fo.is(e)||e.table.schema?this.transformNode(e,t):{...e,table:this.transformIdentifier(e.table.identifier,t)}):this.transformNodeList(e[n],t)}#i(e){let t=new Set;if(`name`in e&&e.name&&Ao.is(e.name)&&this.#s(e.name,t),`from`in e&&e.from)for(let n of e.from.froms)this.#o(n,t);if(`into`in e&&e.into&&this.#o(e.into,t),`table`in e&&e.table&&this.#o(e.table,t),`joins`in e&&e.joins)for(let n of e.joins)this.#o(n.table,t);return`using`in e&&e.using&&(Uo.is(e.using)?this.#o(e.using.table,t):this.#o(e.using,t)),t}#a(e){let t=new Set;return`with`in e&&e.with&&this.#c(e.with,t),t}#o(e,t){if(Fo.is(e))return this.#s(e.table,t);if(Po.is(e)&&Fo.is(e.node))return this.#s(e.node.table,t);if(ac.is(e)){for(let n of e.items)this.#o(n,t);return}if(sc.is(e)){for(let n of e.tables)this.#o(n,t);return}}#s(e,t){let n=e.identifier.name;!this.#t.has(n)&&!this.#n.has(n)&&t.add(n)}#c(e,t){for(let n of e.expressions){let e=n.name.table.table.identifier.name;this.#n.has(e)||t.add(e)}}},_l=class{#e;constructor(e){this.#e=new gl(e)}transformQuery(e){return this.#e.transformNode(e.node,e.queryId)}async transformResult(e){return e.result}};const vl=X({is(e){return e.kind===`MatchedNode`},create(e,t=!1){return X({kind:`MatchedNode`,not:e,bySource:t})}});function yl(e,t,n){return fc.create(qs([vl.create(!e.isMatched,e.bySource),...t&&t.length>0?[t.length===3&&n?Gs(t[0],t[1],t[2]):Us(t)]:[]],`and`,!1))}function bl(e){return fo(e)?us.create([e],[]):Io(e)?e.toOperationNode():e}var xl=class{#e;#t;#n;constructor(){this.#e=new Promise((e,t)=>{this.#n=t,this.#t=e})}get promise(){return this.#e}resolve=e=>{this.#t?.(e),this.#t=this.#n=void 0};reject=e=>{this.#n?.(e),this.#n=this.#t=void 0}};async function Sl(e,t){let n=new xl,r=new xl;return e.provideConnection(async e=>(n.resolve(e),await r.promise),t).catch(e=>n.reject(e)),X({connection:await n.promise,release:r.resolve})}function Cl(e=`ignore query`,t,n){if(e!==`ignore query`){if(e===`cancel query`){let r=t.cancelQuery;return r||(n(),wl(e,t.killSession?`kill session`:void 0)),r.bind(t)}if(e===`kill session`){let r=t.killSession;return r||(n(),wl(e,t.cancelQuery?`cancel query`:void 0)),r.bind(t)}throw n(),Error(`Unexpected \`inflightQueryAbortStrategy\`: "${e}"`)}}function wl(e,t){throw Error(`This dialect doesn't support \`inflightQueryAbortStrategy\` "${e}". Use "ignore query"${t?` or "${t}"`:``} instead.`)}function Tl(e,t,n){e?.aborted&&(n?.(),El(e.reason,t))}function El(e,t){throw Al(e,t),e}const Dl={};async function Ol(e,t,n,r){if(!t)return e;Tl(t,`before ${n}`,r);let{promise:i,resolve:a}=new xl,o=()=>a(Dl);t.addEventListener(`abort`,o);try{Tl(t,`before ${n}`,r);let a=await Promise.race([e,i]);if(a!==Dl)return a;r?.(),El(t.reason,`during ${n}`)}finally{t.removeEventListener(`abort`,o),a(Dl)}}function kl(e){return t=>console.error(`\`${e}\` failed in the background after abortion: ${Co(t)}`)}function Al(e,t){typeof e==`object`&&e&&!Object.isFrozen(e)&&Object.defineProperty(e,"__kysely_timing__",{configurable:!0,enumerable:!1,value:t,writable:!1})}const jl=X([]);var Ml=class{#e;constructor(e=jl){this.#e=e}get plugins(){return this.#e}transformQuery(e,t){for(let n of this.#e){let r=n.transformQuery({node:e,queryId:t});if(r.kind===e.kind)e=r;else throw Error([`KyselyPlugin.transformQuery must return a node`,`of the same kind that was given to it.`,`The plugin was given a ${e.kind}`,`but it returned a ${r.kind}`].join(` `))}return e}async executeQuery(e,t){let{inflightQueryAbortStrategy:n=`ignore query`,signal:r}=t||{};if(!r){let n=await this.provideConnection(async t=>await t.executeQuery(e),t);return await this.#t(n,e.queryId)}Tl(r,`before query execution`),t=X({signal:r});let{connection:i,release:a}=await Sl(this,t),o=this.provideConnection.bind(this),{promise:s,resolve:c}=new xl,l=()=>c(Dl);r.addEventListener(`abort`,l,{once:!0});try{Tl(r,`before query execution`,a);let c=Cl(n,i,a);if(c&&i.collectSessionInfo){Tl(r,`before query execution`,a);let e=i.collectSessionInfo();await Promise.race([s,e]).catch(e=>{throw a(),e})===Dl&&(e.catch(kl(`collectSessionInfo`)).finally(a),El(r.reason,`before query execution`))}let l=i.executeQuery(e,t),u=await Promise.race([s,l]).catch(e=>{throw a(),e});u===Dl?(Promise.allSettled([l.catch(kl(`query`)),c?.(o).catch(kl(`inflightQueryAbortHandler`))]).finally(a),El(r.reason,`during query execution`)):a();let d=this.#t(u,e.queryId,t),f=await Promise.race([s,d]);return f===Dl&&(d.catch(kl(`plugins.transformResult`)),El(r.reason,`during result transformation`)),f}finally{c(Dl),r.removeEventListener(`abort`,l)}}async*stream(e,t,n){let{signal:r}=n||{};if(!r){let{connection:r,release:i}=await Sl(this);try{for await(let i of r.streamQuery(e,t))yield await this.#t(i,e.queryId,n)}finally{i()}return}n=X({signal:r}),Tl(r,`before connection acquisition`);let{connection:i,release:a}=await Sl(this,n),{promise:o,resolve:s}=new xl,c=()=>s(Dl);r.addEventListener(`abort`,c,{once:!0});let l,u;Tl(r,`before query streaming`,a);let{queryId:d}=e;try{for(l=i.streamQuery(e,t,n);;){Tl(r,`during query streaming`);let e=l.next(),t=await Promise.race([o,e]);if(t===Dl&&(u=e.catch(kl(`iterator.next`)),El(r.reason,`during query streaming`)),t.done)break;let i=this.#t(t.value,d,n),a=await Promise.race([o,i]);a===Dl&&(u=i.catch(kl(`plugins.transformResult`)),El(r.reason,`during result transformation`)),yield a}}finally{s(Dl),r.removeEventListener(`abort`,c);let e=(l?.return?.()||Promise.resolve()).finally(()=>u).finally(a);u||await e}}async#t(e,t,n){let{signal:r}=n||{};for(let n of this.#e)e=await n.transformResult(X({queryId:t,result:e,signal:r}));return e}};const Nl=new class e extends Ml{get adapter(){throw Error(`this query cannot be compiled to SQL`)}compileQuery(){throw Error(`this query cannot be compiled to SQL`)}provideConnection(){throw Error(`this query cannot be executed`)}withConnectionProvider(){throw Error(`this query cannot have a connection provider`)}withPlugin(t){return new e([...this.plugins,t])}withPlugins(t){return new e([...this.plugins,...t])}withPluginAtFront(t){return new e([t,...this.plugins])}withoutPlugins(){return new e([])}};var Pl=class{numChangedRows;constructor(e){this.numChangedRows=e}},Fl=class e{#e;constructor(e){this.#e=X(e)}modifyEnd(t){return new e({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,t.toOperationNode())})}top(t,n){return new e({...this.#e,queryNode:Z.cloneWithTop(this.#e.queryNode,Uc(t,n))})}using(...e){return new Il({...this.#e,queryNode:pc.cloneWithUsing(this.#e.queryNode,Ul(`Using`,e))})}returning(t){return new e({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,xc(t))})}returningAll(t){return new e({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,Cc(t))})}output(t){return new e({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,xc(t))})}outputAll(t){return new e({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,Cc(t))})}},Il=class e{#e;constructor(e){this.#e=X(e)}modifyEnd(t){return new e({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,t.toOperationNode())})}top(t,n){return new e({...this.#e,queryNode:Z.cloneWithTop(this.#e.queryNode,Uc(t,n))})}whenMatched(){return this.#t([])}whenMatchedAnd(...e){return this.#t(e)}whenMatchedAndRef(e,t,n){return this.#t([e,t,n],!0)}#t(e,t){return new Ll({...this.#e,queryNode:pc.cloneWithWhen(this.#e.queryNode,yl({isMatched:!0},e,t))})}whenNotMatched(){return this.#n([])}whenNotMatchedAnd(...e){return this.#n(e)}whenNotMatchedAndRef(e,t,n){return this.#n([e,t,n],!0)}whenNotMatchedBySource(){return this.#n([],!1,!0)}whenNotMatchedBySourceAnd(...e){return this.#n(e,!1,!0)}whenNotMatchedBySourceAndRef(e,t,n){return this.#n([e,t,n],!0,!0)}returning(t){return new e({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,xc(t))})}returningAll(t){return new e({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,Cc(t))})}output(t){return new e({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,xc(t))})}outputAll(t){return new e({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,Cc(t))})}#n(e,t=!1,n=!1){let r={...this.#e,queryNode:pc.cloneWithWhen(this.#e.queryNode,yl({isMatched:!1,bySource:n},e,t))};return new(n?Ll:Rl)(r)}$call(e){return e(this)}$if(t,n){return t?n(this):new e({...this.#e})}toOperationNode(){return this.#e.executor.transformQuery(this.#e.queryNode,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){let t=this.compile(),n=await this.#e.executor.executeQuery(t,e),{adapter:r}=this.#e.executor,i=t.query;return i.returning&&r.supportsReturning||i.output&&r.supportsOutput?n.rows:[new Pl(n.numAffectedRows)]}async executeTakeFirst(e){let[t]=await this.execute(e);return t}async executeTakeFirstOrThrow(e){typeof e==`function`&&(e={errorConstructor:e});let t=await this.executeTakeFirst(e);if(t===void 0){let t=e?.errorConstructor??Ic;throw Lc(t)?new t(this.toOperationNode()):t(this.toOperationNode())}return t}},Ll=class{#e;constructor(e){this.#e=X(e)}thenDelete(){return new Il({...this.#e,queryNode:pc.cloneWithThen(this.#e.queryNode,bl(`delete`))})}thenDoNothing(){return new Il({...this.#e,queryNode:pc.cloneWithThen(this.#e.queryNode,bl(`do nothing`))})}thenUpdate(e){return new Il({...this.#e,queryNode:pc.cloneWithThen(this.#e.queryNode,bl(e(new $c({queryId:this.#e.queryId,executor:Nl,queryNode:oc.createWithoutTable()}))))})}thenUpdateSet(...e){return this.thenUpdate(t=>t.set(...e))}},Rl=class{#e;constructor(e){this.#e=X(e)}thenDoNothing(){return new Il({...this.#e,queryNode:pc.cloneWithThen(this.#e.queryNode,bl(`do nothing`))})}thenInsertValues(e){let[t,n]=Dc(e);return new Il({...this.#e,queryNode:pc.cloneWithThen(this.#e.queryNode,bl(ic.cloneWith(ic.createWithoutInto(),{columns:t,values:n})))})}},zl=class e{#e;constructor(e){this.#e=X(e)}selectFrom(e){return ou({queryId:Q(),executor:this.#e.executor,queryNode:hc.createFrom(Bu(e),this.#e.withNode)})}selectNoFrom(e){return ou({queryId:Q(),executor:this.#e.executor,queryNode:hc.cloneWithSelections(hc.create(this.#e.withNode),xc(e))})}insertInto(e){return new Kc({queryId:Q(),executor:this.#e.executor,queryNode:ic.create(Uu(e),this.#e.withNode)})}replaceInto(e){return new Kc({queryId:Q(),executor:this.#e.executor,queryNode:ic.create(Uu(e),this.#e.withNode,!0)})}deleteFrom(e){return new Xc({queryId:Q(),executor:this.#e.executor,queryNode:cc.create(Bu(e),this.#e.withNode)})}updateTable(e){return new $c({queryId:Q(),executor:this.#e.executor,queryNode:oc.create(Bu(e),this.#e.withNode)})}mergeInto(e){return new Fl({queryId:Q(),executor:this.#e.executor,queryNode:pc.create(Hu(e),this.#e.withNode)})}with(t,n){let r=rl(t,n);return new e({...this.#e,withNode:this.#e.withNode?ol.cloneWithExpression(this.#e.withNode,r):ol.create(r)})}withRecursive(t,n){let r=rl(t,n);return new e({...this.#e,withNode:this.#e.withNode?ol.cloneWithExpression(this.#e.withNode,r):ol.create(r,{recursive:!0})})}withPlugin(t){return new e({...this.#e,executor:this.#e.executor.withPlugin(t)})}withoutPlugins(){return new e({...this.#e,executor:this.#e.executor.withoutPlugins()})}withSchema(t){return new e({...this.#e,executor:this.#e.executor.withPluginAtFront(new _l(t))})}};function Bl(){return new zl({executor:Nl})}function Vl(e,t){return new gc({joinNode:Uo.create(e,Vu(t))})}function Hl(){return new yc({overNode:ec.create()})}function Ul(e,t){if(t.length===3)return Gl(e,t[0],t[1],t[2]);if(t.length===2)return Wl(e,t[0],t[1]);if(t.length===1)return Kl(e,t[0]);throw Error(`not implemented`)}function Wl(e,t,n){return n(Vl(e,t)).toOperationNode()}function Gl(e,t,n,r){return Uo.createWithOn(e,Vu(t),Gs(n,`=`,r))}function Kl(e,t){return Uo.create(e,Vu(t))}const ql=X({is(e){return e.kind===`OffsetNode`},create(e){return X({kind:`OffsetNode`,offset:e})}}),Jl=X({is(e){return e.kind===`GroupByItemNode`},create(e){return X({kind:`GroupByItemNode`,groupBy:e})}});function Yl(e){return e=vo(e)?e(Nu()):e,ws(e).map(Jl.create)}const Xl=X({is(e){return e.kind===`SetOperationNode`},create(e,t,n){return X({kind:`SetOperationNode`,operator:e,expression:t,all:n})}});function Zl(e,t,n){return vo(t)&&(t=t(Mu())),xo(t)||(t=[t]),t.map(t=>Xl.create(e,Pu(t),n))}var Ql=class e{#e;constructor(e){this.#e=e}get expressionType(){}as(e){return new $l(this,e)}or(...e){return new eu(Vo.create(this.#e,Us(e)))}and(...e){return new tu(Bo.create(this.#e,Us(e)))}$castTo(){return new e(this.#e)}$notNull(){return new e(this.#e)}toOperationNode(){return this.#e}},$l=class{#e;#t;constructor(e,t){this.#e=e,this.#t=t}get expression(){return this.#e}get alias(){return this.#t}toOperationNode(){return Po.create(this.#e.toOperationNode(),Io(this.#t)?this.#t.toOperationNode():To.create(this.#t))}},eu=class e{#e;constructor(e){this.#e=e}get expressionType(){}as(e){return new $l(this,e)}or(...t){return new e(Vo.create(this.#e,Us(t)))}$castTo(){return new e(this.#e)}toOperationNode(){return Hs.create(this.#e)}},tu=class e{#e;constructor(e){this.#e=e}get expressionType(){}as(e){return new $l(this,e)}and(...t){return new e(Bo.create(this.#e,Us(t)))}$castTo(){return new e(this.#e)}toOperationNode(){return Hs.create(this.#e)}};const nu=X({is(e){return e.kind===`FetchNode`},create(e,t){return{kind:`FetchNode`,rowCount:Is.create(e),modifier:t}}});function ru(e,t){if(!po(e)&&!_o(e))throw Error(`Invalid fetch row count: ${e}`);if(!iu(t))throw Error(`Invalid fetch modifier: ${t}`);return nu.create(e,t)}function iu(e){return e===`only`||e===`with ties`}var $,au=class{#e;constructor(e){this.#e=X(e)}get expressionType(){}get isSelectQueryBuilder(){return!0}where(...e){return new $({...this.#e,queryNode:Z.cloneWithWhere(this.#e.queryNode,Us(e))})}whereRef(e,t,n){return new $({...this.#e,queryNode:Z.cloneWithWhere(this.#e.queryNode,Gs(e,t,n))})}having(...e){return new $({...this.#e,queryNode:hc.cloneWithHaving(this.#e.queryNode,Us(e))})}havingRef(e,t,n){return new $({...this.#e,queryNode:hc.cloneWithHaving(this.#e.queryNode,Gs(e,t,n))})}select(e){return new $({...this.#e,queryNode:hc.cloneWithSelections(this.#e.queryNode,xc(e))})}distinctOn(e){return new $({...this.#e,queryNode:hc.cloneWithDistinctOn(this.#e.queryNode,ws(e))})}modifyFront(e){return new $({...this.#e,queryNode:hc.cloneWithFrontModifier(this.#e.queryNode,zo.createWithExpression(e.toOperationNode()))})}modifyEnd(e){return new $({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,zo.createWithExpression(e.toOperationNode()))})}distinct(){return new $({...this.#e,queryNode:hc.cloneWithFrontModifier(this.#e.queryNode,zo.create(`Distinct`))})}forUpdate(e){return new $({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,zo.create(`ForUpdate`,e?bo(e).map(Uu):void 0))})}forShare(e){return new $({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,zo.create(`ForShare`,e?bo(e).map(Uu):void 0))})}forKeyShare(e){return new $({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,zo.create(`ForKeyShare`,e?bo(e).map(Uu):void 0))})}forNoKeyUpdate(e){return new $({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,zo.create(`ForNoKeyUpdate`,e?bo(e).map(Uu):void 0))})}skipLocked(){return new $({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,zo.create(`SkipLocked`))})}noWait(){return new $({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,zo.create(`NoWait`))})}selectAll(e){return new $({...this.#e,queryNode:hc.cloneWithSelections(this.#e.queryNode,Cc(e))})}innerJoin(...e){return this.#t(`InnerJoin`,e)}leftJoin(...e){return this.#t(`LeftJoin`,e)}rightJoin(...e){return this.#t(`RightJoin`,e)}fullJoin(...e){return this.#t(`FullJoin`,e)}crossJoin(...e){return this.#t(`CrossJoin`,e)}innerJoinLateral(...e){return this.#t(`LateralInnerJoin`,e)}leftJoinLateral(...e){return this.#t(`LateralLeftJoin`,e)}crossJoinLateral(...e){return this.#t(`LateralCrossJoin`,e)}crossApply(...e){return this.#t(`CrossApply`,e)}outerApply(...e){return this.#t(`OuterApply`,e)}#t(e,t){return new $({...this.#e,queryNode:Z.cloneWithJoin(this.#e.queryNode,Ul(e,t))})}orderBy(...e){return new $({...this.#e,queryNode:Z.cloneWithOrderByItems(this.#e.queryNode,gs(e))})}groupBy(e){return new $({...this.#e,queryNode:hc.cloneWithGroupByItems(this.#e.queryNode,Yl(e))})}limit(e){return new $({...this.#e,queryNode:hc.cloneWithLimit(this.#e.queryNode,Jc.create(Rs(e)))})}offset(e){return new $({...this.#e,queryNode:hc.cloneWithOffset(this.#e.queryNode,ql.create(Rs(e)))})}fetch(e,t=`only`){return new $({...this.#e,queryNode:hc.cloneWithFetch(this.#e.queryNode,ru(e,t))})}top(e,t){return new $({...this.#e,queryNode:Z.cloneWithTop(this.#e.queryNode,Uc(e,t))})}union(e){return new $({...this.#e,queryNode:hc.cloneWithSetOperations(this.#e.queryNode,Zl(`union`,e,!1))})}unionAll(e){return new $({...this.#e,queryNode:hc.cloneWithSetOperations(this.#e.queryNode,Zl(`union`,e,!0))})}intersect(e){return new $({...this.#e,queryNode:hc.cloneWithSetOperations(this.#e.queryNode,Zl(`intersect`,e,!1))})}intersectAll(e){return new $({...this.#e,queryNode:hc.cloneWithSetOperations(this.#e.queryNode,Zl(`intersect`,e,!0))})}except(e){return new $({...this.#e,queryNode:hc.cloneWithSetOperations(this.#e.queryNode,Zl(`except`,e,!1))})}exceptAll(e){return new $({...this.#e,queryNode:hc.cloneWithSetOperations(this.#e.queryNode,Zl(`except`,e,!0))})}as(e){return new su(this,e)}clearSelect(){return new $({...this.#e,queryNode:hc.cloneWithoutSelections(this.#e.queryNode)})}clearWhere(){return new $({...this.#e,queryNode:Z.cloneWithoutWhere(this.#e.queryNode)})}clearLimit(){return new $({...this.#e,queryNode:hc.cloneWithoutLimit(this.#e.queryNode)})}clearOffset(){return new $({...this.#e,queryNode:hc.cloneWithoutOffset(this.#e.queryNode)})}clearOrderBy(){return new $({...this.#e,queryNode:Z.cloneWithoutOrderBy(this.#e.queryNode)})}clearGroupBy(){return new $({...this.#e,queryNode:hc.cloneWithoutGroupBy(this.#e.queryNode)})}$call(e){return e(this)}$if(e,t){return e?t(this):new $({...this.#e})}$castTo(){return new $(this.#e)}$narrowType(){return new $(this.#e)}$assertType(){return new $(this.#e)}$asTuple(){return new Ql(this.toOperationNode())}$asScalar(){return new Ql(this.toOperationNode())}withPlugin(e){return new $({...this.#e,executor:this.#e.executor.withPlugin(e)})}toOperationNode(){return this.#e.executor.transformQuery(this.#e.queryNode,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){let t=this.compile();return(await this.#e.executor.executeQuery(t,e)).rows}async executeTakeFirst(e){let[t]=await this.execute(e);return t}async executeTakeFirstOrThrow(e){typeof e==`function`&&(e={errorConstructor:e});let t=await this.executeTakeFirst(e);if(t===void 0){let t=e?.errorConstructor??Ic;throw Lc(t)?new t(this.toOperationNode()):t(this.toOperationNode())}return t}async*stream(e){typeof e!=`object`&&(e={chunkSize:e});let t=this.compile(),n=this.#e.executor.stream(t,e.chunkSize??100,e);for await(let e of n)yield*e.rows}async explain(e,t){return await new $({...this.#e,queryNode:Z.cloneWithExplain(this.#e.queryNode,e,t)}).execute()}};$=au;function ou(e){return new au(e)}var su=class{#e;#t;constructor(e,t){this.#e=e,this.#t=t}get expression(){return this.#e}get alias(){return this.#t}get isAliasedSelectQueryBuilder(){return!0}toOperationNode(){return Po.create(this.#e.toOperationNode(),To.create(this.#t))}};const cu=X({is(e){return e.kind===`AggregateFunctionNode`},create(e,t=[]){return X({kind:`AggregateFunctionNode`,func:e,aggregated:t})},cloneWithDistinct(e){return X({...e,distinct:!0})},cloneWithOrderBy(e,t,n=!1){let r=n?`withinGroup`:`orderBy`;return X({...e,[r]:e[r]?Qs.cloneWithItems(e[r],t):Qs.create(t)})},cloneWithFilter(e,t){return X({...e,filter:e.filter?lc.cloneWithOperation(e.filter,`And`,t):lc.create(t)})},cloneWithOrFilter(e,t){return X({...e,filter:e.filter?lc.cloneWithOperation(e.filter,`Or`,t):lc.create(t)})},cloneWithOver(e,t){return X({...e,over:t})}}),lu=X({is(e){return e.kind===`FunctionNode`},create(e,t){return X({kind:`FunctionNode`,func:e,arguments:t})}});var uu=class e{#e;constructor(e){this.#e=X(e)}get expressionType(){}as(e){return new du(this,e)}distinct(){return new e({...this.#e,aggregateFunctionNode:cu.cloneWithDistinct(this.#e.aggregateFunctionNode)})}orderBy(...t){return new e({...this.#e,aggregateFunctionNode:Z.cloneWithOrderByItems(this.#e.aggregateFunctionNode,gs(t))})}clearOrderBy(){return new e({...this.#e,aggregateFunctionNode:Z.cloneWithoutOrderBy(this.#e.aggregateFunctionNode)})}withinGroupOrderBy(...t){return new e({...this.#e,aggregateFunctionNode:cu.cloneWithOrderBy(this.#e.aggregateFunctionNode,gs(t),!0)})}filterWhere(...t){return new e({...this.#e,aggregateFunctionNode:cu.cloneWithFilter(this.#e.aggregateFunctionNode,Us(t))})}filterWhereRef(t,n,r){return new e({...this.#e,aggregateFunctionNode:cu.cloneWithFilter(this.#e.aggregateFunctionNode,Gs(t,n,r))})}over(t){let n=Hl();return new e({...this.#e,aggregateFunctionNode:cu.cloneWithOver(this.#e.aggregateFunctionNode,(t?t(n):n).toOperationNode())})}$call(e){return e(this)}$castTo(){return new e(this.#e)}$notNull(){return new e(this.#e)}toOperationNode(){return this.#e.aggregateFunctionNode}},du=class{#e;#t;constructor(e,t){this.#e=e,this.#t=t}get expression(){return this.#e}get alias(){return this.#t}toOperationNode(){return Po.create(this.#e.toOperationNode(),To.create(this.#t))}};function fu(){let e=(e,t)=>new Ql(lu.create(e,ws(t??[]))),t=(e,t)=>new uu({aggregateFunctionNode:cu.create(e,t?ws(t):void 0)});return Object.assign(e,{agg:t,avg(e){return t(`avg`,[e])},coalesce(...t){return e(`coalesce`,t)},count(e){return t(`count`,[e])},countAll(e){return new uu({aggregateFunctionNode:cu.create(`count`,Cc(e))})},max(e){return t(`max`,[e])},min(e){return t(`min`,[e])},sum(e){return t(`sum`,[e])},any(t){return e(`any`,[t])},jsonAgg(e){return new uu({aggregateFunctionNode:cu.create(`json_agg`,[fo(e)?Uu(e):e.toOperationNode()])})},toJson(e){return new Ql(lu.create(`to_json`,[fo(e)?Uu(e):e.toOperationNode()]))}})}const pu=X({is(e){return e.kind===`UnaryOperationNode`},create(e,t){return X({kind:`UnaryOperationNode`,operator:e,operand:t})}});function mu(e,t){if(rs(e))return pu.create(es.create(e),Ts(t));throw Error(`invalid unary operator ${JSON.stringify(e)}`)}const hu=X({is(e){return e.kind===`CaseNode`},create(e){return X({kind:`CaseNode`,value:e})},cloneWithWhen(e,t){return X({...e,when:X(e.when?[...e.when,t]:[t])})},cloneWithThen(e,t){return X({...e,when:e.when?X([...e.when.slice(0,-1),fc.cloneWithResult(e.when[e.when.length-1],t)]):void 0})},cloneWith(e,t){return X({...e,...t})}});var gu=class{#e;constructor(e){this.#e=X(e)}when(...e){return new _u({...this.#e,node:hu.cloneWithWhen(this.#e.node,fc.create(Us(e)))})}whenRef(e,t,n){return new _u({...this.#e,node:hu.cloneWithWhen(this.#e.node,fc.create(Gs(e,t,n)))})}},_u=class{#e;constructor(e){this.#e=X(e)}then(e){return new vu({...this.#e,node:hu.cloneWithThen(this.#e.node,zs(e)?Bs(e):Rs(e))})}thenRef(e){return new vu({...this.#e,node:hu.cloneWithThen(this.#e.node,Ts(e))})}},vu=class{#e;constructor(e){this.#e=X(e)}when(...e){return new _u({...this.#e,node:hu.cloneWithWhen(this.#e.node,fc.create(Us(e)))})}whenRef(e,t,n){return new _u({...this.#e,node:hu.cloneWithWhen(this.#e.node,fc.create(Gs(e,t,n)))})}else(e){return new yu({...this.#e,node:hu.cloneWith(this.#e.node,{else:zs(e)?Bs(e):Rs(e)})})}elseRef(e){return new yu({...this.#e,node:hu.cloneWith(this.#e.node,{else:Ts(e)})})}end(){return new Ql(hu.cloneWith(this.#e.node,{isStatement:!1}))}endCase(){return new Ql(hu.cloneWith(this.#e.node,{isStatement:!0}))}},yu=class{#e;constructor(e){this.#e=X(e)}end(){return new Ql(hu.cloneWith(this.#e.node,{isStatement:!1}))}endCase(){return new Ql(hu.cloneWith(this.#e.node,{isStatement:!0}))}};const bu=X({is(e){return e.kind===`JSONPathLegNode`},create(e,t){return X({kind:`JSONPathLegNode`,type:e,value:t})}}),xu=/^#-\d+$/;var Su=class{#e;constructor(e){this.#e=e}at(e){if(typeof e!=`number`&&typeof e!=`string`||typeof e==`number`&&!Number.isInteger(e)||typeof e==`string`&&e!==`last`&&!xu.test(e))throw Error(`Unexpected index value in .at(...): ${e}`);return this.#t(`ArrayLocation`,e)}key(e){return this.#t(`Member`,e)}#t(e,t){return bs.is(this.#e)?new Cu(bs.cloneWithTraversal(this.#e,Ss.is(this.#e.traversal)?Ss.cloneWithLeg(this.#e.traversal,bu.create(e,t)):xs.cloneWithValue(this.#e.traversal,Is.createImmediate(t)))):new Cu(Ss.cloneWithLeg(this.#e,bu.create(e,t)))}},Cu=class e extends Su{#e;constructor(e){super(e),this.#e=e}get expressionType(){}as(e){return new wu(this,e)}$castTo(){return new e(this.#e)}$notNull(){return new e(this.#e)}toOperationNode(){return this.#e}},wu=class{#e;#t;constructor(e,t){this.#e=e,this.#t=t}get expression(){return this.#e}get alias(){return this.#t}toOperationNode(){return Po.create(this.#e.toOperationNode(),Io(this.#t)?this.#t.toOperationNode():To.create(this.#t))}};const Tu=X({is(e){return e.kind===`TupleNode`},create(e){return X({kind:`TupleNode`,values:X(e)})}}),Eu=X({bigint:!0,bigserial:!0,binary:!0,blob:!0,boolean:!0,bytea:!0,char:!0,date:!0,datemultirange:!0,daterange:!0,datetime:!0,datetime2:!0,decimal:!0,"double precision":!0,float4:!0,float8:!0,int2:!0,int4:!0,int4multirange:!0,int4range:!0,int8:!0,int8multirange:!0,int8range:!0,integer:!0,json:!0,jsonb:!0,numeric:!0,nummultirange:!0,numrange:!0,real:!0,serial:!0,smallint:!0,text:!0,time:!0,timestamp:!0,timestamptz:!0,timetz:!0,tsmultirange:!0,tsrange:!0,tstzmultirange:!0,tstzrange:!0,uuid:!0,varbinary:!0,varchar:!0}),Du=X([/^varchar\(\d+\)$/,/^char\(\d+\)$/,/^decimal\(\d+, \d+\)$/,/^numeric\(\d+, \d+\)$/,/^binary\(\d+\)$/,/^datetime\(\d+\)$/,/^time\(\d+\)$/,/^timetz\(\d+\)$/,/^timestamp\(\d+\)$/,/^timestamptz\(\d+\)$/,/^datetime2\(\d+\)$/,/^varbinary\(\d+\)$/]),Ou=X({is(e){return e.kind===`DataTypeNode`},create(e){return X({kind:`DataTypeNode`,dataType:e})}});function ku(e){return Eu[e]||Du.some(t=>t.test(e))}function Au(e){if(Io(e))return e.toOperationNode();if(ku(e))return Ou.create(e);throw Error(`invalid column data type ${JSON.stringify(e)}`)}const ju=X({is(e){return e.kind===`CastNode`},create(e,t){return X({kind:`CastNode`,expression:e,dataType:t})}});function Mu(e=Nl){function t(e,t,n){return new Ql(Ws(e,t,n))}function n(e,t){return new Ql(mu(e,t))}let r=Object.assign(t,{fn:void 0,eb:void 0,selectFrom(t){return ou({queryId:Q(),executor:e,queryNode:hc.createFrom(Bu(t))})},case(e){return new gu({node:hu.create(uo(e)?void 0:Ts(e))})},ref(e,t){return uo(t)?new Ql(Ds(e)):new Su(Es(e,t))},jsonPath(){return new Su(Ss.create())},table(e){return new Ql(Uu(e))},val(e){return new Ql(Rs(e))},refTuple(...e){return new Ql(Tu.create(e.map(Ts)))},tuple(...e){return new Ql(Tu.create(e.map(Rs)))},lit(e){return new Ql(Bs(e))},unary:n,not(e){return n(`not`,e)},exists(e){return n(`exists`,e)},neg(e){return n(`-`,e)},between(e,t,n){return new Ql(Wo.create(Ts(e),es.create(`between`),Bo.create(Rs(t),Rs(n))))},betweenSymmetric(e,t,n){return new Ql(Wo.create(Ts(e),es.create(`between symmetric`),Bo.create(Rs(t),Rs(n))))},and(e){return xo(e)?new Ql(qs(e,`and`)):new Ql(Ks(e,`and`))},or(e){return xo(e)?new Ql(qs(e,`or`)):new Ql(Ks(e,`or`))},parens(...e){let t=Us(e);return Hs.is(t)?new Ql(t):new Ql(Hs.create(t))},cast(e,t){return new Ql(ju.create(Ts(e),Au(t)))}});return r.fn=fu(),r.eb=r,r}function Nu(e){return Mu()}function Pu(e){if(Io(e))return e.toOperationNode();if(vo(e))return e(Nu()).toOperationNode();throw Error(`invalid expression: ${JSON.stringify(e)}`)}function Fu(e){if(Io(e))return e.toOperationNode();if(vo(e))return e(Nu()).toOperationNode();throw Error(`invalid aliased expression: ${JSON.stringify(e)}`)}function Iu(e){return Lo(e)||Ro(e)||vo(e)}var Lu=class{#e;get table(){return this.#e}constructor(e){this.#e=e}as(e){return new Ru(this.#e,e)}},Ru=class{#e;#t;get table(){return this.#e}get alias(){return this.#t}constructor(e,t){this.#e=e,this.#t=t}toOperationNode(){return Po.create(Uu(this.#e),To.create(this.#t))}};function zu(e){return yo(e)&&Io(e)&&fo(e.table)&&fo(e.alias)}function Bu(e){return xo(e)?e.map(e=>Vu(e)):[Vu(e)]}function Vu(e){return fo(e)?Hu(e):zu(e)?e.toOperationNode():Fu(e)}function Hu(e){let t=` as `;if(e.includes(t)){let[n,r]=e.split(t).map(Wu);return Po.create(Uu(n),To.create(r))}return Uu(e)}function Uu(e){if(e.includes(`.`)){let[t,n]=e.split(`.`).map(Wu);return Fo.createWithSchema(t,n)}return Fo.create(e)}function Wu(e){return e.trim()}const Gu=X({is(e){return e.kind===`AddColumnNode`},create(e){return X({kind:`AddColumnNode`,column:e})}}),Ku=X({is(e){return e.kind===`ColumnDefinitionNode`},create(e,t){return X({kind:`ColumnDefinitionNode`,column:is.create(e),dataType:t})},cloneWithFrontModifier(e,t){return X({...e,frontModifiers:e.frontModifiers?X([...e.frontModifiers,t]):[t]})},cloneWithEndModifier(e,t){return X({...e,endModifiers:e.endModifiers?X([...e.endModifiers,t]):[t]})},cloneWith(e,t){return X({...e,...t})}}),qu=X({is(e){return e.kind===`DropColumnNode`},create(e){return X({kind:`DropColumnNode`,column:is.create(e)})},cloneWith(e,t){return X({...e,...t})}}),Ju=X({is(e){return e.kind===`RenameColumnNode`},create(e,t){return X({kind:`RenameColumnNode`,column:is.create(e),renameTo:is.create(t)})}}),Yu=X({is(e){return e.kind===`CheckConstraintNode`},create(e,t){return X({kind:`CheckConstraintNode`,expression:e,name:t?To.create(t):void 0})}}),Xu=X({cascade:!0,"no action":!0,restrict:!0,"set default":!0,"set null":!0});Object.keys(Xu);const Zu=X({is(e){return e.kind===`ReferencesNode`},create(e,t){return X({kind:`ReferencesNode`,table:e,columns:X([...t])})},cloneWithOnDelete(e,t){return X({...e,onDelete:t})},cloneWithOnUpdate(e,t){return X({...e,onUpdate:t})}});function Qu(e){return fo(e)&&Xu[e]}function $u(e){return Io(e)?e.toOperationNode():Is.createImmediate(e)}const ed=X({is(e){return e.kind===`GeneratedNode`},create(e){return X({kind:`GeneratedNode`,...e})},createWithExpression(e){return X({kind:`GeneratedNode`,always:!0,expression:e})},cloneWith(e,t){return X({...e,...t})}}),td=X({is(e){return e.kind===`DefaultValueNode`},create(e){return X({kind:`DefaultValueNode`,defaultValue:e})}});function nd(e){if(Qu(e))return e;throw Error(`invalid OnModifyForeignAction ${e}`)}var rd=class e{#e;constructor(e){this.#e=e}autoIncrement(){return new e(Ku.cloneWith(this.#e,{autoIncrement:!0}))}identity(){return new e(Ku.cloneWith(this.#e,{identity:!0}))}primaryKey(){return new e(Ku.cloneWith(this.#e,{primaryKey:!0}))}references(t){let n=Ds(t);if(!n.table||as.is(n.column))throw Error(`invalid call references('${t}'). The reference must have format table.column or schema.table.column`);return new e(Ku.cloneWith(this.#e,{references:Zu.create(n.table,[n.column])}))}onDelete(t){if(!this.#e.references)throw Error(`on delete constraint can only be added for foreign keys`);return new e(Ku.cloneWith(this.#e,{references:Zu.cloneWithOnDelete(this.#e.references,nd(t))}))}onUpdate(t){if(!this.#e.references)throw Error(`on update constraint can only be added for foreign keys`);return new e(Ku.cloneWith(this.#e,{references:Zu.cloneWithOnUpdate(this.#e.references,nd(t))}))}unique(){return new e(Ku.cloneWith(this.#e,{unique:!0}))}notNull(){return new e(Ku.cloneWith(this.#e,{notNull:!0}))}unsigned(){return new e(Ku.cloneWith(this.#e,{unsigned:!0}))}defaultTo(t){return new e(Ku.cloneWith(this.#e,{defaultTo:td.create($u(t))}))}check(t){return new e(Ku.cloneWith(this.#e,{check:Yu.create(t.toOperationNode())}))}generatedAlwaysAs(t){return new e(Ku.cloneWith(this.#e,{generated:ed.createWithExpression(t.toOperationNode())}))}generatedAlwaysAsIdentity(){return new e(Ku.cloneWith(this.#e,{generated:ed.create({identity:!0,always:!0})}))}generatedByDefaultAsIdentity(){return new e(Ku.cloneWith(this.#e,{generated:ed.create({identity:!0,byDefault:!0})}))}stored(){if(!this.#e.generated)throw Error(`stored() can only be called after generatedAlwaysAs`);return new e(Ku.cloneWith(this.#e,{generated:ed.cloneWith(this.#e.generated,{stored:!0})}))}modifyFront(t){return new e(Ku.cloneWithFrontModifier(this.#e,t.toOperationNode()))}nullsNotDistinct(){return new e(Ku.cloneWith(this.#e,{nullsNotDistinct:!0}))}ifNotExists(){return new e(Ku.cloneWith(this.#e,{ifNotExists:!0}))}modifyEnd(t){return new e(Ku.cloneWithEndModifier(this.#e,t.toOperationNode()))}$call(e){return e(this)}toOperationNode(){return this.#e}};const id=X({is(e){return e.kind===`ModifyColumnNode`},create(e){return X({kind:`ModifyColumnNode`,column:e})}}),ad=X({is(e){return e.kind===`ForeignKeyConstraintNode`},create(e,t,n,r){return X({kind:`ForeignKeyConstraintNode`,columns:e,references:Zu.create(t,n),name:r?To.create(r):void 0})},cloneWith(e,t){return X({...e,...t})}});var od=class e{#e;constructor(e){this.#e=e}onDelete(t){return new e(ad.cloneWith(this.#e,{onDelete:nd(t)}))}onUpdate(t){return new e(ad.cloneWith(this.#e,{onUpdate:nd(t)}))}deferrable(){return new e(ad.cloneWith(this.#e,{deferrable:!0}))}notDeferrable(){return new e(ad.cloneWith(this.#e,{deferrable:!1}))}initiallyDeferred(){return new e(ad.cloneWith(this.#e,{initiallyDeferred:!0}))}initiallyImmediate(){return new e(ad.cloneWith(this.#e,{initiallyDeferred:!1}))}$call(e){return e(this)}toOperationNode(){return this.#e}};const sd=X({is(e){return e.kind===`AddConstraintNode`},create(e){return X({kind:`AddConstraintNode`,constraint:e})}}),cd=X({is(e){return e.kind===`UniqueConstraintNode`},create(e,t,n){return fo(e.at(0))&&(ms("`UniqueConstraintNode.create(columns: string[], ...)` is deprecated - pass `ColumnNode[]` instead."),e=e.map(is.create)),X({kind:`UniqueConstraintNode`,columns:X(e),name:t?To.create(t):void 0,nullsNotDistinct:n})},cloneWith(e,t){return X({...e,...t})}}),ld=X({is(e){return e.kind===`DropConstraintNode`},create(e){return X({kind:`DropConstraintNode`,constraintName:To.create(e)})},cloneWith(e,t){return X({...e,...t})}}),ud=X({is(e){return e.kind===`AlterColumnNode`},create(e,t,n){return X({kind:`AlterColumnNode`,column:is.create(e),[t]:n})}});var dd=class{#e;constructor(e){this.#e=e}setDataType(e){return new fd(ud.create(this.#e,`dataType`,Au(e)))}setDefault(e){return new fd(ud.create(this.#e,`setDefault`,$u(e)))}dropDefault(){return new fd(ud.create(this.#e,`dropDefault`,!0))}setNotNull(){return new fd(ud.create(this.#e,`setNotNull`,!0))}dropNotNull(){return new fd(ud.create(this.#e,`dropNotNull`,!0))}$call(e){return e(this)}},fd=class{#e;constructor(e){this.#e=e}toOperationNode(){return this.#e}},pd=class{#e;constructor(e){this.#e=X(e)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},md=class e{#e;constructor(e){this.#e=X(e)}onDelete(t){return new e({...this.#e,constraintBuilder:this.#e.constraintBuilder.onDelete(t)})}onUpdate(t){return new e({...this.#e,constraintBuilder:this.#e.constraintBuilder.onUpdate(t)})}deferrable(){return new e({...this.#e,constraintBuilder:this.#e.constraintBuilder.deferrable()})}notDeferrable(){return new e({...this.#e,constraintBuilder:this.#e.constraintBuilder.notDeferrable()})}initiallyDeferred(){return new e({...this.#e,constraintBuilder:this.#e.constraintBuilder.initiallyDeferred()})}initiallyImmediate(){return new e({...this.#e,constraintBuilder:this.#e.constraintBuilder.initiallyImmediate()})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(wo.cloneWithTableProps(this.#e.node,{addConstraint:sd.create(this.#e.constraintBuilder.toOperationNode())}),this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},hd=class e{#e;constructor(e){this.#e=X(e)}ifExists(){return new e({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{dropConstraint:ld.cloneWith(this.#e.node.dropConstraint,{ifExists:!0})})})}cascade(){return new e({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{dropConstraint:ld.cloneWith(this.#e.node.dropConstraint,{modifier:`cascade`})})})}restrict(){return new e({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{dropConstraint:ld.cloneWith(this.#e.node.dropConstraint,{modifier:`restrict`})})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};const gd=X({is(e){return e.kind===`PrimaryKeyConstraintNode`},create(e,t){return X({kind:`PrimaryKeyConstraintNode`,columns:X(e.map(is.create)),name:t?To.create(t):void 0})},cloneWith(e,t){return X({...e,...t})}}),_d=X({is(e){return e.kind===`AddIndexNode`},create(e){return X({kind:`AddIndexNode`,name:To.create(e)})},cloneWith(e,t){return X({...e,...t})},cloneWithColumns(e,t){return X({...e,columns:[...e.columns||[],...t]})}});var vd=class e{#e;constructor(e){this.#e=X(e)}unique(){return new e({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{addIndex:_d.cloneWith(this.#e.node.addIndex,{unique:!0})})})}column(t){return new e({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{addIndex:_d.cloneWithColumns(this.#e.node.addIndex,[fo(t)?As(t):t.toOperationNode()])})})}columns(t){return new e({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{addIndex:_d.cloneWithColumns(this.#e.node.addIndex,t.map(e=>fo(e)?As(e):e.toOperationNode()))})})}expression(t){return new e({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{addIndex:_d.cloneWithColumns(this.#e.node.addIndex,[t.toOperationNode()])})})}using(t){return new e({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{addIndex:_d.cloneWith(this.#e.node.addIndex,{using:us.createWithSql(t)})})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},yd=class e{#e;constructor(e){this.#e=e}nullsNotDistinct(){return new e(cd.cloneWith(this.#e,{nullsNotDistinct:!0}))}deferrable(){return new e(cd.cloneWith(this.#e,{deferrable:!0}))}notDeferrable(){return new e(cd.cloneWith(this.#e,{deferrable:!1}))}initiallyDeferred(){return new e(cd.cloneWith(this.#e,{initiallyDeferred:!0}))}initiallyImmediate(){return new e(cd.cloneWith(this.#e,{initiallyDeferred:!1}))}$call(e){return e(this)}toOperationNode(){return this.#e}},bd=class e{#e;constructor(e){this.#e=e}deferrable(){return new e(gd.cloneWith(this.#e,{deferrable:!0}))}notDeferrable(){return new e(gd.cloneWith(this.#e,{deferrable:!1}))}initiallyDeferred(){return new e(gd.cloneWith(this.#e,{initiallyDeferred:!0}))}initiallyImmediate(){return new e(gd.cloneWith(this.#e,{initiallyDeferred:!1}))}$call(e){return e(this)}toOperationNode(){return this.#e}},xd=class{#e;constructor(e){this.#e=e}$call(e){return e(this)}toOperationNode(){return this.#e}};const Sd=X({is(e){return e.kind===`RenameConstraintNode`},create(e,t){return X({kind:`RenameConstraintNode`,oldName:To.create(e),newName:To.create(t)})}});var Cd=class e{#e;constructor(e){this.#e=X({...e})}ifExists(){return new e({...this.#e,node:qu.cloneWith(this.#e.node,{ifExists:!0})})}toOperationNode(){return this.#e.node}},wd=class{#e;constructor(e){this.#e=X(e)}renameTo(e){return new pd({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{renameTo:Uu(e)})})}setSchema(e){return new pd({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{setSchema:To.create(e)})})}alterColumn(e,t){let n=t(new dd(e));return new Td({...this.#e,node:wo.cloneWithColumnAlteration(this.#e.node,n.toOperationNode())})}dropColumn(e,t=So){let n=t(new Cd({node:qu.create(e)}));return new Td({...this.#e,node:wo.cloneWithColumnAlteration(this.#e.node,n.toOperationNode())})}renameColumn(e,t){return new Td({...this.#e,node:wo.cloneWithColumnAlteration(this.#e.node,Ju.create(e,t))})}addColumn(e,t,n=So){let r=n(new rd(Ku.create(e,Au(t))));return new Td({...this.#e,node:wo.cloneWithColumnAlteration(this.#e.node,Gu.create(r.toOperationNode()))})}modifyColumn(e,t,n=So){let r=n(new rd(Ku.create(e,Au(t))));return new Td({...this.#e,node:wo.cloneWithColumnAlteration(this.#e.node,id.create(r.toOperationNode()))})}addUniqueConstraint(e,t,n=So){let r=n(new yd(cd.create(t.map(e=>fo(e)?is.create(e):Pu(e)),e)));return new pd({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{addConstraint:sd.create(r.toOperationNode())})})}addCheckConstraint(e,t,n=So){let r=n(new xd(Yu.create(t.toOperationNode(),e)));return new pd({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{addConstraint:sd.create(r.toOperationNode())})})}addForeignKeyConstraint(e,t,n,r,i=So){let a=i(new od(ad.create(t.map(is.create),Uu(n),r.map(is.create),e)));return new md({...this.#e,constraintBuilder:a})}addPrimaryKeyConstraint(e,t,n=So){let r=n(new bd(gd.create(t,e)));return new pd({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{addConstraint:sd.create(r.toOperationNode())})})}dropConstraint(e){return new hd({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{dropConstraint:ld.create(e)})})}renameConstraint(e,t){return new hd({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{renameConstraint:Sd.create(e,t)})})}addIndex(e){return new vd({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{addIndex:_d.create(e)})})}dropIndex(e){return new pd({...this.#e,node:wo.cloneWithTableProps(this.#e.node,{dropIndex:jo.create(e)})})}$call(e){return e(this)}},Td=class e{#e;constructor(e){this.#e=X(e)}alterColumn(t,n){let r=n(new dd(t));return new e({...this.#e,node:wo.cloneWithColumnAlteration(this.#e.node,r.toOperationNode())})}dropColumn(t,n=So){let r=n(new Cd({node:qu.create(t)}));return new e({...this.#e,node:wo.cloneWithColumnAlteration(this.#e.node,r.toOperationNode())})}renameColumn(t,n){return new e({...this.#e,node:wo.cloneWithColumnAlteration(this.#e.node,Ju.create(t,n))})}addColumn(t,n,r=So){let i=r(new rd(Ku.create(t,Au(n))));return new e({...this.#e,node:wo.cloneWithColumnAlteration(this.#e.node,Gu.create(i.toOperationNode()))})}modifyColumn(t,n,r=So){let i=r(new rd(Ku.create(t,Au(n))));return new e({...this.#e,node:wo.cloneWithColumnAlteration(this.#e.node,id.create(i.toOperationNode()))})}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},Ed=class extends dl{transformPrimitiveValueList(e){return Fs.create(e.values.map(Is.createImmediate))}transformValue(e){return Is.createImmediate(e.value)}},Dd=class e{#e;constructor(e){this.#e=X(e)}ifNotExists(){return new e({...this.#e,node:Eo.cloneWith(this.#e.node,{ifNotExists:!0})})}unique(){return new e({...this.#e,node:Eo.cloneWith(this.#e.node,{unique:!0})})}nullsNotDistinct(){return new e({...this.#e,node:Eo.cloneWith(this.#e.node,{nullsNotDistinct:!0})})}on(t){return new e({...this.#e,node:Eo.cloneWith(this.#e.node,{table:Uu(t)})})}column(t){return new e({...this.#e,node:Eo.cloneWithColumns(this.#e.node,[fo(t)?As(t):t.toOperationNode()])})}columns(t){return new e({...this.#e,node:Eo.cloneWithColumns(this.#e.node,t.map(e=>fo(e)?As(e):e.toOperationNode()))})}expression(t){return new e({...this.#e,node:Eo.cloneWithColumns(this.#e.node,[t.toOperationNode()])})}using(t){return new e({...this.#e,node:Eo.cloneWith(this.#e.node,{using:us.createWithSql(t)})})}where(...t){let n=new Ed;return new e({...this.#e,node:Z.cloneWithWhere(this.#e.node,n.transformNode(Us(t),this.#e.queryId))})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},Od=class e{#e;constructor(e){this.#e=X(e)}ifNotExists(){return new e({...this.#e,node:Do.cloneWith(this.#e.node,{ifNotExists:!0})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};function kd(e){if(Oo.includes(e))return e;throw Error(`invalid OnCommitAction ${e}`)}var Ad=class e{#e;constructor(e){this.#e=e}using(t){return new e(_d.cloneWith(this.#e,{using:us.createWithSql(t)}))}$call(e){return e(this)}toOperationNode(){return this.#e}},jd=class e{#e;constructor(e){this.#e=X(e)}temporary(){return new e({...this.#e,node:ko.cloneWith(this.#e.node,{temporary:!0})})}onCommit(t){return new e({...this.#e,node:ko.cloneWith(this.#e.node,{onCommit:kd(t)})})}ifNotExists(){return new e({...this.#e,node:ko.cloneWith(this.#e.node,{ifNotExists:!0})})}addColumn(t,n,r=So){let i=r(new rd(Ku.create(t,Au(n))));return new e({...this.#e,node:ko.cloneWithColumn(this.#e.node,i.toOperationNode())})}addPrimaryKeyConstraint(t,n,r=So){let i=r(new bd(gd.create(n,t)));return new e({...this.#e,node:ko.cloneWithConstraint(this.#e.node,i.toOperationNode())})}addUniqueConstraint(t,n,r=So){let i=r(new yd(cd.create(n.map(e=>fo(e)?is.create(e):Pu(e)),t)));return new e({...this.#e,node:ko.cloneWithConstraint(this.#e.node,i.toOperationNode())})}addIndex(t,n,r=So){let i=r(new Ad(_d.cloneWithColumns(_d.create(t),n.map(e=>fo(e)?is.create(e):Pu(e)))));return new e({...this.#e,node:ko.cloneWithIndex(this.#e.node,i.toOperationNode())})}addCheckConstraint(t,n,r=So){let i=r(new xd(Yu.create(n.toOperationNode(),t)));return new e({...this.#e,node:ko.cloneWithConstraint(this.#e.node,i.toOperationNode())})}addForeignKeyConstraint(t,n,r,i,a=So){let o=a(new od(ad.create(n.map(is.create),Uu(r),i.map(is.create),t)));return new e({...this.#e,node:ko.cloneWithConstraint(this.#e.node,o.toOperationNode())})}modifyFront(t){return new e({...this.#e,node:ko.cloneWithFrontModifier(this.#e.node,t.toOperationNode())})}modifyEnd(t){return new e({...this.#e,node:ko.cloneWithEndModifier(this.#e.node,t.toOperationNode())})}as(t){return new e({...this.#e,node:ko.cloneWith(this.#e.node,{selectQuery:Pu(t)})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},Md=class e{#e;constructor(e){this.#e=X(e)}on(t){return new e({...this.#e,node:jo.cloneWith(this.#e.node,{table:Uu(t)})})}ifExists(){return new e({...this.#e,node:jo.cloneWith(this.#e.node,{ifExists:!0})})}cascade(){return new e({...this.#e,node:jo.cloneWith(this.#e.node,{cascade:!0})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},Nd=class e{#e;constructor(e){this.#e=X(e)}ifExists(){return new e({...this.#e,node:Mo.cloneWith(this.#e.node,{ifExists:!0})})}cascade(){return new e({...this.#e,node:Mo.cloneWith(this.#e.node,{cascade:!0})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},Pd=class e{#e;constructor(e){this.#e=X(e)}temporary(){return new e({...this.#e,node:No.cloneWith(this.#e.node,{temporary:!0})})}ifExists(){return new e({...this.#e,node:No.cloneWith(this.#e.node,{ifExists:!0})})}cascade(){return new e({...this.#e,node:No.cloneWith(this.#e.node,{cascade:!0})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};const Fd=X({is(e){return e.kind===`CreateViewNode`},create(e){return X({kind:`CreateViewNode`,name:Ao.create(e)})},cloneWith(e,t){return X({...e,...t})}});var Id=class{#e=new Ed;transformQuery(e){return this.#e.transformNode(e.node,e.queryId)}transformResult(e){return Promise.resolve(e.result)}},Ld=class e{#e;constructor(e){this.#e=X(e)}temporary(){return new e({...this.#e,node:Fd.cloneWith(this.#e.node,{temporary:!0})})}materialized(){return new e({...this.#e,node:Fd.cloneWith(this.#e.node,{materialized:!0})})}ifNotExists(){return new e({...this.#e,node:Fd.cloneWith(this.#e.node,{ifNotExists:!0})})}orReplace(){return new e({...this.#e,node:Fd.cloneWith(this.#e.node,{orReplace:!0})})}columns(t){return new e({...this.#e,node:Fd.cloneWith(this.#e.node,{columns:t.map(ks)})})}as(t){let n=t.withPlugin(new Id).toOperationNode();return new e({...this.#e,node:Fd.cloneWith(this.#e.node,{as:n})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};const Rd=X({is(e){return e.kind===`DropViewNode`},create(e){return X({kind:`DropViewNode`,name:Ao.create(e)})},cloneWith(e,t){return X({...e,...t})}});var zd=class e{#e;constructor(e){this.#e=X(e)}materialized(){return new e({...this.#e,node:Rd.cloneWith(this.#e.node,{materialized:!0})})}ifExists(){return new e({...this.#e,node:Rd.cloneWith(this.#e.node,{ifExists:!0})})}cascade(){return new e({...this.#e,node:Rd.cloneWith(this.#e.node,{cascade:!0})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};const Bd=X({is(e){return e.kind===`CreateTypeNode`},create(e){return X({kind:`CreateTypeNode`,name:e})},cloneWithEnum(e,t){return X({...e,enum:Fs.create(t.map(Is.createImmediate))})}});var Vd=class e{#e;constructor(e){this.#e=X(e)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}asEnum(t){return new e({...this.#e,node:Bd.cloneWithEnum(this.#e.node,t)})}$call(e){return e(this)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};const Hd=X({is(e){return e.kind===`DropTypeNode`},create(e){return Array.isArray(e)||(e=[e]),X({kind:`DropTypeNode`,name:e[0],additionalNames:e.slice(1)})},cloneWith(e,t){return X({...e,...t})}});var Ud=class e{#e;constructor(e){this.#e=X(e)}ifExists(){return new e({...this.#e,node:Hd.cloneWith(this.#e.node,{ifExists:!0})})}cascade(){return new e({...this.#e,node:Hd.cloneWith(this.#e.node,{cascade:!0})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};function Wd(e){if(e.includes(`.`)){let t=e.split(`.`).map(Kd);if(t.length===2)return Ao.createWithSchema(t[0],t[1]);throw Error(`invalid schemable identifier ${e}`)}return Ao.create(e)}function Gd(e){return Array.isArray(e)||(e=[e]),e.map(Wd)}function Kd(e){return e.trim()}const qd=X({is(e){return e.kind===`RefreshMaterializedViewNode`},create(e){return X({kind:`RefreshMaterializedViewNode`,name:Ao.create(e)})},cloneWith(e,t){return X({...e,...t})}});var Jd=class e{#e;constructor(e){this.#e=X(e)}concurrently(){return new e({...this.#e,node:qd.cloneWith(this.#e.node,{concurrently:!0,withNoData:!1})})}withData(){return new e({...this.#e,node:qd.cloneWith(this.#e.node,{withNoData:!1})})}withNoData(){return new e({...this.#e,node:qd.cloneWith(this.#e.node,{withNoData:!0,concurrently:!1})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};const Yd=X({is(e){return e.kind===`AlterTypeNode`},create(e){return X({kind:`AlterTypeNode`,name:e})},cloneWith(e,t){return X({...e,...t})}}),Xd=X({is(e){return e.kind===`AddValueNode`},create(e){return X({kind:`AddValueNode`,value:e})},cloneWith(e,t){return X({...e,...t})}});var Zd=class{#e;constructor(e){this.#e=X(e)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){return await this.#e.executor.executeQuery(this.compile(),e)}},Qd,$d=class extends Zd{#e;constructor(e){super(e),this.#e=e}ifNotExists(){return new Qd({...this.#e,node:Yd.cloneWith(this.#e.node,{addValue:Xd.cloneWith(this.#e.node.addValue,{ifNotExists:!0})})})}before(e){return this.#t(e,!0)}after(e){return this.#t(e,!1)}#t(e,t){return new Qd({...this.#e,node:Yd.cloneWith(this.#e.node,{addValue:Xd.cloneWith(this.#e.node.addValue,{isBefore:t,neighborValue:Is.createImmediate(e)})})})}};Qd=$d;const ef=X({is(e){return e.kind===`RenameValueNode`},create(e,t){return X({kind:`RenameValueNode`,oldValue:e,newValue:t})}});var tf=class{#e;constructor(e){this.#e=X(e)}addValue(e){return new $d({...this.#e,node:Yd.cloneWith(this.#e.node,{addValue:Xd.create(Is.createImmediate(e))})})}renameTo(e){return new Zd({...this.#e,node:Yd.cloneWith(this.#e.node,{renameTo:To.create(e)})})}renameValue(e,t){return new Zd({...this.#e,node:Yd.cloneWith(this.#e.node,{renameValue:ef.create(Is.createImmediate(e),Is.createImmediate(t))})})}setSchema(e){return new Zd({...this.#e,node:Yd.cloneWith(this.#e.node,{setSchema:To.create(e)})})}},nf=class e{#e;constructor(e){this.#e=e}createTable(e){return new jd({queryId:Q(),executor:this.#e,node:ko.create(Uu(e))})}dropTable(e){return new Pd({queryId:Q(),executor:this.#e,node:No.create(Uu(e))})}createIndex(e){return new Dd({queryId:Q(),executor:this.#e,node:Eo.create(e)})}dropIndex(e){return new Md({queryId:Q(),executor:this.#e,node:jo.create(e)})}createSchema(e){return new Od({queryId:Q(),executor:this.#e,node:Do.create(e)})}dropSchema(e){return new Nd({queryId:Q(),executor:this.#e,node:Mo.create(e)})}alterTable(e){return new wd({queryId:Q(),executor:this.#e,node:wo.create(Uu(e))})}createView(e){return new Ld({queryId:Q(),executor:this.#e,node:Fd.create(e)})}refreshMaterializedView(e){return new Jd({queryId:Q(),executor:this.#e,node:qd.create(e)})}dropView(e){return new zd({queryId:Q(),executor:this.#e,node:Rd.create(e)})}createType(e){return new Vd({queryId:Q(),executor:this.#e,node:Bd.create(Wd(e))})}alterType(e){return new tf({executor:this.#e,node:Yd.create(Wd(e)),queryId:Q()})}dropType(e){return new Ud({queryId:Q(),executor:this.#e,node:Hd.create(Gd(e))})}withPlugin(t){return new e(this.#e.withPlugin(t))}withoutPlugins(){return new e(this.#e.withoutPlugins())}withSchema(t){return new e(this.#e.withPluginAtFront(new _l(t)))}},rf=class{ref(e){return new ss(e)}table(e){return new Lu(e)}},af=class{#e;constructor(e){this.#e=e}async provideConnection(e,t){let n=await this.#e.acquireConnection(t);try{return await e(n)}finally{await this.#e.releaseConnection(n,t)}}},of=class e extends Ml{#e;#t;#n;constructor(e,t,n,r=[]){super(r),this.#e=e,this.#t=t,this.#n=n}get adapter(){return this.#t}compileQuery(e,t){return this.#e.compileQuery(e,t)}provideConnection(e,t){return this.#n.provideConnection(e,t)}withPlugins(t){return new e(this.#e,this.#t,this.#n,[...this.plugins,...t])}withPlugin(t){return new e(this.#e,this.#t,this.#n,[...this.plugins,t])}withPluginAtFront(t){return new e(this.#e,this.#t,this.#n,[t,...this.plugins])}withConnectionProvider(t){return new e(this.#e,this.#t,t,[...this.plugins])}withoutPlugins(){return new e(this.#e,this.#t,this.#n,[])}};function sf(){return typeof performance<`u`&&vo(performance.now)?performance.now():Date.now()}var cf=class{#e;#t;async obtainLock(){for(;this.#e;)await this.#e;this.#e=new Promise(e=>{this.#t=e})}releaseLock(){let e=this.#t;this.#e=void 0,this.#t=void 0,e?.()}},lf=class{#e;#t;#n;#r;#i;#a=new WeakSet;#o;constructor(e,t,n){this.#e=e,this.#r=!1,this.#t=n,t.supportsMultipleConnections===!1&&(this.#o=new cf)}async init(e){if(this.#i)throw Error(`driver has already been destroyed`);this.#n??=this.#e.init(e).then(()=>{this.#r=!0}).catch(e=>{throw this.#n=void 0,e}),await Ol(this.#n,e?.signal,`init`)}async acquireConnection(e){if(this.#i)throw Error(`driver has already been destroyed`);if(this.#r||await this.init(e),this.#o){let t=this.#o.obtainLock();await Ol(t,e?.signal,`acquireConnection:mutex`,()=>t.then(()=>this.#o?.releaseLock()))}let t=this.#e.acquireConnection(e),n=await Ol(t,e?.signal,`acquireConnection:acquire`,()=>t?.then(e=>this.releaseConnection(e).catch(kl(`driver.releaseConnection`))).catch(kl(`driver.acquireConnection`)));return this.#a.has(n)||(this.#s()&&this.#c(n),this.#a.add(n)),n}async releaseConnection(e,t){await this.#e.releaseConnection(e,t),this.#o?.releaseLock()}async beginTransaction(e,t){return await this.#e.beginTransaction(e,t)}async commitTransaction(e){return await this.#e.commitTransaction(e)}async rollbackTransaction(e){return await this.#e.rollbackTransaction(e)}async savepoint(e,t,n){if(this.#e.savepoint)return await this.#e.savepoint(e,t,n);throw Error("The `savepoint` method is not supported by this driver")}async rollbackToSavepoint(e,t,n){if(this.#e.rollbackToSavepoint)return await this.#e.rollbackToSavepoint(e,t,n);throw Error("The `rollbackToSavepoint` method is not supported by this driver")}async releaseSavepoint(e,t,n){if(this.#e.releaseSavepoint)return await this.#e.releaseSavepoint(e,t,n);throw Error("The `releaseSavepoint` method is not supported by this driver")}async destroy(e){this.#n&&(await Ol(this.#n,e?.signal,`destroy:initPromise`),this.#i??=this.#e.destroy(e).catch(e=>{throw this.#i=void 0,e}),await Ol(this.#i,e?.signal,`destroy`))}#s(){return this.#t.isLevelEnabled(`query`)||this.#t.isLevelEnabled(`error`)}#c(e){let t=e.executeQuery,n=e.streamQuery,r=this;e.executeQuery=async(n,i)=>{let a,o=sf();try{return await t.call(e,n,i)}catch(e){throw a=e,await r.#l(e,n,o),e}finally{a||await r.#u(n,o)}},e.streamQuery=async function*(t,i,a){let o,s=sf();try{for await(let r of n.call(e,t,i,a))yield r}catch(e){throw o=e,await r.#l(e,t,s),e}finally{o||await r.#u(t,s,!0)}}}async#l(e,t,n){await this.#t.error(()=>({level:`error`,error:e,query:t,queryDurationMillis:this.#d(n)}))}async#u(e,t,n=!1){await this.#t.query(()=>({level:`query`,isStream:n,query:e,queryDurationMillis:this.#d(t)}))}#d(e){return sf()-e}};const uf=()=>{};var df=class{#e;#t;constructor(e){this.#e=e}async provideConnection(e){for(;this.#t;)await this.#t.catch(uf);return this.#t=this.#n(e).finally(()=>{this.#t=void 0}),this.#t}async#n(e){return await e(this.#e)}};const ff=[`read only`,`read write`],pf=[`read uncommitted`,`read committed`,`repeatable read`,`serializable`,`snapshot`];function mf(e){if(e.accessMode&&!ff.includes(e.accessMode))throw Error(`invalid transaction access mode ${e.accessMode}`);if(e.isolationLevel&&!pf.includes(e.isolationLevel))throw Error(`invalid transaction isolation level ${e.isolationLevel}`)}X([`query`,`error`]);var hf=class{#e;#t;constructor(e){vo(e)?(this.#t=e,this.#e=X({query:!0,error:!0})):(this.#t=gf,this.#e=X({query:e.includes(`query`),error:e.includes(`error`)}))}isLevelEnabled(e){return this.#e[e]}async query(e){this.#e.query&&await this.#t(e())}async error(e){this.#e.error&&await this.#t(e())}};function gf(e){if(e.level===`query`){let t=`kysely:query:${e.isStream?`stream:`:``}`;console.log(`${t} ${e.query.sql}`),console.log(`${t} duration: ${e.queryDurationMillis.toFixed(1)}ms`)}else e.level===`error`&&(e.error instanceof Error?console.error(`kysely:error: ${e.error.stack??e.error.message}`):console.error(`kysely:error: ${JSON.stringify({error:e.error,query:e.query.sql,queryDurationMillis:e.queryDurationMillis})}`))}function _f(e){return yo(e)&&vo(e.compile)}Symbol.asyncDispose??=Symbol(`Symbol.asyncDispose`);var vf=class e extends zl{#e;constructor(e){let t,n;if(bf(e))t={executor:e.executor},n={...e};else{let r=e.dialect,i=r.createDriver(),a=r.createQueryCompiler(),o=r.createAdapter(),s=new lf(i,o,new hf(e.log??[])),c=new of(a,o,new af(s),e.plugins??[]);t={executor:c},n={config:e,executor:c,dialect:r,driver:s}}super(t),this.#e=X(n)}get schema(){return new nf(this.#e.executor)}get dynamic(){return new rf}get introspection(){return this.#e.dialect.createIntrospector(this.withoutPlugins())}case(e){return new gu({node:hu.create(uo(e)?void 0:Pu(e))})}get fn(){return fu()}transaction(){return new Sf({...this.#e})}startTransaction(){return new Cf({...this.#e})}connection(){return new xf({...this.#e})}withPlugin(t){return new e({...this.#e,executor:this.#e.executor.withPlugin(t)})}withoutPlugins(){return new e({...this.#e,executor:this.#e.executor.withoutPlugins()})}withSchema(t){return new e({...this.#e,executor:this.#e.executor.withPluginAtFront(new _l(t))})}$extendTables(){return new e({...this.#e})}$omitTables(){return new e({...this.#e})}$pickTables(){return new e({...this.#e})}withTables(){return this.$extendTables()}async destroy(){await this.#e.driver.destroy()}get isTransaction(){return!1}getExecutor(){return this.#e.executor}async executeQuery(e,t){let n=_f(e)?e.compile():e;return await this.#e.executor.executeQuery(n,t)}async[Symbol.asyncDispose](){await this.destroy()}},yf=class e extends vf{#e;constructor(e){super(e),this.#e=e}get isTransaction(){return!0}transaction(){throw Error(`calling the transaction method for a Transaction is not supported`)}startTransaction(){throw Error(`calling the controlled transaction method for a Transaction is not supported`)}connection(){throw Error(`calling the connection method for a Transaction is not supported`)}destroy(){throw Error(`calling the destroy method for a Transaction is not supported`)}withPlugin(t){return new e({...this.#e,executor:this.#e.executor.withPlugin(t)})}withoutPlugins(){return new e({...this.#e,executor:this.#e.executor.withoutPlugins()})}withSchema(t){return new e({...this.#e,executor:this.#e.executor.withPluginAtFront(new _l(t))})}withTables(){return new e({...this.#e})}$extendTables(){return new e({...this.#e})}$omitTables(){return new e({...this.#e})}$pickTables(){return new e({...this.#e})}};function bf(e){return yo(e)&&yo(e.config)&&yo(e.driver)&&yo(e.executor)&&yo(e.dialect)}var xf=class{#e;constructor(e){this.#e=X(e)}async execute(e,t){return this.#e.executor.provideConnection(async t=>{let n=this.#e.executor.withConnectionProvider(new df(t));return await e(new vf({...this.#e,executor:n}))},X({signal:t?.signal}))}},Sf=class e{#e;constructor(e){this.#e=X(e)}setAccessMode(t){return new e({...this.#e,accessMode:t})}setIsolationLevel(t){return new e({...this.#e,isolationLevel:t})}async execute(e){let{isolationLevel:t,accessMode:n,...r}=this.#e,i={isolationLevel:t,accessMode:n};return mf(i),this.#e.executor.provideConnection(async t=>{let n={isCommitted:!1,isRolledBack:!1},a=new Df(this.#e.executor.withConnectionProvider(new df(t)),n),o=new yf({...r,executor:a}),s=!1;try{await this.#e.driver.beginTransaction(t,i),s=!0;let r=await e(o);return await this.#e.driver.commitTransaction(t),n.isCommitted=!0,r}catch(e){throw s&&(await this.#e.driver.rollbackTransaction(t),n.isRolledBack=!0),e}})}},Cf=class e{#e;constructor(e){this.#e=X(e)}setAccessMode(t){return new e({...this.#e,accessMode:t})}setIsolationLevel(t){return new e({...this.#e,isolationLevel:t})}async execute(){let{isolationLevel:e,accessMode:t,...n}=this.#e,r={isolationLevel:e,accessMode:t};mf(r);let i=await Sl(this.#e.executor);return await this.#e.driver.beginTransaction(i.connection,r),new wf({...n,connection:i,executor:this.#e.executor.withConnectionProvider(new df(i.connection))})}},wf=class e extends yf{#e;#t;#n;constructor(e){let t={isCommitted:!1,isRolledBack:!1};e={...e,executor:new Df(e.executor,t)};let{connection:n,...r}=e;super(r),this.#e=X(e),this.#n=t;let i=Q();this.#t=t=>e.executor.compileQuery(t,i)}get isCommitted(){return this.#n.isCommitted}get isRolledBack(){return this.#n.isRolledBack}commit(){return Ef(this.#n),new Tf(async()=>{await this.#e.driver.commitTransaction(this.#e.connection.connection),this.#n.isCommitted=!0,this.#e.connection.release()})}rollback(){return Ef(this.#n),new Tf(async()=>{await this.#e.driver.rollbackTransaction(this.#e.connection.connection),this.#n.isRolledBack=!0,this.#e.connection.release()})}savepoint(t){return Ef(this.#n),new Tf(async()=>(await this.#e.driver.savepoint?.(this.#e.connection.connection,t,this.#t),new e({...this.#e})))}rollbackToSavepoint(t){return Ef(this.#n),new Tf(async()=>(await this.#e.driver.rollbackToSavepoint?.(this.#e.connection.connection,t,this.#t),new e({...this.#e})))}releaseSavepoint(t){return Ef(this.#n),new Tf(async()=>(await this.#e.driver.releaseSavepoint?.(this.#e.connection.connection,t,this.#t),new e({...this.#e})))}withPlugin(t){return new e({...this.#e,executor:this.#e.executor.withPlugin(t)})}withoutPlugins(){return new e({...this.#e,executor:this.#e.executor.withoutPlugins()})}withSchema(t){return new e({...this.#e,executor:this.#e.executor.withPluginAtFront(new _l(t))})}withTables(){return new e({...this.#e})}$extendTables(){return new e({...this.#e})}$omitTables(){return new e({...this.#e})}$pickTables(){return new e({...this.#e})}},Tf=class{#e;constructor(e){this.#e=e}async execute(){return await this.#e()}};function Ef(e){if(e.isCommitted)throw Error(`Transaction is already committed`);if(e.isRolledBack)throw Error(`Transaction is already rolled back`)}var Df=class e{#e;#t;constructor(t,n){this.#e=t instanceof e?t.#e:t,this.#t=n}get adapter(){return this.#e.adapter}get plugins(){return this.#e.plugins}transformQuery(e,t){return this.#e.transformQuery(e,t)}compileQuery(e,t){return this.#e.compileQuery(e,t)}provideConnection(e,t){return this.#e.provideConnection(e,t)}executeQuery(e,t){return Ef(this.#t),this.#e.executeQuery(e,t)}stream(e,t,n){return Ef(this.#t),this.#e.stream(e,t,n)}withConnectionProvider(t){return new e(this.#e.withConnectionProvider(t),this.#t)}withPlugin(t){return new e(this.#e.withPlugin(t),this.#t)}withPlugins(t){return new e(this.#e.withPlugins(t),this.#t)}withPluginAtFront(t){return new e(this.#e.withPluginAtFront(t),this.#t)}withoutPlugins(){return new e(this.#e.withoutPlugins(),this.#t)}},Of=class e{#e;constructor(e){this.#e=X(e)}get expressionType(){}get isRawBuilder(){return!0}as(e){return new Af(this,e)}$castTo(){return new e({...this.#e})}$notNull(){return new e(this.#e)}withPlugin(t){return new e({...this.#e,plugins:this.#e.plugins===void 0?X([t]):X([...this.#e.plugins,t])})}toOperationNode(){return this.#n(this.#t())}compile(e){return this.#r(this.#t(e))}async execute(e,t){let n=this.#t(e);return n.executeQuery(this.#r(n),t)}#t(e){let t=e===void 0?Nl:e.getExecutor();return this.#e.plugins===void 0?t:t.withPlugins(this.#e.plugins)}#n(e){return e.transformQuery(this.#e.rawNode,this.#e.queryId)}#r(e){return e.compileQuery(this.#n(e),this.#e.queryId)}};function kf(e){return new Of(e)}var Af=class{#e;#t;constructor(e,t){this.#e=e,this.#t=t}get expression(){return this.#e}get alias(){return this.#t}get rawBuilder(){return this.#e}toOperationNode(){return Po.create(this.#e.toOperationNode(),Io(this.#t)?this.#t.toOperationNode():To.create(this.#t))}};const jf=Object.assign((e,...t)=>kf({queryId:Q(),rawNode:us.create(e,t?.map(Mf)??[])}),{ref(e){return kf({queryId:Q(),rawNode:us.createWithChild(Ds(e))})},val(e){return kf({queryId:Q(),rawNode:us.createWithChild(Rs(e))})},table(e){return kf({queryId:Q(),rawNode:us.createWithChild(Uu(e))})},id(...e){let t=Array(e.length+1).fill(`.`);return t[0]=``,t[t.length-1]=``,kf({queryId:Q(),rawNode:us.create(t,e.map(To.create))})},lit(e){return kf({queryId:Q(),rawNode:us.createWithChild(Is.createImmediate(e))})},raw(e){return kf({queryId:Q(),rawNode:us.createWithSql(e)})},join(e,t=jf`, `){let n=Array(Math.max(2*e.length-1,0)),r=t.toOperationNode();for(let t=0;t<e.length;++t)n[2*t]=Mf(e[t]),t!==e.length-1&&(n[2*t+1]=r);return kf({queryId:Q(),rawNode:us.createWithChildren(n)})}});function Mf(e){return Io(e)?e.toOperationNode():Rs(e)}var Nf=class{nodeStack=[];get parentNode(){return this.nodeStack[this.nodeStack.length-2]}#e=X({AliasNode:this.visitAlias.bind(this),ColumnNode:this.visitColumn.bind(this),IdentifierNode:this.visitIdentifier.bind(this),SchemableIdentifierNode:this.visitSchemableIdentifier.bind(this),RawNode:this.visitRaw.bind(this),ReferenceNode:this.visitReference.bind(this),SelectQueryNode:this.visitSelectQuery.bind(this),SelectionNode:this.visitSelection.bind(this),TableNode:this.visitTable.bind(this),FromNode:this.visitFrom.bind(this),SelectAllNode:this.visitSelectAll.bind(this),AndNode:this.visitAnd.bind(this),OrNode:this.visitOr.bind(this),ValueNode:this.visitValue.bind(this),ValueListNode:this.visitValueList.bind(this),PrimitiveValueListNode:this.visitPrimitiveValueList.bind(this),ParensNode:this.visitParens.bind(this),JoinNode:this.visitJoin.bind(this),OperatorNode:this.visitOperator.bind(this),WhereNode:this.visitWhere.bind(this),InsertQueryNode:this.visitInsertQuery.bind(this),DeleteQueryNode:this.visitDeleteQuery.bind(this),ReturningNode:this.visitReturning.bind(this),CreateTableNode:this.visitCreateTable.bind(this),AddColumnNode:this.visitAddColumn.bind(this),ColumnDefinitionNode:this.visitColumnDefinition.bind(this),DropTableNode:this.visitDropTable.bind(this),DataTypeNode:this.visitDataType.bind(this),OrderByNode:this.visitOrderBy.bind(this),OrderByItemNode:this.visitOrderByItem.bind(this),GroupByNode:this.visitGroupBy.bind(this),GroupByItemNode:this.visitGroupByItem.bind(this),UpdateQueryNode:this.visitUpdateQuery.bind(this),ColumnUpdateNode:this.visitColumnUpdate.bind(this),LimitNode:this.visitLimit.bind(this),OffsetNode:this.visitOffset.bind(this),OnConflictNode:this.visitOnConflict.bind(this),OnDuplicateKeyNode:this.visitOnDuplicateKey.bind(this),CreateIndexNode:this.visitCreateIndex.bind(this),DropIndexNode:this.visitDropIndex.bind(this),ListNode:this.visitList.bind(this),PrimaryKeyConstraintNode:this.visitPrimaryKeyConstraint.bind(this),UniqueConstraintNode:this.visitUniqueConstraint.bind(this),ReferencesNode:this.visitReferences.bind(this),CheckConstraintNode:this.visitCheckConstraint.bind(this),WithNode:this.visitWith.bind(this),CommonTableExpressionNode:this.visitCommonTableExpression.bind(this),CommonTableExpressionNameNode:this.visitCommonTableExpressionName.bind(this),HavingNode:this.visitHaving.bind(this),CreateSchemaNode:this.visitCreateSchema.bind(this),DropSchemaNode:this.visitDropSchema.bind(this),AlterTableNode:this.visitAlterTable.bind(this),DropColumnNode:this.visitDropColumn.bind(this),RenameColumnNode:this.visitRenameColumn.bind(this),AlterColumnNode:this.visitAlterColumn.bind(this),ModifyColumnNode:this.visitModifyColumn.bind(this),AddConstraintNode:this.visitAddConstraint.bind(this),DropConstraintNode:this.visitDropConstraint.bind(this),RenameConstraintNode:this.visitRenameConstraint.bind(this),ForeignKeyConstraintNode:this.visitForeignKeyConstraint.bind(this),CreateViewNode:this.visitCreateView.bind(this),RefreshMaterializedViewNode:this.visitRefreshMaterializedView.bind(this),DropViewNode:this.visitDropView.bind(this),GeneratedNode:this.visitGenerated.bind(this),DefaultValueNode:this.visitDefaultValue.bind(this),OnNode:this.visitOn.bind(this),ValuesNode:this.visitValues.bind(this),SelectModifierNode:this.visitSelectModifier.bind(this),CreateTypeNode:this.visitCreateType.bind(this),DropTypeNode:this.visitDropType.bind(this),ExplainNode:this.visitExplain.bind(this),DefaultInsertValueNode:this.visitDefaultInsertValue.bind(this),AggregateFunctionNode:this.visitAggregateFunction.bind(this),OverNode:this.visitOver.bind(this),PartitionByNode:this.visitPartitionBy.bind(this),PartitionByItemNode:this.visitPartitionByItem.bind(this),SetOperationNode:this.visitSetOperation.bind(this),BinaryOperationNode:this.visitBinaryOperation.bind(this),UnaryOperationNode:this.visitUnaryOperation.bind(this),UsingNode:this.visitUsing.bind(this),FunctionNode:this.visitFunction.bind(this),CaseNode:this.visitCase.bind(this),WhenNode:this.visitWhen.bind(this),JSONReferenceNode:this.visitJSONReference.bind(this),JSONPathNode:this.visitJSONPath.bind(this),JSONPathLegNode:this.visitJSONPathLeg.bind(this),JSONOperatorChainNode:this.visitJSONOperatorChain.bind(this),TupleNode:this.visitTuple.bind(this),MergeQueryNode:this.visitMergeQuery.bind(this),MatchedNode:this.visitMatched.bind(this),AddIndexNode:this.visitAddIndex.bind(this),CastNode:this.visitCast.bind(this),FetchNode:this.visitFetch.bind(this),TopNode:this.visitTop.bind(this),OutputNode:this.visitOutput.bind(this),OrActionNode:this.visitOrAction.bind(this),CollateNode:this.visitCollate.bind(this),AlterTypeNode:this.visitAlterType.bind(this),AddValueNode:this.visitAddValue.bind(this),RenameValueNode:this.visitRenameValue.bind(this)});visitNode=e=>{this.nodeStack.push(e),this.#e[e.kind](e),this.nodeStack.pop()}};const Pf=/'/g,Ff=/['"]/g;var If=class extends Nf{#e=``;#t=[];get numParameters(){return this.#t.length}compileQuery(e,t){return this.#e=``,this.#t=[],this.nodeStack.splice(0,this.nodeStack.length),this.visitNode(e),X({query:e,queryId:t,sql:this.getSql(),parameters:[...this.#t]})}getSql(){return this.#e}visitSelectQuery(e){let t=this.parentNode!==void 0&&!Hs.is(this.parentNode)&&!ic.is(this.parentNode)&&!ko.is(this.parentNode)&&!Fd.is(this.parentNode)&&!Xl.is(this.parentNode);this.parentNode===void 0&&e.explain&&(this.visitNode(e.explain),this.append(` `)),t&&this.append(`(`),e.with&&(this.visitNode(e.with),this.append(` `)),this.append(`select`),e.distinctOn&&(this.append(` `),this.compileDistinctOn(e.distinctOn)),e.frontModifiers?.length&&(this.append(` `),this.compileList(e.frontModifiers,` `)),e.top&&(this.append(` `),this.visitNode(e.top)),e.selections&&(this.append(` `),this.compileList(e.selections)),e.from&&(this.append(` `),this.visitNode(e.from)),e.joins&&(this.append(` `),this.compileList(e.joins,` `)),e.where&&(this.append(` `),this.visitNode(e.where)),e.groupBy&&(this.append(` `),this.visitNode(e.groupBy)),e.having&&(this.append(` `),this.visitNode(e.having)),e.setOperations&&(this.append(` `),this.compileList(e.setOperations,` `)),e.orderBy&&(this.append(` `),this.visitNode(e.orderBy)),e.limit&&(this.append(` `),this.visitNode(e.limit)),e.offset&&(this.append(` `),this.visitNode(e.offset)),e.fetch&&(this.append(` `),this.visitNode(e.fetch)),e.endModifiers?.length&&(this.append(` `),this.compileList(this.sortSelectModifiers(e.endModifiers),` `)),t&&this.append(`)`)}visitFrom(e){this.append(`from `),this.compileList(e.froms)}visitSelection(e){this.visitNode(e.selection)}visitColumn(e){this.visitNode(e.column)}compileDistinctOn(e){this.append(`distinct on (`),this.compileList(e),this.append(`)`)}compileList(e,t=`, `){let n=e.length-1;for(let r=0;r<=n;r++)this.visitNode(e[r]),r<n&&this.append(t)}visitWhere(e){this.append(`where `),this.visitNode(e.where)}visitHaving(e){this.append(`having `),this.visitNode(e.having)}visitInsertQuery(e){let t=this.parentNode!==void 0&&!Hs.is(this.parentNode)&&!us.is(this.parentNode)&&!fc.is(this.parentNode);this.parentNode===void 0&&e.explain&&(this.visitNode(e.explain),this.append(` `)),t&&this.append(`(`),e.with&&(this.visitNode(e.with),this.append(` `)),this.append(e.replace?`replace`:`insert`),e.orAction&&(this.append(` `),this.visitNode(e.orAction)),e.top&&(this.append(` `),this.visitNode(e.top)),e.into&&(this.append(` into `),this.visitNode(e.into)),e.columns&&(this.append(` (`),this.compileList(e.columns),this.append(`)`)),e.output&&(this.append(` `),this.visitNode(e.output)),e.values&&(this.append(` `),this.visitNode(e.values)),e.defaultValues&&(this.append(` `),this.append(`default values`)),e.onConflict&&(this.append(` `),this.visitNode(e.onConflict)),e.onDuplicateKey&&(this.append(` `),this.visitNode(e.onDuplicateKey)),e.returning&&(this.append(` `),this.visitNode(e.returning)),t&&this.append(`)`),e.endModifiers?.length&&(this.append(` `),this.compileList(e.endModifiers,` `))}visitValues(e){this.append(`values `),this.compileList(e.values)}visitDeleteQuery(e){let t=this.parentNode!==void 0&&!Hs.is(this.parentNode)&&!us.is(this.parentNode);this.parentNode===void 0&&e.explain&&(this.visitNode(e.explain),this.append(` `)),t&&this.append(`(`),e.with&&(this.visitNode(e.with),this.append(` `)),this.append(`delete `),e.top&&(this.visitNode(e.top),this.append(` `)),this.visitNode(e.from),e.output&&(this.append(` `),this.visitNode(e.output)),e.using&&(this.append(` `),this.visitNode(e.using)),e.joins&&(this.append(` `),this.compileList(e.joins,` `)),e.where&&(this.append(` `),this.visitNode(e.where)),e.returning&&(this.append(` `),this.visitNode(e.returning)),e.orderBy&&(this.append(` `),this.visitNode(e.orderBy)),e.limit&&(this.append(` `),this.visitNode(e.limit)),t&&this.append(`)`),e.endModifiers?.length&&(this.append(` `),this.compileList(e.endModifiers,` `))}visitReturning(e){this.append(`returning `),this.compileList(e.selections)}visitAlias(e){this.visitNode(e.node),this.append(` as `),this.visitNode(e.alias)}visitReference(e){e.table&&(this.visitNode(e.table),this.append(`.`)),this.visitNode(e.column)}visitSelectAll(e){this.append(`*`)}visitIdentifier(e){this.append(this.getLeftIdentifierWrapper()),this.compileUnwrappedIdentifier(e),this.append(this.getRightIdentifierWrapper())}compileUnwrappedIdentifier(e){if(!fo(e.name))throw Error(`a non-string identifier was passed to compileUnwrappedIdentifier.`);this.append(this.sanitizeIdentifier(e.name))}visitAnd(e){this.visitNode(e.left),this.append(` and `),this.visitNode(e.right)}visitOr(e){this.visitNode(e.left),this.append(` or `),this.visitNode(e.right)}visitValue(e){e.immediate?this.appendImmediateValue(e.value):this.appendValue(e.value)}visitValueList(e){this.append(`(`),this.compileList(e.values),this.append(`)`)}visitTuple(e){this.append(`(`),this.compileList(e.values),this.append(`)`)}visitPrimitiveValueList(e){this.append(`(`);let{values:t}=e;for(let e=0;e<t.length;++e)this.appendValue(t[e]),e!==t.length-1&&this.append(`, `);this.append(`)`)}visitParens(e){this.append(`(`),this.visitNode(e.node),this.append(`)`)}visitJoin(e){this.append(zf[e.joinType]),this.append(` `),this.visitNode(e.table),e.on&&(this.append(` `),this.visitNode(e.on))}visitOn(e){this.append(`on `),this.visitNode(e.on)}visitRaw(e){let{sqlFragments:t,parameters:n}=e;for(let e=0;e<t.length;++e)this.append(t[e]),n.length>e&&this.visitNode(n[e])}visitOperator(e){this.append(e.operator)}visitTable(e){this.visitNode(e.table)}visitSchemableIdentifier(e){e.schema&&(this.visitNode(e.schema),this.append(`.`)),this.visitNode(e.identifier)}visitCreateTable(e){this.append(`create `),e.frontModifiers?.length&&(this.compileList(e.frontModifiers,` `),this.append(` `)),e.temporary&&this.append(`temporary `),this.append(`table `),e.ifNotExists&&this.append(`if not exists `),this.visitNode(e.table),e.selectQuery||(this.append(` (`),this.compileList([...e.columns,...e.constraints??[],...e.indexes??[]]),this.append(`)`)),e.onCommit&&(this.append(` on commit `),this.append(e.onCommit)),e.endModifiers?.length&&(this.append(` `),this.compileList(e.endModifiers,` `)),e.selectQuery&&(this.append(` as `),this.visitNode(e.selectQuery))}visitColumnDefinition(e){e.ifNotExists&&this.append(`if not exists `),this.visitNode(e.column),this.append(` `),this.visitNode(e.dataType),e.unsigned&&this.append(` unsigned`),e.frontModifiers&&e.frontModifiers.length>0&&(this.append(` `),this.compileList(e.frontModifiers,` `)),e.generated&&(this.append(` `),this.visitNode(e.generated)),e.identity&&this.append(` identity`),e.defaultTo&&(this.append(` `),this.visitNode(e.defaultTo)),e.notNull&&this.append(` not null`),e.unique&&this.append(` unique`),e.nullsNotDistinct&&this.append(` nulls not distinct`),e.primaryKey&&this.append(` primary key`),e.autoIncrement&&(this.append(` `),this.append(this.getAutoIncrement())),e.references&&(this.append(` `),this.visitNode(e.references)),e.check&&(this.append(` `),this.visitNode(e.check)),e.endModifiers&&e.endModifiers.length>0&&(this.append(` `),this.compileList(e.endModifiers,` `))}getAutoIncrement(){return`auto_increment`}visitReferences(e){this.append(`references `),this.visitNode(e.table),this.append(` (`),this.compileList(e.columns),this.append(`)`),e.onDelete&&(this.append(` on delete `),this.append(e.onDelete)),e.onUpdate&&(this.append(` on update `),this.append(e.onUpdate))}visitDropTable(e){this.append(`drop `),e.temporary&&this.append(`temporary `),this.append(`table `),e.ifExists&&this.append(`if exists `),this.visitNode(e.table),e.cascade&&this.append(` cascade`)}visitDataType(e){this.append(e.dataType)}visitOrderBy(e){this.append(`order by `),this.compileList(e.items)}visitOrderByItem(e){this.visitNode(e.orderBy),e.collation&&(this.append(` `),this.visitNode(e.collation)),e.direction&&(this.append(` `),this.visitNode(e.direction)),e.nulls&&(this.append(` nulls `),this.append(e.nulls))}visitGroupBy(e){this.append(`group by `),this.compileList(e.items)}visitGroupByItem(e){this.visitNode(e.groupBy)}visitUpdateQuery(e){let t=this.parentNode!==void 0&&!Hs.is(this.parentNode)&&!us.is(this.parentNode)&&!fc.is(this.parentNode);if(this.parentNode===void 0&&e.explain&&(this.visitNode(e.explain),this.append(` `)),t&&this.append(`(`),e.with&&(this.visitNode(e.with),this.append(` `)),this.append(`update `),e.top&&(this.visitNode(e.top),this.append(` `)),e.table&&(this.visitNode(e.table),this.append(` `)),this.append(`set `),e.updates&&this.compileList(e.updates),e.output&&(this.append(` `),this.visitNode(e.output)),e.from&&(this.append(` `),this.visitNode(e.from)),e.joins){if(!e.from)throw Error(`Joins in an update query are only supported as a part of a PostgreSQL 'update set from join' query. If you want to create a MySQL 'update join set' query, see https://kysely.dev/docs/examples/update/my-sql-joins`);this.append(` `),this.compileList(e.joins,` `)}e.where&&(this.append(` `),this.visitNode(e.where)),e.returning&&(this.append(` `),this.visitNode(e.returning)),e.orderBy&&(this.append(` `),this.visitNode(e.orderBy)),e.limit&&(this.append(` `),this.visitNode(e.limit)),t&&this.append(`)`),e.endModifiers?.length&&(this.append(` `),this.compileList(e.endModifiers,` `))}visitColumnUpdate(e){this.visitNode(e.column),this.append(` = `),this.visitNode(e.value)}visitLimit(e){this.append(`limit `),this.visitNode(e.limit)}visitOffset(e){this.append(`offset `),this.visitNode(e.offset)}visitOnConflict(e){this.append(`on conflict`),e.columns?(this.append(` (`),this.compileList(e.columns),this.append(`)`)):e.constraint?(this.append(` on constraint `),this.visitNode(e.constraint)):e.indexExpression&&(this.append(` (`),this.visitNode(e.indexExpression),this.append(`)`)),e.indexWhere&&(this.append(` `),this.visitNode(e.indexWhere)),e.doNothing===!0?this.append(` do nothing`):e.updates&&(this.append(` do update set `),this.compileList(e.updates),e.updateWhere&&(this.append(` `),this.visitNode(e.updateWhere)))}visitOnDuplicateKey(e){this.append(`on duplicate key update `),this.compileList(e.updates)}visitCreateIndex(e){this.append(`create `),e.unique&&this.append(`unique `),this.append(`index `),e.ifNotExists&&this.append(`if not exists `),this.visitNode(e.name),e.table&&(this.append(` on `),this.visitNode(e.table)),e.using&&(this.append(` using `),this.visitNode(e.using)),e.columns&&(this.append(` (`),this.compileList(e.columns),this.append(`)`)),e.nullsNotDistinct&&this.append(` nulls not distinct`),e.where&&(this.append(` `),this.visitNode(e.where))}visitDropIndex(e){this.append(`drop index `),e.ifExists&&this.append(`if exists `),this.visitNode(e.name),e.table&&(this.append(` on `),this.visitNode(e.table)),e.cascade&&this.append(` cascade`)}visitCreateSchema(e){this.append(`create schema `),e.ifNotExists&&this.append(`if not exists `),this.visitNode(e.schema)}visitDropSchema(e){this.append(`drop schema `),e.ifExists&&this.append(`if exists `),this.visitNode(e.schema),e.cascade&&this.append(` cascade`)}visitPrimaryKeyConstraint(e){e.name&&(this.append(`constraint `),this.visitNode(e.name),this.append(` `)),this.append(`primary key (`),this.compileList(e.columns),this.append(`)`),this.buildDeferrable(e)}buildDeferrable(e){e.deferrable!==void 0&&(e.deferrable?this.append(` deferrable`):this.append(` not deferrable`)),e.initiallyDeferred!==void 0&&(e.initiallyDeferred?this.append(` initially deferred`):this.append(` initially immediate`))}visitUniqueConstraint(e){e.name&&(this.append(`constraint `),this.visitNode(e.name),this.append(` `)),this.append(`unique`),e.nullsNotDistinct&&this.append(` nulls not distinct`),this.append(` (`),this.compileList(e.columns),this.append(`)`),this.buildDeferrable(e)}visitCheckConstraint(e){e.name&&(this.append(`constraint `),this.visitNode(e.name),this.append(` `)),this.append(`check (`),this.visitNode(e.expression),this.append(`)`)}visitForeignKeyConstraint(e){e.name&&(this.append(`constraint `),this.visitNode(e.name),this.append(` `)),this.append(`foreign key (`),this.compileList(e.columns),this.append(`) `),this.visitNode(e.references),e.onDelete&&(this.append(` on delete `),this.append(e.onDelete)),e.onUpdate&&(this.append(` on update `),this.append(e.onUpdate)),this.buildDeferrable(e)}visitList(e){this.compileList(e.items)}visitWith(e){this.append(`with `),e.recursive&&this.append(`recursive `),this.compileList(e.expressions)}visitCommonTableExpression(e){this.visitNode(e.name),this.append(` as `),mo(e.materialized)&&(e.materialized||this.append(`not `),this.append(`materialized `)),this.visitNode(e.expression)}visitCommonTableExpressionName(e){this.visitNode(e.table),e.columns&&(this.append(`(`),this.compileList(e.columns),this.append(`)`))}visitAlterTable(e){this.append(`alter table `),this.visitNode(e.table),this.append(` `),e.renameTo&&(this.append(`rename to `),this.visitNode(e.renameTo)),e.setSchema&&(this.append(`set schema `),this.visitNode(e.setSchema)),e.addConstraint&&this.visitNode(e.addConstraint),e.dropConstraint&&this.visitNode(e.dropConstraint),e.renameConstraint&&this.visitNode(e.renameConstraint),e.columnAlterations&&this.compileColumnAlterations(e.columnAlterations),e.addIndex&&this.visitNode(e.addIndex),e.dropIndex&&this.visitNode(e.dropIndex)}visitAddColumn(e){this.append(`add column `),this.visitNode(e.column)}visitRenameColumn(e){this.append(`rename column `),this.visitNode(e.column),this.append(` to `),this.visitNode(e.renameTo)}visitDropColumn(e){this.append(`drop column `),e.ifExists&&this.append(`if exists `),this.visitNode(e.column)}visitAlterColumn(e){this.append(`alter column `),this.visitNode(e.column),this.append(` `),e.dataType&&(this.announcesNewColumnDataType()&&this.append(`type `),this.visitNode(e.dataType),e.dataTypeExpression&&(this.append(`using `),this.visitNode(e.dataTypeExpression))),e.setDefault&&(this.append(`set default `),this.visitNode(e.setDefault)),e.dropDefault&&this.append(`drop default`),e.setNotNull&&this.append(`set not null`),e.dropNotNull&&this.append(`drop not null`)}visitModifyColumn(e){this.append(`modify column `),this.visitNode(e.column)}visitAddConstraint(e){this.append(`add `),this.visitNode(e.constraint)}visitDropConstraint(e){this.append(`drop constraint `),e.ifExists&&this.append(`if exists `),this.visitNode(e.constraintName),e.modifier===`cascade`?this.append(` cascade`):e.modifier===`restrict`&&this.append(` restrict`)}visitRenameConstraint(e){this.append(`rename constraint `),this.visitNode(e.oldName),this.append(` to `),this.visitNode(e.newName)}visitSetOperation(e){this.append(e.operator),this.append(` `),e.all&&this.append(`all `),this.visitNode(e.expression)}visitCreateView(e){this.append(`create `),e.orReplace&&this.append(`or replace `),e.materialized&&this.append(`materialized `),e.temporary&&this.append(`temporary `),this.append(`view `),e.ifNotExists&&this.append(`if not exists `),this.visitNode(e.name),this.append(` `),e.columns&&(this.append(`(`),this.compileList(e.columns),this.append(`) `)),e.as&&(this.append(`as `),this.visitNode(e.as))}visitRefreshMaterializedView(e){this.append(`refresh materialized view `),e.concurrently&&this.append(`concurrently `),this.visitNode(e.name),e.withNoData?this.append(` with no data`):this.append(` with data`)}visitDropView(e){this.append(`drop `),e.materialized&&this.append(`materialized `),this.append(`view `),e.ifExists&&this.append(`if exists `),this.visitNode(e.name),e.cascade&&this.append(` cascade`)}visitGenerated(e){this.append(`generated `),e.always&&this.append(`always `),e.byDefault&&this.append(`by default `),this.append(`as `),e.identity&&this.append(`identity`),e.expression&&(this.append(`(`),this.visitNode(e.expression),this.append(`)`)),e.stored&&this.append(` stored`)}visitDefaultValue(e){this.append(`default `),this.visitNode(e.defaultValue)}visitSelectModifier(e){e.rawModifier?this.visitNode(e.rawModifier):this.append(Lf[e.modifier]),e.of&&(this.append(` of `),this.compileList(e.of,`, `))}visitCreateType(e){this.append(`create type `),this.visitNode(e.name),e.enum&&(this.append(` as enum `),this.visitNode(e.enum))}visitDropType(e){this.append(`drop type `),e.ifExists&&this.append(`if exists `),this.visitNode(e.name),e.additionalNames?.length&&(this.append(`, `),this.compileList(e.additionalNames)),e.cascade&&this.append(` cascade`)}visitAlterType(e){this.append(`alter type `),this.visitNode(e.name),this.append(` `),e.addValue?this.visitNode(e.addValue):e.renameTo?(this.append(`rename to `),this.visitNode(e.renameTo)):e.renameValue?this.visitNode(e.renameValue):e.setSchema&&(this.append(`set schema `),this.visitNode(e.setSchema))}visitAddValue(e){this.append(`add value `),e.ifNotExists&&this.append(`if not exists `),this.visitNode(e.value),e.neighborValue&&(this.append(e.isBefore?` before `:` after `),this.visitNode(e.neighborValue))}visitRenameValue(e){this.append(`rename value `),this.visitNode(e.oldValue),this.append(` to `),this.visitNode(e.newValue)}visitExplain(e){this.append(`explain`),(e.options||e.format)&&(this.append(` `),this.append(this.getLeftExplainOptionsWrapper()),e.options&&(this.visitNode(e.options),e.format&&this.append(this.getExplainOptionsDelimiter())),e.format&&(this.append(`format`),this.append(this.getExplainOptionAssignment()),this.append(e.format)),this.append(this.getRightExplainOptionsWrapper()))}visitDefaultInsertValue(e){this.append(`default`)}visitAggregateFunction(e){this.append(e.func),this.append(`(`),e.distinct&&this.append(`distinct `),this.compileList(e.aggregated),e.orderBy&&(this.append(` `),this.visitNode(e.orderBy)),this.append(`)`),e.withinGroup&&(this.append(` within group (`),this.visitNode(e.withinGroup),this.append(`)`)),e.filter&&(this.append(` filter(`),this.visitNode(e.filter),this.append(`)`)),e.over&&(this.append(` `),this.visitNode(e.over))}visitOver(e){this.append(`over(`),e.partitionBy&&(this.visitNode(e.partitionBy),e.orderBy&&this.append(` `)),e.orderBy&&this.visitNode(e.orderBy),this.append(`)`)}visitPartitionBy(e){this.append(`partition by `),this.compileList(e.items)}visitPartitionByItem(e){this.visitNode(e.partitionBy)}visitBinaryOperation(e){this.visitNode(e.leftOperand),this.append(` `),this.visitNode(e.operator),this.append(` `),this.visitNode(e.rightOperand)}visitUnaryOperation(e){this.visitNode(e.operator),this.isMinusOperator(e.operator)||this.append(` `),this.visitNode(e.operand)}isMinusOperator(e){return es.is(e)&&e.operator===`-`}visitUsing(e){this.append(`using `),this.compileList(e.tables)}visitFunction(e){this.append(e.func),this.append(`(`),this.compileList(e.arguments),this.append(`)`)}visitCase(e){this.append(`case`),e.value&&(this.append(` `),this.visitNode(e.value)),e.when&&(this.append(` `),this.compileList(e.when,` `)),e.else&&(this.append(` else `),this.visitNode(e.else)),this.append(` end`),e.isStatement&&this.append(` case`)}visitWhen(e){this.append(`when `),this.visitNode(e.condition),e.result&&(this.append(` then `),this.visitNode(e.result))}visitJSONReference(e){this.visitNode(e.reference),this.visitNode(e.traversal)}visitJSONPath(e){e.inOperator&&this.visitNode(e.inOperator),this.append(`'$`);for(let t of e.pathLegs)this.visitNode(t);this.append(`'`)}visitJSONPathLeg(e){let t=e.type===`ArrayLocation`,n=String(e.value);t?(this.append(`[`),this.append(this.sanitizeStringLiteral(n)),this.append(`]`)):(this.append(`."`),this.append(this.sanitizeJSONPathMemberValue(n)),this.append(`"`))}visitJSONOperatorChain(e){for(let t=0,n=e.values.length;t<n;t++)t===n-1?this.visitNode(e.operator):this.append(`->`),this.visitNode(e.values[t])}visitMergeQuery(e){e.with&&(this.visitNode(e.with),this.append(` `)),this.append(`merge `),e.top&&(this.visitNode(e.top),this.append(` `)),this.append(`into `),this.visitNode(e.into),e.using&&(this.append(` `),this.visitNode(e.using)),e.whens&&(this.append(` `),this.compileList(e.whens,` `)),e.returning&&(this.append(` `),this.visitNode(e.returning)),e.output&&(this.append(` `),this.visitNode(e.output)),e.endModifiers?.length&&(this.append(` `),this.compileList(e.endModifiers,` `))}visitMatched(e){e.not&&this.append(`not `),this.append(`matched`),e.bySource&&this.append(` by source`)}visitAddIndex(e){(!this.parentNode||!ko.is(this.parentNode))&&this.append(`add `),e.unique&&this.append(`unique `),this.append(`index `),this.visitNode(e.name),e.columns&&(this.append(` (`),this.compileList(e.columns),this.append(`)`)),e.using&&(this.append(` using `),this.visitNode(e.using))}visitCast(e){this.append(`cast(`),this.visitNode(e.expression),this.append(` as `),this.visitNode(e.dataType),this.append(`)`)}visitFetch(e){this.append(`fetch next `),this.visitNode(e.rowCount),this.append(` rows ${e.modifier}`)}visitOutput(e){this.append(`output `),this.compileList(e.selections)}visitTop(e){this.append(`top(${e.expression})`),e.modifiers&&this.append(` ${e.modifiers}`)}visitOrAction(e){this.append(e.action)}visitCollate(e){this.append(`collate `),this.visitNode(e.collation)}append(e){this.#e+=e}appendValue(e){this.addParameter(e),this.append(this.getCurrentParameterPlaceholder())}getLeftIdentifierWrapper(){return`"`}getRightIdentifierWrapper(){return`"`}getCurrentParameterPlaceholder(){return`$`+this.numParameters}getLeftExplainOptionsWrapper(){return`(`}getExplainOptionAssignment(){return` `}getExplainOptionsDelimiter(){return`, `}getRightExplainOptionsWrapper(){return`)`}sanitizeIdentifier(e){let t=this.getLeftIdentifierWrapper(),n=this.getRightIdentifierWrapper(),r=``;for(let i of e)r+=i,i===t?r+=t:i===n&&(r+=n);return r}sanitizeStringLiteral(e){return e.replace(Pf,`''`)}sanitizeJSONPathMemberValue(e){return e.replace(Ff,e=>e===`'`?`''`:`\\"`)}addParameter(e){this.#t.push(e)}appendImmediateValue(e){if(fo(e))this.appendStringLiteral(e);else if(po(e)||mo(e)||_o(e))this.append(e.toString());else if(ho(e))this.append(`null`);else if(go(e))this.appendImmediateValue(e.toISOString());else throw Error(`invalid immediate value ${e}`)}appendStringLiteral(e){this.append(`'`),this.append(this.sanitizeStringLiteral(e)),this.append(`'`)}sortSelectModifiers(e){return X(e.toSorted((e,t)=>e.modifier&&t.modifier?Rf[e.modifier]-Rf[t.modifier]:1))}compileColumnAlterations(e){this.compileList(e)}announcesNewColumnDataType(){return!0}};const Lf=X({ForKeyShare:`for key share`,ForNoKeyUpdate:`for no key update`,ForUpdate:`for update`,ForShare:`for share`,NoWait:`nowait`,SkipLocked:`skip locked`,Distinct:`distinct`}),Rf=X({ForKeyShare:1,ForNoKeyUpdate:1,ForUpdate:1,ForShare:1,NoWait:2,SkipLocked:2,Distinct:0}),zf=X({InnerJoin:`inner join`,LeftJoin:`left join`,RightJoin:`right join`,FullJoin:`full join`,CrossJoin:`cross join`,LateralInnerJoin:`inner join lateral`,LateralLeftJoin:`left join lateral`,LateralCrossJoin:`cross join lateral`,OuterApply:`outer apply`,CrossApply:`cross apply`,Using:`using`});X({raw(e,t=[]){return X({sql:e,query:us.createWithSql(e),parameters:X(t),queryId:Q()})}});var Bf=class{async init(){}async acquireConnection(){return new Vf}async beginTransaction(){}async commitTransaction(){}async rollbackTransaction(){}async releaseConnection(){}async destroy(){}async releaseSavepoint(){}async rollbackToSavepoint(){}async savepoint(){}},Vf=class{async executeQuery(){return{rows:[]}}async*streamQuery(){}},Hf=class{get supportsCreateIfNotExists(){return!0}get supportsMultipleConnections(){return!0}get supportsTransactionalDdl(){return!1}get supportsReturning(){return!1}get supportsOutput(){return!1}};const Uf=/"/g,Wf=/[\\'"]/g;var Gf=class extends If{visitOrAction(e){this.append(`or `),this.append(e.action)}getCurrentParameterPlaceholder(){return`?`}getLeftExplainOptionsWrapper(){return``}getRightExplainOptionsWrapper(){return``}getLeftIdentifierWrapper(){return`"`}getRightIdentifierWrapper(){return`"`}getAutoIncrement(){return`autoincrement`}sanitizeIdentifier(e){return e.replace(Uf,`""`)}sanitizeJSONPathMemberValue(e){return e.replace(Wf,e=>e===`\\`?`\\\\`:e===`'`?`''`:`\\"`)}visitDefaultInsertValue(e){this.append(`null`)}};X({__noMigrations__:!0});var Kf=class extends Hf{get supportsMultipleConnections(){return!1}get supportsTransactionalDdl(){return!1}get supportsReturning(){return!0}async acquireMigrationLock(e,t){}async releaseMigrationLock(e,t){}};const qf=ar({randomBytes:bi()}),Jf=e=>{let t=re(e.length);for(let n=0;n<e.length;++n)t[n]=Yf(e[n]);return t},Yf=e=>Ln.is(e)&&e.startsWith(qf)?Yf(JSON.parse(e.slice(qf.length))):Array.isArray(e)?Jf(e):h(e)?Xf(e):e,Xf=e=>{let t=b();for(let n in e)t[n]=Yf(e[n]);return t},Zf=new Set(Object.keys(Cr({createdAt:Xn,updatedAt:Xn,isDeleted:Jn(Ga),ownerId:so}).props)),Qf=[...Zf,`id`],$f=e=>(t,n)=>{let r=[];n??=ep(e)();for(let[e,i]of Object.entries(t.tables)){j(i);let t=x(n.tables,e);if(!t)r.push(np(e,i));else for(let n of i.difference(t))r.push(Y`
            alter table ${Y.identifier(e)}
            add column ${Y.identifier(n)} any;
          `)}n.indexes.filter(e=>!t.indexes.some(t=>Ua(t,e))).forEach(e=>{r.push(Y`drop index ${Y.identifier(e.name)};`)}),t.indexes.filter(e=>!n.indexes.some(t=>Ua(e,t))).forEach(e=>{r.push({sql:`${e.sql};`,parameters:[]})});for(let t of r)e.sqlite.exec(t)},ep=e=>()=>Wa(e)({excludeIndexNamePrefix:`evolu_`}),tp=new vf({dialect:{createAdapter:()=>new Kf,createDriver:()=>new Bf,createIntrospector(){throw Error(`Not implemeneted`)},createQueryCompiler:()=>new Gf}});tp.schema.createIndex.bind(tp.schema);const np=(e,t)=>Y`
  create table ${Y.identifier(e)} (
    "id" text,
    ${Y.raw([...Zf,...t].map(e=>`${Y.identifier(e).sql} any`).join(`, `))},
    primary key ("ownerId", "id")
  )
  without rowid, strict;
`,rp=q.orThrow(12),ip=new Uint8Array(rp),ap=Symbol(`evolu.local-first.Storage.InfiniteUpperBound`),op={Fingerprint:1,Skip:0,Timestamps:2},sp=Cr({table:Ln,id:ir,values:Yn(`ValidDbChangeValues`,vr(Ln,Ra),e=>{let t=Qf.filter(t=>t in e);return t.length>0?K({type:`ValidDbChangeValues`,value:e,invalidColumns:t}):G()},e=>`DbChange values contain reserved system columns: ${e.invalidColumns.join(`, `)}.`),isInsert:Bn,isDelete:Jn(Bn)}),cp=e=>({insertTimestamp:(t,n,r)=>{let i=mp(e);fp(e)(t,n,i,r)},getExistingTimestamps:(t,n)=>{let r=ke(...n);return e.sqlite.exec(Y`
      with recursive
        split_timestamps(timestampBytes, pos) as (
          select
            substr(${r}, 1, 16),
            17 as pos
          union all
          select
            substr(${r}, pos, 16),
            pos + 16
          from split_timestamps
          where pos <= length(${r})
        )
      select s.timestampBytes
      from
        split_timestamps s
        join evolu_timestamp t
          on t.ownerId = ${t} and s.timestampBytes = t.t;
    `).rows.map(e=>e.timestampBytes)},getSize:yp(e),fingerprint:(t,n,r)=>(lp(n,r),Sp(e)(t,n,r)),fingerprintRanges:Cp(e),findLowerBound:(t,n,r,i)=>bp(e)(t,n,r,i),iterate:(t,n,r,i)=>{lp(n,r);let a=r-n;if(a===0)return;let o=Tp(e)(t,n);if(!i(o,n)||a===1)return;let s=e.sqlite.exec(Y`
      select t
      from evolu_timestamp
      where ownerId = ${t} and t > ${o}
      order by t
      limit ${a-1};
    `);for(let e=0;e<s.rows.length;e++){let t=q.orThrow(n+1+e);if(!i(s.rows[e].t,t))return}},deleteOwner:t=>{e.sqlite.exec(Y`
      delete from evolu_timestamp where ownerId = ${t};
    `)}}),lp=(e,t)=>{A(e<=t,`invalid begin or end`)},up=e=>{for(let t of[Y`
      create table evolu_timestamp (
        "ownerId" blob not null,
        "t" blob not null,
        "h1" integer,
        "h2" integer,
        "c" integer,
        "l" integer not null,
        primary key ("ownerId", "t")
      )
      strict;
    `,Y`
      create index evolu_timestamp_index on evolu_timestamp (
        "ownerId",
        "l",
        "t",
        "h1",
        "h2",
        "c"
      );
    `,Y`
      create table evolu_usage (
        "ownerId" blob primary key,
        "storedBytes" integer not null,
        "firstTimestamp" blob,
        "lastTimestamp" blob
      )
      strict;
    `])e.sqlite.exec(t)},dp=(e,t,n)=>oo(e,n)===1?[`append`,t,e]:oo(e,t)===-1?[`prepend`,e,n]:[`insert`,t,n],fp=e=>(t,n,r,i)=>{let[a,o]=_p(pp(n)),s=[];switch(i){case`append`:s=[r===1?Y.prepared`
                insert into evolu_timestamp
                  (ownerId, l, t, h1, h2, c)
                values
                  (${t}, 1, ${n}, ${a}, ${o}, 1)
                on conflict do nothing;
              `:Y.prepared`
                with
                  fc(b, cl, pt, nt, ih1, ih2, ic) as (
                    select
                      0,
                      ${r} - 1,
                      ifnull(
                        (
                          select t
                          from evolu_timestamp
                          where
                            ownerId = ${t}
                            and l >= ${r}
                            and t < ${n}
                          order by t desc
                          limit 1
                        ),
                        zeroblob(0)
                      ),
                      null,
                      0,
                      0,
                      0
                    union all
                    select
                      not b,
                      iif(b, iif(nt is null, cl - 1, cl), cl),
                      iif(b, ifnull(nt, pt), pt),
                      iif(
                        b,
                        null,
                        (
                          select t
                          from evolu_timestamp
                          where
                            ownerId = ${t}
                            and l = cl
                            and t > pt
                            and t < ${n}
                          order by t
                          limit 1
                        )
                      ),
                      iif(
                        node.t is not null,
                        (ih1 | node.h1) - (ih1 & node.h1),
                        ih1
                      ),
                      iif(
                        node.t is not null,
                        (ih2 | node.h2) - (ih2 & node.h2),
                        ih2
                      ),
                      iif(node.t is not null, ic + node.c, ic)
                    from
                      fc
                      left join evolu_timestamp as node
                        on b and node.ownerId = ${t} and node.t = nt
                    where cl > 0
                  )
                insert into evolu_timestamp (ownerId, t, l, h1, h2, c)
                select
                  ${t},
                  ${n},
                  ${r},
                  (${a} | ih1) - (${a} & ih1),
                  (${o} | ih2) - (${o} & ih2),
                  ic + 1
                from fc
                order by cl asc
                limit 1
                on conflict do nothing;
              `];break;case`prepend`:s=[Y.prepared`
            insert into evolu_timestamp
              (ownerId, l, t, h1, h2, c)
            values
              (${t}, ${r}, ${n}, ${a}, ${o}, 1)
            on conflict do nothing;
          `,Y.prepared`
            with
              ml(ml) as (
                select max(l)
                from evolu_timestamp
                where ownerId = ${t}
              ),
              fp(b, cl, pt, nt, h1, h2) as (
                select
                  0,
                  (select ml from ml),
                  null,
                  null,
                  null,
                  null
                union all
                select
                  not fp.b,
                  iif(fp.b, fp.cl - 1, fp.cl),
                  iif(
                    fp.b,
                    iif(
                      fp.nt is not null and (fp.pt is null or fp.nt < fp.pt),
                      fp.nt,
                      fp.pt
                    ),
                    fp.pt
                  ),
                  iif(
                    fp.b,
                    null,
                    (
                      select t
                      from evolu_timestamp
                      where
                        ownerId = ${t}
                        and l = fp.cl
                        and t > ${n}
                      order by t
                      limit 1
                    )
                  ),
                  iif(
                    fp.b
                    and fp.nt is not null
                    and (fp.pt is null or fp.nt < fp.pt),
                    node.h1,
                    null
                  ),
                  iif(
                    fp.b
                    and fp.nt is not null
                    and (fp.pt is null or fp.nt < fp.pt),
                    node.h2,
                    null
                  )
                from
                  fp
                  left join evolu_timestamp as node
                    on fp.b and node.ownerId = ${t} and node.t = fp.nt
                where fp.cl > ${r}
              ),
              u(t, h1, h2) as (
                select
                  pt,
                  (${a} | h1) - (${a} & h1),
                  (${o} | h2) - (${o} & h2)
                from fp
                where h1 is not null and pt is not null
                order by pt
                limit ${Y.raw(gp.toString())}
              )
            update evolu_timestamp
            set
              h1 = u.h1,
              h2 = u.h2,
              c = c + 1
            from u
            where
              changes() > 0
              and ownerId = ${t}
              and evolu_timestamp.t = u.t;
          `];break;case`insert`:s=r===1?[Y.prepared`
                  insert into evolu_timestamp
                    (ownerId, l, t, h1, h2, c)
                  values
                    (${t}, 1, ${n}, ${a}, ${o}, 1)
                  on conflict do nothing;
                `,Y.prepared`
                  with
                    p(l, t, pt) as (
                      select
                        (
                          select max(l) + 1
                          from evolu_timestamp
                          where ownerId = ${t}
                        ),
                        X'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
                        X'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
                      union all
                      select
                        p.l - 1,
                        ifnull(
                          (
                            select t
                            from evolu_timestamp
                            where
                              ownerId = ${t}
                              and l = p.l - 1
                              and t > ${n}
                              and t < p.t
                            order by t
                            limit 1
                          ),
                          p.t
                        ),
                        p.t
                      from p
                      where p.l > 2
                      limit ${Y.raw(gp.toString())}
                    ),
                    u(t, h1, h2) as (
                      select
                        p.t,
                        (${a} | node.h1) - (${a} & node.h1),
                        (${o} | node.h2) - (${o} & node.h2)
                      from
                        p
                        join evolu_timestamp as node
                          on node.ownerId = ${t} and node.t = p.t
                      where p.t is not p.pt
                    )
                  update evolu_timestamp
                  set
                    h1 = u.h1,
                    h2 = u.h2,
                    c = c + 1
                  from u
                  where
                    changes() > 0
                    and ownerId = ${t}
                    and evolu_timestamp.t = u.t;
                `]:[Y.prepared`
                  insert into evolu_timestamp (ownerId, t, l)
                  values (${t}, ${n}, ${r})
                  on conflict do nothing;
                `,Y.prepared`
                  with
                    c0(b, cl, pt, nt, h1, h2, c) as (
                      select
                        0,
                        (
                          select max(l)
                          from evolu_timestamp
                          where ownerId = ${t}
                        ),
                        0,
                        null,
                        null,
                        null,
                        null
                      union all
                      select
                        not b,
                        iif(b, iif(nt is null, cl - 1, cl), cl),
                        iif(b, ifnull(nt, pt), pt),
                        iif(
                          b,
                          null,
                          (
                            select t
                            from evolu_timestamp
                            where
                              ownerId = ${t}
                              and l = cl
                              and t > pt
                              and t < ${n}
                            order by t
                            limit 1
                          )
                        ),
                        node.h1,
                        node.h2,
                        node.c
                      from
                        c0
                        left join evolu_timestamp as node
                          on c0.b
                          and c0.cl < ${r}
                          and node.ownerId = ${t}
                          and node.t = c0.nt
                      where cl > 0
                    ),
                    c1(l, t, h1, h2, c) as (
                      select
                        ${r},
                        ${n},
                        ${a},
                        ${o},
                        1
                      union all
                      select cl, pt, h1, h2, c
                      from c0
                      where h1 is not null
                    ),
                    c2(rn, l, t, h1, h2, c) as (
                      select row_number() over (order by l), l, t, h1, h2, c
                      from c1
                    ),
                    c3(rn, l, t, h1, h2, c) as (
                      select rn, l, t, h1, h2, c from c2 where rn = 1
                      union all
                      select
                        c3.rn + 1,
                        c2.l,
                        c2.t,
                        (c2.h1 | c3.h1) - (c2.h1 & c3.h1),
                        (c2.h2 | c3.h2) - (c2.h2 & c3.h2),
                        c2.c + c3.c
                      from
                        c3
                        join c2 on c2.rn = c3.rn + 1
                    ),
                    c4(l, t, h1, h2, c, rn) as (
                      select l, t, h1, h2, c, max(rn)
                      from c3
                      group by l
                    ),
                    -- Alternate range discovery and primary-key loading.
                    n(b, l, t, nt, h1, h2, c) as (
                      select
                        1,
                        (
                          select max(l) + 1
                          from evolu_timestamp
                          where ownerId = ${t}
                        ),
                        X'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
                        null,
                        null,
                        null,
                        null
                      union all
                      select
                        not n.b,
                        iif(n.b, n.l - 1, n.l),
                        iif(n.b, n.t, ifnull(n.nt, n.t)),
                        iif(
                          n.b,
                          (
                            select t
                            from evolu_timestamp
                            where
                              ownerId = ${t}
                              and l = n.l - 1
                              and t > ${n}
                              and t < n.t
                            order by t
                            limit 1
                          ),
                          null
                        ),
                        iif(not n.b and n.nt is not null, node.h1, null),
                        iif(not n.b and n.nt is not null, node.h2, null),
                        iif(not n.b and n.nt is not null, node.c, null)
                      from
                        n
                        left join evolu_timestamp as node
                          on not n.b
                          and node.ownerId = ${t}
                          and node.t = n.nt
                      where iif(n.b, n.l - 1 > (select min(l) from c4), 1)
                    ),
                    u(ut, uh1, uh2, uc) as (
                      select t, h1, h2, c from c4 where t = ${n}
                      union all
                      select
                        max(t),
                        iif(
                          l > ${r},
                          (${a} | h1) - (${a} & h1),
                          (
                            select (c4.h1 | n.h1) - (c4.h1 & n.h1)
                            from c4
                            where
                              c4.l = (select max(l) from c4 where c4.l < n.l)
                          )
                        ),
                        iif(
                          l > ${r},
                          (${o} | h2) - (${o} & h2),
                          (
                            select (c4.h2 | n.h2) - (c4.h2 & n.h2)
                            from c4
                            where
                              c4.l = (select max(l) from c4 where c4.l < n.l)
                          )
                        ),
                        iif(
                          l > ${r},
                          c + 1,
                          (
                            select n.c - c4.c
                            from c4
                            where
                              c4.l = (select max(l) from c4 where c4.l < n.l)
                          )
                        )
                      from n
                      where b
                      group by t
                      limit ${Y.raw(gp.toString())}
                    )
                  update evolu_timestamp
                  set
                    h1 = uh1,
                    h2 = uh2,
                    c = uc
                  from u
                  where changes() > 0 and ownerId = ${t} and t = ut;
                `]}for(let t of s)e.sqlite.exec(t)},pp=e=>Jt(e).slice(0,rp),mp=e=>{let t=1;for(;e.random.next()<=hp&&t<gp;)t+=1;return fr.orThrow(t)},hp=.25,gp=10,_p=e=>{let t=BigInt(0),n=BigInt(0);for(let n=0;n<6;n++)t=t<<BigInt(8)|BigInt(e[n]);for(let t=6;t<12;t++)n=n<<BigInt(8)|BigInt(e[t]);return[t.toString(),n.toString()]},vp=([e,t])=>{let n=BigInt(e),r=BigInt(t),i=new Uint8Array(12);for(let e=5;e>=0;e--)i[e]=Number(n&BigInt(255)),n>>=BigInt(8);for(let e=11;e>=6;e--)i[e]=Number(r&BigInt(255)),r>>=BigInt(8);return i},yp=e=>t=>e.sqlite.exec(Y.prepared`
      with
        ml(ml) as (
          select max(l)
          from evolu_timestamp
          where ownerId = ${t}
        ),
        sc(l, pt, c) as (
          select (select ml + 1 from ml), zeroblob(0), 0
          union all
          select
            sc.l - 1,
            ifnull(
              (
                select max(t)
                from evolu_timestamp as m
                where ownerId = ${t} and m.l = sc.l - 1 and m.t > sc.pt
              ),
              sc.pt
            ),
            ifnull(
              (
                select sum(m.c)
                from evolu_timestamp as m
                where ownerId = ${t} and m.l = sc.l - 1 and m.t > sc.pt
              ),
              0
            )
          from sc
          where sc.l > 1
        )
      select sum(c) as size
      from sc;
    `).rows[0].size,bp=e=>(t,n,r,i)=>{if(lp(n,r),r===0||n===r||i===ap)return r;let a=e.sqlite.exec(Y.prepared`
      select t
      from evolu_timestamp
      where ownerId = ${t} and t >= ${i}
      order by t
      limit 1;
    `);if(a.rows.length===0)return r;let o=xp(e)(t,a.rows[0].t);return q.orThrow(Ri(o))},xp=e=>(t,n)=>e.sqlite.exec(Y.prepared`
      with
        ml(ml) as (
          select max(l) from evolu_timestamp where ownerId = ${t}
        ),
        sc(l, pt, tc) as (
          select ml + 1, zeroblob(0), 0 from ml
          union all
          select
            sc.l - 1,
            ifnull(
              (
                select max(t)
                from evolu_timestamp
                where
                  ownerId = ${t}
                  and l = sc.l - 1
                  and t <= ${n}
                  and t > sc.pt
                order by t
              ),
              sc.pt
            ),
            ifnull(
              (
                select sum(c)
                from evolu_timestamp
                where
                  ownerId = ${t}
                  and l = sc.l - 1
                  and t <= ${n}
                  and t > sc.pt
              ),
              0
            )
          from sc
          where sc.l > 1 and sc.pt != ${n}
        )
      select sum(tc) as count
      from sc;
    `).rows[0].count,Sp=e=>(t,n,r)=>r-n===0?ip:n===0?Cp(e)(t,[r])[0].fingerprint:Cp(e)(t,[n,r])[1].fingerprint,Cp=e=>(t,n,r=ap)=>{let i=JSON.stringify(n);return e.sqlite.exec(Y.prepared`
      with
        ml(ml) as (
          select max(l) from evolu_timestamp where ownerId = ${t}
        ),
        c0(c) as (select value as c from json_each(${i})),
        c1(c, b, nt, ft, tt, dl, ic, h1, h2) as (
          select
            c,
            1,
            null,
            zeroblob(0),
            X'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
            ml,
            0,
            0,
            0
          from
            c0,
            ml
          union all
          select
            c1.c,
            not c1.b,
            iif(
              c1.b,
              (
                select t
                from evolu_timestamp
                where
                  l = c1.dl
                  and t > c1.ft
                  and t < c1.tt
                  and ownerId = ${t}
                order by t
                limit 1
              ),
              null
            ),
            iif(c1.b, c1.ft, iif(c1.ic + node.c <= c1.c, c1.nt, c1.ft)),
            iif(
              c1.b,
              c1.tt,
              iif(c1.ic + node.c <= c1.c, c1.tt, ifnull(c1.nt, c1.tt))
            ),
            iif(c1.b, c1.dl, iif(c1.ic + node.c <= c1.c, c1.dl, c1.dl - 1)),
            iif(
              c1.b,
              c1.ic,
              iif(c1.ic + node.c <= c1.c, c1.ic + node.c, c1.ic)
            ),
            iif(
              c1.b,
              c1.h1,
              iif(c1.ic + node.c <= c1.c, ${wp(`c1.h1`,`node.h1`)}, c1.h1)
            ),
            iif(
              c1.b,
              c1.h2,
              iif(c1.ic + node.c <= c1.c, ${wp(`c1.h2`,`node.h2`)}, c1.h2)
            )
          from
            c1
            left join evolu_timestamp as node
              on not c1.b and node.ownerId = ${t} and node.t = c1.nt
          where iif(c1.b, 1, c1.ic != c1.c)
        ),
        c2(h1, h2, t, rn) as (
          select
            h1,
            h2,
            (
              select min(t)
              from evolu_timestamp
              where t > ft and ownerId = ${t}
            ),
            row_number() over (order by c)
          from c1
          where c = ic and b = 1
        ),
        c3(oh1, oh2, b, rn, h1, h2) as (
          select h1, h2, t, rn, h1, h2 from c2 where rn = 1
          union all
          select
            c2.h1,
            c2.h2,
            t,
            c2.rn,
            ${wp(`c3.oh1`,`c2.h1`)},
            ${wp(`c3.oh2`,`c2.h2`)}
          from
            c2
            join c3 on c2.rn = c3.rn + 1
        )
      select b, cast(h1 as text) as h1, cast(h2 as text) as h2
      from c3;
    `).rows.map((e,t,n)=>({type:op.Fingerprint,upperBound:t===n.length-1?r:e.b,fingerprint:vp([e.h1,e.h2])}))},wp=(e,t)=>Y.raw(`(${e} | ${t}) - (${e} & ${t})`),Tp=e=>(t,n)=>e.sqlite.exec(Y.prepared`
      with
        fi(b, cl, ic, pt, mt, nt, nc) as (
          select
            0,
            (
              select max(l)
              from evolu_timestamp
              where ownerId = ${t}
            ),
            0,
            zeroblob(0),
            X'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
            null,
            0
          union all
          select
            not b,
            iif(
              b,
              iif(nt is null or nt > mt or ic + nc > ${n+1}, cl - 1, cl),
              cl
            ),
            iif(
              b,
              iif(nt is null or nt > mt or ic + nc > ${n+1}, ic, ic + nc),
              ic
            ),
            iif(
              b,
              iif(nt is null or nt > mt or ic + nc > ${n+1}, pt, nt),
              pt
            ),
            iif(
              b,
              iif(
                nt is null or nt > mt or ic + nc > ${n+1},
                iif(nt is not null and nt < mt, nt, mt),
                mt
              ),
              mt
            ),
            iif(
              b,
              null,
              (
                select t
                from evolu_timestamp
                where ownerId = ${t} and l = cl and t > pt
                order by t
                limit 1
              )
            ),
            iif(
              b,
              null,
              (
                select c
                from evolu_timestamp
                where ownerId = ${t} and l = cl and t > pt
                order by t
                limit 1
              )
            )
          from fi
          where ic != ${n+1}
        )
      select pt
      from fi
      where ic == ${n+1};
    `).rows[0].pt,Ep=e=>(t,n)=>{let r=e.sqlite.exec(Y`
      select storedBytes, firstTimestamp, lastTimestamp
      from evolu_usage
      where ownerId = ${t};
    `);if(!ie(r.rows))return{storedBytes:null,firstTimestamp:n,lastTimestamp:n};let i=oe(r.rows);return A(i.firstTimestamp,`not null`),A(i.lastTimestamp,`not null`),{storedBytes:i.storedBytes,firstTimestamp:i.firstTimestamp,lastTimestamp:i.lastTimestamp}},Dp=e=>(t,n,r,i)=>{e.sqlite.exec(Y`
      insert into evolu_usage
        ("ownerId", "storedBytes", "firstTimestamp", "lastTimestamp")
      values
        (${t}, ${n}, ${r}, ${i})
      on conflict (ownerId) do update
        set
          storedBytes = ${n},
          firstTimestamp = ${r},
          lastTimestamp = ${i};
    `)},Op=V(),kp=pr,Ap={Request:0,Response:1,Broadcast:2},jp={None:0,Subscribe:1,Unsubscribe:2},Mp={NoError:0,WriteKeyError:1,WriteError:2,QuotaError:3,SyncError:4},Np=e=>(t,n)=>{let r=Pp(t,{messageType:Ap.Request,subscriptionFlag:n??jp.None}),i=co(t),a=e.storage.getSize(i);return Hp(e)(i,dr,a,ap,r),r.unwrap()},Pp=(e,t)=>{let{totalMaxSize:n=1e6,rangesMaxSize:r=3e4,version:i=kp}=t,a={header:V(),messages:{timestamps:Fp(),dbChanges:V()},ranges:{timestamps:Fp(),types:V(),payloads:V()}};if($p(a.header,i),a.header.extend(co(e)),a.header.extend([t.messageType]),t.messageType===Ap.Request){t.writeKey?(a.header.extend([1]),a.header.extend(t.writeKey)):a.header.extend([0]);let e=t.subscriptionFlag??jp.None;a.header.extend([e])}else t.messageType===Ap.Response&&a.header.extend([t.errorCode]);let o=!1,s=()=>c()<=n,c=()=>fr.orThrow(l()+u()),l=()=>a.header.getLength()+a.messages.timestamps.getLength()+a.messages.dbChanges.getLength(),u=()=>a.ranges.timestamps.getCount()>0?a.ranges.timestamps.getLength()+a.ranges.types.getLength()+a.ranges.payloads.getLength()+d.remainingRange:0,d={remainingRange:rp+10,timestamp:30,dbChangeLength:8,splitRange:800,timestampsRange:50},f=d.timestamp+d.dbChangeLength+d.remainingRange;return{canAddMessage:e=>c()+f+e.change.length<=n,addMessage:e=>{a.messages.timestamps.add(e.timestamp),tm(a.messages.dbChanges,e.change),a.messages.dbChanges.extend(e.change),A(s(),`the message is too big`)},canSplitRange:()=>u()+d.splitRange<=r,canAddTimestampsRangeAndMessage:(e,t)=>{let i=u()+e.getLength()+d.timestampsRange;return i<=r&&(!t||l()+i+f+t.change.length<=n)},addRange:e=>{switch(A(t.messageType!==Ap.Broadcast,`Cannot add a range into broadcast message`),A(!o,`Cannot add a range after an InfiniteUpperBound range`),o=e.upperBound===ap,e.upperBound===ap?a.ranges.timestamps.addInfinite():a.ranges.timestamps.add(ao(e.upperBound)),$p(a.ranges.types,q.orThrow(e.type)),e.type){case op.Skip:break;case op.Fingerprint:a.ranges.payloads.extend(e.fingerprint);break;case op.Timestamps:e.timestamps.append(a.ranges.payloads)}A(s(),`the range ${e.type} is too big`)},unwrap:()=>(a.ranges.timestamps.getCount()>0&&A(o,`The last range's upperBound must be InfiniteUpperBound`),a.messages.timestamps.append(a.header),a.header.extend(a.messages.dbChanges.unwrap()),a.ranges.timestamps.getCount()>0&&(a.ranges.timestamps.append(a.header),a.header.extend(a.ranges.types.unwrap()),a.header.extend(a.ranges.payloads.unwrap())),a.header.unwrap()),getSize:c}},Fp=()=>{let e=dr,t=V(),n=()=>{t.reset(),$p(t,e)};n();let r=V(),i=0,a=Ip((e,t)=>{$p(e,t)}),o=Ip((e,t)=>{am(e,t)});return{add:t=>{let s=t.millis-i;A(q.is(s),`The delta must be NonNegativeInt`),e++,n(),i=t.millis,$p(r,s),a.add(t.counter),o.add(t.nodeId)},addInfinite:()=>{e++,n()},getCount:()=>e,getLength:()=>t.getLength()+r.getLength()+a.getLength()+o.getLength(),append:e=>{e.extend(t.unwrap()),e.extend(r.unwrap()),e.extend(a.unwrap()),e.extend(o.unwrap())}}},Ip=e=>{let t=V(),n=dr,r=null,i=dr;return{add:a=>{a===r?(i++,t.truncate(n)):(r=a,i=q.orThrow(1)),n=t.getLength(),e(t,a),$p(t,i)},getLength:()=>t.getLength(),unwrap:()=>t.unwrap()}},Lp=(e,t={})=>async n=>{let{storage:r}=n.deps;try{let i=V(e),[a,o]=Rp(i),s=t.version??kp;if(a!==s)return K({type:`ProtocolVersionError`,version:a,isInitiator:s<a,ownerId:o});let c=i.shift();if(A(c===Ap.Response||c===Ap.Broadcast,`Invalid MessageType`),c===Ap.Response){let e=i.shift();if(e!==Mp.NoError)switch(e){case Mp.WriteKeyError:return K({type:`ProtocolWriteKeyError`,ownerId:o});case Mp.WriteError:return K({type:`ProtocolWriteError`,ownerId:o});case Mp.QuotaError:return K({type:`ProtocolQuotaError`,ownerId:o});case Mp.SyncError:return K({type:`ProtocolSyncError`,ownerId:o});default:throw new zp(`Invalid ProtocolErrorCode: ${e}`)}}let l=Bp(i),u=co(o);if(ie(l))try{if(!(await n(r.writeMessages(u,l))).ok)return G({type:`NoResponse`})}catch(e){if(Sa.is(e))throw e;return n.deps.console.error(e),G({type:`NoResponse`})}let d=t.writeKey;if(d==null)return G({type:`NoResponse`});if(c===Ap.Broadcast)return G({type:`Broadcast`});let f=Up(i);if(!ie(f))return G({type:`NoResponse`});let p=Pp(o,{messageType:Ap.Request,writeKey:d,rangesMaxSize:t.rangesMaxSize}),m=Vp(n.deps)(f,p,u);return!m.ok||!m.value?G({type:`NoResponse`}):G({type:`Response`,message:p.unwrap()})}catch(t){if(Sa.is(t))throw t;return K({type:`ProtocolInvalidDataError`,data:e,error:t})}},Rp=e=>[em(e),Kp(e)];var zp=class extends Error{constructor(e){super(e),this.name=this.constructor.name,Error.captureStackTrace(this,this.constructor)}};const Bp=e=>{let t=Wp(e),n=re(t.length);for(let r=0;r<t.length;r++){let i=t[r],a=nm(e),o=e.shiftN(a);n[r]={timestamp:i,change:o}}return n},Vp=e=>(t,n,r)=>{let i=n.getSize(),a;try{a=e.storage.getSize(r)}catch(t){return e.console.error(t),K(Mp.SyncError)}let o=null,s=dr,c=!1,l=!1,u=e=>{l&&e.upperBound===ap?n.addRange({type:op.Skip,upperBound:ap}):c=!0},d=()=>{l=!0,c&&(c=!1,j(o,`prevUpperBound is null`),n.addRange({type:op.Skip,upperBound:o}))},f=t=>{let i;try{i=e.storage.fingerprint(r,t,a)}catch(t){return e.console.error(t),!1}return n.addRange({type:op.Fingerprint,upperBound:ap,fingerprint:i}),!0};for(let i of t){let t=i.upperBound,c=s,l;try{l=e.storage.findLowerBound(r,s,a,t)}catch(t){return e.console.error(t),K(Mp.SyncError)}switch(i.type){case op.Skip:u(i);break;case op.Fingerprint:{let a;try{a=e.storage.fingerprint(r,c,l)}catch(t){return e.console.error(t),K(Mp.SyncError)}if(O(i.fingerprint,a))u(i);else if(n.canSplitRange())d(),Hp(e)(r,c,l,t,n);else return f(l)?G(!0):K(Mp.SyncError);break}case op.Timestamps:{let a=t,o=new Map(i.timestamps.map(e=>[e.join(),!0])),s=Fp(),p=!1,m=!1;try{e.storage.iterate(r,c,l,(t,i)=>{let c=t.join(),u=ao(t),d=null;if(o.has(c))o.delete(c);else try{d={timestamp:u,change:e.storage.readDbChange(r,t)}}catch(t){return e.console.error(t),m=!0,!1}return n.canAddTimestampsRangeAndMessage(s,d)?(s.add(u),d&&n.addMessage(d),!0):(p=!0,a=t,l=i,!1)})}catch(t){return e.console.error(t),K(Mp.SyncError)}if(m)return K(Mp.SyncError);let h=()=>{d(),n.addRange({type:op.Timestamps,upperBound:a,timestamps:s})};if(p)return h(),f(l)?G(!0):K(Mp.SyncError);o.size>0?h():u(i);break}}s=l,o=t}return G(n.getSize()>i)},Hp=e=>(t,n,r,i,a)=>{let o=q.orThrow(r-n),s=zi(o);if(!s.ok){let n={type:op.Timestamps,upperBound:i,timestamps:Fp()};e.storage.iterate(t,dr,o,e=>(n.timestamps.add(ao(e)),!0)),a.addRange(n);return}let c=n===0?s.value:[n,...s.value.map(e=>q.orThrow(e+n))],l;try{l=e.storage.fingerprintRanges(t,c,i)}catch(t){e.console.error(t);return}let u=n>0?l.slice(1):l;for(let e of u)a.addRange(e)},Up=e=>{if(e.getLength()===0)return[];let t=em(e);if(t===0)return[];let n=q.orThrow(t-1),r=Wp(e,n),i=re(t);for(let n=0;n<t;n++){let t=em(e);switch(t){case op.Fingerprint:case op.Skip:case op.Timestamps:i[n]=t;break;default:throw new zp(`Invalid RangeType: ${t}`)}}let a=re(t);for(let o=0;o<t;o++){let t=o<n?io(r[o]):ap;switch(i[o]){case op.Skip:a[o]={type:op.Skip,upperBound:t};break;case op.Fingerprint:{let n=e.shiftN(rp);a[o]={type:op.Fingerprint,upperBound:t,fingerprint:n};break}case op.Timestamps:{let n=Wp(e).map(io);a[o]={type:op.Timestamps,upperBound:t,timestamps:n};break}}}return a},Wp=(e,t)=>{t??=em(e);let n=0,r=re(t);for(let i=0;i<t;i++){let t=em(e),a=Kr.fromUnknown(n+t);if(!a.ok)throw new zp(a.error.type);r[i]=a.value,n=a.value}let i=Gp(e,t,()=>{let t=Ja.fromUnknown(em(e));if(!t.ok)throw new zp(t.error.type);return t.value}),a=Gp(e,t,()=>om(e)),o=re(t);for(let e=0;e<t;e++)o[e]={millis:r[e],counter:i[e],nodeId:a[e]};return o},Gp=(e,t,n)=>{let r=re(t),i=0;for(;i<t;){let a=n(),o=em(e);if(o===0)throw new zp(`Invalid RLE encoding: runLength must be positive`);let s=t-i;if(o>s)throw new zp(`Invalid RLE encoding: runLength ${o} exceeds remaining ${s}`);for(let e=0;e<o;e++)r[i]=a,i++}return r},Kp=e=>{let t=e.shiftN(16);return sr(t)},qp=(e,t)=>{Ye(e,t)},Jp=e=>{let t=ur.fromUnknown(Xe(e));if(!t.ok)throw new zp(t.error.type);return t.value},Yp=(e,t)=>{let n=0;for(let e=0;e<t.length&&e<8;e++)t[e]&&(n|=1<<e);e.extend([n])},Xp=(e,t)=>{let n=e.shift(),r=globalThis.Math.min(t,8),i=re(r);for(let e=0;e<r;e++)i[e]=!!(n&1<<e);return i},Zp=e=>(t,n)=>{let r=V();$p(r,kp),r.extend(io(t.timestamp)),Yp(r,[t.change.isInsert,t.change.isDelete!=null,t.change.isDelete??!1]),rm(r,t.change.table),r.extend(or(t.change.id));let i=_(t.change.values);tm(r,i);for(let[e,t]of i)M(t),rm(r,e),lm(r,t);r.extend(Ti(r.getLength()));let[a,o]=Si(e)(r.unwrap(),n);return r.reset(),r.extend(o),tm(r,a),r.extend(a),r.unwrap()},Qp=(e,t)=>{try{let n=V(e.change),r=n.shiftN(24),i=n.shiftN(nm(n)),a=Ci(xi.orThrow(i),yi.orThrow(r),t);if(!a.ok)return a;n.reset(),n.extend(a.value),em(n);let o=ao(no.orThrow(n.shiftN(ro)));if(!Ya(o,e.timestamp))return K({type:`ProtocolTimestampMismatchError`,expected:e.timestamp,timestamp:o});let s=Xp(n,fr.orThrow(3)),c=im(n),l=Kp(n),u=nm(n),d=b();for(let e=0;e<u;e++){let e=im(n);d[e]=um(n)}return G(sp.orThrow({table:c,id:l,values:d,isInsert:s[0],isDelete:s[1]?s[2]:null}))}catch(t){return K({type:`ProtocolInvalidDataError`,data:e.change,error:t})}},$p=(e,t)=>{if(t===0){e.extend([0]);return}let n=BigInt(t),r=[];for(;n!==0n;){let e=globalThis.Number(n&127n);r.push(e),n>>=7n}for(let e=0;e<r.length-1;e++)r[e]|=128;e.extend(r)},em=e=>{let t=0n,n=0n,r;for(let i=0;i<8&&(r=e.shift(),t|=BigInt(r&127)<<n,r&128);i++)n+=7n;let i=q.fromUnknown(globalThis.Number(t));if(!i.ok)throw new zp(i.error.type);return i.value},tm=(e,t)=>{$p(e,q.orThrow(t.length))},nm=em,rm=(e,t)=>{let n=Ee(t);tm(e,n),e.extend(n)},im=e=>{let t=nm(e);return De(e.shiftN(t))},am=(e,t)=>{e.extend(Te(t))},om=e=>Ce(e.shiftN(q.orThrow(8))),sm=e=>e>=0&&e<20,cm={String:q.orThrow(20),Number:q.orThrow(21),Null:q.orThrow(22),Bytes:q.orThrow(23),NonNegativeInt:q.orThrow(30),EmptyString:q.orThrow(31),Base64Url:q.orThrow(32),Id:q.orThrow(33),Json:q.orThrow(34),DateIsoWithNonNegativeTime:q.orThrow(35),DateIsoWithNegativeTime:q.orThrow(36)},lm=(e,t)=>{if(t===null){$p(e,cm.Null);return}switch(typeof t){case`string`:{if(t===``){$p(e,cm.EmptyString);return}let n=Xn.from.parent(t);if(n.ok){let t=new Date(n.value).getTime();q.is(t)?($p(e,cm.DateIsoWithNonNegativeTime),$p(e,t)):($p(e,cm.DateIsoWithNegativeTime),qp(e,ur.orThrow(t)));return}let r=ir.from.parent(t);if(r.ok){$p(e,cm.Id),e.extend(or(r.value));return}let i=Lr.from.parent(t);if(i.ok&&JSON.stringify(Rr(i.value))===t){Op.reset();try{Ye(Op,Rr(i.value));let t=Op.unwrap();$p(e,cm.Json),tm(e,t),e.extend(t)}finally{Op.reset()}return}let a=tr.from.parent(t);if(a.ok){$p(e,cm.Base64Url);let t=rr(a.value);tm(e,t),e.extend(t);return}$p(e,cm.String),rm(e,t);return}case`number`:if(!globalThis.Object.is(t,-0)&&q.is(t)){if(sm(t)){$p(e,t);return}$p(e,cm.NonNegativeInt),$p(e,t);return}$p(e,cm.Number),qp(e,t);return}$p(e,cm.Bytes),tm(e,t),e.extend(t)},um=e=>{let t=em(e);if(sm(t))return t;switch(t){case cm.String:return im(e);case cm.Number:return Jp(e);case cm.Null:return null;case cm.Bytes:{let t=nm(e);return e.shiftN(t)}case cm.Id:return Kp(e);case cm.NonNegativeInt:return em(e);case cm.Json:{let t=nm(e),n=e.getLength(),r=Xe(e);if(n-e.getLength()!==t)throw new zp(`Invalid JSON MessagePack length`);return JSON.stringify(r)}case cm.DateIsoWithNonNegativeTime:case cm.DateIsoWithNegativeTime:{let n=t===cm.DateIsoWithNonNegativeTime?em(e):Jp(e),r=Xn.from.parent(new Date(n).toISOString());if(!r.ok)throw new zp(r.error.type);return r.value}case cm.EmptyString:return``;case cm.Base64Url:{let t=nm(e),n=e.shiftN(t);return nr(n)}default:throw new zp(`invalid ProtocolValueType`)}};var dm=function(e,t,n){if(t!=null){if(typeof t!=`object`&&typeof t!=`function`)throw TypeError(`Object expected.`);var r,i;if(n){if(!Symbol.asyncDispose)throw TypeError(`Symbol.asyncDispose is not defined.`);r=t[Symbol.asyncDispose]}if(r===void 0){if(!Symbol.dispose)throw TypeError(`Symbol.dispose is not defined.`);r=t[Symbol.dispose],n&&(i=r)}if(typeof r!=`function`)throw TypeError(`Object not disposable.`);i&&(r=function(){try{i.call(this)}catch(e){return Promise.reject(e)}}),e.stack.push({value:t,dispose:r,async:n})}else n&&e.stack.push({async:!0});return t},fm=(function(e){return function(t){function n(n){t.error=t.hasError?new e(n,t.error,`An error was suppressed during disposal.`):n,t.hasError=!0}var r,i=0;function a(){for(;r=t.stack.pop();)try{if(!r.async&&i===1)return i=0,t.stack.push(r),Promise.resolve().then(a);if(r.dispose){var e=r.dispose.call(r.value);if(r.async)return i|=2,Promise.resolve(e).then(a,function(e){return n(e),a()})}else i|=1}catch(e){n(e)}if(i===1)return t.hasError?Promise.reject(t.error):Promise.resolve();if(t.hasError)throw t.error}return a()}})(typeof SuppressedError==`function`?SuppressedError:function(e,t,n){var r=Error(n);return r.name=`SuppressedError`,r.error=e,r.suppressed=t,r});const pm=e=>async t=>{let n={stack:[],error:void 0,hasError:!1};try{let r=dm(n,new AsyncDisposableStack,!0);r.use(e);let{deps:i}=t,a=await t.ok(Pa(({resolve:t})=>{e.onMessage=e=>t(G(e))})),o=r.use(i.createMessagePort(a.port)),s=r.use(i.createBroadcastChannel(`evolu:console-entry-or-error`));r.defer(i.consoleStoreOutputEntry.subscribe(()=>{let e=i.consoleStoreOutputEntry.get();e&&s.postMessage({type:`ConsoleEntry`,entry:e})})),r.use(await t.ok(ji(a.name)));let c=r.use(await t.ok(Ba(a.name,a.memoryOnly?{mode:`memory`}:{mode:`encrypted`,encryptionKey:a.encryptionKey}))),l=cp({sqlite:c,...i}),u={...i,sqlite:c,sqliteSchema:a.sqliteSchema,baseSqliteStorage:l,timestampConfig:{maxDrift:3e5}},d=ep(u)(),f=`evolu_version`in d.tables,p=mm(u)(f);c.transaction(()=>{f||hm(u)(p.get()),$f(u)(a.sqliteSchema,d),gm(u)});let m=bm({...u,clock:p})({onError:e=>{s.postMessage({type:`Error`,error:e})}}),h=r.use(t.create({storage:m}));return o.postMessage({type:`LeaderAcquired`,name:a.name}),await t.ok(Pa(({resolve:e})=>(o.onMessage=t=>{if(t.type===`Dispose`){e(G());return}let{callbackId:n,request:r}=t,a=e=>{o.postMessage({type:`OnQueuedResponse`,callbackId:n,response:e},e.type===`ForEvolu`&&e.message.type===`Export`?[e.message.file.buffer]:void 0)};if(r.type===`ForSharedWorker`){if(r.message.type===`ApplySyncMessage`){let{owner:e,inputMessage:t}=r.message;h(async n=>{m.setRequestContext(e.encryptionKey);let r=await n.abortable(Lp(t,{writeKey:e.writeKey}));return a({type:`ForSharedWorker`,message:{type:`ApplySyncMessage`,ownerId:e.id,didWriteMessages:m.didWriteMessages(),result:r}}),G()});return}let e=new Map;for(let t of r.message.owners)m.setRequestContext(t.encryptionKey),e.set(t.id,Np({storage:m,console:i.console})(t.id,jp.Subscribe));a({type:`ForSharedWorker`,message:{type:`CreateSyncMessages`,protocolMessagesByOwnerId:e}});return}if(r.message.type===`Query`){a({type:`ForEvolu`,id:r.id,message:{type:`Query`,rowsByQuery:Tm(u)(r.message.queries)}});return}if(r.message.type===`Export`){a({type:`ForEvolu`,id:r.id,message:{type:`Export`,file:c.export()}});return}let l=xm({...u,clock:p})(r.message);if(!l.ok){s.postMessage({type:`Error`,error:l.error});return}a({type:`ForEvolu`,id:r.id,message:l.value})},()=>{o.onMessage=null}))),G()}catch(e){n.error=e,n.hasError=!0}finally{let e=fm(n);e&&await e}},mm=e=>t=>{let n;if(t){let{rows:t}=e.sqlite.exec(Y`
        select clock
        from evolu_config
        limit 1;
      `);N(t),n=ao(oe(t).clock)}else n=Za(e);return{get:()=>n,save:t=>{n=t,e.sqlite.exec(Y.prepared`
          update evolu_config
          set "clock" = ${io(t)};
        `)}}},hm=({sqlite:e})=>t=>{for(let n of[Y`
        create table evolu_version (
          "protocolVersion" integer not null
        )
        strict;
      `,Y`
        insert into evolu_version ("protocolVersion")
        values (${kp});
      `,Y`
        create table evolu_config (
          "clock" blob not null
        )
        strict;
      `,Y`
        insert into evolu_config ("clock")
        values (${io(t)});
      `,Y`
        create table evolu_history (
          "ownerId" blob not null,
          "table" text not null,
          "id" blob not null,
          "column" text not null,
          "timestamp" blob not null,
          "value" any
        )
        strict;
      `,Y`
        create index evolu_history_ownerId_timestamp on evolu_history (
          "ownerId",
          "timestamp"
        );
      `,Y`
        create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
          "ownerId",
          "table",
          "id",
          "column",
          "timestamp" desc
        );
      `,Y`
        create table evolu_message_quarantine (
          "ownerId" blob not null,
          "timestamp" blob not null,
          "table" text not null,
          "id" blob not null,
          "column" text not null,
          "value" any,
          primary key ("ownerId", "timestamp", "table", "id", "column")
        )
        strict;
      `])e.exec(n);up({sqlite:e})},gm=e=>{let t=e.sqlite.exec(Y`
    select "ownerId", "timestamp", "table", "id", "column", "value"
    from evolu_message_quarantine;
  `);for(let n of t.rows)_m(e)(n.table,n.column,n.value)&&(ym(e)(n.ownerId,lo(n.ownerId),n.table,n.id,sr(n.id),n.column,n.value,n.timestamp),e.sqlite.exec(Y`
      delete from evolu_message_quarantine
      where
        "ownerId" = ${n.ownerId}
        and "timestamp" = ${n.timestamp}
        and "table" = ${n.table}
        and "id" = ${n.id}
        and "column" = ${n.column};
    `))},_m=e=>(t,n,r)=>{let i=x(e.sqliteSchema.tables,t);return i!=null&&(vm.has(n)||i.has(n))},vm=Zf.difference(new Set([`ownerId`])),ym=e=>(t,n,r,i,a,o,s,c)=>{e.sqlite.exec(Y.prepared`
      with
        existingTimestamp as (
          select 1
          from evolu_history
          where
            "ownerId" = ${t}
            and "table" = ${r}
            and "id" = ${i}
            and "column" = ${o}
            and "timestamp" >= ${c}
          limit 1
        )
      insert into ${Y.identifier(r)}
        ("ownerId", "id", ${Y.identifier(o)})
      select ${n}, ${a}, ${s}
      where not exists (select 1 from existingTimestamp)
      on conflict ("ownerId", "id") do update
        set ${Y.identifier(o)} = ${s}
        where not exists (select 1 from existingTimestamp);
    `),e.sqlite.exec(Y.prepared`
      insert into evolu_history
        ("ownerId", "table", "id", "column", "value", "timestamp")
      values
        (
          ${t},
          ${r},
          ${i},
          ${o},
          ${s},
          ${c}
        )
      on conflict do nothing;
    `)},bm=e=>({onError:t})=>{let n=null,r=!1,i=()=>(j(n,`ClientStorage encryption key must be set`),n);return{...e.baseSqliteStorage,setRequestContext:e=>{n=e,r=!1},didWriteMessages:()=>r,validateWriteKey:te,setWriteKey:ne,writeMessages:(n,a)=>()=>{let o=[],s=i();for(let e of a){let n=Qp(e,s);if(!n.ok)return t(n.error),G();o.push({timestamp:e.timestamp,change:n.value})}let c=e.clock.get();for(let n of o){let r=to(e)(c,n.timestamp);if(!r.ok)return t(r.error),G();c=r.value}return N(o),e.sqlite.transaction(()=>(Cm(e)(lo(n),o),e.clock.save(c),r=!0,G()))},readDbChange:(t,n)=>{let{rows:r}=e.sqlite.exec(Y`
          select "table", "id", "column", "value"
          from evolu_history
          where "ownerId" = ${t} and "timestamp" = ${n}
          union all
          select "table", "id", "column", "value"
          from evolu_message_quarantine
          where "ownerId" = ${t} and "timestamp" = ${n};
        `);N(r,`Every timestamp must have rows`);let a=oe(r),o=b(),s=!1,c=null;for(let e of r)switch(e.column){case`createdAt`:s=!0;break;case`updatedAt`:s=!1;break;case`isDeleted`:gn(Ga,e.value),c=qa(e.value);break;default:o[e.column]=e.value}let l={timestamp:ao(n),change:sp.orThrow({table:a.table,id:sr(a.id),values:o,isInsert:s,isDelete:c})};return Zp(e)(l,i())}}},xm=e=>t=>e.sqlite.transaction(()=>{let n=new Map,r=e.clock.get(),i=!1;for(let a of t.changes){if(a.table.startsWith(`_`)){Sm(e)(a);continue}let t=eo(e)(r);if(!t.ok)return t;r=t.value,i=!0;let{ownerId:o,...s}=a,c={timestamp:r,change:s},l=n.get(o);l?l.push(c):n.set(o,[c])}for(let[t,r]of n)Cm(e)(t,r);return i&&e.clock.save(r),G({type:`Mutate`,messagesByOwnerId:n,rowsByQuery:Tm(e)(t.subscribedQueries)})}),Sm=e=>t=>{if(t.isDelete)e.sqlite.exec(Y`
        delete from ${Y.identifier(t.table)}
        where "ownerId" = ${t.ownerId} and "id" = ${t.id};
      `);else{let n=t.ownerId,r=wm(t,e.time.now());for(let[i,a]of r)M(a),e.sqlite.exec(Y.prepared`
          insert into ${Y.identifier(t.table)}
            ("ownerId", "id", ${Y.identifier(i)})
          values (${n}, ${t.id}, ${a})
          on conflict ("ownerId", "id") do update
            set ${Y.identifier(i)} = ${a};
        `)}},Cm=e=>(t,n)=>{let r=co(t),{firstTimestamp:i,lastTimestamp:a}=Ep(e)(r,io(oe(n).timestamp));for(let{timestamp:o,change:s}of n){let n=wm(s,o.millis),c=or(s.id),l=io(o);for(let[i,a]of n)M(a),_m(e)(s.table,i,a)?ym(e)(r,t,s.table,c,s.id,i,a,l):e.sqlite.exec(Y.prepared`
            insert into evolu_message_quarantine
              ("ownerId", "timestamp", "table", "id", "column", "value")
            values
              (
                ${r},
                ${l},
                ${s.table},
                ${c},
                ${i},
                ${a}
              )
            on conflict do nothing;
          `);let u;[u,i,a]=dp(l,i,a),e.baseSqliteStorage.insertTimestamp(r,l,u)}Dp(e)(r,pr,i,a)},wm=(e,t)=>{let n=_(e.values);return n=ae(n,[e.isInsert?`createdAt`:`updatedAt`,qr(t)]),e.isDelete!=null&&(n=ae(n,[`isDeleted`,Ka(e.isDelete)])),n},Tm=e=>t=>{let n=new Map;for(let r of t){let{rows:t}=e.sqlite.exec(za(r));n.set(r,t)}return n};var Em=async function(e={}){var t,n=e,r=typeof window==`object`,i=typeof WorkerGlobalScope<`u`;typeof process==`object`&&process.versions?.node&&process.type;let a=globalThis.sqlite3InitModuleState||Object.assign(Object.create(null),{debugModule:()=>{}});delete globalThis.sqlite3InitModuleState,a.debugModule(`globalThis.location =`,globalThis.location);var o=`./this.program`,s=(e,t)=>{throw t},c=import.meta.url,l=``;function u(e){return n.locateFile?n.locateFile(e,l):l+e}var d,f;if(r||i){try{l=new URL(`.`,c).href}catch{}i&&(f=e=>{var t=new XMLHttpRequest;return t.open(`GET`,e,!1),t.responseType=`arraybuffer`,t.send(null),new Uint8Array(t.response)}),d=async e=>{var t=await fetch(e,{credentials:`same-origin`});if(t.ok)return t.arrayBuffer();throw Error(t.status+` : `+t.url)}}var p=console.log.bind(console),m=console.error.bind(console),h,g=!1,_,y,b,x,S,C,w,T,E,D=!1;function O(){var e=b.buffer;n.HEAP8=x=new Int8Array(e),n.HEAP16=C=new Int16Array(e),n.HEAPU8=S=new Uint8Array(e),n.HEAPU16=new Uint16Array(e),n.HEAP32=w=new Int32Array(e),n.HEAPU32=T=new Uint32Array(e),new Float32Array(e),new Float64Array(e),n.HEAP64=E=new BigInt64Array(e),n.HEAPU64=new BigUint64Array(e)}function k(){if(n.wasmMemory)b=n.wasmMemory;else{var e=n.INITIAL_MEMORY||16777216;b=new WebAssembly.Memory({initial:e/65536,maximum:32768})}O()}function A(){if(n.preRun)for(typeof n.preRun==`function`&&(n.preRun=[n.preRun]);n.preRun.length;)pe(n.preRun.shift());le(fe)}function j(){D=!0,!n.noFSInit&&!B.initialized&&B.init(),Te.init(),Wt.__wasm_call_ctors(),B.ignorePermissions=!1}function M(){if(n.postRun)for(typeof n.postRun==`function`&&(n.postRun=[n.postRun]);n.postRun.length;)de(n.postRun.shift());le(ue)}var N=0,P=null;function F(e){N++,n.monitorRunDependencies?.(N)}function I(e){if(N--,n.monitorRunDependencies?.(N),N==0&&P){var t=P;P=null,t()}}function L(e){n.onAbort?.(e),e=`Aborted(`+e+`)`,m(e),g=!0,e+=`. Build with -sASSERTIONS for more info.`;var t=new WebAssembly.RuntimeError(e);throw y?.(t),t}var ee;function te(){return n.locateFile?u(`sqlite3.wasm`):new URL(`sqlite3.wasm`,import.meta.url).href}function ne(e){if(e==ee&&h)return new Uint8Array(h);if(f)return f(e);throw`both async and sync fetching of the wasm failed`}async function re(e){if(!h)try{var t=await d(e);return new Uint8Array(t)}catch{}return ne(e)}async function ie(e,t){try{var n=await re(e);return await WebAssembly.instantiate(n,t)}catch(e){m(`failed to asynchronously prepare wasm: ${e}`),L(e)}}async function ae(e,t,n){if(!e&&typeof WebAssembly.instantiateStreaming==`function`)try{var r=fetch(t,{credentials:`same-origin`});return await WebAssembly.instantiateStreaming(r,n)}catch(e){m(`wasm streaming compile failed: ${e}`),m(`falling back to ArrayBuffer instantiation`)}return ie(t,n)}function oe(){return{env:Ut,wasi_snapshot_preview1:Ut}}async function se(){function e(e,t){return Wt=e.exports,Ht(Wt),I(`wasm-instantiate`),Wt}F(`wasm-instantiate`);function t(t){return e(t.instance)}var r=oe();return n.instantiateWasm?new Promise((t,i)=>{n.instantiateWasm(r,(n,r)=>{t(e(n,r))})}):(ee??=te(),t(await ae(h,ee,r)))}class ce{name=`ExitStatus`;constructor(e){this.message=`Program terminated with exit(${e})`,this.status=e}}var le=e=>{for(;e.length>0;)e.shift()(n)},ue=[],de=e=>ue.push(e),fe=[],pe=e=>fe.push(e),me=!0,R={isAbs:e=>e.charAt(0)===`/`,splitPath:e=>/^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(e).slice(1),normalizeArray:(e,t)=>{for(var n=0,r=e.length-1;r>=0;r--){var i=e[r];i===`.`?e.splice(r,1):i===`..`?(e.splice(r,1),n++):n&&(e.splice(r,1),n--)}if(t)for(;n;n--)e.unshift(`..`);return e},normalize:e=>{var t=R.isAbs(e),n=e.slice(-1)===`/`;return e=R.normalizeArray(e.split(`/`).filter(e=>!!e),!t).join(`/`),!e&&!t&&(e=`.`),e&&n&&(e+=`/`),(t?`/`:``)+e},dirname:e=>{var t=R.splitPath(e),n=t[0],r=t[1];return!n&&!r?`.`:(r&&=r.slice(0,-1),n+r)},basename:e=>e&&e.match(/([^\/]+|\/)\/*$/)[1],join:(...e)=>R.normalize(e.join(`/`)),join2:(e,t)=>R.normalize(e+`/`+t)},he=()=>e=>crypto.getRandomValues(e),ge=e=>{(ge=he())(e)},_e={resolve:(...e)=>{for(var t=``,n=!1,r=e.length-1;r>=-1&&!n;r--){var i=r>=0?e[r]:B.cwd();if(typeof i!=`string`)throw TypeError(`Arguments to path.resolve must be strings`);if(!i)return``;t=i+`/`+t,n=R.isAbs(i)}return t=R.normalizeArray(t.split(`/`).filter(e=>!!e),!n).join(`/`),(n?`/`:``)+t||`.`},relative:(e,t)=>{e=_e.resolve(e).slice(1),t=_e.resolve(t).slice(1);function n(e){for(var t=0;t<e.length&&e[t]===``;t++);for(var n=e.length-1;n>=0&&e[n]===``;n--);return t>n?[]:e.slice(t,n-t+1)}for(var r=n(e.split(`/`)),i=n(t.split(`/`)),a=Math.min(r.length,i.length),o=a,s=0;s<a;s++)if(r[s]!==i[s]){o=s;break}for(var c=[],s=o;s<r.length;s++)c.push(`..`);return c=c.concat(i.slice(o)),c.join(`/`)}},ve=new TextDecoder,ye=(e,t=0,n=NaN)=>{for(var r=t+n,i=t;e[i]&&!(i>=r);)++i;return ve.decode(e.buffer?e.subarray(t,i):new Uint8Array(e.slice(t,i)))},be=[],xe=e=>{for(var t=0,n=0;n<e.length;++n){var r=e.charCodeAt(n);r<=127?t++:r<=2047?t+=2:r>=55296&&r<=57343?(t+=4,++n):t+=3}return t},Se=(e,t,n,r)=>{if(!(r>0))return 0;for(var i=n,a=n+r-1,o=0;o<e.length;++o){var s=e.codePointAt(o);if(s<=127){if(n>=a)break;t[n++]=s}else if(s<=2047){if(n+1>=a)break;t[n++]=192|s>>6,t[n++]=128|s&63}else if(s<=65535){if(n+2>=a)break;t[n++]=224|s>>12,t[n++]=128|s>>6&63,t[n++]=128|s&63}else{if(n+3>=a)break;t[n++]=240|s>>18,t[n++]=128|s>>12&63,t[n++]=128|s>>6&63,t[n++]=128|s&63,o++}}return t[n]=0,n-i},Ce=(e,t,n)=>{var r=n>0?n:xe(e)+1,i=Array(r),a=Se(e,i,0,i.length);return t&&(i.length=a),i},we=()=>{if(!be.length){var e=null;if(typeof window<`u`&&typeof window.prompt==`function`&&(e=window.prompt(`Input: `),e!==null&&(e+=`
`)),!e)return null;be=Ce(e,!0)}return be.shift()},Te={ttys:[],init(){},shutdown(){},register(e,t){Te.ttys[e]={input:[],output:[],ops:t},B.registerDevice(e,Te.stream_ops)},stream_ops:{open(e){var t=Te.ttys[e.node.rdev];if(!t)throw new B.ErrnoError(43);e.tty=t,e.seekable=!1},close(e){e.tty.ops.fsync(e.tty)},fsync(e){e.tty.ops.fsync(e.tty)},read(e,t,n,r,i){if(!e.tty||!e.tty.ops.get_char)throw new B.ErrnoError(60);for(var a=0,o=0;o<r;o++){var s;try{s=e.tty.ops.get_char(e.tty)}catch{throw new B.ErrnoError(29)}if(s===void 0&&a===0)throw new B.ErrnoError(6);if(s==null)break;a++,t[n+o]=s}return a&&(e.node.atime=Date.now()),a},write(e,t,n,r,i){if(!e.tty||!e.tty.ops.put_char)throw new B.ErrnoError(60);try{for(var a=0;a<r;a++)e.tty.ops.put_char(e.tty,t[n+a])}catch{throw new B.ErrnoError(29)}return r&&(e.node.mtime=e.node.ctime=Date.now()),a}},default_tty_ops:{get_char(e){return we()},put_char(e,t){t===null||t===10?(p(ye(e.output)),e.output=[]):t!=0&&e.output.push(t)},fsync(e){e.output?.length>0&&(p(ye(e.output)),e.output=[])},ioctl_tcgets(e){return{c_iflag:25856,c_oflag:5,c_cflag:191,c_lflag:35387,c_cc:[3,28,127,21,4,0,1,0,17,19,26,0,18,15,23,22,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}},ioctl_tcsets(e,t,n){return 0},ioctl_tiocgwinsz(e){return[24,80]}},default_tty1_ops:{put_char(e,t){t===null||t===10?(m(ye(e.output)),e.output=[]):t!=0&&e.output.push(t)},fsync(e){e.output?.length>0&&(m(ye(e.output)),e.output=[])}}},Ee=(e,t)=>S.fill(0,e,e+t),De=(e,t)=>Math.ceil(e/t)*t,Oe=e=>{e=De(e,65536);var t=Vt(65536,e);return t&&Ee(t,e),t},z={ops_table:null,mount(e){return z.createNode(null,`/`,16895,0)},createNode(e,t,n,r){if(B.isBlkdev(n)||B.isFIFO(n))throw new B.ErrnoError(63);z.ops_table||={dir:{node:{getattr:z.node_ops.getattr,setattr:z.node_ops.setattr,lookup:z.node_ops.lookup,mknod:z.node_ops.mknod,rename:z.node_ops.rename,unlink:z.node_ops.unlink,rmdir:z.node_ops.rmdir,readdir:z.node_ops.readdir,symlink:z.node_ops.symlink},stream:{llseek:z.stream_ops.llseek}},file:{node:{getattr:z.node_ops.getattr,setattr:z.node_ops.setattr},stream:{llseek:z.stream_ops.llseek,read:z.stream_ops.read,write:z.stream_ops.write,mmap:z.stream_ops.mmap,msync:z.stream_ops.msync}},link:{node:{getattr:z.node_ops.getattr,setattr:z.node_ops.setattr,readlink:z.node_ops.readlink},stream:{}},chrdev:{node:{getattr:z.node_ops.getattr,setattr:z.node_ops.setattr},stream:B.chrdev_stream_ops}};var i=B.createNode(e,t,n,r);return B.isDir(i.mode)?(i.node_ops=z.ops_table.dir.node,i.stream_ops=z.ops_table.dir.stream,i.contents={}):B.isFile(i.mode)?(i.node_ops=z.ops_table.file.node,i.stream_ops=z.ops_table.file.stream,i.usedBytes=0,i.contents=null):B.isLink(i.mode)?(i.node_ops=z.ops_table.link.node,i.stream_ops=z.ops_table.link.stream):B.isChrdev(i.mode)&&(i.node_ops=z.ops_table.chrdev.node,i.stream_ops=z.ops_table.chrdev.stream),i.atime=i.mtime=i.ctime=Date.now(),e&&(e.contents[t]=i,e.atime=e.mtime=e.ctime=i.atime),i},getFileDataAsTypedArray(e){return e.contents?e.contents.subarray?e.contents.subarray(0,e.usedBytes):new Uint8Array(e.contents):new Uint8Array},expandFileStorage(e,t){var n=e.contents?e.contents.length:0;if(!(n>=t)){t=Math.max(t,n*(n<1048576?2:1.125)>>>0),n!=0&&(t=Math.max(t,256));var r=e.contents;e.contents=new Uint8Array(t),e.usedBytes>0&&e.contents.set(r.subarray(0,e.usedBytes),0)}},resizeFileStorage(e,t){if(e.usedBytes!=t){if(t==0)e.contents=null,e.usedBytes=0;else{var n=e.contents;e.contents=new Uint8Array(t),n&&e.contents.set(n.subarray(0,Math.min(t,e.usedBytes))),e.usedBytes=t}}},node_ops:{getattr(e){var t={};return t.dev=B.isChrdev(e.mode)?e.id:1,t.ino=e.id,t.mode=e.mode,t.nlink=1,t.uid=0,t.gid=0,t.rdev=e.rdev,t.size=B.isDir(e.mode)?4096:B.isFile(e.mode)?e.usedBytes:B.isLink(e.mode)?e.link.length:0,t.atime=new Date(e.atime),t.mtime=new Date(e.mtime),t.ctime=new Date(e.ctime),t.blksize=4096,t.blocks=Math.ceil(t.size/t.blksize),t},setattr(e,t){for(let n of[`mode`,`atime`,`mtime`,`ctime`])t[n]!=null&&(e[n]=t[n]);t.size!==void 0&&z.resizeFileStorage(e,t.size)},lookup(e,t){throw z.doesNotExistError},mknod(e,t,n,r){return z.createNode(e,t,n,r)},rename(e,t,n){var r;try{r=B.lookupNode(t,n)}catch{}if(r){if(B.isDir(e.mode))for(var i in r.contents)throw new B.ErrnoError(55);B.hashRemoveNode(r)}delete e.parent.contents[e.name],t.contents[n]=e,e.name=n,t.ctime=t.mtime=e.parent.ctime=e.parent.mtime=Date.now()},unlink(e,t){delete e.contents[t],e.ctime=e.mtime=Date.now()},rmdir(e,t){for(var n in B.lookupNode(e,t).contents)throw new B.ErrnoError(55);delete e.contents[t],e.ctime=e.mtime=Date.now()},readdir(e){return[`.`,`..`,...Object.keys(e.contents)]},symlink(e,t,n){var r=z.createNode(e,t,41471,0);return r.link=n,r},readlink(e){if(!B.isLink(e.mode))throw new B.ErrnoError(28);return e.link}},stream_ops:{read(e,t,n,r,i){var a=e.node.contents;if(i>=e.node.usedBytes)return 0;var o=Math.min(e.node.usedBytes-i,r);if(o>8&&a.subarray)t.set(a.subarray(i,i+o),n);else for(var s=0;s<o;s++)t[n+s]=a[i+s];return o},write(e,t,n,r,i,a){if(t.buffer===x.buffer&&(a=!1),!r)return 0;var o=e.node;if(o.mtime=o.ctime=Date.now(),t.subarray&&(!o.contents||o.contents.subarray)){if(a)return o.contents=t.subarray(n,n+r),o.usedBytes=r,r;if(o.usedBytes===0&&i===0)return o.contents=t.slice(n,n+r),o.usedBytes=r,r;if(i+r<=o.usedBytes)return o.contents.set(t.subarray(n,n+r),i),r}if(z.expandFileStorage(o,i+r),o.contents.subarray&&t.subarray)o.contents.set(t.subarray(n,n+r),i);else for(var s=0;s<r;s++)o.contents[i+s]=t[n+s];return o.usedBytes=Math.max(o.usedBytes,i+r),r},llseek(e,t,n){var r=t;if(n===1?r+=e.position:n===2&&B.isFile(e.node.mode)&&(r+=e.node.usedBytes),r<0)throw new B.ErrnoError(28);return r},mmap(e,t,n,r,i){if(!B.isFile(e.node.mode))throw new B.ErrnoError(43);var a,o,s=e.node.contents;if(!(i&2)&&s&&s.buffer===x.buffer)o=!1,a=s.byteOffset;else{if(o=!0,a=Oe(t),!a)throw new B.ErrnoError(48);s&&((n>0||n+t<s.length)&&(s=s.subarray?s.subarray(n,n+t):Array.prototype.slice.call(s,n,n+t)),x.set(s,a))}return{ptr:a,allocated:o}},msync(e,t,n,r,i){return z.stream_ops.write(e,t,0,r,n,!1),0}}},ke=async e=>{var t=await d(e);return new Uint8Array(t)},Ae=(...e)=>B.createDataFile(...e),je=e=>e,Me=[],Ne=(e,t,n,r)=>{typeof Browser<`u`&&Browser.init();var i=!1;return Me.forEach(a=>{i||a.canHandle(t)&&(a.handle(e,t,n,r),i=!0)}),i},Pe=(e,t,n,r,i,a,o,s,c,l)=>{var u=t?_e.resolve(R.join2(e,t)):e,d=je(`cp ${u}`);function f(n){function f(n){l?.(),s||Ae(e,t,n,r,i,c),a?.(),I(d)}Ne(n,u,f,()=>{o?.(),I(d)})||f(n)}F(d),typeof n==`string`?ke(n).then(f,o):f(n)},Fe=e=>{var t={r:0,"r+":2,w:577,"w+":578,a:1089,"a+":1090}[e];if(t===void 0)throw Error(`Unknown file open mode: ${e}`);return t},Ie=(e,t)=>{var n=0;return e&&(n|=365),t&&(n|=146),n},B={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:`/`,initialized:!1,ignorePermissions:!0,filesystems:null,syncFSRequests:0,readFiles:{},ErrnoError:class{name=`ErrnoError`;constructor(e){this.errno=e}},FSStream:class{shared={};get object(){return this.node}set object(e){this.node=e}get isRead(){return(this.flags&2097155)!=1}get isWrite(){return!!(this.flags&2097155)}get isAppend(){return this.flags&1024}get flags(){return this.shared.flags}set flags(e){this.shared.flags=e}get position(){return this.shared.position}set position(e){this.shared.position=e}},FSNode:class{node_ops={};stream_ops={};readMode=365;writeMode=146;mounted=null;constructor(e,t,n,r){e||=this,this.parent=e,this.mount=e.mount,this.id=B.nextInode++,this.name=t,this.mode=n,this.rdev=r,this.atime=this.mtime=this.ctime=Date.now()}get read(){return(this.mode&this.readMode)===this.readMode}set read(e){e?this.mode|=this.readMode:this.mode&=~this.readMode}get write(){return(this.mode&this.writeMode)===this.writeMode}set write(e){e?this.mode|=this.writeMode:this.mode&=~this.writeMode}get isFolder(){return B.isDir(this.mode)}get isDevice(){return B.isChrdev(this.mode)}},lookupPath(e,t={}){if(!e)throw new B.ErrnoError(44);t.follow_mount??=!0,R.isAbs(e)||(e=B.cwd()+`/`+e);linkloop:for(var n=0;n<40;n++){for(var r=e.split(`/`).filter(e=>!!e),i=B.root,a=`/`,o=0;o<r.length;o++){var s=o===r.length-1;if(s&&t.parent)break;if(r[o]!==`.`){if(r[o]===`..`){if(a=R.dirname(a),B.isRoot(i)){e=a+`/`+r.slice(o+1).join(`/`);continue linkloop}i=i.parent;continue}a=R.join2(a,r[o]);try{i=B.lookupNode(i,r[o])}catch(e){if(e?.errno===44&&s&&t.noent_okay)return{path:a};throw e}if(B.isMountpoint(i)&&(!s||t.follow_mount)&&(i=i.mounted.root),B.isLink(i.mode)&&(!s||t.follow)){if(!i.node_ops.readlink)throw new B.ErrnoError(52);var c=i.node_ops.readlink(i);R.isAbs(c)||(c=R.dirname(a)+`/`+c),e=c+`/`+r.slice(o+1).join(`/`);continue linkloop}}}return{path:a,node:i}}throw new B.ErrnoError(32)},getPath(e){for(var t;;){if(B.isRoot(e)){var n=e.mount.mountpoint;return t?n[n.length-1]===`/`?n+t:`${n}/${t}`:n}t=t?`${e.name}/${t}`:e.name,e=e.parent}},hashName(e,t){for(var n=0,r=0;r<t.length;r++)n=(n<<5)-n+t.charCodeAt(r)|0;return(e+n>>>0)%B.nameTable.length},hashAddNode(e){var t=B.hashName(e.parent.id,e.name);e.name_next=B.nameTable[t],B.nameTable[t]=e},hashRemoveNode(e){var t=B.hashName(e.parent.id,e.name);if(B.nameTable[t]===e)B.nameTable[t]=e.name_next;else for(var n=B.nameTable[t];n;){if(n.name_next===e){n.name_next=e.name_next;break}n=n.name_next}},lookupNode(e,t){var n=B.mayLookup(e);if(n)throw new B.ErrnoError(n);for(var r=B.hashName(e.id,t),i=B.nameTable[r];i;i=i.name_next){var a=i.name;if(i.parent.id===e.id&&a===t)return i}return B.lookup(e,t)},createNode(e,t,n,r){var i=new B.FSNode(e,t,n,r);return B.hashAddNode(i),i},destroyNode(e){B.hashRemoveNode(e)},isRoot(e){return e===e.parent},isMountpoint(e){return!!e.mounted},isFile(e){return(e&61440)==32768},isDir(e){return(e&61440)==16384},isLink(e){return(e&61440)==40960},isChrdev(e){return(e&61440)==8192},isBlkdev(e){return(e&61440)==24576},isFIFO(e){return(e&61440)==4096},isSocket(e){return(e&49152)==49152},flagsToPermissionString(e){var t=[`r`,`w`,`rw`][e&3];return e&512&&(t+=`w`),t},nodePermissions(e,t){return B.ignorePermissions?0:t.includes(`r`)&&!(e.mode&292)||t.includes(`w`)&&!(e.mode&146)||t.includes(`x`)&&!(e.mode&73)?2:0},mayLookup(e){return B.isDir(e.mode)?B.nodePermissions(e,`x`)||(e.node_ops.lookup?0:2):54},mayCreate(e,t){if(!B.isDir(e.mode))return 54;try{return B.lookupNode(e,t),20}catch{}return B.nodePermissions(e,`wx`)},mayDelete(e,t,n){var r;try{r=B.lookupNode(e,t)}catch(e){return e.errno}var i=B.nodePermissions(e,`wx`);if(i)return i;if(n){if(!B.isDir(r.mode))return 54;if(B.isRoot(r)||B.getPath(r)===B.cwd())return 10}else if(B.isDir(r.mode))return 31;return 0},mayOpen(e,t){return e?B.isLink(e.mode)?32:B.isDir(e.mode)&&(B.flagsToPermissionString(t)!==`r`||t&576)?31:B.nodePermissions(e,B.flagsToPermissionString(t)):44},checkOpExists(e,t){if(!e)throw new B.ErrnoError(t);return e},MAX_OPEN_FDS:4096,nextfd(){for(var e=0;e<=B.MAX_OPEN_FDS;e++)if(!B.streams[e])return e;throw new B.ErrnoError(33)},getStreamChecked(e){var t=B.getStream(e);if(!t)throw new B.ErrnoError(8);return t},getStream:e=>B.streams[e],createStream(e,t=-1){return e=Object.assign(new B.FSStream,e),t==-1&&(t=B.nextfd()),e.fd=t,B.streams[t]=e,e},closeStream(e){B.streams[e]=null},dupStream(e,t=-1){var n=B.createStream(e,t);return n.stream_ops?.dup?.(n),n},doSetAttr(e,t,n){var r=e?.stream_ops.setattr,i=r?e:t;r??=t.node_ops.setattr,B.checkOpExists(r,63),r(i,n)},chrdev_stream_ops:{open(e){e.stream_ops=B.getDevice(e.node.rdev).stream_ops,e.stream_ops.open?.(e)},llseek(){throw new B.ErrnoError(70)}},major:e=>e>>8,minor:e=>e&255,makedev:(e,t)=>e<<8|t,registerDevice(e,t){B.devices[e]={stream_ops:t}},getDevice:e=>B.devices[e],getMounts(e){for(var t=[],n=[e];n.length;){var r=n.pop();t.push(r),n.push(...r.mounts)}return t},syncfs(e,t){typeof e==`function`&&(t=e,e=!1),B.syncFSRequests++,B.syncFSRequests>1&&m(`warning: ${B.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);var n=B.getMounts(B.root.mount),r=0;function i(e){return B.syncFSRequests--,t(e)}function a(e){if(e)return a.errored?void 0:(a.errored=!0,i(e));++r>=n.length&&i(null)}n.forEach(t=>{if(!t.type.syncfs)return a(null);t.type.syncfs(t,e,a)})},mount(e,t,n){var r=n===`/`,i=!n,a;if(r&&B.root)throw new B.ErrnoError(10);if(!r&&!i){var o=B.lookupPath(n,{follow_mount:!1});if(n=o.path,a=o.node,B.isMountpoint(a))throw new B.ErrnoError(10);if(!B.isDir(a.mode))throw new B.ErrnoError(54)}var s={type:e,opts:t,mountpoint:n,mounts:[]},c=e.mount(s);return c.mount=s,s.root=c,r?B.root=c:a&&(a.mounted=s,a.mount&&a.mount.mounts.push(s)),c},unmount(e){var t=B.lookupPath(e,{follow_mount:!1});if(!B.isMountpoint(t.node))throw new B.ErrnoError(28);var n=t.node,r=n.mounted,i=B.getMounts(r);Object.keys(B.nameTable).forEach(e=>{for(var t=B.nameTable[e];t;){var n=t.name_next;i.includes(t.mount)&&B.destroyNode(t),t=n}}),n.mounted=null;var a=n.mount.mounts.indexOf(r);n.mount.mounts.splice(a,1)},lookup(e,t){return e.node_ops.lookup(e,t)},mknod(e,t,n){var r=B.lookupPath(e,{parent:!0}).node,i=R.basename(e);if(!i)throw new B.ErrnoError(28);if(i===`.`||i===`..`)throw new B.ErrnoError(20);var a=B.mayCreate(r,i);if(a)throw new B.ErrnoError(a);if(!r.node_ops.mknod)throw new B.ErrnoError(63);return r.node_ops.mknod(r,i,t,n)},statfs(e){return B.statfsNode(B.lookupPath(e,{follow:!0}).node)},statfsStream(e){return B.statfsNode(e.node)},statfsNode(e){var t={bsize:4096,frsize:4096,blocks:1e6,bfree:5e5,bavail:5e5,files:B.nextInode,ffree:B.nextInode-1,fsid:42,flags:2,namelen:255};return e.node_ops.statfs&&Object.assign(t,e.node_ops.statfs(e.mount.opts.root)),t},create(e,t=438){return t&=4095,t|=32768,B.mknod(e,t,0)},mkdir(e,t=511){return t&=1023,t|=16384,B.mknod(e,t,0)},mkdirTree(e,t){var n=e.split(`/`),r=``;for(var i of n)if(i){(r||R.isAbs(e))&&(r+=`/`),r+=i;try{B.mkdir(r,t)}catch(e){if(e.errno!=20)throw e}}},mkdev(e,t,n){return n===void 0&&(n=t,t=438),t|=8192,B.mknod(e,t,n)},symlink(e,t){if(!_e.resolve(e))throw new B.ErrnoError(44);var n=B.lookupPath(t,{parent:!0}).node;if(!n)throw new B.ErrnoError(44);var r=R.basename(t),i=B.mayCreate(n,r);if(i)throw new B.ErrnoError(i);if(!n.node_ops.symlink)throw new B.ErrnoError(63);return n.node_ops.symlink(n,r,e)},rename(e,t){var n=R.dirname(e),r=R.dirname(t),i=R.basename(e),a=R.basename(t),o=B.lookupPath(e,{parent:!0}),s=o.node,c;if(o=B.lookupPath(t,{parent:!0}),c=o.node,!s||!c)throw new B.ErrnoError(44);if(s.mount!==c.mount)throw new B.ErrnoError(75);var l=B.lookupNode(s,i),u=_e.relative(e,r);if(u.charAt(0)!==`.`)throw new B.ErrnoError(28);if(u=_e.relative(t,n),u.charAt(0)!==`.`)throw new B.ErrnoError(55);var d;try{d=B.lookupNode(c,a)}catch{}if(l!==d){var f=B.isDir(l.mode),p=B.mayDelete(s,i,f);if(p||(p=d?B.mayDelete(c,a,f):B.mayCreate(c,a),p))throw new B.ErrnoError(p);if(!s.node_ops.rename)throw new B.ErrnoError(63);if(B.isMountpoint(l)||d&&B.isMountpoint(d))throw new B.ErrnoError(10);if(c!==s&&(p=B.nodePermissions(s,`w`),p))throw new B.ErrnoError(p);B.hashRemoveNode(l);try{s.node_ops.rename(l,c,a),l.parent=c}catch(e){throw e}finally{B.hashAddNode(l)}}},rmdir(e){var t=B.lookupPath(e,{parent:!0}).node,n=R.basename(e),r=B.lookupNode(t,n),i=B.mayDelete(t,n,!0);if(i)throw new B.ErrnoError(i);if(!t.node_ops.rmdir)throw new B.ErrnoError(63);if(B.isMountpoint(r))throw new B.ErrnoError(10);t.node_ops.rmdir(t,n),B.destroyNode(r)},readdir(e){var t=B.lookupPath(e,{follow:!0}).node;return B.checkOpExists(t.node_ops.readdir,54)(t)},unlink(e){var t=B.lookupPath(e,{parent:!0}).node;if(!t)throw new B.ErrnoError(44);var n=R.basename(e),r=B.lookupNode(t,n),i=B.mayDelete(t,n,!1);if(i)throw new B.ErrnoError(i);if(!t.node_ops.unlink)throw new B.ErrnoError(63);if(B.isMountpoint(r))throw new B.ErrnoError(10);t.node_ops.unlink(t,n),B.destroyNode(r)},readlink(e){var t=B.lookupPath(e).node;if(!t)throw new B.ErrnoError(44);if(!t.node_ops.readlink)throw new B.ErrnoError(28);return t.node_ops.readlink(t)},stat(e,t){var n=B.lookupPath(e,{follow:!t}).node;return B.checkOpExists(n.node_ops.getattr,63)(n)},fstat(e){var t=B.getStreamChecked(e),n=t.node,r=t.stream_ops.getattr,i=r?t:n;return r??=n.node_ops.getattr,B.checkOpExists(r,63),r(i)},lstat(e){return B.stat(e,!0)},doChmod(e,t,n,r){B.doSetAttr(e,t,{mode:n&4095|t.mode&-4096,ctime:Date.now(),dontFollow:r})},chmod(e,t,n){var r=typeof e==`string`?B.lookupPath(e,{follow:!n}).node:e;B.doChmod(null,r,t,n)},lchmod(e,t){B.chmod(e,t,!0)},fchmod(e,t){var n=B.getStreamChecked(e);B.doChmod(n,n.node,t,!1)},doChown(e,t,n){B.doSetAttr(e,t,{timestamp:Date.now(),dontFollow:n})},chown(e,t,n,r){var i=typeof e==`string`?B.lookupPath(e,{follow:!r}).node:e;B.doChown(null,i,r)},lchown(e,t,n){B.chown(e,t,n,!0)},fchown(e,t,n){var r=B.getStreamChecked(e);B.doChown(r,r.node,!1)},doTruncate(e,t,n){if(B.isDir(t.mode))throw new B.ErrnoError(31);if(!B.isFile(t.mode))throw new B.ErrnoError(28);var r=B.nodePermissions(t,`w`);if(r)throw new B.ErrnoError(r);B.doSetAttr(e,t,{size:n,timestamp:Date.now()})},truncate(e,t){if(t<0)throw new B.ErrnoError(28);var n=typeof e==`string`?B.lookupPath(e,{follow:!0}).node:e;B.doTruncate(null,n,t)},ftruncate(e,t){var n=B.getStreamChecked(e);if(t<0||!(n.flags&2097155))throw new B.ErrnoError(28);B.doTruncate(n,n.node,t)},utime(e,t,n){var r=B.lookupPath(e,{follow:!0}).node;B.checkOpExists(r.node_ops.setattr,63)(r,{atime:t,mtime:n})},open(e,t,r=438){if(e===``)throw new B.ErrnoError(44);t=typeof t==`string`?Fe(t):t,r=t&64?r&4095|32768:0;var i,a;if(typeof e==`object`)i=e;else{a=e.endsWith(`/`);var o=B.lookupPath(e,{follow:!(t&131072),noent_okay:!0});i=o.node,e=o.path}var s=!1;if(t&64){if(i){if(t&128)throw new B.ErrnoError(20)}else if(a)throw new B.ErrnoError(31);else i=B.mknod(e,r|511,0),s=!0}if(!i)throw new B.ErrnoError(44);if(B.isChrdev(i.mode)&&(t&=-513),t&65536&&!B.isDir(i.mode))throw new B.ErrnoError(54);if(!s){var c=B.mayOpen(i,t);if(c)throw new B.ErrnoError(c)}t&512&&!s&&B.truncate(i,0),t&=-131713;var l=B.createStream({node:i,path:B.getPath(i),flags:t,seekable:!0,position:0,stream_ops:i.stream_ops,ungotten:[],error:!1});return l.stream_ops.open&&l.stream_ops.open(l),s&&B.chmod(i,r&511),n.logReadFiles&&!(t&1)&&(e in B.readFiles||(B.readFiles[e]=1)),l},close(e){if(B.isClosed(e))throw new B.ErrnoError(8);e.getdents&&=null;try{e.stream_ops.close&&e.stream_ops.close(e)}catch(e){throw e}finally{B.closeStream(e.fd)}e.fd=null},isClosed(e){return e.fd===null},llseek(e,t,n){if(B.isClosed(e))throw new B.ErrnoError(8);if(!e.seekable||!e.stream_ops.llseek)throw new B.ErrnoError(70);if(n!=0&&n!=1&&n!=2)throw new B.ErrnoError(28);return e.position=e.stream_ops.llseek(e,t,n),e.ungotten=[],e.position},read(e,t,n,r,i){if(r<0||i<0)throw new B.ErrnoError(28);if(B.isClosed(e)||(e.flags&2097155)==1)throw new B.ErrnoError(8);if(B.isDir(e.node.mode))throw new B.ErrnoError(31);if(!e.stream_ops.read)throw new B.ErrnoError(28);var a=i!==void 0;if(!a)i=e.position;else if(!e.seekable)throw new B.ErrnoError(70);var o=e.stream_ops.read(e,t,n,r,i);return a||(e.position+=o),o},write(e,t,n,r,i,a){if(r<0||i<0)throw new B.ErrnoError(28);if(B.isClosed(e)||!(e.flags&2097155))throw new B.ErrnoError(8);if(B.isDir(e.node.mode))throw new B.ErrnoError(31);if(!e.stream_ops.write)throw new B.ErrnoError(28);e.seekable&&e.flags&1024&&B.llseek(e,0,2);var o=i!==void 0;if(!o)i=e.position;else if(!e.seekable)throw new B.ErrnoError(70);var s=e.stream_ops.write(e,t,n,r,i,a);return o||(e.position+=s),s},mmap(e,t,n,r,i){if(r&2&&!(i&2)&&(e.flags&2097155)!=2||(e.flags&2097155)==1)throw new B.ErrnoError(2);if(!e.stream_ops.mmap)throw new B.ErrnoError(43);if(!t)throw new B.ErrnoError(28);return e.stream_ops.mmap(e,t,n,r,i)},msync(e,t,n,r,i){return e.stream_ops.msync?e.stream_ops.msync(e,t,n,r,i):0},ioctl(e,t,n){if(!e.stream_ops.ioctl)throw new B.ErrnoError(59);return e.stream_ops.ioctl(e,t,n)},readFile(e,t={}){if(t.flags=t.flags||0,t.encoding=t.encoding||`binary`,t.encoding!==`utf8`&&t.encoding!==`binary`)throw Error(`Invalid encoding type "${t.encoding}"`);var n=B.open(e,t.flags),r=B.stat(e).size,i=new Uint8Array(r);return B.read(n,i,0,r,0),t.encoding===`utf8`&&(i=ye(i)),B.close(n),i},writeFile(e,t,n={}){n.flags=n.flags||577;var r=B.open(e,n.flags,n.mode);if(typeof t==`string`&&(t=new Uint8Array(Ce(t,!0))),ArrayBuffer.isView(t))B.write(r,t,0,t.byteLength,void 0,n.canOwn);else throw Error(`Unsupported data type`);B.close(r)},cwd:()=>B.currentPath,chdir(e){var t=B.lookupPath(e,{follow:!0});if(t.node===null)throw new B.ErrnoError(44);if(!B.isDir(t.node.mode))throw new B.ErrnoError(54);var n=B.nodePermissions(t.node,`x`);if(n)throw new B.ErrnoError(n);B.currentPath=t.path},createDefaultDirectories(){B.mkdir(`/tmp`),B.mkdir(`/home`),B.mkdir(`/home/web_user`)},createDefaultDevices(){B.mkdir(`/dev`),B.registerDevice(B.makedev(1,3),{read:()=>0,write:(e,t,n,r,i)=>r,llseek:()=>0}),B.mkdev(`/dev/null`,B.makedev(1,3)),Te.register(B.makedev(5,0),Te.default_tty_ops),Te.register(B.makedev(6,0),Te.default_tty1_ops),B.mkdev(`/dev/tty`,B.makedev(5,0)),B.mkdev(`/dev/tty1`,B.makedev(6,0));var e=new Uint8Array(1024),t=0,n=()=>(t===0&&(ge(e),t=e.byteLength),e[--t]);B.createDevice(`/dev`,`random`,n),B.createDevice(`/dev`,`urandom`,n),B.mkdir(`/dev/shm`),B.mkdir(`/dev/shm/tmp`)},createSpecialDirectories(){B.mkdir(`/proc`);var e=B.mkdir(`/proc/self`);B.mkdir(`/proc/self/fd`),B.mount({mount(){var t=B.createNode(e,`fd`,16895,73);return t.stream_ops={llseek:z.stream_ops.llseek},t.node_ops={lookup(e,t){var n=+t,r=B.getStreamChecked(n),i={parent:null,mount:{mountpoint:`fake`},node_ops:{readlink:()=>r.path},id:n+1};return i.parent=i,i},readdir(){return Array.from(B.streams.entries()).filter(([e,t])=>t).map(([e,t])=>e.toString())}},t}},{},`/proc/self/fd`)},createStandardStreams(e,t,n){e?B.createDevice(`/dev`,`stdin`,e):B.symlink(`/dev/tty`,`/dev/stdin`),t?B.createDevice(`/dev`,`stdout`,null,t):B.symlink(`/dev/tty`,`/dev/stdout`),n?B.createDevice(`/dev`,`stderr`,null,n):B.symlink(`/dev/tty1`,`/dev/stderr`),B.open(`/dev/stdin`,0),B.open(`/dev/stdout`,1),B.open(`/dev/stderr`,1)},staticInit(){B.nameTable=Array(4096),B.mount(z,{},`/`),B.createDefaultDirectories(),B.createDefaultDevices(),B.createSpecialDirectories(),B.filesystems={MEMFS:z}},init(e,t,r){B.initialized=!0,e??=n.stdin,t??=n.stdout,r??=n.stderr,B.createStandardStreams(e,t,r)},quit(){B.initialized=!1;for(var e of B.streams)e&&B.close(e)},findObject(e,t){var n=B.analyzePath(e,t);return n.exists?n.object:null},analyzePath(e,t){try{var n=B.lookupPath(e,{follow:!t});e=n.path}catch{}var r={isRoot:!1,exists:!1,error:0,name:null,path:null,object:null,parentExists:!1,parentPath:null,parentObject:null};try{var n=B.lookupPath(e,{parent:!0});r.parentExists=!0,r.parentPath=n.path,r.parentObject=n.node,r.name=R.basename(e),n=B.lookupPath(e,{follow:!t}),r.exists=!0,r.path=n.path,r.object=n.node,r.name=n.node.name,r.isRoot=n.path===`/`}catch(e){r.error=e.errno}return r},createPath(e,t,n,r){e=typeof e==`string`?e:B.getPath(e);for(var i=t.split(`/`).reverse();i.length;){var a=i.pop();if(a){var o=R.join2(e,a);try{B.mkdir(o)}catch(e){if(e.errno!=20)throw e}e=o}}return o},createFile(e,t,n,r,i){var a=R.join2(typeof e==`string`?e:B.getPath(e),t),o=Ie(r,i);return B.create(a,o)},createDataFile(e,t,n,r,i,a){var o=t;e&&(e=typeof e==`string`?e:B.getPath(e),o=t?R.join2(e,t):e);var s=Ie(r,i),c=B.create(o,s);if(n){if(typeof n==`string`){for(var l=Array(n.length),u=0,d=n.length;u<d;++u)l[u]=n.charCodeAt(u);n=l}B.chmod(c,s|146);var f=B.open(c,577);B.write(f,n,0,n.length,0,a),B.close(f),B.chmod(c,s)}},createDevice(e,t,n,r){var i=R.join2(typeof e==`string`?e:B.getPath(e),t),a=Ie(!!n,!!r);B.createDevice.major??=64;var o=B.makedev(B.createDevice.major++,0);return B.registerDevice(o,{open(e){e.seekable=!1},close(e){r?.buffer?.length&&r(10)},read(e,t,r,i,a){for(var o=0,s=0;s<i;s++){var c;try{c=n()}catch{throw new B.ErrnoError(29)}if(c===void 0&&o===0)throw new B.ErrnoError(6);if(c==null)break;o++,t[r+s]=c}return o&&(e.node.atime=Date.now()),o},write(e,t,n,i,a){for(var o=0;o<i;o++)try{r(t[n+o])}catch{throw new B.ErrnoError(29)}return i&&(e.node.mtime=e.node.ctime=Date.now()),o}}),B.mkdev(i,a,o)},forceLoadFile(e){if(e.isDevice||e.isFolder||e.link||e.contents)return!0;if(typeof XMLHttpRequest<`u`)throw Error(`Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.`);try{e.contents=f(e.url),e.usedBytes=e.contents.length}catch{throw new B.ErrnoError(29)}},createLazyFile(e,t,n,r,a){class o{lengthKnown=!1;chunks=[];get(e){if(!(e>this.length-1||e<0)){var t=e%this.chunkSize,n=e/this.chunkSize|0;return this.getter(n)[t]}}setDataGetter(e){this.getter=e}cacheLength(){var e=new XMLHttpRequest;if(e.open(`HEAD`,n,!1),e.send(null),!(e.status>=200&&e.status<300||e.status===304))throw Error(`Couldn't load `+n+`. Status: `+e.status);var t=Number(e.getResponseHeader(`Content-length`)),r,i=(r=e.getResponseHeader(`Accept-Ranges`))&&r===`bytes`,a=(r=e.getResponseHeader(`Content-Encoding`))&&r===`gzip`,o=1048576;i||(o=t);var s=(e,r)=>{if(e>r)throw Error(`invalid range (`+e+`, `+r+`) or no bytes requested!`);if(r>t-1)throw Error(`only `+t+` bytes available! programmer error!`);var i=new XMLHttpRequest;if(i.open(`GET`,n,!1),t!==o&&i.setRequestHeader(`Range`,`bytes=`+e+`-`+r),i.responseType=`arraybuffer`,i.overrideMimeType&&i.overrideMimeType(`text/plain; charset=x-user-defined`),i.send(null),!(i.status>=200&&i.status<300||i.status===304))throw Error(`Couldn't load `+n+`. Status: `+i.status);return i.response===void 0?Ce(i.responseText||``,!0):new Uint8Array(i.response||[])},c=this;c.setDataGetter(e=>{var n=e*o,r=(e+1)*o-1;if(r=Math.min(r,t-1),c.chunks[e]===void 0&&(c.chunks[e]=s(n,r)),c.chunks[e]===void 0)throw Error(`doXHR failed!`);return c.chunks[e]}),(a||!t)&&(o=t=1,t=this.getter(0).length,o=t,p(`LazyFiles on gzip forces download of the whole file when length is accessed`)),this._length=t,this._chunkSize=o,this.lengthKnown=!0}get length(){return this.lengthKnown||this.cacheLength(),this._length}get chunkSize(){return this.lengthKnown||this.cacheLength(),this._chunkSize}}if(typeof XMLHttpRequest<`u`){if(!i)throw`Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc`;var s={isDevice:!1,contents:new o}}else var s={isDevice:!1,url:n};var c=B.createFile(e,t,s,r,a);s.contents?c.contents=s.contents:s.url&&(c.contents=null,c.url=s.url),Object.defineProperties(c,{usedBytes:{get:function(){return this.contents.length}}});var l={};Object.keys(c.stream_ops).forEach(e=>{var t=c.stream_ops[e];l[e]=(...e)=>(B.forceLoadFile(c),t(...e))});function u(e,t,n,r,i){var a=e.node.contents;if(i>=a.length)return 0;var o=Math.min(a.length-i,r);if(a.slice)for(var s=0;s<o;s++)t[n+s]=a[i+s];else for(var s=0;s<o;s++)t[n+s]=a.get(i+s);return o}return l.read=(e,t,n,r,i)=>(B.forceLoadFile(c),u(e,t,n,r,i)),l.mmap=(e,t,n,r,i)=>{B.forceLoadFile(c);var a=Oe(t);if(!a)throw new B.ErrnoError(48);return u(e,x,a,t,n),{ptr:a,allocated:!0}},c.stream_ops=l,c}},Le=(e,t)=>{if(!e)return``;for(var n=e+t,r=e;!(r>=n)&&S[r];)++r;return ve.decode(S.subarray(e,r))},V={DEFAULT_POLLMASK:5,calculateAt(e,t,n){if(R.isAbs(t))return t;var r=e===-100?B.cwd():V.getStreamFromFD(e).path;if(t.length==0){if(!n)throw new B.ErrnoError(44);return r}return r+`/`+t},writeStat(e,t){w[e>>2]=t.dev,w[e+4>>2]=t.mode,T[e+8>>2]=t.nlink,w[e+12>>2]=t.uid,w[e+16>>2]=t.gid,w[e+20>>2]=t.rdev,E[e+24>>3]=BigInt(t.size),w[e+32>>2]=4096,w[e+36>>2]=t.blocks;var n=t.atime.getTime(),r=t.mtime.getTime(),i=t.ctime.getTime();return E[e+40>>3]=BigInt(Math.floor(n/1e3)),T[e+48>>2]=n%1e3*1e3*1e3,E[e+56>>3]=BigInt(Math.floor(r/1e3)),T[e+64>>2]=r%1e3*1e3*1e3,E[e+72>>3]=BigInt(Math.floor(i/1e3)),T[e+80>>2]=i%1e3*1e3*1e3,E[e+88>>3]=BigInt(t.ino),0},writeStatFs(e,t){w[e+4>>2]=t.bsize,w[e+40>>2]=t.bsize,w[e+8>>2]=t.blocks,w[e+12>>2]=t.bfree,w[e+16>>2]=t.bavail,w[e+20>>2]=t.files,w[e+24>>2]=t.ffree,w[e+28>>2]=t.fsid,w[e+44>>2]=t.flags,w[e+36>>2]=t.namelen},doMsync(e,t,n,r,i){if(!B.isFile(t.node.mode))throw new B.ErrnoError(43);if(r&2)return 0;var a=S.slice(e,e+n);B.msync(t,a,i,n,r)},getStreamFromFD(e){return B.getStreamChecked(e)},varargs:void 0,getStr(e){return Le(e)}};function Re(e,t){try{return e=V.getStr(e),B.chmod(e,t),0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}function H(e,t,n,r){try{if(t=V.getStr(t),t=V.calculateAt(e,t),n&-8)return-28;var i=B.lookupPath(t,{follow:!0}).node;if(!i)return-44;var a=``;return n&4&&(a+=`r`),n&2&&(a+=`w`),n&1&&(a+=`x`),a&&B.nodePermissions(i,a)?-2:0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}function ze(e,t){try{return B.fchmod(e,t),0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}function U(e,t,n){try{return B.fchown(e,t,n),0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}var Be=()=>{var e=w[V.varargs>>2];return V.varargs+=4,e},Ve=Be;function He(e,t,n){V.varargs=n;try{var r=V.getStreamFromFD(e);switch(t){case 0:var i=Be();if(i<0)return-28;for(;B.streams[i];)i++;return B.dupStream(r,i).fd;case 1:case 2:return 0;case 3:return r.flags;case 4:var i=Be();return r.flags|=i,0;case 12:var i=Ve(),a=0;return C[i+a>>1]=2,0;case 13:case 14:return 0}return-28}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}function Ue(e,t){try{return V.writeStat(t,B.fstat(e))}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}var We=9007199254740992,Ge=-9007199254740992,W=e=>e<Ge||e>We?NaN:Number(e);function Ke(e,t){t=W(t);try{return isNaN(t)?-61:(B.ftruncate(e,t),0)}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}var qe=(e,t,n)=>Se(e,S,t,n);function Je(e,t){try{if(t===0)return-28;var n=B.cwd(),r=xe(n)+1;return t<r?-68:(qe(n,e,t),r)}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}function Ye(e,t,n){V.varargs=n;try{var r=V.getStreamFromFD(e);switch(t){case 21509:return r.tty?0:-59;case 21505:if(!r.tty)return-59;if(r.tty.ops.ioctl_tcgets){var i=r.tty.ops.ioctl_tcgets(r),a=Ve();w[a>>2]=i.c_iflag||0,w[a+4>>2]=i.c_oflag||0,w[a+8>>2]=i.c_cflag||0,w[a+12>>2]=i.c_lflag||0;for(var o=0;o<32;o++)x[a+o+17]=i.c_cc[o]||0;return 0}return 0;case 21510:case 21511:case 21512:return r.tty?0:-59;case 21506:case 21507:case 21508:if(!r.tty)return-59;if(r.tty.ops.ioctl_tcsets){for(var a=Ve(),s=w[a>>2],c=w[a+4>>2],l=w[a+8>>2],u=w[a+12>>2],d=[],o=0;o<32;o++)d.push(x[a+o+17]);return r.tty.ops.ioctl_tcsets(r.tty,t,{c_iflag:s,c_oflag:c,c_cflag:l,c_lflag:u,c_cc:d})}return 0;case 21519:if(!r.tty)return-59;var a=Ve();return w[a>>2]=0,0;case 21520:return r.tty?-28:-59;case 21531:var a=Ve();return B.ioctl(r,t,a);case 21523:if(!r.tty)return-59;if(r.tty.ops.ioctl_tiocgwinsz){var f=r.tty.ops.ioctl_tiocgwinsz(r.tty),a=Ve();C[a>>1]=f[0],C[a+2>>1]=f[1]}return 0;case 21524:return r.tty?0:-59;case 21515:return r.tty?0:-59;default:return-28}}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}function Xe(e,t){try{return e=V.getStr(e),V.writeStat(t,B.lstat(e))}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}function Ze(e,t,n){try{return t=V.getStr(t),t=V.calculateAt(e,t),B.mkdir(t,n,0),0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}function Qe(e,t,n,r){try{t=V.getStr(t);var i=r&256,a=r&4096;return r&=-6401,t=V.calculateAt(e,t,a),V.writeStat(n,i?B.lstat(t):B.stat(t))}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}function $e(e,t,n,r){V.varargs=r;try{t=V.getStr(t),t=V.calculateAt(e,t);var i=r?Be():0;return B.open(t,n,i).fd}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}function et(e,t,n,r){try{if(t=V.getStr(t),t=V.calculateAt(e,t),r<=0)return-28;var i=B.readlink(t),a=Math.min(r,xe(i)),o=x[n+a];return qe(i,n,r+1),x[n+a]=o,a}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}function tt(e){try{return e=V.getStr(e),B.rmdir(e),0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}function nt(e,t){try{return e=V.getStr(e),V.writeStat(t,B.stat(e))}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}function rt(e,t,n){try{if(t=V.getStr(t),t=V.calculateAt(e,t),!n)B.unlink(t);else if(n===512)B.rmdir(t);else return-28;return 0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}var it=e=>T[e>>2]+w[e+4>>2]*4294967296;function at(e,t,n,r){try{t=V.getStr(t),t=V.calculateAt(e,t,!0);var i=Date.now(),a,o;if(!n)a=i,o=i;else{var s=it(n),c=w[n+8>>2];a=c==1073741823?i:c==1073741822?null:s*1e3+c/1e6,n+=16,s=it(n),c=w[n+8>>2],o=c==1073741823?i:c==1073741822?null:s*1e3+c/1e6}return(o??a)!==null&&B.utime(t,a,o),0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}var ot=()=>L(``),st=e=>e%4==0&&(e%100!=0||e%400==0),ct=[0,31,60,91,121,152,182,213,244,274,305,335],lt=[0,31,59,90,120,151,181,212,243,273,304,334],ut=e=>(st(e.getFullYear())?ct:lt)[e.getMonth()]+e.getDate()-1;function dt(e,t){e=W(e);var n=new Date(e*1e3);w[t>>2]=n.getSeconds(),w[t+4>>2]=n.getMinutes(),w[t+8>>2]=n.getHours(),w[t+12>>2]=n.getDate(),w[t+16>>2]=n.getMonth(),w[t+20>>2]=n.getFullYear()-1900,w[t+24>>2]=n.getDay();var r=ut(n)|0;w[t+28>>2]=r,w[t+36>>2]=-(n.getTimezoneOffset()*60);var i=new Date(n.getFullYear(),0,1),a=new Date(n.getFullYear(),6,1).getTimezoneOffset(),o=i.getTimezoneOffset(),s=(a!=o&&n.getTimezoneOffset()==Math.min(o,a))|0;w[t+32>>2]=s}function ft(e,t,n,r,i,a,o){i=W(i);try{var s=V.getStreamFromFD(r),c=B.mmap(s,e,i,t,n),l=c.ptr;return w[a>>2]=c.allocated,T[o>>2]=l,0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}function pt(e,t,n,r,i,a){a=W(a);try{var o=V.getStreamFromFD(i);n&2&&V.doMsync(e,o,t,r,a)}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return-e.errno}}var mt=(e,t,n,r)=>{var i=new Date().getFullYear(),a=new Date(i,0,1),o=new Date(i,6,1),s=a.getTimezoneOffset(),c=o.getTimezoneOffset(),l=Math.max(s,c);T[e>>2]=l*60,w[t>>2]=Number(s!=c);var u=e=>{var t=e>=0?`-`:`+`,n=Math.abs(e);return`UTC${t}${String(Math.floor(n/60)).padStart(2,`0`)}${String(n%60).padStart(2,`0`)}`},d=u(s),f=u(c);c<s?(qe(d,n,17),qe(f,r,17)):(qe(d,r,17),qe(f,n,17))},ht=()=>performance.now(),gt=()=>Date.now(),_t=1,vt=e=>e>=0&&e<=3;function yt(e,t,n){if(t=W(t),!vt(e))return 28;var r;if(e===0)r=gt();else if(_t)r=ht();else return 52;var i=Math.round(r*1e3*1e3);return E[n>>3]=BigInt(i),0}var bt=()=>2147483648,xt=e=>{var t=(e-b.buffer.byteLength+65535)/65536|0;try{return b.grow(t),O(),1}catch{}},St=e=>{var t=S.length;e>>>=0;var n=bt();if(e>n)return!1;for(var r=1;r<=4;r*=2){var i=t*(1+.2/r);if(i=Math.min(i,e+100663296),xt(Math.min(n,De(Math.max(e,i),65536))))return!0}return!1},Ct={},wt=()=>o||`./this.program`,Tt=()=>{if(!Tt.strings){var e={USER:`web_user`,LOGNAME:`web_user`,PATH:`/`,PWD:`/`,HOME:`/home/web_user`,LANG:(typeof navigator==`object`&&navigator.language||`C`).replace(`-`,`_`)+`.UTF-8`,_:wt()};for(var t in Ct)Ct[t]===void 0?delete e[t]:e[t]=Ct[t];var n=[];for(var t in e)n.push(`${t}=${e[t]}`);Tt.strings=n}return Tt.strings},Et=(e,t)=>{var n=0,r=0;for(var i of Tt()){var a=t+n;T[e+r>>2]=a,n+=qe(i,a,1/0)+1,r+=4}return 0},Dt=(e,t)=>{var n=Tt();T[e>>2]=n.length;var r=0;for(var i of n)r+=xe(i)+1;return T[t>>2]=r,0},Ot=0,kt=()=>me||Ot>0,At=e=>{kt()||(n.onExit?.(e),g=!0),s(e,new ce(e))},jt=(e,t)=>{At(e)};function Mt(e){try{var t=V.getStreamFromFD(e);return B.close(t),0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return e.errno}}function Nt(e,t){try{var n=0,r=0,i=0,a=V.getStreamFromFD(e),o=a.tty?2:B.isDir(a.mode)?3:B.isLink(a.mode)?7:4;return x[t]=o,C[t+2>>1]=i,E[t+8>>3]=BigInt(n),E[t+16>>3]=BigInt(r),0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return e.errno}}var Pt=(e,t,n,r)=>{for(var i=0,a=0;a<n;a++){var o=T[t>>2],s=T[t+4>>2];t+=8;var c=B.read(e,x,o,s,r);if(c<0)return-1;if(i+=c,c<s)break;r!==void 0&&(r+=c)}return i};function Ft(e,t,n,r){try{var i=Pt(V.getStreamFromFD(e),t,n);return T[r>>2]=i,0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return e.errno}}function It(e,t,n,r){t=W(t);try{if(isNaN(t))return 61;var i=V.getStreamFromFD(e);return B.llseek(i,t,n),E[r>>3]=BigInt(i.position),i.getdents&&t===0&&n===0&&(i.getdents=null),0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return e.errno}}function Lt(e){try{var t=V.getStreamFromFD(e);return t.stream_ops?.fsync?t.stream_ops.fsync(t):0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return e.errno}}var Rt=(e,t,n,r)=>{for(var i=0,a=0;a<n;a++){var o=T[t>>2],s=T[t+4>>2];t+=8;var c=B.write(e,x,o,s,r);if(c<0)return-1;if(i+=c,c<s)break;r!==void 0&&(r+=c)}return i};function zt(e,t,n,r){try{var i=Rt(V.getStreamFromFD(e),t,n);return T[r>>2]=i,0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return e.errno}}function Bt(e,t){try{return ge(S.subarray(e,e+t)),0}catch(e){if(B===void 0||e.name!==`ErrnoError`)throw e;return e.errno}}B.createPreloadedFile=Pe,B.staticInit(),z.doesNotExistError=new B.ErrnoError(44),z.doesNotExistError.stack=`<generic error, no stack>`,k(),n.noExitRuntime&&(me=n.noExitRuntime),n.preloadPlugins&&(Me=n.preloadPlugins),n.print&&(p=n.print),n.printErr&&(m=n.printErr),n.wasmBinary&&(h=n.wasmBinary),n.arguments&&n.arguments,n.thisProgram&&(o=n.thisProgram),n.wasmMemory=b;var Vt;function Ht(e){n._sqlite3_status64=e.sqlite3_status64,n._sqlite3_status=e.sqlite3_status,n._sqlite3_db_status=e.sqlite3_db_status,n._sqlite3_msize=e.sqlite3_msize,n._sqlite3_vfs_find=e.sqlite3_vfs_find,n._sqlite3_initialize=e.sqlite3_initialize,n._sqlite3_malloc=e.sqlite3_malloc,n._sqlite3_free=e.sqlite3_free,n._sqlite3_vfs_register=e.sqlite3_vfs_register,n._sqlite3_randomness=e.sqlite3_randomness,n._sqlite3mc_vfs_create=e.sqlite3mc_vfs_create,n._sqlite3_vfs_unregister=e.sqlite3_vfs_unregister,n._sqlite3_malloc64=e.sqlite3_malloc64,n._sqlite3_realloc=e.sqlite3_realloc,n._sqlite3_realloc64=e.sqlite3_realloc64,n._sqlite3_value_text=e.sqlite3_value_text,n._sqlite3_stricmp=e.sqlite3_stricmp,n._sqlite3_strnicmp=e.sqlite3_strnicmp,n._sqlite3_uri_parameter=e.sqlite3_uri_parameter,n._sqlite3_uri_boolean=e.sqlite3_uri_boolean,n._sqlite3_serialize=e.sqlite3_serialize,n._sqlite3_prepare_v2=e.sqlite3_prepare_v2,n._sqlite3_step=e.sqlite3_step,n._sqlite3_column_int64=e.sqlite3_column_int64,n._sqlite3_reset=e.sqlite3_reset,n._sqlite3_exec=e.sqlite3_exec,n._sqlite3_column_int=e.sqlite3_column_int,n._sqlite3_finalize=e.sqlite3_finalize,n._sqlite3_file_control=e.sqlite3_file_control,n._sqlite3_column_name=e.sqlite3_column_name,n._sqlite3_column_text=e.sqlite3_column_text,n._sqlite3_column_type=e.sqlite3_column_type,n._sqlite3_errmsg=e.sqlite3_errmsg,n._sqlite3_deserialize=e.sqlite3_deserialize,n._sqlite3_clear_bindings=e.sqlite3_clear_bindings,n._sqlite3_value_blob=e.sqlite3_value_blob,n._sqlite3_value_bytes=e.sqlite3_value_bytes,n._sqlite3_value_double=e.sqlite3_value_double,n._sqlite3_value_int=e.sqlite3_value_int,n._sqlite3_value_int64=e.sqlite3_value_int64,n._sqlite3_value_subtype=e.sqlite3_value_subtype,n._sqlite3_value_pointer=e.sqlite3_value_pointer,n._sqlite3_value_type=e.sqlite3_value_type,n._sqlite3_value_nochange=e.sqlite3_value_nochange,n._sqlite3_value_frombind=e.sqlite3_value_frombind,n._sqlite3_value_dup=e.sqlite3_value_dup,n._sqlite3_value_free=e.sqlite3_value_free,n._sqlite3_result_blob=e.sqlite3_result_blob,n._sqlite3_result_error_toobig=e.sqlite3_result_error_toobig,n._sqlite3_result_error_nomem=e.sqlite3_result_error_nomem,n._sqlite3_result_double=e.sqlite3_result_double,n._sqlite3_result_error=e.sqlite3_result_error,n._sqlite3_result_int=e.sqlite3_result_int,n._sqlite3_result_int64=e.sqlite3_result_int64,n._sqlite3_result_null=e.sqlite3_result_null,n._sqlite3_result_pointer=e.sqlite3_result_pointer,n._sqlite3_result_subtype=e.sqlite3_result_subtype,n._sqlite3_result_text=e.sqlite3_result_text,n._sqlite3_result_zeroblob=e.sqlite3_result_zeroblob,n._sqlite3_result_zeroblob64=e.sqlite3_result_zeroblob64,n._sqlite3_result_error_code=e.sqlite3_result_error_code,n._sqlite3_user_data=e.sqlite3_user_data,n._sqlite3_context_db_handle=e.sqlite3_context_db_handle,n._sqlite3_vtab_nochange=e.sqlite3_vtab_nochange,n._sqlite3_vtab_in_first=e.sqlite3_vtab_in_first,n._sqlite3_vtab_in_next=e.sqlite3_vtab_in_next,n._sqlite3_aggregate_context=e.sqlite3_aggregate_context,n._sqlite3_get_auxdata=e.sqlite3_get_auxdata,n._sqlite3_set_auxdata=e.sqlite3_set_auxdata,n._sqlite3_column_count=e.sqlite3_column_count,n._sqlite3_data_count=e.sqlite3_data_count,n._sqlite3_column_blob=e.sqlite3_column_blob,n._sqlite3_column_bytes=e.sqlite3_column_bytes,n._sqlite3_column_double=e.sqlite3_column_double,n._sqlite3_column_value=e.sqlite3_column_value,n._sqlite3_column_decltype=e.sqlite3_column_decltype,n._sqlite3_bind_blob=e.sqlite3_bind_blob,n._sqlite3_bind_double=e.sqlite3_bind_double,n._sqlite3_bind_int=e.sqlite3_bind_int,n._sqlite3_bind_int64=e.sqlite3_bind_int64,n._sqlite3_bind_null=e.sqlite3_bind_null,n._sqlite3_bind_pointer=e.sqlite3_bind_pointer,n._sqlite3_bind_text=e.sqlite3_bind_text,n._sqlite3_bind_parameter_count=e.sqlite3_bind_parameter_count,n._sqlite3_bind_parameter_name=e.sqlite3_bind_parameter_name,n._sqlite3_bind_parameter_index=e.sqlite3_bind_parameter_index,n._sqlite3_db_handle=e.sqlite3_db_handle,n._sqlite3_stmt_readonly=e.sqlite3_stmt_readonly,n._sqlite3_stmt_isexplain=e.sqlite3_stmt_isexplain,n._sqlite3_stmt_explain=e.sqlite3_stmt_explain,n._sqlite3_stmt_busy=e.sqlite3_stmt_busy,n._sqlite3_stmt_status=e.sqlite3_stmt_status,n._sqlite3_sql=e.sqlite3_sql,n._sqlite3_expanded_sql=e.sqlite3_expanded_sql,n._sqlite3_preupdate_old=e.sqlite3_preupdate_old,n._sqlite3_preupdate_count=e.sqlite3_preupdate_count,n._sqlite3_preupdate_depth=e.sqlite3_preupdate_depth,n._sqlite3_preupdate_blobwrite=e.sqlite3_preupdate_blobwrite,n._sqlite3_preupdate_new=e.sqlite3_preupdate_new,n._sqlite3_value_numeric_type=e.sqlite3_value_numeric_type,n._sqlite3_set_authorizer=e.sqlite3_set_authorizer,n._sqlite3_strglob=e.sqlite3_strglob,n._sqlite3_strlike=e.sqlite3_strlike,n._sqlite3_auto_extension=e.sqlite3_auto_extension,n._sqlite3_cancel_auto_extension=e.sqlite3_cancel_auto_extension,n._sqlite3_reset_auto_extension=e.sqlite3_reset_auto_extension,n._sqlite3_prepare_v3=e.sqlite3_prepare_v3,n._sqlite3_create_module=e.sqlite3_create_module,n._sqlite3_create_module_v2=e.sqlite3_create_module_v2,n._sqlite3_drop_modules=e.sqlite3_drop_modules,n._sqlite3_declare_vtab=e.sqlite3_declare_vtab,n._sqlite3_vtab_on_conflict=e.sqlite3_vtab_on_conflict,n._sqlite3_vtab_collation=e.sqlite3_vtab_collation,n._sqlite3_vtab_in=e.sqlite3_vtab_in,n._sqlite3_vtab_rhs_value=e.sqlite3_vtab_rhs_value,n._sqlite3_vtab_distinct=e.sqlite3_vtab_distinct,n._sqlite3_keyword_name=e.sqlite3_keyword_name,n._sqlite3_keyword_count=e.sqlite3_keyword_count,n._sqlite3_keyword_check=e.sqlite3_keyword_check,n._sqlite3_complete=e.sqlite3_complete,n._sqlite3_libversion=e.sqlite3_libversion,n._sqlite3_libversion_number=e.sqlite3_libversion_number,n._sqlite3_shutdown=e.sqlite3_shutdown,n._sqlite3mc_vfs_shutdown=e.sqlite3mc_vfs_shutdown,n._sqlite3_last_insert_rowid=e.sqlite3_last_insert_rowid,n._sqlite3_set_last_insert_rowid=e.sqlite3_set_last_insert_rowid,n._sqlite3_changes64=e.sqlite3_changes64,n._sqlite3_changes=e.sqlite3_changes,n._sqlite3_total_changes64=e.sqlite3_total_changes64,n._sqlite3_total_changes=e.sqlite3_total_changes,n._sqlite3_txn_state=e.sqlite3_txn_state,n._sqlite3_close_v2=e.sqlite3_close_v2,n._sqlite3_busy_handler=e.sqlite3_busy_handler,n._sqlite3_progress_handler=e.sqlite3_progress_handler,n._sqlite3_busy_timeout=e.sqlite3_busy_timeout,n._sqlite3_interrupt=e.sqlite3_interrupt,n._sqlite3_is_interrupted=e.sqlite3_is_interrupted,n._sqlite3_create_function=e.sqlite3_create_function,n._sqlite3_create_function_v2=e.sqlite3_create_function_v2,n._sqlite3_create_window_function=e.sqlite3_create_window_function,n._sqlite3_overload_function=e.sqlite3_overload_function,n._sqlite3_trace_v2=e.sqlite3_trace_v2,n._sqlite3_commit_hook=e.sqlite3_commit_hook,n._sqlite3_update_hook=e.sqlite3_update_hook,n._sqlite3_rollback_hook=e.sqlite3_rollback_hook,n._sqlite3_preupdate_hook=e.sqlite3_preupdate_hook,n._sqlite3_error_offset=e.sqlite3_error_offset,n._sqlite3_errcode=e.sqlite3_errcode,n._sqlite3_extended_errcode=e.sqlite3_extended_errcode,n._sqlite3_errstr=e.sqlite3_errstr,n._sqlite3_limit=e.sqlite3_limit,n._sqlite3_open=e.sqlite3_open,n._sqlite3_open_v2=e.sqlite3_open_v2,n._sqlite3_create_collation=e.sqlite3_create_collation,n._sqlite3_create_collation_v2=e.sqlite3_create_collation_v2,n._sqlite3_collation_needed=e.sqlite3_collation_needed,n._sqlite3_get_autocommit=e.sqlite3_get_autocommit,n._sqlite3_table_column_metadata=e.sqlite3_table_column_metadata,n._sqlite3_extended_result_codes=e.sqlite3_extended_result_codes,n._sqlite3_uri_key=e.sqlite3_uri_key,n._sqlite3_uri_int64=e.sqlite3_uri_int64,n._sqlite3_db_name=e.sqlite3_db_name,n._sqlite3_db_filename=e.sqlite3_db_filename,n._sqlite3_db_readonly=e.sqlite3_db_readonly,n._sqlite3_compileoption_used=e.sqlite3_compileoption_used,n._sqlite3_compileoption_get=e.sqlite3_compileoption_get,n._sqlite3session_diff=e.sqlite3session_diff,n._sqlite3session_attach=e.sqlite3session_attach,n._sqlite3session_create=e.sqlite3session_create,n._sqlite3session_delete=e.sqlite3session_delete,n._sqlite3session_table_filter=e.sqlite3session_table_filter,n._sqlite3session_changeset=e.sqlite3session_changeset,n._sqlite3session_changeset_strm=e.sqlite3session_changeset_strm,n._sqlite3session_patchset_strm=e.sqlite3session_patchset_strm,n._sqlite3session_patchset=e.sqlite3session_patchset,n._sqlite3session_enable=e.sqlite3session_enable,n._sqlite3session_indirect=e.sqlite3session_indirect,n._sqlite3session_isempty=e.sqlite3session_isempty,n._sqlite3session_memory_used=e.sqlite3session_memory_used,n._sqlite3session_object_config=e.sqlite3session_object_config,n._sqlite3session_changeset_size=e.sqlite3session_changeset_size,n._sqlite3changeset_start=e.sqlite3changeset_start,n._sqlite3changeset_start_v2=e.sqlite3changeset_start_v2,n._sqlite3changeset_start_strm=e.sqlite3changeset_start_strm,n._sqlite3changeset_start_v2_strm=e.sqlite3changeset_start_v2_strm,n._sqlite3changeset_next=e.sqlite3changeset_next,n._sqlite3changeset_op=e.sqlite3changeset_op,n._sqlite3changeset_pk=e.sqlite3changeset_pk,n._sqlite3changeset_old=e.sqlite3changeset_old,n._sqlite3changeset_new=e.sqlite3changeset_new,n._sqlite3changeset_conflict=e.sqlite3changeset_conflict,n._sqlite3changeset_fk_conflicts=e.sqlite3changeset_fk_conflicts,n._sqlite3changeset_finalize=e.sqlite3changeset_finalize,n._sqlite3changeset_invert=e.sqlite3changeset_invert,n._sqlite3changeset_invert_strm=e.sqlite3changeset_invert_strm,n._sqlite3changeset_apply_v2=e.sqlite3changeset_apply_v2,n._sqlite3changeset_apply=e.sqlite3changeset_apply,n._sqlite3changeset_apply_v2_strm=e.sqlite3changeset_apply_v2_strm,n._sqlite3changeset_apply_strm=e.sqlite3changeset_apply_strm,n._sqlite3changegroup_new=e.sqlite3changegroup_new,n._sqlite3changegroup_add=e.sqlite3changegroup_add,n._sqlite3changegroup_output=e.sqlite3changegroup_output,n._sqlite3changegroup_add_strm=e.sqlite3changegroup_add_strm,n._sqlite3changegroup_output_strm=e.sqlite3changegroup_output_strm,n._sqlite3changegroup_delete=e.sqlite3changegroup_delete,n._sqlite3changeset_concat=e.sqlite3changeset_concat,n._sqlite3changeset_concat_strm=e.sqlite3changeset_concat_strm,n._sqlite3session_config=e.sqlite3session_config,n._sqlite3_sourceid=e.sqlite3_sourceid,n._sqlite3mc_version=e.sqlite3mc_version,n._sqlite3mc_config=e.sqlite3mc_config,n._sqlite3mc_cipher_count=e.sqlite3mc_cipher_count,n._sqlite3mc_cipher_index=e.sqlite3mc_cipher_index,n._sqlite3mc_cipher_name=e.sqlite3mc_cipher_name,n._sqlite3mc_config_cipher=e.sqlite3mc_config_cipher,n._sqlite3mc_codec_data=e.sqlite3mc_codec_data,n._sqlite3_activate_see=e.sqlite3_activate_see,n._sqlite3_key=e.sqlite3_key,n._sqlite3_key_v2=e.sqlite3_key_v2,n._sqlite3_rekey_v2=e.sqlite3_rekey_v2,n._sqlite3_rekey=e.sqlite3_rekey,n._sqlite3mc_vfs_destroy=e.sqlite3mc_vfs_destroy,n._sqlite3__wasm_pstack_ptr=e.sqlite3__wasm_pstack_ptr,n._sqlite3__wasm_pstack_restore=e.sqlite3__wasm_pstack_restore,n._sqlite3__wasm_pstack_alloc=e.sqlite3__wasm_pstack_alloc,n._sqlite3__wasm_pstack_remaining=e.sqlite3__wasm_pstack_remaining,n._sqlite3__wasm_pstack_quota=e.sqlite3__wasm_pstack_quota,n._sqlite3__wasm_db_error=e.sqlite3__wasm_db_error,n._sqlite3__wasm_test_struct=e.sqlite3__wasm_test_struct,n._sqlite3__wasm_enum_json=e.sqlite3__wasm_enum_json,n._sqlite3__wasm_vfs_unlink=e.sqlite3__wasm_vfs_unlink,n._sqlite3__wasm_db_vfs=e.sqlite3__wasm_db_vfs,n._sqlite3__wasm_db_reset=e.sqlite3__wasm_db_reset,n._sqlite3__wasm_db_export_chunked=e.sqlite3__wasm_db_export_chunked,n._sqlite3__wasm_db_serialize=e.sqlite3__wasm_db_serialize,n._sqlite3__wasm_vfs_create_file=e.sqlite3__wasm_vfs_create_file,n._sqlite3__wasm_posix_create_file=e.sqlite3__wasm_posix_create_file,n._sqlite3__wasm_kvvfsMakeKeyOnPstack=e.sqlite3__wasm_kvvfsMakeKeyOnPstack,n._sqlite3__wasm_kvvfs_methods=e.sqlite3__wasm_kvvfs_methods,n._sqlite3__wasm_vtab_config=e.sqlite3__wasm_vtab_config,n._sqlite3__wasm_db_config_ip=e.sqlite3__wasm_db_config_ip,n._sqlite3__wasm_db_config_pii=e.sqlite3__wasm_db_config_pii,n._sqlite3__wasm_db_config_s=e.sqlite3__wasm_db_config_s,n._sqlite3__wasm_config_i=e.sqlite3__wasm_config_i,n._sqlite3__wasm_config_ii=e.sqlite3__wasm_config_ii,n._sqlite3__wasm_config_j=e.sqlite3__wasm_config_j,n._sqlite3__wasm_qfmt_token=e.sqlite3__wasm_qfmt_token,n._sqlite3__wasm_init_wasmfs=e.sqlite3__wasm_init_wasmfs,n._sqlite3__wasm_test_intptr=e.sqlite3__wasm_test_intptr,n._sqlite3__wasm_test_voidptr=e.sqlite3__wasm_test_voidptr,n._sqlite3__wasm_test_int64_max=e.sqlite3__wasm_test_int64_max,n._sqlite3__wasm_test_int64_min=e.sqlite3__wasm_test_int64_min,n._sqlite3__wasm_test_int64_times2=e.sqlite3__wasm_test_int64_times2,n._sqlite3__wasm_test_int64_minmax=e.sqlite3__wasm_test_int64_minmax,n._sqlite3__wasm_test_int64ptr=e.sqlite3__wasm_test_int64ptr,n._sqlite3__wasm_test_stack_overflow=e.sqlite3__wasm_test_stack_overflow,n._sqlite3__wasm_test_str_hello=e.sqlite3__wasm_test_str_hello,n._sqlite3__wasm_SQLTester_strglob=e.sqlite3__wasm_SQLTester_strglob,n._malloc=e.malloc,n._free=e.free,n._realloc=e.realloc,Vt=e.emscripten_builtin_memalign,e._emscripten_stack_restore,e._emscripten_stack_alloc,e.emscripten_stack_get_current}var Ut={__syscall_chmod:Re,__syscall_faccessat:H,__syscall_fchmod:ze,__syscall_fchown32:U,__syscall_fcntl64:He,__syscall_fstat64:Ue,__syscall_ftruncate64:Ke,__syscall_getcwd:Je,__syscall_ioctl:Ye,__syscall_lstat64:Xe,__syscall_mkdirat:Ze,__syscall_newfstatat:Qe,__syscall_openat:$e,__syscall_readlinkat:et,__syscall_rmdir:tt,__syscall_stat64:nt,__syscall_unlinkat:rt,__syscall_utimensat:at,_abort_js:ot,_localtime_js:dt,_mmap_js:ft,_munmap_js:pt,_tzset_js:mt,clock_time_get:yt,emscripten_date_now:gt,emscripten_get_now:ht,emscripten_resize_heap:St,environ_get:Et,environ_sizes_get:Dt,exit:jt,fd_close:Mt,fd_fdstat_get:Nt,fd_read:Ft,fd_seek:It,fd_sync:Lt,fd_write:zt,memory:b,random_get:Bt},Wt=await se();function Gt(){if(N>0){P=Gt;return}if(A(),N>0){P=Gt;return}function e(){n.calledRun=!0,!g&&(j(),_?.(n),n.onRuntimeInitialized?.(),M())}n.setStatus?(n.setStatus(`Running...`),setTimeout(()=>{setTimeout(()=>n.setStatus(``),1),e()},1)):e()}function Kt(){if(n.preInit)for(typeof n.preInit==`function`&&(n.preInit=[n.preInit]);n.preInit.length>0;)n.preInit.shift()()}return Kt(),Gt(),n.runSQLite3PostLoadInit=function(e){if(globalThis.sqlite3ApiBootstrap=function e(t=globalThis.sqlite3ApiConfig||e.defaultConfig){if(e.sqlite3)return(e.sqlite3.config||console).warn(`sqlite3ApiBootstrap() called multiple times.`,`Config and external initializers are ignored on calls after the first.`),e.sqlite3;let r=Object.assign(Object.create(null),{exports:void 0,memory:void 0,bigIntEnabled:n!==void 0&&n.HEAPU64?!0:!!globalThis.BigInt64Array,debug:console.debug.bind(console),warn:console.warn.bind(console),error:console.error.bind(console),log:console.log.bind(console),wasmfsOpfsDir:`/opfs`,useStdAlloc:!1},t||{});Object.assign(r,{allocExportName:r.useStdAlloc?`malloc`:`sqlite3_malloc`,deallocExportName:r.useStdAlloc?`free`:`sqlite3_free`,reallocExportName:r.useStdAlloc?`realloc`:`sqlite3_realloc`},r),[`exports`,`memory`,`wasmfsOpfsDir`].forEach(e=>{typeof r[e]==`function`&&(r[e]=r[e]())}),delete globalThis.sqlite3ApiConfig,delete e.defaultConfig;let i=Object.create(null),a=Object.create(null),o=e=>i.sqlite3_js_rc_str&&i.sqlite3_js_rc_str(e)||`Unknown result code #`+e,s=e=>typeof e==`number`&&e===(e|0);class c extends Error{constructor(...e){let t;if(e.length){if(s(e[0])){if(t=e[0],e.length===1)super(o(e[0]));else{let n=o(t);typeof e[1]==`object`?super(n,e[1]):(e[0]=n+`:`,super(e.join(` `)))}}else e.length===2&&typeof e[1]==`object`?super(...e):super(e.join(` `))}this.resultCode=t||i.SQLITE_ERROR,this.name=`SQLite3Error`}}c.toss=(...e)=>{throw new c(...e)};let l=c.toss;r.wasmfsOpfsDir&&!/^\/[^/]+$/.test(r.wasmfsOpfsDir)&&l(`config.wasmfsOpfsDir must be falsy or in the form '/dir-name'.`);let u=e=>typeof e!=`bigint`&&e===(e|0)&&e<=2147483647&&e>=-2147483648,d=function e(t){return e._max||(e._max=BigInt(`0x7fffffffffffffff`),e._min=~e._max),t>=e._min&&t<=e._max},f=e=>e>=-2147483647n-1n&&e<=2147483647n,p=function e(t){return e._min||(e._min=-(2**53-1),e._max=2**53-1),t>=e._min&&t<=e._max},m=e=>e&&e.constructor&&u(e.constructor.BYTES_PER_ELEMENT)?e:!1,h=typeof SharedArrayBuffer>`u`?function(){}:SharedArrayBuffer,g=e=>e.buffer instanceof h,_=(e,t,n)=>g(e)?e.slice(t,n):e.subarray(t,n),y=e=>e&&(e instanceof Uint8Array||e instanceof Int8Array||e instanceof ArrayBuffer),b=e=>e&&(e instanceof Uint8Array||e instanceof Int8Array||e instanceof ArrayBuffer),x=e=>y(e)||l(`Value is not of a supported TypedArray type.`),S=new TextDecoder(`utf-8`),C=function(e,t,n){return S.decode(_(e,t,n))},w=function(e){return b(e)?C(e instanceof ArrayBuffer?new Uint8Array(e):e):Array.isArray(e)?e.join(``):(a.isPtr(e)&&(e=a.cstrToJs(e)),e)};class T extends Error{constructor(...e){e.length===2&&typeof e[1]==`object`?super(...e):e.length?super(e.join(` `)):super(`Allocation failed.`),this.resultCode=i.SQLITE_NOMEM,this.name=`WasmAllocError`}}T.toss=(...e)=>{throw new T(...e)},Object.assign(i,{sqlite3_bind_blob:void 0,sqlite3_bind_text:void 0,sqlite3_create_function_v2:(e,t,n,r,i,a,o,s,c)=>{},sqlite3_create_function:(e,t,n,r,i,a,o,s)=>{},sqlite3_create_window_function:(e,t,n,r,i,a,o,s,c,l)=>{},sqlite3_prepare_v3:(e,t,n,r,i,a)=>{},sqlite3_prepare_v2:(e,t,n,r,i)=>{},sqlite3_exec:(e,t,n,r,i)=>{},sqlite3_randomness:(e,t)=>{}});let E={affirmBindableTypedArray:x,flexibleString:w,bigIntFits32:f,bigIntFits64:d,bigIntFitsDouble:p,isBindableTypedArray:y,isInt32:u,isSQLableTypedArray:b,isTypedArray:m,typedArrayToString:C,isUIThread:()=>globalThis.window===globalThis&&!!globalThis.document,isSharedTypedArray:g,toss:function(...e){throw Error(e.join(` `))},toss3:l,typedArrayPart:_,affirmDbHeader:function(e){e instanceof ArrayBuffer&&(e=new Uint8Array(e)),15>e.byteLength&&l(`Input does not contain an SQLite3 database header.`);for(let t=0;t<15;++t)`SQLite format 3`.charCodeAt(t)!==e[t]&&l(`Input does not contain an SQLite3 database header.`)},affirmIsDb:function(e){e instanceof ArrayBuffer&&(e=new Uint8Array(e));let t=e.byteLength;(t<512||t%512!=0)&&l(`Byte array size`,t,`is invalid for an SQLite3 db.`),E.affirmDbHeader(e)}};Object.assign(a,{ptrSizeof:r.wasmPtrSizeof||4,ptrIR:r.wasmPtrIR||`i32`,bigIntEnabled:!!r.bigIntEnabled,exports:r.exports||l(`Missing API config.exports (WASM module exports).`),memory:r.memory||r.exports.memory||l(`API config object requires a WebAssembly.Memory object`,`in either config.exports.memory (exported)`,`or config.memory (imported).`),alloc:void 0,realloc:void 0,dealloc:void 0}),a.allocFromTypedArray=function(e){e instanceof ArrayBuffer&&(e=new Uint8Array(e)),x(e);let t=a.alloc(e.byteLength||1);return a.heapForSize(e.constructor).set(e.byteLength?e:[0],t),t};{let e=r.allocExportName,t=r.deallocExportName,n=r.reallocExportName;for(let r of[e,t,n])a.exports[r]instanceof Function||l(`Missing required exports[`,r,`] function.`);a.alloc=function e(t){return e.impl(t)||T.toss(`Failed to allocate`,t,` bytes.`)},a.alloc.impl=a.exports[e],a.realloc=function e(t,n){let r=e.impl(t,n);return n?r||T.toss(`Failed to reallocate`,n,` bytes.`):0},a.realloc.impl=a.exports[n],a.dealloc=a.exports[t]}a.compileOptionUsed=function e(t){if(!arguments.length){if(e._result)return e._result;e._opt||=(e._rx=/^([^=]+)=(.+)/,e._rxInt=/^-?\d+$/,function(t,n){let r=e._rx.exec(t);n[0]=r?r[1]:t,n[1]=r?e._rxInt.test(r[2])?+r[2]:r[2]:!0});let t={},n=[0,0],r=0,a;for(;a=i.sqlite3_compileoption_get(r++);)e._opt(a,n),t[n[0]]=n[1];return e._result=t}if(Array.isArray(t)){let e={};return t.forEach(t=>{e[t]=i.sqlite3_compileoption_used(t)}),e}return typeof t==`object`?(Object.keys(t).forEach(e=>{t[e]=i.sqlite3_compileoption_used(e)}),t):typeof t==`string`&&!!i.sqlite3_compileoption_used(t)},a.pstack=Object.assign(Object.create(null),{restore:a.exports.sqlite3__wasm_pstack_restore,alloc:function(e){return typeof e==`string`&&!(e=a.sizeofIR(e))&&T.toss(`Invalid value for pstack.alloc(`,arguments[0],`)`),a.exports.sqlite3__wasm_pstack_alloc(e)||T.toss(`Could not allocate`,e,`bytes from the pstack.`)},allocChunks:function(e,t){typeof t==`string`&&!(t=a.sizeofIR(t))&&T.toss(`Invalid size value for allocChunks(`,arguments[1],`)`);let n=a.pstack.alloc(e*t),r=[],i=0,o=0;for(;i<e;++i,o+=t)r.push(n+o);return r},allocPtr:(e=1,t=!0)=>e===1?a.pstack.alloc(t?8:a.ptrSizeof):a.pstack.allocChunks(e,t?8:a.ptrSizeof),call:function(e){let t=a.pstack.pointer;try{return e(k)}finally{a.pstack.restore(t)}}}),Object.defineProperties(a.pstack,{pointer:{configurable:!1,iterable:!0,writeable:!1,get:a.exports.sqlite3__wasm_pstack_ptr},quota:{configurable:!1,iterable:!0,writeable:!1,get:a.exports.sqlite3__wasm_pstack_quota},remaining:{configurable:!1,iterable:!0,writeable:!1,get:a.exports.sqlite3__wasm_pstack_remaining}}),i.sqlite3_randomness=(...e)=>{if(e.length===1&&E.isTypedArray(e[0])&&e[0].BYTES_PER_ELEMENT===1){let t=e[0];if(t.byteLength===0)return a.exports.sqlite3_randomness(0,0),t;let n=a.pstack.pointer;try{let e=t.byteLength,n=0,r=a.exports.sqlite3_randomness,i=a.heap8u(),o=e<512?e:512,s=a.pstack.alloc(o);do{let a=e>o?o:e;r(a,s),t.set(_(i,s,s+a),n),e-=a,n+=a}while(e>0)}catch(e){console.error(`Highly unexpected (and ignored!) exception in sqlite3_randomness():`,e)}finally{a.pstack.restore(n)}return t}a.exports.sqlite3_randomness(...e)};let D;if(i.sqlite3_wasmfs_opfs_dir=function(){if(D!==void 0)return D;let e=r.wasmfsOpfsDir;if(!e||!globalThis.FileSystemHandle||!globalThis.FileSystemDirectoryHandle||!globalThis.FileSystemFileHandle)return D=``;try{return D=e&&a.xCallWrapped(`sqlite3__wasm_init_wasmfs`,`i32`,[`string`],e)===0?e:``}catch{return D=``}},i.sqlite3_wasmfs_filename_is_persistent=function(e){let t=i.sqlite3_wasmfs_opfs_dir();return t&&e?e.startsWith(t+`/`):!1},i.sqlite3_js_db_uses_vfs=function(e,t,n=0){try{let r=i.sqlite3_vfs_find(t);return r?e?r===i.sqlite3_js_db_vfs(e,n)&&r:r===i.sqlite3_vfs_find(0)&&r:!1}catch{return!1}},i.sqlite3_js_vfs_list=function(){let e=[],t=i.sqlite3_vfs_find(0);for(;t;){let n=new i.sqlite3_vfs(t);e.push(a.cstrToJs(n.$zName)),t=n.$pNext,n.dispose()}return e},i.sqlite3_js_db_export=function(e,t=0){e=a.xWrap.testConvertArg(`sqlite3*`,e),e||l(`Invalid sqlite3* argument.`),a.bigIntEnabled||l(`BigInt64 support is not enabled.`);let n=a.scopedAllocPush(),r;try{let n=a.scopedAlloc(8+a.ptrSizeof),i=n+8,o=t?a.isPtr(t)?t:a.scopedAllocCString(``+t):0,s=a.exports.sqlite3__wasm_db_serialize(e,o,i,n,0);s&&l(`Database serialization failed with code`,k.capi.sqlite3_js_rc_str(s)),r=a.peekPtr(i);let c=a.peek(n,`i64`);return s=c?a.heap8u().slice(r,r+Number(c)):new Uint8Array,s}finally{r&&a.exports.sqlite3_free(r),a.scopedAllocPop(n)}},i.sqlite3_js_db_vfs=(e,t=0)=>E.sqlite3__wasm_db_vfs(e,t),i.sqlite3_js_aggregate_context=(e,t)=>i.sqlite3_aggregate_context(e,t)||(t?T.toss(`Cannot allocate`,t,`bytes for sqlite3_aggregate_context()`):0),i.sqlite3_js_posix_create_file=function(e,t,n){let r;t&&a.isPtr(t)?r=t:t instanceof ArrayBuffer||t instanceof Uint8Array?(r=a.allocFromTypedArray(t),(arguments.length<3||!E.isInt32(n)||n<0)&&(n=t.byteLength)):c.toss(`Invalid 2nd argument for sqlite3_js_posix_create_file().`);try{(!E.isInt32(n)||n<0)&&c.toss(`Invalid 3rd argument for sqlite3_js_posix_create_file().`);let t=E.sqlite3__wasm_posix_create_file(e,r,n);t&&c.toss(`Creation of file failed with sqlite3 result code`,i.sqlite3_js_rc_str(t))}finally{a.dealloc(r)}},i.sqlite3_js_vfs_create_file=function(e,t,n,o){r.warn(`sqlite3_js_vfs_create_file() is deprecated and`,`should be avoided because it can lead to C-level crashes.`,`See its documentation for alternative options.`);let s;n?(a.isPtr(n)?s=n:n instanceof ArrayBuffer&&(n=new Uint8Array(n)),n instanceof Uint8Array?(s=a.allocFromTypedArray(n),(arguments.length<4||!E.isInt32(o)||o<0)&&(o=n.byteLength)):c.toss(`Invalid 3rd argument type for sqlite3_js_vfs_create_file().`)):s=0,(!E.isInt32(o)||o<0)&&(a.dealloc(s),c.toss(`Invalid 4th argument for sqlite3_js_vfs_create_file().`));try{let n=E.sqlite3__wasm_vfs_create_file(e,t,s,o);n&&c.toss(`Creation of file failed with sqlite3 result code`,i.sqlite3_js_rc_str(n))}finally{a.dealloc(s)}},i.sqlite3_js_sql_to_string=e=>{if(typeof e==`string`)return e;let t=w(v);return t===v?void 0:t},E.isUIThread()){let e=function(e){let t=Object.create(null);return t.prefix=`kvvfs-`+e,t.stores=[],(e===`session`||e===``)&&t.stores.push(globalThis.sessionStorage),(e===`local`||e===``)&&t.stores.push(globalThis.localStorage),t};i.sqlite3_js_kvvfs_clear=function(t=``){let n=0,r=e(t);return r.stores.forEach(e=>{let t=[],i;for(i=0;i<e.length;++i){let n=e.key(i);n.startsWith(r.prefix)&&t.push(n)}t.forEach(t=>e.removeItem(t)),n+=t.length}),n},i.sqlite3_js_kvvfs_size=function(t=``){let n=0,r=e(t);return r.stores.forEach(e=>{let t;for(t=0;t<e.length;++t){let i=e.key(t);i.startsWith(r.prefix)&&(n+=i.length,n+=e.getItem(i).length)}}),n*2}}i.sqlite3_db_config=function(e,t,...n){switch(t){case i.SQLITE_DBCONFIG_ENABLE_FKEY:case i.SQLITE_DBCONFIG_ENABLE_TRIGGER:case i.SQLITE_DBCONFIG_ENABLE_FTS3_TOKENIZER:case i.SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION:case i.SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE:case i.SQLITE_DBCONFIG_ENABLE_QPSG:case i.SQLITE_DBCONFIG_TRIGGER_EQP:case i.SQLITE_DBCONFIG_RESET_DATABASE:case i.SQLITE_DBCONFIG_DEFENSIVE:case i.SQLITE_DBCONFIG_WRITABLE_SCHEMA:case i.SQLITE_DBCONFIG_LEGACY_ALTER_TABLE:case i.SQLITE_DBCONFIG_DQS_DML:case i.SQLITE_DBCONFIG_DQS_DDL:case i.SQLITE_DBCONFIG_ENABLE_VIEW:case i.SQLITE_DBCONFIG_LEGACY_FILE_FORMAT:case i.SQLITE_DBCONFIG_TRUSTED_SCHEMA:case i.SQLITE_DBCONFIG_STMT_SCANSTATUS:case i.SQLITE_DBCONFIG_REVERSE_SCANORDER:case i.SQLITE_DBCONFIG_ENABLE_ATTACH_CREATE:case i.SQLITE_DBCONFIG_ENABLE_ATTACH_WRITE:case i.SQLITE_DBCONFIG_ENABLE_COMMENTS:return this.ip||=a.xWrap(`sqlite3__wasm_db_config_ip`,`int`,[`sqlite3*`,`int`,`int`,`*`]),this.ip(e,t,n[0],n[1]||0);case i.SQLITE_DBCONFIG_LOOKASIDE:return this.pii||=a.xWrap(`sqlite3__wasm_db_config_pii`,`int`,[`sqlite3*`,`int`,`*`,`int`,`int`]),this.pii(e,t,n[0],n[1],n[2]);case i.SQLITE_DBCONFIG_MAINDBNAME:return this.s||=a.xWrap(`sqlite3__wasm_db_config_s`,`int`,[`sqlite3*`,`int`,`string:static`]),this.s(e,t,n[0]);default:return i.SQLITE_MISUSE}}.bind(Object.create(null)),i.sqlite3_value_to_js=function(e,t=!0){let n,r=i.sqlite3_value_type(e);switch(r){case i.SQLITE_INTEGER:a.bigIntEnabled?(n=i.sqlite3_value_int64(e),E.bigIntFitsDouble(n)&&(n=Number(n))):n=i.sqlite3_value_double(e);break;case i.SQLITE_FLOAT:n=i.sqlite3_value_double(e);break;case i.SQLITE_TEXT:n=i.sqlite3_value_text(e);break;case i.SQLITE_BLOB:{let t=i.sqlite3_value_bytes(e),r=i.sqlite3_value_blob(e);t&&!r&&k.WasmAllocError.toss(`Cannot allocate memory for blob argument of`,t,`byte(s)`),n=t?a.heap8u().slice(r,r+Number(t)):null;break}case i.SQLITE_NULL:n=null;break;default:t&&l(i.SQLITE_MISMATCH,`Unhandled sqlite3_value_type():`,r),n=void 0}return n},i.sqlite3_values_to_js=function(e,t,n=!0){let r,o=[];for(r=0;r<e;++r)o.push(i.sqlite3_value_to_js(a.peekPtr(t+a.ptrSizeof*r),n));return o},i.sqlite3_result_error_js=function(e,t){t instanceof T?i.sqlite3_result_error_nomem(e):i.sqlite3_result_error(e,``+t,-1)},i.sqlite3_result_js=function(e,t){if(t instanceof Error){i.sqlite3_result_error_js(e,t);return}try{switch(typeof t){case`undefined`:break;case`boolean`:i.sqlite3_result_int(e,+!!t);break;case`bigint`:E.bigIntFits32(t)?i.sqlite3_result_int(e,Number(t)):E.bigIntFitsDouble(t)?i.sqlite3_result_double(e,Number(t)):a.bigIntEnabled?E.bigIntFits64(t)?i.sqlite3_result_int64(e,t):l(`BigInt value`,t.toString(),`is too BigInt for int64.`):l(`BigInt value`,t.toString(),`is too BigInt.`);break;case`number`:{let n;n=E.isInt32(t)?i.sqlite3_result_int:a.bigIntEnabled&&Number.isInteger(t)&&E.bigIntFits64(BigInt(t))?i.sqlite3_result_int64:i.sqlite3_result_double,n(e,t);break}case`string`:{let[n,r]=a.allocCString(t,!0);i.sqlite3_result_text(e,n,r,i.SQLITE_WASM_DEALLOC);break}case`object`:if(t===null){i.sqlite3_result_null(e);break}if(E.isBindableTypedArray(t)){let n=a.allocFromTypedArray(t);i.sqlite3_result_blob(e,n,t.byteLength,i.SQLITE_WASM_DEALLOC);break}default:l(`Don't not how to handle this UDF result value:`,typeof t,t)}}catch(t){i.sqlite3_result_error_js(e,t)}},i.sqlite3_column_js=function(e,t,n=!0){let r=i.sqlite3_column_value(e,t);return r===0?void 0:i.sqlite3_value_to_js(r,n)};let O=function(e,t,n){n=i[n],this.ptr?a.pokePtr(this.ptr,0):this.ptr=a.allocPtr();let r=n(e,t,this.ptr);if(r)return c.toss(r,arguments[2]+`() failed with code `+r);let o=a.peekPtr(this.ptr);return o?i.sqlite3_value_to_js(o,!0):void 0}.bind(Object.create(null));i.sqlite3_preupdate_new_js=(e,t)=>O(e,t,`sqlite3_preupdate_new`),i.sqlite3_preupdate_old_js=(e,t)=>O(e,t,`sqlite3_preupdate_old`),i.sqlite3changeset_new_js=(e,t)=>O(e,t,`sqlite3changeset_new`),i.sqlite3changeset_old_js=(e,t)=>O(e,t,`sqlite3changeset_old`);let k={WasmAllocError:T,SQLite3Error:c,capi:i,util:E,wasm:a,config:r,version:Object.create(null),client:void 0,asyncPostInit:async function t(){if(t.isReady instanceof Promise)return t.isReady;let n=e.initializersAsync;delete e.initializersAsync;let i=async()=>(k.__isUnderTest||(delete k.util,delete k.StructBinder),k),a=e=>{throw r.error(`an async sqlite3 initializer failed:`,e),e};if(!n||!n.length)return t.isReady=i().catch(a);n=n.map(e=>e instanceof Function?async t=>e(k):e),n.push(i);let o=Promise.resolve(k);for(;n.length;)o=o.then(n.shift());return t.isReady=o.catch(a)},scriptInfo:void 0};try{e.initializers.forEach(e=>{e(k)})}catch(e){throw console.error(`sqlite3 bootstrap initializer threw:`,e),e}return delete e.initializers,e.sqlite3=k,k},globalThis.sqlite3ApiBootstrap.initializers=[],globalThis.sqlite3ApiBootstrap.initializersAsync=[],globalThis.sqlite3ApiBootstrap.defaultConfig=Object.create(null),globalThis.sqlite3ApiBootstrap.sqlite3=void 0,globalThis.WhWasmUtilInstaller=function(e){e.bigIntEnabled===void 0&&(e.bigIntEnabled=!!globalThis.BigInt64Array);let t=(...e)=>{throw Error(e.join(` `))};e.exports||Object.defineProperty(e,"exports",{enumerable:!0,configurable:!0,get:()=>e.instance&&e.instance.exports});let n=e.pointerIR||`i32`,r=e.ptrSizeof=n===`i32`?4:n===`i64`?8:t(`Unhandled ptrSizeof:`,n),i=Object.create(null);i.heapSize=0,i.memory=null,i.freeFuncIndexes=[],i.scopedAlloc=[],i.utf8Decoder=new TextDecoder,i.utf8Encoder=new TextEncoder(`utf-8`),e.sizeofIR=e=>{switch(e){case`i8`:return 1;case`i16`:return 2;case`i32`:case`f32`:case`float`:return 4;case`i64`:case`f64`:case`double`:return 8;case`*`:return r;default:return(``+e).endsWith(`*`)?r:void 0}};let a=function(){if(!i.memory)i.memory=e.memory instanceof WebAssembly.Memory?e.memory:e.exports.memory;else if(i.heapSize===i.memory.buffer.byteLength)return i;let t=i.memory.buffer;return i.HEAP8=new Int8Array(t),i.HEAP8U=new Uint8Array(t),i.HEAP16=new Int16Array(t),i.HEAP16U=new Uint16Array(t),i.HEAP32=new Int32Array(t),i.HEAP32U=new Uint32Array(t),e.bigIntEnabled&&(i.HEAP64=new BigInt64Array(t),i.HEAP64U=new BigUint64Array(t)),i.HEAP32F=new Float32Array(t),i.HEAP64F=new Float64Array(t),i.heapSize=t.byteLength,i};e.heap8=()=>a().HEAP8,e.heap8u=()=>a().HEAP8U,e.heap16=()=>a().HEAP16,e.heap16u=()=>a().HEAP16U,e.heap32=()=>a().HEAP32,e.heap32u=()=>a().HEAP32U,e.heapForSize=function(n,r=!0){let o=i.memory&&i.heapSize===i.memory.buffer.byteLength?i:a();switch(n){case Int8Array:return o.HEAP8;case Uint8Array:return o.HEAP8U;case Int16Array:return o.HEAP16;case Uint16Array:return o.HEAP16U;case Int32Array:return o.HEAP32;case Uint32Array:return o.HEAP32U;case 8:return r?o.HEAP8U:o.HEAP8;case 16:return r?o.HEAP16U:o.HEAP16;case 32:return r?o.HEAP32U:o.HEAP32;case 64:if(o.HEAP64)return r?o.HEAP64U:o.HEAP64;break;default:if(e.bigIntEnabled){if(n===globalThis.BigUint64Array)return o.HEAP64U;if(n===globalThis.BigInt64Array)return o.HEAP64;break}}t(`Invalid heapForSize() size: expecting 8, 16, 32,`,`or (if BigInt is enabled) 64.`)},e.functionTable=function(){return e.exports.__indirect_function_table},e.functionEntry=function(t){let n=e.functionTable();return t<n.length?n.get(t):void 0},e.jsFuncToWasm=function e(n,r){if(e._||={sigTypes:Object.assign(Object.create(null),{i:`i32`,p:`i32`,P:`i32`,s:`i32`,j:`i64`,f:`f32`,d:`f64`}),typeCodes:Object.assign(Object.create(null),{f64:124,f32:125,i64:126,i32:127}),uleb128Encode:function(e,t,n){n<128?e[t](n):e[t](n%128|128,n>>7)},rxJSig:/^(\w)\((\w*)\)$/,sigParams:function(t){let n=e._.rxJSig.exec(t);return n?n[2]:t.substr(1)},letterType:n=>e._.sigTypes[n]||t(`Invalid signature letter:`,n),pushSigType:(t,n)=>t.push(e._.typeCodes[e._.letterType(n)])},typeof n==`string`){let e=r;r=n,n=e}let i=e._.sigParams(r),a=[1,96];e._.uleb128Encode(a,`push`,i.length);for(let t of i)e._.pushSigType(a,t);return r[0]===`v`?a.push(0):(a.push(1),e._.pushSigType(a,r[0])),e._.uleb128Encode(a,`unshift`,a.length),a.unshift(0,97,115,109,1,0,0,0,1),a.push(2,7,1,1,101,1,102,0,0,7,5,1,1,102,0,0),new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(a)),{e:{f:n}}).exports.f};let o=function(n,r,a){if(a&&!i.scopedAlloc.length&&t(`No scopedAllocPush() scope is active.`),typeof n==`string`){let e=r;r=n,n=e}(typeof r!=`string`||!(n instanceof Function))&&t(`Invalid arguments: expecting (function,signature) or (signature,function).`);let o=e.functionTable(),s=o.length,c;for(;i.freeFuncIndexes.length;){if(c=i.freeFuncIndexes.pop(),o.get(c)){c=null;continue}break}c||(c=s,o.grow(1));try{return o.set(c,n),a&&i.scopedAlloc[i.scopedAlloc.length-1].push(c),c}catch(e){if(!(e instanceof TypeError))throw c===s&&i.freeFuncIndexes.push(s),e}try{let t=e.jsFuncToWasm(n,r);o.set(c,t),a&&i.scopedAlloc[i.scopedAlloc.length-1].push(c)}catch(e){throw c===s&&i.freeFuncIndexes.push(s),e}return c};e.installFunction=(e,t)=>o(e,t,!1),e.scopedInstallFunction=(e,t)=>o(e,t,!0),e.uninstallFunction=function(t){if(!t&&t!==0)return;let n=i.freeFuncIndexes,r=e.functionTable();n.push(t);let a=r.get(t);return r.set(t,null),a},e.peek=function(r,o=`i8`){o.endsWith(`*`)&&(o=n);let s=i.memory&&i.heapSize===i.memory.buffer.byteLength?i:a(),c=Array.isArray(r)?[]:void 0,l;do{switch(c&&(r=arguments[0].shift()),o){case`i1`:case`i8`:l=s.HEAP8[r>>0];break;case`i16`:l=s.HEAP16[r>>1];break;case`i32`:l=s.HEAP32[r>>2];break;case`float`:case`f32`:l=s.HEAP32F[r>>2];break;case`double`:case`f64`:l=Number(s.HEAP64F[r>>3]);break;case`i64`:if(e.bigIntEnabled){l=BigInt(s.HEAP64[r>>3]);break}default:t(`Invalid type for peek():`,o)}c&&c.push(l)}while(c&&arguments[0].length);return c||l},e.poke=function(e,r,o=`i8`){o.endsWith(`*`)&&(o=n);let s=i.memory&&i.heapSize===i.memory.buffer.byteLength?i:a();for(let n of Array.isArray(e)?e:[e])switch(o){case`i1`:case`i8`:s.HEAP8[n>>0]=r;continue;case`i16`:s.HEAP16[n>>1]=r;continue;case`i32`:s.HEAP32[n>>2]=r;continue;case`float`:case`f32`:s.HEAP32F[n>>2]=r;continue;case`double`:case`f64`:s.HEAP64F[n>>3]=r;continue;case`i64`:if(s.HEAP64){s.HEAP64[n>>3]=BigInt(r);continue}default:t(`Invalid type for poke(): `+o)}return this},e.peekPtr=(...t)=>e.peek(t.length===1?t[0]:t,n),e.pokePtr=(t,r=0)=>e.poke(t,r,n),e.peek8=(...t)=>e.peek(t.length===1?t[0]:t,`i8`),e.poke8=(t,n)=>e.poke(t,n,`i8`),e.peek16=(...t)=>e.peek(t.length===1?t[0]:t,`i16`),e.poke16=(t,n)=>e.poke(t,n,`i16`),e.peek32=(...t)=>e.peek(t.length===1?t[0]:t,`i32`),e.poke32=(t,n)=>e.poke(t,n,`i32`),e.peek64=(...t)=>e.peek(t.length===1?t[0]:t,`i64`),e.poke64=(t,n)=>e.poke(t,n,`i64`),e.peek32f=(...t)=>e.peek(t.length===1?t[0]:t,`f32`),e.poke32f=(t,n)=>e.poke(t,n,`f32`),e.peek64f=(...t)=>e.peek(t.length===1?t[0]:t,`f64`),e.poke64f=(t,n)=>e.poke(t,n,`f64`),e.getMemValue=e.peek,e.getPtrValue=e.peekPtr,e.setMemValue=e.poke,e.setPtrValue=e.pokePtr,e.isPtr32=e=>typeof e==`number`&&e===(e|0)&&e>=0,e.isPtr=e.isPtr32,e.cstrlen=function(t){if(!t||!e.isPtr(t))return null;let n=a().HEAP8U,r=t;for(;n[r]!==0;++r);return r-t};let s=typeof SharedArrayBuffer>`u`?function(){}:SharedArrayBuffer,c=function(e,t,n){return i.utf8Decoder.decode(e.buffer instanceof s?e.slice(t,n):e.subarray(t,n))};e.cstrToJs=function(t){let n=e.cstrlen(t);return n?c(a().HEAP8U,t,t+n):n===null?n:``},e.jstrlen=function(e){if(typeof e!=`string`)return null;let t=e.length,n=0;for(let r=0;r<t;++r){let t=e.charCodeAt(r);t>=55296&&t<=57343&&(t=65536+((t&1023)<<10)|e.charCodeAt(++r)&1023),t<=127?++n:n+=t<=2047?2:t<=65535?3:4}return n},e.jstrcpy=function(e,n,r=0,i=-1,a=!0){if((!n||!(n instanceof Int8Array)&&!(n instanceof Uint8Array))&&t(`jstrcpy() target must be an Int8Array or Uint8Array.`),i<0&&(i=n.length-r),!(i>0)||!(r>=0))return 0;let o=0,s=e.length,c=r,l=r+i-+!!a;for(;o<s&&r<l;++o){let t=e.charCodeAt(o);if(t>=55296&&t<=57343&&(t=65536+((t&1023)<<10)|e.charCodeAt(++o)&1023),t<=127){if(r>=l)break;n[r++]=t}else if(t<=2047){if(r+1>=l)break;n[r++]=192|t>>6,n[r++]=128|t&63}else if(t<=65535){if(r+2>=l)break;n[r++]=224|t>>12,n[r++]=128|t>>6&63,n[r++]=128|t&63}else{if(r+3>=l)break;n[r++]=240|t>>18,n[r++]=128|t>>12&63,n[r++]=128|t>>6&63,n[r++]=128|t&63}}return a&&(n[r++]=0),r-c},e.cstrncpy=function(n,r,i){if((!n||!r)&&t(`cstrncpy() does not accept NULL strings.`),i<0)i=e.cstrlen(strPtr)+1;else if(!(i>0))return 0;let a=e.heap8u(),o=0,s;for(;o<i&&(s=a[r+o]);++o)a[n+o]=s;return o<i&&(a[n+o++]=0),o},e.jstrToUintArray=(e,t=!1)=>i.utf8Encoder.encode(t?e+`\0`:e);let l=(e,n)=>{(!(e.alloc instanceof Function)||!(e.dealloc instanceof Function))&&t(`Object is missing alloc() and/or dealloc() function(s)`,`required by`,n+`().`)},u=function(t,n,r,o){if(l(e,o),typeof t!=`string`)return null;{let e=i.utf8Encoder.encode(t),o=r(e.length+1),s=a().HEAP8U;return s.set(e,o),s[o+e.length]=0,n?[o,e.length]:o}};e.allocCString=(t,n=!1)=>u(t,n,e.alloc,`allocCString()`),e.scopedAllocPush=function(){l(e,`scopedAllocPush`);let t=[];return i.scopedAlloc.push(t),t},e.scopedAllocPop=function(n){l(e,`scopedAllocPop`);let r=arguments.length?i.scopedAlloc.indexOf(n):i.scopedAlloc.length-1;r<0&&t(`Invalid state object for scopedAllocPop().`),arguments.length===0&&(n=i.scopedAlloc[r]),i.scopedAlloc.splice(r,1);for(let t;t=n.pop();)e.functionEntry(t)?e.uninstallFunction(t):e.dealloc(t)},e.scopedAlloc=function(n){i.scopedAlloc.length||t(`No scopedAllocPush() scope is active.`);let r=e.alloc(n);return i.scopedAlloc[i.scopedAlloc.length-1].push(r),r},Object.defineProperty(e.scopedAlloc,"level",{configurable:!1,enumerable:!1,get:()=>i.scopedAlloc.length,set:()=>t(`The 'active' property is read-only.`)}),e.scopedAllocCString=(t,n=!1)=>u(t,n,e.scopedAlloc,`scopedAllocCString()`);let d=function(t,n){let r=e[t?`scopedAlloc`:`alloc`]((n.length+1)*e.ptrSizeof),i=0;return n.forEach(n=>{e.pokePtr(r+e.ptrSizeof*i++,e[t?`scopedAllocCString`:`allocCString`](``+n))}),e.pokePtr(r+e.ptrSizeof*i,0),r};e.scopedAllocMainArgv=e=>d(!0,e),e.allocMainArgv=e=>d(!1,e),e.cArgvToJs=(t,n)=>{let r=[];for(let i=0;i<t;++i){let t=e.peekPtr(n+e.ptrSizeof*i);r.push(t?e.cstrToJs(t):null)}return r},e.scopedAllocCall=function(t){e.scopedAllocPush();try{return t()}finally{e.scopedAllocPop()}};let f=function(t,i,a){l(e,a);let o=i?`i64`:n,s=e[a](t*(i?8:r));if(e.poke(s,0,o),t===1)return s;let c=[s];for(let n=1;n<t;++n)s+=i?8:r,c[n]=s,e.poke(s,0,o);return c};e.allocPtr=(e=1,t=!0)=>f(e,t,`alloc`),e.scopedAllocPtr=(e=1,t=!0)=>f(e,t,`scopedAlloc`),e.xGet=function(n){return e.exports[n]||t(`Cannot find exported symbol:`,n)};let p=(e,n)=>t(e+`() requires`,n,`argument(s).`);e.xCall=function(n,...r){let i=n instanceof Function?n:e.xGet(n);return i instanceof Function||t(`Exported symbol`,n,`is not a function.`),i.length!==r.length&&p(i===n?i.name:n,i.length),arguments.length===2&&Array.isArray(arguments[1])?i.apply(null,arguments[1]):i.apply(null,r)},i.xWrap=Object.create(null),i.xWrap.convert=Object.create(null),i.xWrap.convert.arg=new Map,i.xWrap.convert.result=new Map;let m=i.xWrap.convert.arg,h=i.xWrap.convert.result;e.bigIntEnabled&&m.set(`i64`,e=>BigInt(e));let g=n===`i32`?e=>e|0:e=>BigInt(e)|BigInt(0);m.set(`i32`,g).set(`i16`,e=>(e|0)&65535).set(`i8`,e=>(e|0)&255).set(`f32`,e=>Number(e).valueOf()).set(`float`,m.get(`f32`)).set(`f64`,m.get(`f32`)).set(`double`,m.get(`f64`)).set(`int`,m.get(`i32`)).set(`null`,e=>e).set(null,m.get(`null`)).set(`**`,g).set(`*`,g),h.set(`*`,g).set(`pointer`,g).set(`number`,e=>Number(e)).set(`void`,e=>void 0).set(`null`,e=>e).set(null,h.get(`null`));{let r=[`i8`,`i16`,`i32`,`int`,`f32`,`float`,`f64`,`double`];e.bigIntEnabled&&r.push(`i64`);let i=m.get(n);for(let e of r)m.set(e+`*`,i),h.set(e+`*`,i),h.set(e,m.get(e)||t(`Missing arg converter:`,e))}let _=function(t){return typeof t==`string`?e.scopedAllocCString(t):t?g(t):null};m.set(`string`,_).set(`utf8`,_).set(`pointer`,_),h.set(`string`,t=>e.cstrToJs(t)).set(`utf8`,h.get(`string`)).set(`string:dealloc`,t=>{try{return t?e.cstrToJs(t):null}finally{e.dealloc(t)}}).set(`utf8:dealloc`,h.get(`string:dealloc`)).set(`json`,t=>JSON.parse(e.cstrToJs(t))).set(`json:dealloc`,t=>{try{return t?JSON.parse(e.cstrToJs(t)):null}finally{e.dealloc(t)}});let y=class{constructor(e){this.name=e.name||`unnamed adapter`}convertArg(e,n,r){t(`AbstractArgAdapter must be subclassed.`)}};m.FuncPtrAdapter=class n extends y{constructor(e){super(e),m.FuncPtrAdapter.warnOnUse&&console.warn(`xArg.FuncPtrAdapter is an internal-only API`,`and is not intended to be invoked from`,`client-level code. Invoked with:`,e),this.name=e.name||`unnamed`,this.signature=e.signature,e.contextKey instanceof Function&&(this.contextKey=e.contextKey,e.bindScope||=`context`),this.bindScope=e.bindScope||t(`FuncPtrAdapter options requires a bindScope (explicit or implied).`),n.bindScopes.indexOf(e.bindScope)<0&&t(`Invalid options.bindScope (`+e.bindMod+`) for FuncPtrAdapter. Expecting one of: (`+n.bindScopes.join(`, `)+`)`),this.isTransient=this.bindScope===`transient`,this.isContext=this.bindScope===`context`,this.isPermanent=this.bindScope===`permanent`,this.singleton=this.bindScope===`singleton`?[]:void 0,this.callProxy=e.callProxy instanceof Function?e.callProxy:void 0}contextKey(e,t){return this}contextMap(e){let t=this.__cmap||=new Map,n=t.get(e);return n===void 0&&t.set(e,n=[]),n}convertArg(t,r,a){let s=this.singleton;if(!s&&this.isContext&&(s=this.contextMap(this.contextKey(r,a))),s&&s[0]===t)return s[1];if(t instanceof Function){this.callProxy&&(t=this.callProxy(t));let e=o(t,this.signature,this.isTransient);if(n.debugFuncInstall&&n.debugOut(`FuncPtrAdapter installed`,this,this.contextKey(r,a),`@`+e,t),s){if(s[1]){n.debugFuncInstall&&n.debugOut(`FuncPtrAdapter uninstalling`,this,this.contextKey(r,a),`@`+s[1],t);try{i.scopedAlloc[i.scopedAlloc.length-1].push(s[1])}catch{}}s[0]=t,s[1]=e}return e}if(e.isPtr(t)||t==null){if(s&&s[1]&&s[1]!==t){n.debugFuncInstall&&n.debugOut(`FuncPtrAdapter uninstalling`,this,this.contextKey(r,a),`@`+s[1],t);try{i.scopedAlloc[i.scopedAlloc.length-1].push(s[1])}catch{}s[0]=s[1]=t|0}return t||0}throw TypeError(`Invalid FuncPtrAdapter argument type. Expecting a function pointer or a `+(this.name?this.name+` `:``)+`function matching signature `+this.signature+`.`)}},m.FuncPtrAdapter.warnOnUse=!1,m.FuncPtrAdapter.debugFuncInstall=!1,m.FuncPtrAdapter.debugOut=console.debug.bind(console),m.FuncPtrAdapter.bindScopes=[`transient`,`context`,`singleton`,`permanent`];let b=e=>m.get(e)||t(`Argument adapter not found:`,e),x=e=>h.get(e)||t(`Result adapter not found:`,e);i.xWrap.convertArg=(e,...t)=>b(e)(...t),i.xWrap.convertArgNoCheck=(e,...t)=>m.get(e)(...t),i.xWrap.convertResult=(e,t)=>e===null?t:e?x(e)(t):void 0,i.xWrap.convertResultNoCheck=(e,t)=>e===null?t:e?h.get(e)(t):void 0,e.xWrap=function(n,r,...a){arguments.length===3&&Array.isArray(arguments[2])&&(a=arguments[2]),e.isPtr(n)&&(n=e.functionEntry(n)||t(`Function pointer not found in WASM function table.`));let o=n instanceof Function,s=o?n:e.xGet(n);if(o&&(n=s.name||`unnamed function`),a.length!==s.length&&p(n,s.length),r===null&&s.length===0)return s;r!=null&&x(r);for(let e of a)e instanceof y?m.set(e,(...t)=>e.convertArg(...t)):b(e);let c=i.xWrap;return s.length===0?(...e)=>e.length?p(n,s.length):c.convertResult(r,s.call(null)):function(...t){t.length!==s.length&&p(n,s.length);let i=e.scopedAllocPush();try{let e=0;for(;e<t.length;++e)t[e]=c.convertArgNoCheck(a[e],t[e],t,e);return c.convertResultNoCheck(r,s.apply(null,t))}finally{e.scopedAllocPop(i)}}};let S=function(e,n,r,i,a,o){if(typeof r==`string`){if(n===1)return o.get(r);if(n===2){if(i)i instanceof Function||t(a,`requires a function argument.`);else return o.delete(r),e;return o.set(r,i),e}}t(`Invalid arguments to`,a)};return e.xWrap.resultAdapter=function e(t,n){return S(e,arguments.length,t,n,`resultAdapter()`,h)},e.xWrap.argAdapter=function e(t,n){return S(e,arguments.length,t,n,`argAdapter()`,m)},e.xWrap.FuncPtrAdapter=m.FuncPtrAdapter,e.xCallWrapped=function(t,n,r,...i){return Array.isArray(arguments[3])&&(i=arguments[3]),e.xWrap(t,n,r||[]).apply(null,i||[])},e.xWrap.testConvertArg=i.xWrap.convertArg,e.xWrap.testConvertResult=i.xWrap.convertResult,e},globalThis.WhWasmUtilInstaller.yawl=function(e){let t=()=>fetch(e.uri,{credentials:`same-origin`}),n=this,r=function(t){if(e.wasmUtilTarget){let r=(...e)=>{throw Error(e.join(` `))},i=e.wasmUtilTarget;if(i.module=t.module,i.instance=t.instance,i.instance.exports.memory||(i.memory=e.imports&&e.imports.env&&e.imports.env.memory||r(`Missing 'memory' object!`)),!i.alloc&&t.instance.exports.malloc){let e=t.instance.exports;i.alloc=function(t){return e.malloc(t)||r(`Allocation of`,t,`bytes failed.`)},i.dealloc=function(t){e.free(t)}}n(i)}return e.onload&&e.onload(t,e),t};return WebAssembly.instantiateStreaming?function(){return WebAssembly.instantiateStreaming(t(),e.imports||{}).then(r)}:function(){return t().then(e=>e.arrayBuffer()).then(t=>WebAssembly.instantiate(t,e.imports||{})).then(r)}}.bind(globalThis.WhWasmUtilInstaller),globalThis.Jaccwabyt=function e(t){let n=(...e)=>{throw Error(e.join(` `))};!(t.heap instanceof WebAssembly.Memory)&&!(t.heap instanceof Function)&&n(`config.heap must be WebAssembly.Memory instance or a function.`),[`alloc`,`dealloc`].forEach(function(e){t[e]instanceof Function||n(`Config option '`+e+`' must be a function.`)});let r=e,i=t.heap instanceof Function?t.heap:()=>new Uint8Array(t.heap.buffer),a=t.alloc,o=t.dealloc,s=t.log||console.log.bind(console),c=t.memberPrefix||``,l=t.memberSuffix||``,u=t.bigIntEnabled===void 0?!!globalThis.BigInt64Array:!!t.bigIntEnabled,d=globalThis.BigInt,f=globalThis.BigInt64Array,p=t.ptrSizeof||4,m=t.ptrIR||`i32`;r.debugFlags||=(r.__makeDebugFlags=function(e=null){e&&e.__flags&&(e=e.__flags);let t=function e(t){return arguments.length===0?e.__flags:(t<0?(delete e.__flags.getter,delete e.__flags.setter,delete e.__flags.alloc,delete e.__flags.dealloc):(e.__flags.getter=!!(1&t),e.__flags.setter=!!(2&t),e.__flags.alloc=!!(4&t),e.__flags.dealloc=!!(8&t)),e._flags)};return Object.defineProperty(t,"__flags",{iterable:!1,writable:!1,value:Object.create(e)}),e||t(0),t},r.__makeDebugFlags());let h=(function(){let e=new ArrayBuffer(2);return new DataView(e).setInt16(0,256,!0),new Int16Array(e)[0]===256})(),g=e=>e[1]===`(`,_=e=>e===`P`,y=e=>g(e)?`p`:e[0],b=function(e){switch(y(e)){case`c`:case`C`:return`i8`;case`i`:return`i32`;case`p`:case`P`:case`s`:return m;case`j`:return`i64`;case`f`:return`float`;case`d`:return`double`}n(`Unhandled signature IR:`,e)},x=f?()=>!0:()=>n(`BigInt64Array is not available.`),S=function(e){switch(y(e)){case`p`:case`P`:case`s`:switch(p){case 4:return`getInt32`;case 8:return x()&&`getBigInt64`}break;case`i`:return`getInt32`;case`c`:return`getInt8`;case`C`:return`getUint8`;case`j`:return x()&&`getBigInt64`;case`f`:return`getFloat32`;case`d`:return`getFloat64`}n(`Unhandled DataView getter for signature:`,e)},C=function(e){switch(y(e)){case`p`:case`P`:case`s`:switch(p){case 4:return`setInt32`;case 8:return x()&&`setBigInt64`}break;case`i`:return`setInt32`;case`c`:return`setInt8`;case`C`:return`setUint8`;case`j`:return x()&&`setBigInt64`;case`f`:return`setFloat32`;case`d`:return`setFloat64`}n(`Unhandled DataView setter for signature:`,e)},w=function(e){switch(y(e)){case`i`:case`f`:case`c`:case`C`:case`d`:return Number;case`j`:return x()&&d;case`p`:case`P`:case`s`:switch(p){case 4:return Number;case 8:return x()&&d}}n(`Unhandled DataView set wrapper for signature:`,e)},T=(e,t)=>e+`::`+t,E=function(e,t){return()=>n(T(e,t),`is read-only.`)},D=new WeakMap,O=`(pointer-is-external)`,k=function(e,t,n){if(n||=D.get(t),n){if(D.delete(t),Array.isArray(t.ondispose)){let r;for(;r=t.ondispose.shift();)try{r instanceof Function?r.call(t):r instanceof ue?r.dispose():typeof r==`number`&&o(r)}catch(t){console.warn(`ondispose() for`,e.structName,`@`,n,`threw. NOT propagating it.`,t)}}else if(t.ondispose instanceof Function)try{t.ondispose()}catch(t){console.warn(`ondispose() for`,e.structName,`@`,n,`threw. NOT propagating it.`,t)}delete t.ondispose,e.debugFlags.__flags.dealloc&&s(`debug.dealloc:`,t[O]?`EXTERNAL`:``,e.structName,`instance:`,e.structInfo.sizeof,`bytes @`+n),t[O]||o(n)}},A=e=>({configurable:!1,writable:!1,iterable:!1,value:e}),j=function(e,t,r){let o=!r;r?Object.defineProperty(t,O,A(r)):(r=a(e.structInfo.sizeof),r||n(`Allocation of`,e.structName,`structure failed.`));try{e.debugFlags.__flags.alloc&&s(`debug.alloc:`,o?``:`EXTERNAL`,e.structName,`instance:`,e.structInfo.sizeof,`bytes @`+r),o&&i().fill(0,r,r+e.structInfo.sizeof),D.set(t,r)}catch(n){throw k(e,t,r),n}},M=function(){let e=this.pointer;return e?new Uint8Array(i().slice(e,e+this.structInfo.sizeof)):null},N=A(e=>c+e+l),P=function(e,t,r=!0){let i=e.members[t];if(!i&&(c||l)){for(let n of Object.values(e.members))if(n.key===t){i=n;break}!i&&r&&n(T(e.name,t),`is not a mapped struct member.`)}return i},F=function e(t,n,r=!1){e._||=e=>e.replace(/[^vipPsjrdcC]/g,``).replace(/[pPscC]/g,`i`);let i=P(t.structInfo,n,!0);return r?e._(i.signature):i.signature},I={configurable:!1,enumerable:!1,get:function(){return D.get(this)},set:()=>n(`Cannot assign the 'pointer' property of a struct.`)},L=A(function(){let e=[];for(let t of Object.keys(this.structInfo.members))e.push(this.memberKey(t));return e}),ee=new TextDecoder(`utf-8`),te=new TextEncoder,ne=typeof SharedArrayBuffer>`u`?function(){}:SharedArrayBuffer,re=function(e,t,n){return ee.decode(e.buffer instanceof ne?e.slice(t,n):e.subarray(t,n))},ie=function(e,t,n=!1){let r=P(e.structInfo,t,n);return r&&r.signature.length===1&&r.signature[0]===`s`?r:!1},ae=function(e){e.signature!==`s`&&n(`Invalid member type signature for C-string value:`,JSON.stringify(e))},oe=function(e,t){let n=P(e.structInfo,t,!0);ae(n);let r=e[n.key];if(!r)return null;let a=r,o=i();for(;o[a]!==0;++a);return r===a?``:re(o,r,a)},se=function(e,...t){e.ondispose?Array.isArray(e.ondispose)||(e.ondispose=[e.ondispose]):e.ondispose=[],e.ondispose.push(...t)},ce=function(e){let t=te.encode(e),r=a(t.length+1);r||n(`Allocation error while duplicating string:`,e);let o=i();return o.set(t,r),o[r+t.length]=0,r},le=function(e,t,n){let r=P(e.structInfo,t,!0);ae(r);let i=ce(n);return e[r.key]=i,se(e,i),e},ue=function(e,t){arguments[2]!==A&&n(`Do not call the StructType constructor`,`from client-level code.`),Object.defineProperties(this,{structName:A(e),structInfo:A(t)})};ue.prototype=Object.create(null,{dispose:A(function(){k(this.constructor,this)}),lookupMember:A(function(e,t=!0){return P(this.structInfo,e,t)}),memberToJsString:A(function(e){return oe(this,e)}),memberIsString:A(function(e,t=!0){return ie(this,e,t)}),memberKey:N,memberKeys:L,memberSignature:A(function(e,t=!1){return F(this,e,t)}),memoryDump:A(M),pointer:I,setMemberCString:A(function(e,t){return le(this,e,t)})}),Object.assign(ue.prototype,{addOnDispose:function(...e){return se(this,...e),this}}),Object.defineProperties(ue,{allocCString:A(ce),isA:A(e=>e instanceof ue),hasExternalPointer:A(e=>e instanceof ue&&!!e[O]),memberKey:N});let de=e=>Number.isFinite(e)||e instanceof(d||Number),fe=function e(t,r,a){if(!e._){e._={getters:{},setters:{},sw:{}};let t=[`i`,`c`,`C`,`p`,`P`,`s`,`f`,`d`,`v()`];u&&t.push(`j`),t.forEach(function(t){e._.getters[t]=S(t),e._.setters[t]=C(t),e._.sw[t]=w(t)});let r=/^[ipPsjfdcC]$/,i=/^[vipPsjfdcC]\([ipPsjfdcC]*\)$/;e.sigCheck=function(e,t,a,o){Object.prototype.hasOwnProperty.call(e,a)&&n(e.structName,`already has a property named`,a+`.`),r.test(o)||i.test(o)||n(`Malformed signature for`,T(e.structName,t)+`:`,o)}}let o=t.memberKey(r);e.sigCheck(t.prototype,r,o,a.signature),a.key=o,a.name=r;let c=y(a.signature),l=T(t.prototype.structName,o),d=t.prototype.debugFlags.__flags,f=Object.create(null);f.configurable=!1,f.enumerable=!1,f.get=function(){d.getter&&s(`debug.getter:`,e._.getters[c],`for`,b(c),l,`@`,this.pointer,`+`,a.offset,`sz`,a.sizeof);let t=new DataView(i().buffer,this.pointer+a.offset,a.sizeof)[e._.getters[c]](0,h);return d.getter&&s(`debug.getter:`,l,`result =`,t),t},f.set=a.readOnly?E(t.prototype.structName,o):function(t){if(d.setter&&s(`debug.setter:`,e._.setters[c],`for`,b(c),l,`@`,this.pointer,`+`,a.offset,`sz`,a.sizeof,t),this.pointer||n(`Cannot set struct property on disposed instance.`),t===null)t=0;else for(;!de(t);){if(_(a.signature)&&t instanceof ue){t=t.pointer||0,d.setter&&s(`debug.setter:`,l,`resolved to`,t);break}n(`Invalid value for pointer-type`,l+`.`)}new DataView(i().buffer,this.pointer+a.offset,a.sizeof)[e._.setters[c]](0,e._.sw[c](t),h)},Object.defineProperty(t.prototype,o,f)},pe=function e(t,i){arguments.length===1?(i=t,t=i.name):i.name||(i.name=t),t||n(`Struct name is required.`);let a=!1;Object.keys(i.members).forEach(e=>{let r=i.members[e];r.sizeof?r.sizeof===1?r.signature===`c`||r.signature===`C`||n(`Unexpected sizeof==1 member`,T(i.name,e),`with signature`,r.signature):(r.sizeof%4!=0&&(console.warn(`Invalid struct member description =`,r,`from`,i),n(t,`member`,e,`sizeof is not aligned. sizeof=`+r.sizeof)),r.offset%4!=0&&(console.warn(`Invalid struct member description =`,r,`from`,i),n(t,`member`,e,`offset is not aligned. offset=`+r.offset))):n(t,`member`,e,`is missing sizeof.`),(!a||a.offset<r.offset)&&(a=r)}),a?i.sizeof<a.offset+a.sizeof&&n(`Invalid struct config:`,t,`max member offset (`+a.offset+`) `,`extends past end of struct (sizeof=`+i.sizeof+`).`):n(`No member property descriptions found.`);let o=A(r.__makeDebugFlags(e.debugFlags)),s=function e(r){this instanceof e?arguments.length?((r!==(r|0)||r<=0)&&n(`Invalid pointer value for`,t,`constructor.`),j(e,this,r)):j(e,this):n(`The`,t,`constructor may only be called via 'new'.`)};return Object.defineProperties(s,{debugFlags:o,isA:A(e=>e instanceof s),memberKey:N,memberKeys:L,methodInfoForKey:A(function(e){}),structInfo:A(i),structName:A(t)}),s.prototype=new ue(t,i,A),Object.defineProperties(s.prototype,{debugFlags:o,constructor:A(s)}),Object.keys(i.members).forEach(e=>fe(s,e,i.members[e])),s};return pe.StructType=ue,pe.config=t,pe.allocCString=ce,pe.debugFlags||=r.__makeDebugFlags(r.debugFlags),pe},globalThis.sqlite3ApiBootstrap.initializers.push(function(e){let t=(...e)=>{throw Error(e.join(` `))};e.SQLite3Error.toss;let n=e.capi,r=e.wasm,i=e.util;if(globalThis.WhWasmUtilInstaller(r),delete globalThis.WhWasmUtilInstaller,r.bindingSignatures=[[`sqlite3_aggregate_context`,`void*`,`sqlite3_context*`,`int`],[`sqlite3_bind_double`,`int`,`sqlite3_stmt*`,`int`,`f64`],[`sqlite3_bind_int`,`int`,`sqlite3_stmt*`,`int`,`int`],[`sqlite3_bind_null`,void 0,`sqlite3_stmt*`,`int`],[`sqlite3_bind_parameter_count`,`int`,`sqlite3_stmt*`],[`sqlite3_bind_parameter_index`,`int`,`sqlite3_stmt*`,`string`],[`sqlite3_bind_parameter_name`,`string`,`sqlite3_stmt*`,`int`],[`sqlite3_bind_pointer`,`int`,`sqlite3_stmt*`,`int`,`*`,`string:static`,`*`],[`sqlite3_busy_handler`,`int`,[`sqlite3*`,new r.xWrap.FuncPtrAdapter({signature:`i(pi)`,contextKey:(e,t)=>e[0]}),`*`]],[`sqlite3_busy_timeout`,`int`,`sqlite3*`,`int`],[`sqlite3_changes`,`int`,`sqlite3*`],[`sqlite3_clear_bindings`,`int`,`sqlite3_stmt*`],[`sqlite3_collation_needed`,`int`,`sqlite3*`,`*`,`*`],[`sqlite3_column_blob`,`*`,`sqlite3_stmt*`,`int`],[`sqlite3_column_bytes`,`int`,`sqlite3_stmt*`,`int`],[`sqlite3_column_count`,`int`,`sqlite3_stmt*`],[`sqlite3_column_decltype`,`string`,`sqlite3_stmt*`,`int`],[`sqlite3_column_double`,`f64`,`sqlite3_stmt*`,`int`],[`sqlite3_column_int`,`int`,`sqlite3_stmt*`,`int`],[`sqlite3_column_name`,`string`,`sqlite3_stmt*`,`int`],[`sqlite3_column_text`,`string`,`sqlite3_stmt*`,`int`],[`sqlite3_column_type`,`int`,`sqlite3_stmt*`,`int`],[`sqlite3_column_value`,`sqlite3_value*`,`sqlite3_stmt*`,`int`],[`sqlite3_commit_hook`,`void*`,[`sqlite3*`,new r.xWrap.FuncPtrAdapter({name:`sqlite3_commit_hook`,signature:`i(p)`,contextKey:e=>e[0]}),`*`]],[`sqlite3_compileoption_get`,`string`,`int`],[`sqlite3_compileoption_used`,`int`,`string`],[`sqlite3_complete`,`int`,`string:flexible`],[`sqlite3_context_db_handle`,`sqlite3*`,`sqlite3_context*`],[`sqlite3_data_count`,`int`,`sqlite3_stmt*`],[`sqlite3_db_filename`,`string`,`sqlite3*`,`string`],[`sqlite3_db_handle`,`sqlite3*`,`sqlite3_stmt*`],[`sqlite3_db_name`,`string`,`sqlite3*`,`int`],[`sqlite3_db_readonly`,`int`,`sqlite3*`,`string`],[`sqlite3_db_status`,`int`,`sqlite3*`,`int`,`*`,`*`,`int`],[`sqlite3_errcode`,`int`,`sqlite3*`],[`sqlite3_errmsg`,`string`,`sqlite3*`],[`sqlite3_error_offset`,`int`,`sqlite3*`],[`sqlite3_errstr`,`string`,`int`],[`sqlite3_exec`,`int`,[`sqlite3*`,`string:flexible`,new r.xWrap.FuncPtrAdapter({signature:`i(pipp)`,bindScope:`transient`,callProxy:e=>{let t;return(i,a,o,s)=>{try{let n=r.cArgvToJs(a,o);return t||=r.cArgvToJs(a,s),e(n,t)|0}catch(e){return e.resultCode||n.SQLITE_ERROR}}}}),`*`,`**`]],[`sqlite3_expanded_sql`,`string`,`sqlite3_stmt*`],[`sqlite3_extended_errcode`,`int`,`sqlite3*`],[`sqlite3_extended_result_codes`,`int`,`sqlite3*`,`int`],[`sqlite3_file_control`,`int`,`sqlite3*`,`string`,`int`,`*`],[`sqlite3_finalize`,`int`,`sqlite3_stmt*`],[`sqlite3_free`,void 0,`*`],[`sqlite3_get_autocommit`,`int`,`sqlite3*`],[`sqlite3_get_auxdata`,`*`,`sqlite3_context*`,`int`],[`sqlite3_initialize`,void 0],[`sqlite3_interrupt`,void 0,`sqlite3*`],[`sqlite3_is_interrupted`,`int`,`sqlite3*`],[`sqlite3_keyword_count`,`int`],[`sqlite3_keyword_name`,`int`,[`int`,`**`,`*`]],[`sqlite3_keyword_check`,`int`,[`string`,`int`]],[`sqlite3_libversion`,`string`],[`sqlite3_libversion_number`,`int`],[`sqlite3_limit`,`int`,[`sqlite3*`,`int`,`int`]],[`sqlite3_malloc`,`*`,`int`],[`sqlite3_open`,`int`,`string`,`*`],[`sqlite3_open_v2`,`int`,`string`,`*`,`int`,`string`],[`sqlite3_realloc`,`*`,`*`,`int`],[`sqlite3_reset`,`int`,`sqlite3_stmt*`],[`sqlite3_result_blob`,void 0,`sqlite3_context*`,`*`,`int`,`*`],[`sqlite3_result_double`,void 0,`sqlite3_context*`,`f64`],[`sqlite3_result_error`,void 0,`sqlite3_context*`,`string`,`int`],[`sqlite3_result_error_code`,void 0,`sqlite3_context*`,`int`],[`sqlite3_result_error_nomem`,void 0,`sqlite3_context*`],[`sqlite3_result_error_toobig`,void 0,`sqlite3_context*`],[`sqlite3_result_int`,void 0,`sqlite3_context*`,`int`],[`sqlite3_result_null`,void 0,`sqlite3_context*`],[`sqlite3_result_pointer`,void 0,`sqlite3_context*`,`*`,`string:static`,`*`],[`sqlite3_result_subtype`,void 0,`sqlite3_value*`,`int`],[`sqlite3_result_text`,void 0,`sqlite3_context*`,`string`,`int`,`*`],[`sqlite3_result_zeroblob`,void 0,`sqlite3_context*`,`int`],[`sqlite3_rollback_hook`,`void*`,[`sqlite3*`,new r.xWrap.FuncPtrAdapter({name:`sqlite3_rollback_hook`,signature:`v(p)`,contextKey:e=>e[0]}),`*`]],[`sqlite3_set_auxdata`,void 0,[`sqlite3_context*`,`int`,`*`,`*`]],[`sqlite3_shutdown`,void 0],[`sqlite3_sourceid`,`string`],[`sqlite3_sql`,`string`,`sqlite3_stmt*`],[`sqlite3_status`,`int`,`int`,`*`,`*`,`int`],[`sqlite3_step`,`int`,`sqlite3_stmt*`],[`sqlite3_stmt_busy`,`int`,`sqlite3_stmt*`],[`sqlite3_stmt_readonly`,`int`,`sqlite3_stmt*`],[`sqlite3_stmt_status`,`int`,`sqlite3_stmt*`,`int`,`int`],[`sqlite3_strglob`,`int`,`string`,`string`],[`sqlite3_stricmp`,`int`,`string`,`string`],[`sqlite3_strlike`,`int`,`string`,`string`,`int`],[`sqlite3_strnicmp`,`int`,`string`,`string`,`int`],[`sqlite3_table_column_metadata`,`int`,`sqlite3*`,`string`,`string`,`string`,`**`,`**`,`*`,`*`,`*`],[`sqlite3_total_changes`,`int`,`sqlite3*`],[`sqlite3_trace_v2`,`int`,[`sqlite3*`,`int`,new r.xWrap.FuncPtrAdapter({name:`sqlite3_trace_v2::callback`,signature:`i(ippp)`,contextKey:(e,t)=>e[0]}),`*`]],[`sqlite3_txn_state`,`int`,[`sqlite3*`,`string`]],[`sqlite3_uri_boolean`,`int`,`sqlite3_filename`,`string`,`int`],[`sqlite3_uri_key`,`string`,`sqlite3_filename`,`int`],[`sqlite3_uri_parameter`,`string`,`sqlite3_filename`,`string`],[`sqlite3_user_data`,`void*`,`sqlite3_context*`],[`sqlite3_value_blob`,`*`,`sqlite3_value*`],[`sqlite3_value_bytes`,`int`,`sqlite3_value*`],[`sqlite3_value_double`,`f64`,`sqlite3_value*`],[`sqlite3_value_dup`,`sqlite3_value*`,`sqlite3_value*`],[`sqlite3_value_free`,void 0,`sqlite3_value*`],[`sqlite3_value_frombind`,`int`,`sqlite3_value*`],[`sqlite3_value_int`,`int`,`sqlite3_value*`],[`sqlite3_value_nochange`,`int`,`sqlite3_value*`],[`sqlite3_value_numeric_type`,`int`,`sqlite3_value*`],[`sqlite3_value_pointer`,`*`,`sqlite3_value*`,`string:static`],[`sqlite3_value_subtype`,`int`,`sqlite3_value*`],[`sqlite3_value_text`,`string`,`sqlite3_value*`],[`sqlite3_value_type`,`int`,`sqlite3_value*`],[`sqlite3_vfs_find`,`*`,`string`],[`sqlite3_vfs_register`,`int`,`sqlite3_vfs*`,`int`],[`sqlite3_vfs_unregister`,`int`,`sqlite3_vfs*`]],r.exports.sqlite3_progress_handler&&r.bindingSignatures.push([`sqlite3_progress_handler`,void 0,[`sqlite3*`,`int`,new r.xWrap.FuncPtrAdapter({name:`xProgressHandler`,signature:`i(p)`,bindScope:`context`,contextKey:(e,t)=>e[0]}),`*`]]),r.exports.sqlite3_stmt_explain&&r.bindingSignatures.push([`sqlite3_stmt_explain`,`int`,`sqlite3_stmt*`,`int`],[`sqlite3_stmt_isexplain`,`int`,`sqlite3_stmt*`]),r.exports.sqlite3_set_authorizer&&r.bindingSignatures.push([`sqlite3_set_authorizer`,`int`,[`sqlite3*`,new r.xWrap.FuncPtrAdapter({name:`sqlite3_set_authorizer::xAuth`,signature:`i(pissss)`,contextKey:(e,t)=>e[0],callProxy:e=>(t,i,a,o,s,c)=>{try{return a&&=r.cstrToJs(a),o&&=r.cstrToJs(o),s&&=r.cstrToJs(s),c&&=r.cstrToJs(c),e(t,i,a,o,s,c)||0}catch(e){return e.resultCode||n.SQLITE_ERROR}}}),`*`]]),r.exports.sqlite3_key_v2 instanceof Function&&r.bindingSignatures.push([`sqlite3_key`,`int`,`sqlite3*`,`string`,`int`],[`sqlite3_key_v2`,`int`,`sqlite3*`,`string`,`*`,`int`],[`sqlite3_rekey`,`int`,`sqlite3*`,`string`,`int`],[`sqlite3_rekey_v2`,`int`,`sqlite3*`,`string`,`*`,`int`],[`sqlite3_activate_see`,void 0,`string`],[`sqlite3mc_cipher_count`,`int`],[`sqlite3mc_cipher_index`,`int`,`string`],[`sqlite3mc_cipher_name`,`string`,`int`],[`sqlite3mc_config`,`int`,`sqlite3*`,`string`,`int`],[`sqlite3mc_config_cipher`,`int`,`sqlite3*`,`string`,`string`,`int`],[`sqlite3mc_codec_data`,`string`,`sqlite3*`,`string`,`string`],[`sqlite3mc_version`,`string`],[`sqlite3mc_vfs_create`,`int`,`string`,`int`],[`sqlite3mc_vfs_destroy`,void 0,`string`],[`sqlite3mc_vfs_shutdown`,void 0]),r.bindingSignatures.int64=[[`sqlite3_bind_int64`,`int`,[`sqlite3_stmt*`,`int`,`i64`]],[`sqlite3_changes64`,`i64`,[`sqlite3*`]],[`sqlite3_column_int64`,`i64`,[`sqlite3_stmt*`,`int`]],[`sqlite3_deserialize`,`int`,`sqlite3*`,`string`,`*`,`i64`,`i64`,`int`],[`sqlite3_last_insert_rowid`,`i64`,[`sqlite3*`]],[`sqlite3_malloc64`,`*`,`i64`],[`sqlite3_msize`,`i64`,`*`],[`sqlite3_overload_function`,`int`,[`sqlite3*`,`string`,`int`]],[`sqlite3_realloc64`,`*`,`*`,`i64`],[`sqlite3_result_int64`,void 0,`*`,`i64`],[`sqlite3_result_zeroblob64`,`int`,`*`,`i64`],[`sqlite3_serialize`,`*`,`sqlite3*`,`string`,`*`,`int`],[`sqlite3_set_last_insert_rowid`,void 0,[`sqlite3*`,`i64`]],[`sqlite3_status64`,`int`,`int`,`*`,`*`,`int`],[`sqlite3_total_changes64`,`i64`,[`sqlite3*`]],[`sqlite3_update_hook`,`*`,[`sqlite3*`,new r.xWrap.FuncPtrAdapter({name:`sqlite3_update_hook`,signature:`v(iippj)`,contextKey:e=>e[0],callProxy:e=>(t,n,i,a,o)=>{e(t,n,r.cstrToJs(i),r.cstrToJs(a),o)}}),`*`]],[`sqlite3_uri_int64`,`i64`,[`sqlite3_filename`,`string`,`i64`]],[`sqlite3_value_int64`,`i64`,`sqlite3_value*`]],r.bigIntEnabled&&r.exports.sqlite3_declare_vtab&&r.bindingSignatures.int64.push([`sqlite3_create_module`,`int`,[`sqlite3*`,`string`,`sqlite3_module*`,`*`]],[`sqlite3_create_module_v2`,`int`,[`sqlite3*`,`string`,`sqlite3_module*`,`*`,`*`]],[`sqlite3_declare_vtab`,`int`,[`sqlite3*`,`string:flexible`]],[`sqlite3_drop_modules`,`int`,[`sqlite3*`,`**`]],[`sqlite3_vtab_collation`,`string`,`sqlite3_index_info*`,`int`],[`sqlite3_vtab_distinct`,`int`,`sqlite3_index_info*`],[`sqlite3_vtab_in`,`int`,`sqlite3_index_info*`,`int`,`int`],[`sqlite3_vtab_in_first`,`int`,`sqlite3_value*`,`**`],[`sqlite3_vtab_in_next`,`int`,`sqlite3_value*`,`**`],[`sqlite3_vtab_nochange`,`int`,`sqlite3_context*`],[`sqlite3_vtab_on_conflict`,`int`,`sqlite3*`],[`sqlite3_vtab_rhs_value`,`int`,`sqlite3_index_info*`,`int`,`**`]),r.bigIntEnabled&&r.exports.sqlite3_preupdate_hook&&r.bindingSignatures.int64.push([`sqlite3_preupdate_blobwrite`,`int`,`sqlite3*`],[`sqlite3_preupdate_count`,`int`,`sqlite3*`],[`sqlite3_preupdate_depth`,`int`,`sqlite3*`],[`sqlite3_preupdate_hook`,`*`,[`sqlite3*`,new r.xWrap.FuncPtrAdapter({name:`sqlite3_preupdate_hook`,signature:`v(ppippjj)`,contextKey:e=>e[0],callProxy:e=>(t,n,i,a,o,s,c)=>{e(t,n,i,r.cstrToJs(a),r.cstrToJs(o),s,c)}}),`*`]],[`sqlite3_preupdate_new`,`int`,[`sqlite3*`,`int`,`**`]],[`sqlite3_preupdate_old`,`int`,[`sqlite3*`,`int`,`**`]]),r.bigIntEnabled&&r.exports.sqlite3changegroup_add&&r.exports.sqlite3session_create&&r.exports.sqlite3_preupdate_hook){let e={signature:`i(ps)`,callProxy:e=>(t,i)=>{try{return e(t,r.cstrToJs(i))|0}catch(e){return e.resultCode||n.SQLITE_ERROR}}};r.bindingSignatures.int64.push([`sqlite3changegroup_add`,`int`,[`sqlite3_changegroup*`,`int`,`void*`]],[`sqlite3changegroup_add_strm`,`int`,[`sqlite3_changegroup*`,new r.xWrap.FuncPtrAdapter({name:`xInput`,signature:`i(ppp)`,bindScope:`transient`}),`void*`]],[`sqlite3changegroup_delete`,void 0,[`sqlite3_changegroup*`]],[`sqlite3changegroup_new`,`int`,[`**`]],[`sqlite3changegroup_output`,`int`,[`sqlite3_changegroup*`,`int*`,`**`]],[`sqlite3changegroup_output_strm`,`int`,[`sqlite3_changegroup*`,new r.xWrap.FuncPtrAdapter({name:`xOutput`,signature:`i(ppi)`,bindScope:`transient`}),`void*`]],[`sqlite3changeset_apply`,`int`,[`sqlite3*`,`int`,`void*`,new r.xWrap.FuncPtrAdapter({name:`xFilter`,bindScope:`transient`,...e}),new r.xWrap.FuncPtrAdapter({name:`xConflict`,signature:`i(pip)`,bindScope:`transient`}),`void*`]],[`sqlite3changeset_apply_strm`,`int`,[`sqlite3*`,new r.xWrap.FuncPtrAdapter({name:`xInput`,signature:`i(ppp)`,bindScope:`transient`}),`void*`,new r.xWrap.FuncPtrAdapter({name:`xFilter`,bindScope:`transient`,...e}),new r.xWrap.FuncPtrAdapter({name:`xConflict`,signature:`i(pip)`,bindScope:`transient`}),`void*`]],[`sqlite3changeset_apply_v2`,`int`,[`sqlite3*`,`int`,`void*`,new r.xWrap.FuncPtrAdapter({name:`xFilter`,bindScope:`transient`,...e}),new r.xWrap.FuncPtrAdapter({name:`xConflict`,signature:`i(pip)`,bindScope:`transient`}),`void*`,`**`,`int*`,`int`]],[`sqlite3changeset_apply_v2_strm`,`int`,[`sqlite3*`,new r.xWrap.FuncPtrAdapter({name:`xInput`,signature:`i(ppp)`,bindScope:`transient`}),`void*`,new r.xWrap.FuncPtrAdapter({name:`xFilter`,bindScope:`transient`,...e}),new r.xWrap.FuncPtrAdapter({name:`xConflict`,signature:`i(pip)`,bindScope:`transient`}),`void*`,`**`,`int*`,`int`]],[`sqlite3changeset_concat`,`int`,[`int`,`void*`,`int`,`void*`,`int*`,`**`]],[`sqlite3changeset_concat_strm`,`int`,[new r.xWrap.FuncPtrAdapter({name:`xInputA`,signature:`i(ppp)`,bindScope:`transient`}),`void*`,new r.xWrap.FuncPtrAdapter({name:`xInputB`,signature:`i(ppp)`,bindScope:`transient`}),`void*`,new r.xWrap.FuncPtrAdapter({name:`xOutput`,signature:`i(ppi)`,bindScope:`transient`}),`void*`]],[`sqlite3changeset_conflict`,`int`,[`sqlite3_changeset_iter*`,`int`,`**`]],[`sqlite3changeset_finalize`,`int`,[`sqlite3_changeset_iter*`]],[`sqlite3changeset_fk_conflicts`,`int`,[`sqlite3_changeset_iter*`,`int*`]],[`sqlite3changeset_invert`,`int`,[`int`,`void*`,`int*`,`**`]],[`sqlite3changeset_invert_strm`,`int`,[new r.xWrap.FuncPtrAdapter({name:`xInput`,signature:`i(ppp)`,bindScope:`transient`}),`void*`,new r.xWrap.FuncPtrAdapter({name:`xOutput`,signature:`i(ppi)`,bindScope:`transient`}),`void*`]],[`sqlite3changeset_new`,`int`,[`sqlite3_changeset_iter*`,`int`,`**`]],[`sqlite3changeset_next`,`int`,[`sqlite3_changeset_iter*`]],[`sqlite3changeset_old`,`int`,[`sqlite3_changeset_iter*`,`int`,`**`]],[`sqlite3changeset_op`,`int`,[`sqlite3_changeset_iter*`,`**`,`int*`,`int*`,`int*`]],[`sqlite3changeset_pk`,`int`,[`sqlite3_changeset_iter*`,`**`,`int*`]],[`sqlite3changeset_start`,`int`,[`**`,`int`,`*`]],[`sqlite3changeset_start_strm`,`int`,[`**`,new r.xWrap.FuncPtrAdapter({name:`xInput`,signature:`i(ppp)`,bindScope:`transient`}),`void*`]],[`sqlite3changeset_start_v2`,`int`,[`**`,`int`,`*`,`int`]],[`sqlite3changeset_start_v2_strm`,`int`,[`**`,new r.xWrap.FuncPtrAdapter({name:`xInput`,signature:`i(ppp)`,bindScope:`transient`}),`void*`,`int`]],[`sqlite3session_attach`,`int`,[`sqlite3_session*`,`string`]],[`sqlite3session_changeset`,`int`,[`sqlite3_session*`,`int*`,`**`]],[`sqlite3session_changeset_size`,`i64`,[`sqlite3_session*`]],[`sqlite3session_changeset_strm`,`int`,[`sqlite3_session*`,new r.xWrap.FuncPtrAdapter({name:`xOutput`,signature:`i(ppp)`,bindScope:`transient`}),`void*`]],[`sqlite3session_config`,`int`,[`int`,`void*`]],[`sqlite3session_create`,`int`,[`sqlite3*`,`string`,`**`]],[`sqlite3session_diff`,`int`,[`sqlite3_session*`,`string`,`string`,`**`]],[`sqlite3session_enable`,`int`,[`sqlite3_session*`,`int`]],[`sqlite3session_indirect`,`int`,[`sqlite3_session*`,`int`]],[`sqlite3session_isempty`,`int`,[`sqlite3_session*`]],[`sqlite3session_memory_used`,`i64`,[`sqlite3_session*`]],[`sqlite3session_object_config`,`int`,[`sqlite3_session*`,`int`,`void*`]],[`sqlite3session_patchset`,`int`,[`sqlite3_session*`,`*`,`**`]],[`sqlite3session_patchset_strm`,`int`,[`sqlite3_session*`,new r.xWrap.FuncPtrAdapter({name:`xOutput`,signature:`i(ppp)`,bindScope:`transient`}),`void*`]],[`sqlite3session_table_filter`,void 0,[`sqlite3_session*`,new r.xWrap.FuncPtrAdapter({name:`xFilter`,...e,contextKey:(e,t)=>e[0]}),`*`]])}r.bindingSignatures.wasmInternal=[[`sqlite3__wasm_db_reset`,`int`,`sqlite3*`],[`sqlite3__wasm_db_vfs`,`sqlite3_vfs*`,`sqlite3*`,`string`],[`sqlite3__wasm_vfs_create_file`,`int`,`sqlite3_vfs*`,`string`,`*`,`int`],[`sqlite3__wasm_posix_create_file`,`int`,`string`,`*`,`int`],[`sqlite3__wasm_vfs_unlink`,`int`,`sqlite3_vfs*`,`string`],[`sqlite3__wasm_qfmt_token`,`string:dealloc`,`string`,`int`]],e.StructBinder=globalThis.Jaccwabyt({heap:r.heap8u,alloc:r.alloc,dealloc:r.dealloc,bigIntEnabled:r.bigIntEnabled,memberPrefix:`$`}),delete globalThis.Jaccwabyt;{let a=r.xWrap.argAdapter(`string`);r.xWrap.argAdapter(`string:flexible`,e=>a(i.flexibleString(e))),r.xWrap.argAdapter(`string:static`,function(e){return r.isPtr(e)?e:(e=``+e,this[e]||(this[e]=r.allocCString(e)))}.bind(Object.create(null)));let o=r.xWrap.argAdapter(`*`),s=function(){};r.xWrap.argAdapter(`sqlite3_filename`,o)(`sqlite3_context*`,o)(`sqlite3_value*`,o)(`void*`,o)(`sqlite3_changegroup*`,o)(`sqlite3_changeset_iter*`,o)(`sqlite3_session*`,o)(`sqlite3_stmt*`,t=>o(t instanceof(e?.oo1?.Stmt||s)?t.pointer:t))(`sqlite3*`,t=>o(t instanceof(e?.oo1?.DB||s)?t.pointer:t))(`sqlite3_vfs*`,t=>typeof t==`string`?n.sqlite3_vfs_find(t)||e.SQLite3Error.toss(n.SQLITE_NOTFOUND,`Unknown sqlite3_vfs name:`,t):o(t instanceof(n.sqlite3_vfs||s)?t.pointer:t)),r.exports.sqlite3_declare_vtab&&r.xWrap.argAdapter(`sqlite3_index_info*`,e=>o(e instanceof(n.sqlite3_index_info||s)?e.pointer:e))(`sqlite3_module*`,e=>o(e instanceof(n.sqlite3_module||s)?e.pointer:e));let c=r.xWrap.resultAdapter(`*`);r.xWrap.resultAdapter(`sqlite3*`,c)(`sqlite3_context*`,c)(`sqlite3_stmt*`,c)(`sqlite3_value*`,c)(`sqlite3_vfs*`,c)(`void*`,c),r.exports.sqlite3_step.length===0&&(r.xWrap.doArgcCheck=!1,e.config.warn(`Disabling sqlite3.wasm.xWrap.doArgcCheck due to environmental quirks.`));for(let e of r.bindingSignatures)n[e[0]]=r.xWrap.apply(null,e);for(let e of r.bindingSignatures.wasmInternal)i[e[0]]=r.xWrap.apply(null,e);let l=function(e){return()=>t(e+`() is unavailable due to lack`,`of BigInt support in this build.`)};for(let e of r.bindingSignatures.int64)n[e[0]]=r.bigIntEnabled?r.xWrap.apply(null,e):l(e[0]);if(delete r.bindingSignatures,r.exports.sqlite3__wasm_db_error){let t=r.xWrap(`sqlite3__wasm_db_error`,`int`,`sqlite3*`,`int`,`string`);i.sqlite3__wasm_db_error=function(r,i,a){return i instanceof e.WasmAllocError?(i=n.SQLITE_NOMEM,a=0):i instanceof Error&&(a||=``+i,i=i.resultCode||n.SQLITE_ERROR),r?t(r,i,a):i}}else i.sqlite3__wasm_db_error=function(e,t,n){return console.warn(`sqlite3__wasm_db_error() is not exported.`,arguments),t}}{let a=r.xCall(`sqlite3__wasm_enum_json`);a||t(`Maintenance required: increase sqlite3__wasm_enum_json()'s`,`static buffer size!`),r.ctype=JSON.parse(r.cstrToJs(a));let o=[`access`,`authorizer`,`blobFinalizers`,`changeset`,`config`,`dataTypes`,`dbConfig`,`dbStatus`,`encodings`,`fcntl`,`flock`,`ioCap`,`limits`,`openFlags`,`prepareFlags`,`resultCodes`,`sqlite3Status`,`stmtStatus`,`syncFlags`,`trace`,`txnState`,`udfFlags`,`version`];r.bigIntEnabled&&o.push(`serialize`,`session`,`vtab`);for(let e of o)for(let t of Object.entries(r.ctype[e]))n[t[0]]=t[1];r.functionEntry(n.SQLITE_WASM_DEALLOC)||t(`Internal error: cannot resolve exported function`,`entry SQLITE_WASM_DEALLOC (==`+n.SQLITE_WASM_DEALLOC+`).`);let s=Object.create(null);for(let e of[`resultCodes`])for(let t of Object.entries(r.ctype[e]))s[t[1]]=t[0];n.sqlite3_js_rc_str=e=>s[e];let c=Object.assign(Object.create(null),{WasmTestStruct:!0,sqlite3_kvvfs_methods:!i.isUIThread(),sqlite3_index_info:!r.bigIntEnabled,sqlite3_index_constraint:!r.bigIntEnabled,sqlite3_index_orderby:!r.bigIntEnabled,sqlite3_index_constraint_usage:!r.bigIntEnabled});for(let t of r.ctype.structs)c[t.name]||(n[t.name]=e.StructBinder(t));if(n.sqlite3_index_info){for(let e of[`sqlite3_index_constraint`,`sqlite3_index_orderby`,`sqlite3_index_constraint_usage`])n.sqlite3_index_info[e]=n[e],delete n[e];n.sqlite3_vtab_config=r.xWrap(`sqlite3__wasm_vtab_config`,`int`,[`sqlite3*`,`int`,`int`])}}let a=(e,t,r)=>i.sqlite3__wasm_db_error(e,n.SQLITE_MISUSE,t+`() requires `+r+` argument`+(r===1?``:`s`)+`.`),o=e=>i.sqlite3__wasm_db_error(e,n.SQLITE_FORMAT,`SQLITE_UTF8 is the only supported encoding.`),s=e=>r.xWrap.argAdapter(`sqlite3*`)(e),c=e=>r.isPtr(e)?r.cstrToJs(e):e,l=function(e,t){e=s(e);let n=this.dbMap.get(e);if(t)!n&&t>0&&this.dbMap.set(e,n=Object.create(null));else return this.dbMap.delete(e),n;return n}.bind(Object.assign(Object.create(null),{dbMap:new Map}));l.addCollation=function(e,t){let n=l(e,1);n.collation||=new Set,n.collation.add(c(t).toLowerCase())},l._addUDF=function(e,t,n,r){t=c(t).toLowerCase();let i=r.get(t);i||r.set(t,i=new Set),i.add(n<0?-1:n)},l.addFunction=function(e,t,n){let r=l(e,1);r.udf||=new Map,this._addUDF(e,t,n,r.udf)},r.exports.sqlite3_create_window_function&&(l.addWindowFunc=function(e,t,n){let r=l(e,1);r.wudf||=new Map,this._addUDF(e,t,n,r.wudf)}),l.cleanup=function(t){t=s(t);let i=[t];for(let t of[`sqlite3_busy_handler`,`sqlite3_commit_hook`,`sqlite3_preupdate_hook`,`sqlite3_progress_handler`,`sqlite3_rollback_hook`,`sqlite3_set_authorizer`,`sqlite3_trace_v2`,`sqlite3_update_hook`]){let a=r.exports[t];if(a){i.length=a.length;try{n[t](...i)}catch(n){e.config.warn(`close-time call of`,t+`(`,i,`) threw:`,n)}}}let a=l(t,0);if(!a)return;if(a.collation){for(let e of a.collation)try{n.sqlite3_create_collation_v2(t,e,n.SQLITE_UTF8,0,0,0)}catch{}delete a.collation}let o;for(o=0;o<2;++o){let e=o?a.wudf:a.udf;if(!e)continue;let r=o?n.sqlite3_create_window_function:n.sqlite3_create_function_v2;for(let i of e){let e=i[0],a=i[1],s=[t,e,0,n.SQLITE_UTF8,0,0,0,0,0];o&&s.push(0);for(let e of a)try{s[2]=e,r.apply(null,s)}catch{}a.clear()}e.clear()}delete a.udf,delete a.wudf};{let e=r.xWrap(`sqlite3_close_v2`,`int`,`sqlite3*`);n.sqlite3_close_v2=function(t){if(arguments.length!==1)return a(t,`sqlite3_close_v2`,1);if(t)try{l.cleanup(t)}catch{}return e(t)}}if(n.sqlite3session_create){let e=r.xWrap(`sqlite3session_delete`,void 0,[`sqlite3_session*`]);n.sqlite3session_delete=function(t){if(arguments.length!==1)return a(pDb,`sqlite3session_delete`,1);t&&n.sqlite3session_table_filter(t,0,0),e(t)}}{let e=(e,t)=>`argv[`+t+`]:`+e[0]+`:`+r.cstrToJs(e[1]).toLowerCase(),t=r.xWrap(`sqlite3_create_collation_v2`,`int`,[`sqlite3*`,`string`,`int`,`*`,new r.xWrap.FuncPtrAdapter({name:`xCompare`,signature:`i(pipip)`,contextKey:e}),new r.xWrap.FuncPtrAdapter({name:`xDestroy`,signature:`v(p)`,contextKey:e})]);n.sqlite3_create_collation_v2=function(e,r,s,c,u,d){if(arguments.length!==6)return a(e,`sqlite3_create_collation_v2`,6);if(!(s&15))s|=n.SQLITE_UTF8;else if(n.SQLITE_UTF8!==(s&15))return o(e);try{let n=t(e,r,s,c,u,d);return n===0&&u instanceof Function&&l.addCollation(e,r),n}catch(t){return i.sqlite3__wasm_db_error(e,t)}},n.sqlite3_create_collation=(e,t,r,i,o)=>arguments.length===5?n.sqlite3_create_collation_v2(e,t,r,i,o,0):a(e,`sqlite3_create_collation`,5)}{let e=function(e,t){return e[0]+`:`+(e[2]<0?-1:e[2])+`:`+t+`:`+r.cstrToJs(e[1]).toLowerCase()},t=Object.assign(Object.create(null),{xInverseAndStep:{signature:`v(pip)`,contextKey:e,callProxy:e=>(t,r,i)=>{try{e(t,...n.sqlite3_values_to_js(r,i))}catch(e){n.sqlite3_result_error_js(t,e)}}},xFinalAndValue:{signature:`v(p)`,contextKey:e,callProxy:e=>t=>{try{n.sqlite3_result_js(t,e(t))}catch(e){n.sqlite3_result_error_js(t,e)}}},xFunc:{signature:`v(pip)`,contextKey:e,callProxy:e=>(t,r,i)=>{try{n.sqlite3_result_js(t,e(t,...n.sqlite3_values_to_js(r,i)))}catch(e){n.sqlite3_result_error_js(t,e)}}},xDestroy:{signature:`v(p)`,contextKey:e,callProxy:e=>t=>{try{e(t)}catch(e){console.error(`UDF xDestroy method threw:`,e)}}}}),s=r.xWrap(`sqlite3_create_function_v2`,`int`,[`sqlite3*`,`string`,`int`,`int`,`*`,new r.xWrap.FuncPtrAdapter({name:`xFunc`,...t.xFunc}),new r.xWrap.FuncPtrAdapter({name:`xStep`,...t.xInverseAndStep}),new r.xWrap.FuncPtrAdapter({name:`xFinal`,...t.xFinalAndValue}),new r.xWrap.FuncPtrAdapter({name:`xDestroy`,...t.xDestroy})]),c=r.exports.sqlite3_create_window_function?r.xWrap(`sqlite3_create_window_function`,`int`,[`sqlite3*`,`string`,`int`,`int`,`*`,new r.xWrap.FuncPtrAdapter({name:`xStep`,...t.xInverseAndStep}),new r.xWrap.FuncPtrAdapter({name:`xFinal`,...t.xFinalAndValue}),new r.xWrap.FuncPtrAdapter({name:`xValue`,...t.xFinalAndValue}),new r.xWrap.FuncPtrAdapter({name:`xInverse`,...t.xInverseAndStep}),new r.xWrap.FuncPtrAdapter({name:`xDestroy`,...t.xDestroy})]):void 0;n.sqlite3_create_function_v2=function e(t,r,c,u,d,f,p,m,h){if(e.length!==arguments.length)return a(t,`sqlite3_create_function_v2`,e.length);if(!(u&15))u|=n.SQLITE_UTF8;else if(n.SQLITE_UTF8!==(u&15))return o(t);try{let e=s(t,r,c,u,d,f,p,m,h);return e===0&&(f instanceof Function||p instanceof Function||m instanceof Function||h instanceof Function)&&l.addFunction(t,r,c),e}catch(e){return console.error(`sqlite3_create_function_v2() setup threw:`,e),i.sqlite3__wasm_db_error(t,e,`Creation of UDF threw: `+e)}},n.sqlite3_create_function=function e(t,r,i,o,s,c,l,u){return e.length===arguments.length?n.sqlite3_create_function_v2(t,r,i,o,s,c,l,u,0):a(t,`sqlite3_create_function`,e.length)},c?n.sqlite3_create_window_function=function e(t,r,s,u,d,f,p,m,h,g){if(e.length!==arguments.length)return a(t,`sqlite3_create_window_function`,e.length);if(!(u&15))u|=n.SQLITE_UTF8;else if(n.SQLITE_UTF8!==(u&15))return o(t);try{let e=c(t,r,s,u,d,f,p,m,h,g);return e===0&&(f instanceof Function||p instanceof Function||m instanceof Function||h instanceof Function||g instanceof Function)&&l.addWindowFunc(t,r,s),e}catch(e){return console.error(`sqlite3_create_window_function() setup threw:`,e),i.sqlite3__wasm_db_error(t,e,`Creation of UDF threw: `+e)}}:delete n.sqlite3_create_window_function,n.sqlite3_create_function_v2.udfSetResult=n.sqlite3_create_function.udfSetResult=n.sqlite3_result_js,n.sqlite3_create_window_function&&(n.sqlite3_create_window_function.udfSetResult=n.sqlite3_result_js),n.sqlite3_create_function_v2.udfConvertArgs=n.sqlite3_create_function.udfConvertArgs=n.sqlite3_values_to_js,n.sqlite3_create_window_function&&(n.sqlite3_create_window_function.udfConvertArgs=n.sqlite3_values_to_js),n.sqlite3_create_function_v2.udfSetError=n.sqlite3_create_function.udfSetError=n.sqlite3_result_error_js,n.sqlite3_create_window_function&&(n.sqlite3_create_window_function.udfSetError=n.sqlite3_result_error_js)}{let e=(e,t)=>(typeof e==`string`?t=-1:i.isSQLableTypedArray(e)?(t=e.byteLength,e=i.typedArrayToString(e instanceof ArrayBuffer?new Uint8Array(e):e)):Array.isArray(e)&&(e=e.join(``),t=-1),[e,t]),t={basic:r.xWrap(`sqlite3_prepare_v3`,`int`,[`sqlite3*`,`string`,`int`,`int`,`**`,`**`]),full:r.xWrap(`sqlite3_prepare_v3`,`int`,[`sqlite3*`,`*`,`int`,`int`,`**`,`**`])};n.sqlite3_prepare_v3=function r(o,s,c,l,u,d){if(r.length!==arguments.length)return a(o,`sqlite3_prepare_v3`,r.length);let[f,p]=e(s,c);switch(typeof f){case`string`:return t.basic(o,f,p,l,u,null);case`number`:return t.full(o,f,p,l,u,d);default:return i.sqlite3__wasm_db_error(o,n.SQLITE_MISUSE,`Invalid SQL argument type for sqlite3_prepare_v2/v3().`)}},n.sqlite3_prepare_v2=function e(t,r,i,o,s){return e.length===arguments.length?n.sqlite3_prepare_v3(t,r,i,0,o,s):a(t,`sqlite3_prepare_v2`,e.length)}}{let e=r.xWrap(`sqlite3_bind_text`,`int`,[`sqlite3_stmt*`,`int`,`string`,`int`,`*`]),t=r.xWrap(`sqlite3_bind_blob`,`int`,[`sqlite3_stmt*`,`int`,`*`,`int`,`*`]);n.sqlite3_bind_text=function t(o,s,c,l,u){if(t.length!==arguments.length)return a(n.sqlite3_db_handle(o),`sqlite3_bind_text`,t.length);if(r.isPtr(c)||c===null)return e(o,s,c,l,u);c instanceof ArrayBuffer?c=new Uint8Array(c):Array.isArray(pMem)&&(c=pMem.join(``));let d,f;try{if(i.isSQLableTypedArray(c))d=r.allocFromTypedArray(c),f=c.byteLength;else if(typeof c==`string`)[d,f]=r.allocCString(c);else return i.sqlite3__wasm_db_error(n.sqlite3_db_handle(o),n.SQLITE_MISUSE,`Invalid 3rd argument type for sqlite3_bind_text().`);return e(o,s,d,f,n.SQLITE_WASM_DEALLOC)}catch(e){return r.dealloc(d),i.sqlite3__wasm_db_error(n.sqlite3_db_handle(o),e)}},n.sqlite3_bind_blob=function e(o,s,c,l,u){if(e.length!==arguments.length)return a(n.sqlite3_db_handle(o),`sqlite3_bind_blob`,e.length);if(r.isPtr(c)||c===null)return t(o,s,c,l,u);c instanceof ArrayBuffer?c=new Uint8Array(c):Array.isArray(c)&&(c=c.join(``));let d,f;try{if(i.isBindableTypedArray(c))d=r.allocFromTypedArray(c),f=l>=0?l:c.byteLength;else if(typeof c==`string`)[d,f]=r.allocCString(c);else return i.sqlite3__wasm_db_error(n.sqlite3_db_handle(o),n.SQLITE_MISUSE,`Invalid 3rd argument type for sqlite3_bind_blob().`);return t(o,s,d,f,n.SQLITE_WASM_DEALLOC)}catch(e){return r.dealloc(d),i.sqlite3__wasm_db_error(n.sqlite3_db_handle(o),e)}}}n.sqlite3_config=function(e,...t){if(arguments.length<2)return n.SQLITE_MISUSE;switch(e){case n.SQLITE_CONFIG_COVERING_INDEX_SCAN:case n.SQLITE_CONFIG_MEMSTATUS:case n.SQLITE_CONFIG_SMALL_MALLOC:case n.SQLITE_CONFIG_SORTERREF_SIZE:case n.SQLITE_CONFIG_STMTJRNL_SPILL:case n.SQLITE_CONFIG_URI:return r.exports.sqlite3__wasm_config_i(e,t[0]);case n.SQLITE_CONFIG_LOOKASIDE:return r.exports.sqlite3__wasm_config_ii(e,t[0],t[1]);case n.SQLITE_CONFIG_MEMDB_MAXSIZE:return r.exports.sqlite3__wasm_config_j(e,t[0]);case n.SQLITE_CONFIG_GETMALLOC:case n.SQLITE_CONFIG_GETMUTEX:case n.SQLITE_CONFIG_GETPCACHE2:case n.SQLITE_CONFIG_GETPCACHE:case n.SQLITE_CONFIG_HEAP:case n.SQLITE_CONFIG_LOG:case n.SQLITE_CONFIG_MALLOC:case n.SQLITE_CONFIG_MMAP_SIZE:case n.SQLITE_CONFIG_MULTITHREAD:case n.SQLITE_CONFIG_MUTEX:case n.SQLITE_CONFIG_PAGECACHE:case n.SQLITE_CONFIG_PCACHE2:case n.SQLITE_CONFIG_PCACHE:case n.SQLITE_CONFIG_PCACHE_HDRSZ:case n.SQLITE_CONFIG_PMASZ:case n.SQLITE_CONFIG_SERIALIZED:case n.SQLITE_CONFIG_SINGLETHREAD:case n.SQLITE_CONFIG_SQLLOG:case n.SQLITE_CONFIG_WIN32_HEAPSIZE:default:return n.SQLITE_NOTFOUND}};{let e=new Set;n.sqlite3_auto_extension=function(t){if(t instanceof Function)t=r.installFunction(`i(ppp)`,t);else if(arguments.length!==1||!r.isPtr(t))return n.SQLITE_MISUSE;let i=r.exports.sqlite3_auto_extension(t);return t!==arguments[0]&&(i===0?e.add(t):r.uninstallFunction(t)),i},n.sqlite3_cancel_auto_extension=function(e){return!e||arguments.length!==1||!r.isPtr(e)?0:r.exports.sqlite3_cancel_auto_extension(e)},n.sqlite3_reset_auto_extension=function(){r.exports.sqlite3_reset_auto_extension();for(let t of e)r.uninstallFunction(t);e.clear()}}let u=n.sqlite3_vfs_find(`kvvfs`);if(u){if(i.isUIThread()){let e=new n.sqlite3_kvvfs_methods(r.exports.sqlite3__wasm_kvvfs_methods());delete n.sqlite3_kvvfs_methods;let t=r.exports.sqlite3__wasm_kvvfsMakeKeyOnPstack,i=r.pstack,a=e=>r.peek(e)===115?sessionStorage:localStorage,o={xRead:(e,n,o,s)=>{let c=i.pointer,l=r.scopedAllocPush();try{let i=t(e,n);if(!i)return-3;let c=r.cstrToJs(i),l=a(e).getItem(c);if(!l)return-1;let u=l.length;if(s<=0)return u;if(s===1)return r.poke(o,0),u;let d=r.scopedAllocCString(l);return s>u+1&&(s=u+1),r.heap8u().copyWithin(o,d,d+s-1),r.poke(o+s-1,0),s-1}catch(e){return console.error(`kvstorageRead()`,e),-2}finally{i.restore(c),r.scopedAllocPop(l)}},xWrite:(e,o,s)=>{let c=i.pointer;try{let n=t(e,o);if(!n)return 1;let i=r.cstrToJs(n);return a(e).setItem(i,r.cstrToJs(s)),0}catch(e){return console.error(`kvstorageWrite()`,e),n.SQLITE_IOERR}finally{i.restore(c)}},xDelete:(e,o)=>{let s=i.pointer;try{let n=t(e,o);return n?(a(e).removeItem(r.cstrToJs(n)),0):1}catch(e){return console.error(`kvstorageDelete()`,e),n.SQLITE_IOERR}finally{i.restore(s)}}};for(let t of Object.keys(o))e[e.memberKey(t)]=r.installFunction(e.memberSignature(t),o[t])}else n.sqlite3_vfs_unregister(u)}r.xWrap.FuncPtrAdapter.warnOnUse=!0;let d=e.StructBinder,f=function e(n,i,a,o=e.installMethodArgcCheck){if(n instanceof d.StructType?!(a instanceof Function)&&!r.isPtr(a)&&t(`Usage error: expecting a Function or WASM pointer to one.`):t(`Usage error: target object is-not-a StructType.`),arguments.length===1)return(t,r)=>e(n,t,r,o);e.argcProxy||(e.argcProxy=function(e,n,r,i){return function(...a){return r.length!==arguments.length&&t(`Argument mismatch for`,e.structInfo.name+`::`+n+`: Native signature is:`,i),r.apply(this,a)}},e.removeFuncList=function(){this.ondispose.__removeFuncList&&(this.ondispose.__removeFuncList.forEach((e,t)=>{if(typeof e==`number`)try{r.uninstallFunction(e)}catch{}}),delete this.ondispose.__removeFuncList)});let s=n.memberSignature(i);s.length<2&&t(`Member`,i,`does not have a function pointer signature:`,s);let c=n.memberKey(i),l=o&&!r.isPtr(a)?e.argcProxy(n,c,a,s):a;if(r.isPtr(l))l&&!r.functionEntry(l)&&t(`Pointer`,l,`is not a WASM function table entry.`),n[c]=l;else{let t=r.installFunction(l,n.memberSignature(i,!0));n[c]=t,(!n.ondispose||!n.ondispose.__removeFuncList)&&(n.addOnDispose(`ondispose.__removeFuncList handler`,e.removeFuncList),n.ondispose.__removeFuncList=[]),n.ondispose.__removeFuncList.push(c,t)}return(t,r)=>e(n,t,r,o)};f.installMethodArgcCheck=!1;let p=function(e,t,n=f.installMethodArgcCheck){let r=new Map;for(let i of Object.keys(t)){let a=t[i],o=r.get(a);if(o){let t=e.memberKey(i);e[t]=e[e.memberKey(o)]}else f(e,i,a,n),r.set(a,i)}return e};d.StructType.prototype.installMethod=function(e,t,n=f.installMethodArgcCheck){return arguments.length<3&&e&&typeof e==`object`?p(this,...arguments):f(this,...arguments)},d.StructType.prototype.installMethods=function(e,t=f.installMethodArgcCheck){return p(this,e,t)}}),globalThis.sqlite3ApiBootstrap.initializers.push(function(e){e.version={libVersion:`3.50.4`,libVersionNumber:3050004,sourceId:`2025-07-30 19:33:53 4d8adfb30e03f9cf27f800a2c1ba3c48fb4ca1b08b0f5ed59a4d5ecbf45e20a3`,downloadVersion:3500400}}),globalThis.sqlite3ApiBootstrap.initializers.push(function(e){let t=(...t)=>{throw new e.SQLite3Error(...t)},n=e.capi,r=e.wasm,i=e.util,a=new WeakMap,o=new WeakMap,s=(e,t,n)=>{let r=Object.getOwnPropertyDescriptor(e,t);return r?r.value:n},c=function(e,r){return r&&(e instanceof m&&(e=e.pointer),t(r,`sqlite3 result code`,r+`:`,e?n.sqlite3_errmsg(e):n.sqlite3_errstr(r))),arguments[0]},l=r.installFunction(`i(ippp)`,function(e,t,i,a){n.SQLITE_TRACE_STMT===e&&console.log(`SQL TRACE #`+ ++this.counter+` via sqlite3@`+t+`:`,r.cstrToJs(a))}.bind({counter:0})),u=Object.create(null),d=function(e){e instanceof ArrayBuffer&&(e=new Uint8Array(e));let t=[],n=`0123456789abcdef`;for(let r of e)t.push(n[(r&240)>>4],n[r&15]);return t.join(``)},f=function(e,r){if(!n.sqlite3_key_v2)return;let a,o,s=+!!r.key+ +!!r.hexkey+ +!!r.textkey;if(s)s>1&&t(n.SQLITE_MISUSE,`Only ONE of (key, hexkey, textkey) may be provided.`);else return;if(r.key){if(a=`key`,o=r.key,typeof o==`string`&&(o=new TextEncoder(`utf-8`).encode(o)),o instanceof ArrayBuffer||o instanceof Uint8Array)o=d(o),a=`hexkey`;else{t(n.SQLITE_MISUSE,`Invalid value for the 'key' option. Expecting a string,`,`ArrayBuffer, or Uint8Array.`);return}}else if(r.textkey)a=`textkey`,o=r.textkey,o instanceof ArrayBuffer&&(o=new Uint8Array(o)),o instanceof Uint8Array?o=new TextDecoder(`utf-8`).decode(o):typeof o!=`string`&&t(n.SQLITE_MISUSE,`Invalid value for the 'textkey' option. Expecting a string,`,`ArrayBuffer, or Uint8Array.`);else if(r.hexkey)a=`hexkey`,o=r.hexkey,o instanceof ArrayBuffer||o instanceof Uint8Array?o=d(o):typeof o!=`string`&&t(n.SQLITE_MISUSE,`Invalid value for the 'hexkey' option. Expecting a string,`,`ArrayBuffer, or Uint8Array.`);else return;let c;try{return c=e.prepare(`PRAGMA `+a+`=`+i.sqlite3__wasm_qfmt_token(o,1)),c.step(),!0}finally{c&&c.finalize()}},p=function i(...s){if(!i._name2vfs){i._name2vfs=Object.create(null);let e=typeof importScripts==`function`?e=>t(`The VFS for`,e,`is only available in the main window thread.`):!1;i._name2vfs[`:localStorage:`]={vfs:`kvvfs`,filename:e||(()=>`local`)},i._name2vfs[`:sessionStorage:`]={vfs:`kvvfs`,filename:e||(()=>`session`)}}let d=i.normalizeArgs(...s),p=d.filename,m=d.vfs,h=d.flags;(typeof p!=`string`&&typeof p!=`number`||typeof h!=`string`||m&&typeof m!=`string`&&typeof m!=`number`)&&(e.config.error(`Invalid DB ctor args`,d,arguments),t(`Invalid arguments for DB constructor.`));let g=typeof p==`number`?r.cstrToJs(p):p,_=i._name2vfs[g];_&&(m=_.vfs,p=g=_.filename(g));let y,b=0;h.indexOf(`c`)>=0&&(b|=n.SQLITE_OPEN_CREATE|n.SQLITE_OPEN_READWRITE),h.indexOf(`w`)>=0&&(b|=n.SQLITE_OPEN_READWRITE),b===0&&(b|=n.SQLITE_OPEN_READONLY),b|=n.SQLITE_OPEN_EXRESCODE;let x=r.pstack.pointer;try{let e=r.pstack.allocPtr(),t=n.sqlite3_open_v2(p,e,b,m||0);y=r.peekPtr(e),c(y,t),n.sqlite3_extended_result_codes(y,1),h.indexOf(`t`)>=0&&n.sqlite3_trace_v2(y,n.SQLITE_TRACE_STMT,l,y)}catch(e){throw y&&n.sqlite3_close_v2(y),e}finally{r.pstack.restore(x)}this.filename=g,a.set(this,y),o.set(this,Object.create(null));try{f(this,d);let r=n.sqlite3_js_db_vfs(y)||t(`Internal error: cannot get VFS for new db handle.`),i=u[r];i&&(i instanceof Function?i(this,e):c(y,n.sqlite3_exec(y,i,0,0,0)))}catch(e){throw this.close(),e}};p.setVfsPostOpenCallback=function(e,n){n instanceof Function||t(`dbCtorHelper.setVfsPostOpenCallback() should not be used with a non-function argument.`,arguments),u[e]=n},p.normalizeArgs=function(e=`:memory:`,t=`c`,n=null){let r={};return arguments.length===1&&arguments[0]&&typeof arguments[0]==`object`?(Object.assign(r,arguments[0]),r.flags===void 0&&(r.flags=`c`),r.vfs===void 0&&(r.vfs=null),r.filename===void 0&&(r.filename=`:memory:`)):(r.filename=e,r.flags=t,r.vfs=n),r};let m=function(...e){p.apply(this,e)};m.dbCtorHelper=p;let h={null:1,number:2,string:3,boolean:4,blob:5};h.undefined,h.null,r.bigIntEnabled&&(h.bigint=h.number);let g=function(){h!==arguments[2]&&t(n.SQLITE_MISUSE,`Do not call the Stmt constructor directly. Use DB.prepare().`),this.db=arguments[0],a.set(this,arguments[1]),this.parameterCount=n.sqlite3_bind_parameter_count(this.pointer)},_=function(e){return e.pointer||t(`DB has been closed.`),e},y=function(e,n){return(n!==(n|0)||n<0||n>=e.columnCount)&&t(`Column index`,n,`is out of range.`),e},b=function(e,r){let a=Object.create(null);switch(a.opt=Object.create(null),r.length){case 1:typeof r[0]==`string`||i.isSQLableTypedArray(r[0])||Array.isArray(r[0])?a.sql=r[0]:r[0]&&typeof r[0]==`object`&&(a.opt=r[0],a.sql=a.opt.sql);break;case 2:a.sql=r[0],a.opt=r[1];break;default:t(`Invalid argument count for exec().`)}a.sql=i.flexibleString(a.sql),typeof a.sql!=`string`&&t(`Missing SQL argument or unsupported SQL value type.`);let o=a.opt;switch(o.returnValue){case`resultRows`:o.resultRows||=[],a.returnVal=()=>o.resultRows;break;case`saveSql`:o.saveSql||=[],a.returnVal=()=>o.saveSql;break;case void 0:case`this`:a.returnVal=()=>e;break;default:t(`Invalid returnValue value:`,o.returnValue)}if(!o.callback&&!o.returnValue&&o.rowMode!==void 0&&(o.resultRows||=[],a.returnVal=()=>o.resultRows),o.callback||o.resultRows)switch(o.rowMode===void 0?`array`:o.rowMode){case`object`:a.cbArg=(e,t)=>{t.columnNames||=e.getColumnNames([]);let n=e.get([]),r=Object.create(null);for(let e in t.columnNames)r[t.columnNames[e]]=n[e];return r};break;case`array`:a.cbArg=e=>e.get([]);break;case`stmt`:Array.isArray(o.resultRows)&&t(`exec(): invalid rowMode for a resultRows array: must`,`be one of 'array', 'object',`,`a result column number, or column name reference.`),a.cbArg=e=>e;break;default:if(i.isInt32(o.rowMode)){a.cbArg=e=>e.get(o.rowMode);break}if(typeof o.rowMode==`string`&&o.rowMode.length>1&&o.rowMode[0]===`$`){let e=o.rowMode.substr(1);a.cbArg=r=>{let i=r.get(Object.create(null))[e];return i===void 0?t(n.SQLITE_NOTFOUND,`exec(): unknown result column:`,e):i};break}t(`Invalid rowMode:`,o.rowMode)}return a},x=(e,t,n,...r)=>{let i=e.prepare(t);try{let e=i.bind(n).step()?i.get(...r):void 0;return i.reset(),e}finally{i.finalize()}},S=(e,t,n,r)=>e.exec({sql:t,bind:n,rowMode:r,returnValue:`resultRows`});m.checkRc=(e,t)=>c(e,t),m.prototype={isOpen:function(){return!!this.pointer},affirmOpen:function(){return _(this)},close:function(){if(this.pointer){if(this.onclose&&this.onclose.before instanceof Function)try{this.onclose.before(this)}catch{}let e=this.pointer;if(Object.keys(o.get(this)).forEach((e,t)=>{if(t&&t.pointer)try{t.finalize()}catch{}}),a.delete(this),o.delete(this),n.sqlite3_close_v2(e),this.onclose&&this.onclose.after instanceof Function)try{this.onclose.after(this)}catch{}delete this.filename}},changes:function(e=!1,t=!1){let r=_(this).pointer;return e?t?n.sqlite3_total_changes64(r):n.sqlite3_total_changes(r):t?n.sqlite3_changes64(r):n.sqlite3_changes(r)},dbFilename:function(e=`main`){return n.sqlite3_db_filename(_(this).pointer,e)},dbName:function(e=0){return n.sqlite3_db_name(_(this).pointer,e)},dbVfsName:function(e=0){let t,i=n.sqlite3_js_db_vfs(_(this).pointer,e);if(i){let e=new n.sqlite3_vfs(i);try{t=r.cstrToJs(e.$zName)}finally{e.dispose()}}return t},prepare:function(e){_(this);let i=r.pstack.pointer,a,s;try{a=r.pstack.alloc(8),m.checkRc(this,n.sqlite3_prepare_v2(this.pointer,e,-1,a,null)),s=r.peekPtr(a)}finally{r.pstack.restore(i)}s||t(`Cannot prepare empty SQL.`);let c=new g(this,s,h);return o.get(this)[s]=c,c},exec:function(){_(this);let e=b(this,arguments);if(!e.sql)return t(`exec() requires an SQL string.`);let a=e.opt,o=a.callback,s=Array.isArray(a.resultRows)?a.resultRows:void 0,c,l=a.bind,u=!!(e.cbArg||a.columnNames||s),d=r.scopedAllocPush(),f=Array.isArray(a.saveSql)?a.saveSql:void 0;try{let t=i.isSQLableTypedArray(e.sql),d=t?e.sql.byteLength:r.jstrlen(e.sql),p=r.scopedAlloc(2*r.ptrSizeof+(d+1)),_=p+r.ptrSizeof,y=_+r.ptrSizeof,b=y+d;for(t?r.heap8().set(e.sql,y):r.jstrcpy(e.sql,r.heap8(),y,d,!1),r.poke(y+d,0);y&&r.peek(y,`i8`);){r.pokePtr([p,_],0),m.checkRc(this,n.sqlite3_prepare_v3(this.pointer,y,d,0,p,_));let t=r.peekPtr(p);if(y=r.peekPtr(_),d=b-y,t){if(f&&f.push(n.sqlite3_sql(t).trim()),c=new g(this,t,h),l&&c.parameterCount&&(c.bind(l),l=null),u&&c.columnCount){let t=+!Array.isArray(a.columnNames);if(u=!1,e.cbArg||s){let n=Object.create(null);for(;c.step();c._lockedByExec=!1){t++===0&&c.getColumnNames(n.columnNames=a.columnNames||[]),c._lockedByExec=!0;let r=e.cbArg(c,n);if(s&&s.push(r),o&&!1===o.call(a,r,c))break}c._lockedByExec=!1}t===0&&c.getColumnNames(a.columnNames)}else c.step();c.reset().finalize(),c=null}}}finally{r.scopedAllocPop(d),c&&(delete c._lockedByExec,c.finalize())}return e.returnVal()},createFunction:function(e,r,a){let o=e=>e instanceof Function;switch(arguments.length){case 1:a=e,e=a.name,r=a.xFunc||0;break;case 2:o(r)||(a=r,r=a.xFunc||0)}a||={},typeof e!=`string`&&t(`Invalid arguments: missing function name.`);let c=a.xStep||0,l=a.xFinal||0,u=a.xValue||0,d=a.xInverse||0,f;o(r)?(f=!1,(o(c)||o(l))&&t(`Ambiguous arguments: scalar or aggregate?`),c=l=null):o(c)?(o(l)||t(`Missing xFinal() callback for aggregate or window UDF.`),r=null):o(l)?t(`Missing xStep() callback for aggregate or window UDF.`):t(`Missing function-type properties.`),!1===f?(o(u)||o(d))&&t(`xValue and xInverse are not permitted for non-window UDFs.`):o(u)?(o(d)||t(`xInverse must be provided if xValue is.`),f=!0):o(d)&&t(`xValue must be provided if xInverse is.`);let p=a.pApp;p!=null&&(typeof p!=`number`||!i.isInt32(p))&&t(`Invalid value for pApp property. Must be a legal WASM pointer value.`);let h=a.xDestroy||0;h&&!o(h)&&t(`xDestroy property must be a function.`);let g=0;s(a,`deterministic`)&&(g|=n.SQLITE_DETERMINISTIC),s(a,`directOnly`)&&(g|=n.SQLITE_DIRECTONLY),s(a,`innocuous`)&&(g|=n.SQLITE_INNOCUOUS),e=e.toLowerCase();let _=r||c,y=s(a,`arity`),b=typeof y==`number`?y:_.length?_.length-1:0,x;return x=f?n.sqlite3_create_window_function(this.pointer,e,b,n.SQLITE_UTF8|g,p||0,c,l,u,d,h):n.sqlite3_create_function_v2(this.pointer,e,b,n.SQLITE_UTF8|g,p||0,r,c,l,h),m.checkRc(this,x),this},selectValue:function(e,t,n){return x(this,e,t,0,n)},selectValues:function(e,t,n){let r=this.prepare(e),i=[];try{for(r.bind(t);r.step();)i.push(r.get(0,n));r.reset()}finally{r.finalize()}return i},selectArray:function(e,t){return x(this,e,t,[])},selectObject:function(e,t){return x(this,e,t,{})},selectArrays:function(e,t){return S(this,e,t,`array`)},selectObjects:function(e,t){return S(this,e,t,`object`)},openStatementCount:function(){return this.pointer?Object.keys(o.get(this)).length:0},transaction:function(e){let r=`BEGIN`;arguments.length>1&&(/[^a-zA-Z]/.test(arguments[0])&&t(n.SQLITE_MISUSE,`Invalid argument for BEGIN qualifier.`),r+=` `+arguments[0],e=arguments[1]),_(this).exec(r);try{let t=e(this);return this.exec(`COMMIT`),t}catch(e){throw this.exec(`ROLLBACK`),e}},savepoint:function(e){_(this).exec(`SAVEPOINT oo1`);try{let t=e(this);return this.exec(`RELEASE oo1`),t}catch(e){throw this.exec(`ROLLBACK to SAVEPOINT oo1; RELEASE SAVEPOINT oo1`),e}},checkRc:function(e){return c(this,e)}};let C=function(e){return e.pointer||t(`Stmt has been closed.`),e},w=function(e){let t=h[e==null?`null`:typeof e];switch(t){case h.boolean:case h.null:case h.number:case h.string:return t;case h.bigint:if(r.bigIntEnabled)return t;default:return i.isBindableTypedArray(e)?h.blob:void 0}},T=function(e){return w(e)||t(`Unsupported bind() argument type:`,typeof e)},E=function(e,r){let a=typeof r==`number`?r:n.sqlite3_bind_parameter_index(e.pointer,r);return a===0||!i.isInt32(a)?t(`Invalid bind() parameter name: `+r):(a<1||a>e.parameterCount)&&t(`Bind index`,r,`is out of range.`),a},D=function(e,n){return e._lockedByExec&&t(`Operation is illegal when statement is locked:`,n),e},O=function a(o,s,c,l){D(C(o),`bind()`),a._||=(a._tooBigInt=e=>t(`BigInt value is too big to store without precision loss:`,e),{string:function(e,t,i,a){let[o,s]=r.allocCString(i,!0);return(a?n.sqlite3_bind_blob:n.sqlite3_bind_text)(e.pointer,t,o,s,n.SQLITE_WASM_DEALLOC)}}),T(l),s=E(o,s);let u=0;switch(l==null?h.null:c){case h.null:u=n.sqlite3_bind_null(o.pointer,s);break;case h.string:u=a._.string(o,s,l,!1);break;case h.number:{let e;i.isInt32(l)?e=n.sqlite3_bind_int:typeof l==`bigint`?i.bigIntFits64(l)?r.bigIntEnabled?e=n.sqlite3_bind_int64:i.bigIntFitsDouble(l)?(l=Number(l),e=n.sqlite3_bind_double):a._tooBigInt(l):a._tooBigInt(l):(l=Number(l),e=r.bigIntEnabled&&Number.isInteger(l)?n.sqlite3_bind_int64:n.sqlite3_bind_double),u=e(o.pointer,s,l);break}case h.boolean:u=n.sqlite3_bind_int(o.pointer,s,+!!l);break;case h.blob:{if(typeof l==`string`){u=a._.string(o,s,l,!0);break}l instanceof ArrayBuffer?l=new Uint8Array(l):i.isBindableTypedArray(l)||t(`Binding a value as a blob requires`,`that it be a string, Uint8Array, Int8Array, or ArrayBuffer.`);let e=r.alloc(l.byteLength||1);r.heap8().set(l.byteLength?l:[0],e),u=n.sqlite3_bind_blob(o.pointer,s,e,l.byteLength,n.SQLITE_WASM_DEALLOC);break}default:e.config.warn(`Unsupported bind() argument type:`,l),t(`Unsupported bind() argument type: `+typeof l)}return u&&m.checkRc(o.db.pointer,u),o._mayGet=!1,o};g.prototype={finalize:function(){if(this.pointer){D(this,`finalize()`);let e=n.sqlite3_finalize(this.pointer);return delete o.get(this.db)[this.pointer],a.delete(this),delete this._mayGet,delete this.parameterCount,delete this._lockedByExec,delete this.db,e}},clearBindings:function(){return D(C(this),`clearBindings()`),n.sqlite3_clear_bindings(this.pointer),this._mayGet=!1,this},reset:function(e){D(this,`reset()`),e&&this.clearBindings();let t=n.sqlite3_reset(C(this).pointer);return this._mayGet=!1,c(this.db,t),this},bind:function(){C(this);let e,n;switch(arguments.length){case 1:e=1,n=arguments[0];break;case 2:e=arguments[0],n=arguments[1];break;default:t(`Invalid bind() arguments.`)}return n===void 0?this:(this.parameterCount||t(`This statement has no bindable parameters.`),this._mayGet=!1,n===null?O(this,e,h.null,n):Array.isArray(n)?(arguments.length!==1&&t(`When binding an array, an index argument is not permitted.`),n.forEach((e,t)=>O(this,t+1,T(e),e)),this):(n instanceof ArrayBuffer&&(n=new Uint8Array(n)),typeof n==`object`&&!i.isBindableTypedArray(n)?(arguments.length!==1&&t(`When binding an object, an index argument is not permitted.`),Object.keys(n).forEach(e=>O(this,e,T(n[e]),n[e])),this):O(this,e,T(n),n)))},bindAsBlob:function(e,n){C(this),arguments.length===1&&(n=e,e=1);let r=T(n);return h.string!==r&&h.blob!==r&&h.null!==r&&t(`Invalid value type for bindAsBlob()`),O(this,e,h.blob,n)},step:function(){D(this,`step()`);let t=n.sqlite3_step(C(this).pointer);switch(t){case n.SQLITE_DONE:return this._mayGet=!1;case n.SQLITE_ROW:return this._mayGet=!0;default:this._mayGet=!1,e.config.warn(`sqlite3_step() rc=`,t,n.sqlite3_js_rc_str(t),`SQL =`,n.sqlite3_sql(this.pointer)),m.checkRc(this.db.pointer,t)}},stepReset:function(){return this.step(),this.reset()},stepFinalize:function(){try{let e=this.step();return this.reset(),e}finally{try{this.finalize()}catch{}}},get:function(e,a){if(C(this)._mayGet||t(`Stmt.step() has not (recently) returned true.`),Array.isArray(e)){let t=0,n=this.columnCount;for(;t<n;)e[t]=this.get(t++);return e}if(e&&typeof e==`object`){let t=0,r=this.columnCount;for(;t<r;)e[n.sqlite3_column_name(this.pointer,t)]=this.get(t++);return e}switch(y(this,e),a===void 0?n.sqlite3_column_type(this.pointer,e):a){case n.SQLITE_NULL:return null;case n.SQLITE_INTEGER:if(r.bigIntEnabled){let t=n.sqlite3_column_int64(this.pointer,e);return t>=-(2**53-1)&&t<=2**53-1?Number(t).valueOf():t}{let r=n.sqlite3_column_double(this.pointer,e);return(r>2**53-1||r<-(2**53-1))&&t(`Integer is out of range for JS integer range: `+r),i.isInt32(r)?r|0:r}case n.SQLITE_FLOAT:return n.sqlite3_column_double(this.pointer,e);case n.SQLITE_TEXT:return n.sqlite3_column_text(this.pointer,e);case n.SQLITE_BLOB:{let t=n.sqlite3_column_bytes(this.pointer,e),i=n.sqlite3_column_blob(this.pointer,e),a=new Uint8Array(t);return t&&a.set(r.heap8u().slice(i,i+t),0),t&&this.db._blobXfer instanceof Array&&this.db._blobXfer.push(a.buffer),a}default:t(`Don't know how to translate`,`type of result column #`+e+`.`)}t(`Not reached.`)},getInt:function(e){return this.get(e,n.SQLITE_INTEGER)},getFloat:function(e){return this.get(e,n.SQLITE_FLOAT)},getString:function(e){return this.get(e,n.SQLITE_TEXT)},getBlob:function(e){return this.get(e,n.SQLITE_BLOB)},getJSON:function(e){let t=this.get(e,n.SQLITE_STRING);return t===null?t:JSON.parse(t)},getColumnName:function(e){return n.sqlite3_column_name(y(C(this),e).pointer,e)},getColumnNames:function(e=[]){y(C(this),0);let t=this.columnCount;for(let r=0;r<t;++r)e.push(n.sqlite3_column_name(this.pointer,r));return e},getParamIndex:function(e){return C(this).parameterCount?n.sqlite3_bind_parameter_index(this.pointer,e):void 0},getParamName:function(e){return C(this).parameterCount?n.sqlite3_bind_parameter_name(this.pointer,e):void 0},isBusy:function(){return n.sqlite3_stmt_busy(C(this))!==0},isReadOnly:function(){return n.sqlite3_stmt_readonly(C(this))!==0}};{let e={enumerable:!0,get:function(){return a.get(this)},set:()=>t(`The pointer property is read-only.`)};Object.defineProperty(g.prototype,"pointer",e),Object.defineProperty(m.prototype,"pointer",e)}if(Object.defineProperty(g.prototype,"columnCount",{enumerable:!1,get:function(){return n.sqlite3_column_count(this.pointer)},set:()=>t(`The columnCount property is read-only.`)}),e.oo1={DB:m,Stmt:g},i.isUIThread()){e.oo1.JsStorageDb=function(e=`session`){let n=p.normalizeArgs(...arguments);e=n.filename,e!==`session`&&e!==`local`&&t(`JsStorageDb db name must be one of 'session' or 'local'.`),n.vfs=`kvvfs`,p.call(this,n)};let r=e.oo1.JsStorageDb;r.prototype=Object.create(m.prototype),r.clearStorage=n.sqlite3_js_kvvfs_clear,r.prototype.clearStorage=function(){return r.clearStorage(_(this).filename)},r.storageSize=n.sqlite3_js_kvvfs_size,r.prototype.storageSize=function(){return r.storageSize(_(this).filename)}}}),globalThis.sqlite3ApiBootstrap.initializers.push(function(e){let t=e.util;e.initWorker1API=function(){let e=(...e)=>{throw Error(e.join(` `))};globalThis.WorkerGlobalScope instanceof Function||e(`initWorker1API() must be run from a Worker thread.`);let n=this.sqlite3||e(`Missing this.sqlite3 object.`),r=n.oo1.DB,i=function(e){let t=a.idMap.get(e);return t||(t=`db#`+ ++a.idSeq+`@`+e.pointer,a.idMap.set(e,t),t)},a={dbList:[],idSeq:0,idMap:new WeakMap,xfer:[],open:function(e){let t=new r(e);return this.dbs[i(t)]=t,this.dbList.indexOf(t)<0&&this.dbList.push(t),t},close:function(e,n){if(e){delete this.dbs[i(e)];let r=e.filename,a=t.sqlite3__wasm_db_vfs(e.pointer,0);e.close();let o=this.dbList.indexOf(e);o>=0&&this.dbList.splice(o,1),n&&r&&a&&t.sqlite3__wasm_vfs_unlink(a,r)}},post:function(e,t){t&&t.length?(globalThis.postMessage(e,Array.from(t)),t.length=0):globalThis.postMessage(e)},dbs:Object.create(null),getDb:function(t,n=!0){return this.dbs[t]||(n?e(`Unknown (or closed) DB ID:`,t):void 0)}},o=function(t=a.dbList[0]){return t&&t.pointer?t:e(`DB is not opened.`)},s=function(e,t=!0){let n=a.getDb(e.dbId,!1)||a.dbList[0];return t?o(n):n},c=function(){return a.dbList[0]&&i(a.dbList[0])},l={open:function(t){let r=Object.create(null),o=t.args||Object.create(null);o.simulateError&&e(`Throwing because of simulateError flag.`);let s=Object.create(null);r.vfs=o.vfs,r.filename=o.filename||``;let c=a.open(r);return s.filename=c.filename,s.persistent=!!n.capi.sqlite3_js_db_uses_vfs(c.pointer,`opfs`),s.dbId=i(c),s.vfs=c.dbVfsName(),s},close:function(e){let t=s(e,!1),n={filename:t&&t.filename};if(t){let n=e.args&&typeof e.args==`object`?!!e.args.unlink:!1;a.close(t,n)}return n},exec:function(t){let r=typeof t.args==`string`?{sql:t.args}:t.args||Object.create(null);r.rowMode===`stmt`?e(`Invalid rowMode for 'exec': stmt mode`,`does not work in the Worker API.`):r.sql||e(`'exec' requires input SQL.`);let i=s(t);(r.callback||Array.isArray(r.resultRows))&&(i._blobXfer=a.xfer);let o=r.callback,c=0,l=!!r.columnNames;typeof o==`string`&&(l||(r.columnNames=[]),r.callback=function(e,t){a.post({type:o,columnNames:r.columnNames,rowNumber:++c,row:e},a.xfer)});try{let e=r.countChanges?i.changes(!0,r.countChanges===64):void 0;i.exec(r),e!==void 0&&(r.changeCount=i.changes(!0,r.countChanges===64)-e);let t=r.lastInsertRowId?n.capi.sqlite3_last_insert_rowid(i):void 0;t!==void 0&&(r.lastInsertRowId=t),r.callback instanceof Function&&(r.callback=o,a.post({type:o,columnNames:r.columnNames,rowNumber:null,row:void 0}))}finally{delete i._blobXfer,r.callback&&=o}return r},"config-get":function(){let e=Object.create(null),t=n.config;return[`bigIntEnabled`].forEach(function(n){Object.getOwnPropertyDescriptor(t,n)&&(e[n]=t[n])}),e.version=n.version,e.vfsList=n.capi.sqlite3_js_vfs_list(),e},export:function(e){let t=s(e),r={byteArray:n.capi.sqlite3_js_db_export(t.pointer),filename:t.filename,mimetype:`application/x-sqlite3`};return a.xfer.push(r.byteArray.buffer),r},toss:function(t){e(`Testing worker exception`)}};globalThis.onmessage=async function(t){t=t.data;let n,r=t.dbId,i=t.type,o=performance.now();try{l.hasOwnProperty(i)&&l[i]instanceof Function?n=await l[i](t):e(`Unknown db worker message type:`,t.type)}catch(e){i=`error`,n={operation:t.type,message:e.message,errorClass:e.name,input:t},e.stack&&(n.stack=typeof e.stack==`string`?e.stack.split(/\n\s*/):e.stack)}r||=n.dbId||c(),a.post({type:i,dbId:r,messageId:t.messageId,workerReceivedTime:o,workerRespondTime:performance.now(),departureTime:t.departureTime,result:n},a.xfer)},globalThis.postMessage({type:`sqlite3-api`,result:`worker1-ready`})}.bind({sqlite3:e})}),globalThis.sqlite3ApiBootstrap.initializers.push(function(e){let t=e.wasm,n=e.capi,r=e.util.toss3,i=Object.create(null);e.vfs=i,n.sqlite3_vfs.prototype.registerVfs=function(t=!1){this instanceof e.capi.sqlite3_vfs||r(`Expecting a sqlite3_vfs-type argument.`);let i=n.sqlite3_vfs_register(this,+!!t);return i&&r(`sqlite3_vfs_register(`,this,`) failed with rc`,i),this.pointer!==n.sqlite3_vfs_find(this.$zName)&&r(`BUG: sqlite3_vfs_find(vfs.$zName) failed for just-installed VFS`,this),this},i.installVfs=function(e){let n=0,i=[`io`,`vfs`];for(let r of i){let i=e[r];i&&(++n,i.struct.installMethods(i.methods,!!i.applyArgcCheck),r===`vfs`&&(!i.struct.$zName&&typeof i.name==`string`&&i.struct.addOnDispose(i.struct.$zName=t.allocCString(i.name)),i.struct.registerVfs(!!i.asDefault)))}return n||r(`Misuse: installVfs() options object requires at least`,`one of:`,i),this}}),globalThis.sqlite3ApiBootstrap.initializers.push(function(e){if(!e.wasm.exports.sqlite3_declare_vtab)return;let t=e.wasm,n=e.capi,r=e.util.toss3,i=Object.create(null);e.vtab=i;let a=n.sqlite3_index_info;a.prototype.nthConstraint=function(e,t=!1){if(e<0||e>=this.$nConstraint)return!1;let n=this.$aConstraint+a.sqlite3_index_constraint.structInfo.sizeof*e;return t?n:new a.sqlite3_index_constraint(n)},a.prototype.nthConstraintUsage=function(e,t=!1){if(e<0||e>=this.$nConstraint)return!1;let n=this.$aConstraintUsage+a.sqlite3_index_constraint_usage.structInfo.sizeof*e;return t?n:new a.sqlite3_index_constraint_usage(n)},a.prototype.nthOrderBy=function(e,t=!1){if(e<0||e>=this.$nOrderBy)return!1;let n=this.$aOrderBy+a.sqlite3_index_orderby.structInfo.sizeof*e;return t?n:new a.sqlite3_index_orderby(n)};let o=function(n,r){return function(i,a=!1){if(arguments.length===0&&(i=new r),i instanceof r)return this.set(i.pointer,i),i;t.isPtr(i)||e.SQLite3Error.toss(`Invalid argument to`,n+`()`);let o=this.get(i);return a&&this.delete(i),o}.bind(new Map)},s=function(e,n){let r=o(e,n);return Object.assign(Object.create(null),{StructType:n,create:e=>{let n=r();return t.pokePtr(e,n.pointer),n},get:e=>r(e),unget:e=>r(e,!0),dispose:e=>{let t=r(e,!0);t&&t.dispose()}})};i.xVtab=s(`xVtab`,n.sqlite3_vtab),i.xCursor=s(`xCursor`,n.sqlite3_vtab_cursor),i.xIndexInfo=e=>new n.sqlite3_index_info(e),i.xError=function t(r,i,a){if(t.errorReporter instanceof Function)try{t.errorReporter(`sqlite3_module::`+r+`(): `+i.message)}catch{}let o;return i instanceof e.WasmAllocError?o=n.SQLITE_NOMEM:arguments.length>2?o=a:i instanceof e.SQLite3Error&&(o=i.resultCode),o||n.SQLITE_ERROR},i.xError.errorReporter=console.error.bind(console),i.xRowid=(e,n)=>t.poke(e,n,`i64`),i.setupModule=function(a){let o=!1,s=this instanceof n.sqlite3_module?this:a.struct||(o=new n.sqlite3_module);try{let n=a.methods||r(`Missing 'methods' object.`);for(let e of Object.entries({xConnect:`xCreate`,xDisconnect:`xDestroy`})){let t=e[0],r=e[1];!0===n[t]?n[t]=n[r]:!0===n[r]&&(n[r]=n[t])}if(a.catchExceptions){let r=function(n,r){return[`xConnect`,`xCreate`].indexOf(n)>=0?function(a,o,s,c,l,u){try{return r(...arguments)||0}catch(r){return r instanceof e.WasmAllocError||(t.dealloc(t.peekPtr(u)),t.pokePtr(u,t.allocCString(r.message))),i.xError(n,r)}}:function(...e){try{return r(...e)||0}catch(e){return i.xError(n,e)}}},a=[`xCreate`,`xConnect`,`xBestIndex`,`xDisconnect`,`xDestroy`,`xOpen`,`xClose`,`xFilter`,`xNext`,`xEof`,`xColumn`,`xRowid`,`xUpdate`,`xBegin`,`xSync`,`xCommit`,`xRollback`,`xFindFunction`,`xRename`,`xSavepoint`,`xRelease`,`xRollbackTo`,`xShadowName`],o=Object.create(null);for(let e of a){let t=n[e];if(t instanceof Function)o[e]=e===`xConnect`&&n.xCreate===t?n.xCreate:e===`xCreate`&&n.xConnect===t?n.xConnect:r(e,t);else continue}s.installMethods(o,!1)}else s.installMethods(n,!!a.applyArgcCheck);if(s.$iVersion===0){let e;e=typeof a.iVersion==`number`?a.iVersion:s.$xShadowName?3:s.$xSavePoint||s.$xRelease||s.$xRollbackTo?2:1,s.$iVersion=e}}catch(e){throw o&&o.dispose(),e}return s},n.sqlite3_module.prototype.setupModule=function(e){return i.setupModule.call(this,e)}}),globalThis.sqlite3ApiBootstrap.initializers.push(function(e){let t=function t(n){if(!globalThis.SharedArrayBuffer||!globalThis.Atomics)return Promise.reject(Error(`Cannot install OPFS: Missing SharedArrayBuffer and/or Atomics. The server must emit the COOP/COEP response headers to enable those. See https://sqlite.org/wasm/doc/trunk/persistence.md#coop-coep`));if(typeof WorkerGlobalScope>`u`)return Promise.reject(Error(`The OPFS sqlite3_vfs cannot run in the main thread because it requires Atomics.wait().`));if(!globalThis.FileSystemHandle||!globalThis.FileSystemDirectoryHandle||!globalThis.FileSystemFileHandle||!globalThis.FileSystemFileHandle.prototype.createSyncAccessHandle||!navigator?.storage?.getDirectory)return Promise.reject(Error(`Missing required OPFS APIs.`));(!n||typeof n!=`object`)&&(n=Object.create(null));let r=new URL(globalThis.location.href).searchParams;return r.has(`opfs-disable`)?Promise.resolve(e):(n.verbose===void 0&&(n.verbose=r.has(`opfs-verbose`)?+r.get(`opfs-verbose`)||2:1),n.sanityChecks===void 0&&(n.sanityChecks=r.has(`opfs-sanity-check`)),n.proxyUri===void 0&&(n.proxyUri=t.defaultProxyUri),typeof n.proxyUri==`function`&&(n.proxyUri=n.proxyUri()),new Promise(function(t,r){let i=[e.config.error,e.config.warn,e.config.log],a=(e,...t)=>{n.verbose>e&&i[e](`OPFS syncer:`,...t)},o=(...e)=>a(2,...e),s=(...e)=>a(1,...e),c=(...e)=>a(0,...e),l=e.util.toss,u=e.capi,d=e.util,f=e.wasm,p=u.sqlite3_vfs,m=u.sqlite3_file,h=u.sqlite3_io_methods,g=Object.create(null),_=()=>globalThis.FileSystemHandle&&globalThis.FileSystemDirectoryHandle&&globalThis.FileSystemFileHandle&&globalThis.FileSystemFileHandle.prototype.createSyncAccessHandle&&navigator?.storage?.getDirectory;g.metrics={dump:function(){let t,n=0,r=0,i=0;for(t in D.opIds){let e=O[t];n+=e.count,r+=e.time,i+=e.wait,e.avgTime=e.count&&e.time?e.time/e.count:0,e.avgWait=e.count&&e.wait?e.wait/e.count:0}e.config.log(globalThis.location.href,`metrics for`,globalThis.location.href,`:`,O,`
Total of`,n,`op(s) for`,r,`ms (incl. `+i+` ms of waiting on the async side)`),e.config.log(`Serialization metrics:`,O.s11n),w.postMessage({type:`opfs-async-metrics`})},reset:function(){let e,t=e=>e.count=e.time=e.wait=0;for(e in D.opIds)t(O[e]=Object.create(null));let n=O.s11n=Object.create(null);n=n.serialize=Object.create(null),n.count=n.time=0,n=O.s11n.deserialize=Object.create(null),n.count=n.time=0}};let y=new h,b=new p().addOnDispose(()=>y.dispose()),x,S=e=>(x=!0,b.dispose(),r(e)),C=()=>(x=!1,t(e)),w=new Worker(new URL(`sqlite3-opfs-async-proxy.js`,import.meta.url));setTimeout(()=>{x===void 0&&S(Error(`Timeout while waiting for OPFS async proxy worker.`))},4e3),w._originalOnError=w.onerror,w.onerror=function(e){c(`Error initializing OPFS asyncer:`,e),S(Error(`Loading OPFS async Worker failed for unknown reasons.`))};let T=u.sqlite3_vfs_find(null),E=T?new p(T):null;y.$iVersion=1,b.$iVersion=2,b.$szOsFile=u.sqlite3_file.structInfo.sizeof,b.$mxPathname=1024,b.$zName=f.allocCString(`opfs`),b.$xDlOpen=b.$xDlError=b.$xDlSym=b.$xDlClose=null,b.addOnDispose(`$zName`,b.$zName,`cleanup default VFS wrapper`,()=>E?E.dispose():null);let D=Object.create(null);D.verbose=n.verbose,D.littleEndian=(()=>{let e=new ArrayBuffer(2);return new DataView(e).setInt16(0,256,!0),new Int16Array(e)[0]===256})(),D.asyncIdleWaitTime=150,D.asyncS11nExceptions=1,D.fileBufferSize=65536,D.sabS11nOffset=D.fileBufferSize,D.sabS11nSize=b.$mxPathname*2,D.sabIO=new SharedArrayBuffer(D.fileBufferSize+D.sabS11nSize),D.opIds=Object.create(null);let O=Object.create(null);{let e=0;D.opIds.whichOp=e++,D.opIds.rc=e++,D.opIds.xAccess=e++,D.opIds.xClose=e++,D.opIds.xDelete=e++,D.opIds.xDeleteNoWait=e++,D.opIds.xFileSize=e++,D.opIds.xLock=e++,D.opIds.xOpen=e++,D.opIds.xRead=e++,D.opIds.xSleep=e++,D.opIds.xSync=e++,D.opIds.xTruncate=e++,D.opIds.xUnlock=e++,D.opIds.xWrite=e++,D.opIds.mkdir=e++,D.opIds[`opfs-async-metrics`]=e++,D.opIds[`opfs-async-shutdown`]=e++,D.opIds.retry=e++,D.sabOP=new SharedArrayBuffer(e*4),g.metrics.reset()}D.sq3Codes=Object.create(null),`SQLITE_ACCESS_EXISTS.SQLITE_ACCESS_READWRITE.SQLITE_BUSY.SQLITE_CANTOPEN.SQLITE_ERROR.SQLITE_IOERR.SQLITE_IOERR_ACCESS.SQLITE_IOERR_CLOSE.SQLITE_IOERR_DELETE.SQLITE_IOERR_FSYNC.SQLITE_IOERR_LOCK.SQLITE_IOERR_READ.SQLITE_IOERR_SHORT_READ.SQLITE_IOERR_TRUNCATE.SQLITE_IOERR_UNLOCK.SQLITE_IOERR_WRITE.SQLITE_LOCK_EXCLUSIVE.SQLITE_LOCK_NONE.SQLITE_LOCK_PENDING.SQLITE_LOCK_RESERVED.SQLITE_LOCK_SHARED.SQLITE_LOCKED.SQLITE_MISUSE.SQLITE_NOTFOUND.SQLITE_OPEN_CREATE.SQLITE_OPEN_DELETEONCLOSE.SQLITE_OPEN_MAIN_DB.SQLITE_OPEN_READONLY`.split(`.`).forEach(e=>{(D.sq3Codes[e]=u[e])===void 0&&l(`Maintenance required: not found:`,e)}),D.opfsFlags=Object.assign(Object.create(null),{OPFS_UNLOCK_ASAP:1,OPFS_UNLINK_BEFORE_OPEN:2,defaultUnlockAsap:!1});let k=(e,...t)=>{let n=D.opIds[e]||l(`Invalid op ID:`,e);D.s11n.serialize(...t),Atomics.store(D.sabOPView,D.opIds.rc,-1),Atomics.store(D.sabOPView,D.opIds.whichOp,n),Atomics.notify(D.sabOPView,D.opIds.whichOp);let r=performance.now();for(;Atomics.wait(D.sabOPView,D.opIds.rc,-1)!==`not-equal`;);let i=Atomics.load(D.sabOPView,D.opIds.rc);if(O[e].wait+=performance.now()-r,i&&D.asyncS11nExceptions){let t=D.s11n.deserialize();t&&c(e+`() async error:`,...t)}return i};g.debug={asyncShutdown:()=>{s(`Shutting down OPFS async listener. The OPFS VFS will no longer work.`),k(`opfs-async-shutdown`)},asyncRestart:()=>{s(`Attempting to restart OPFS VFS async listener. Might work, might not.`),w.postMessage({type:`opfs-async-restart`})}};let A=()=>{if(D.s11n)return D.s11n;let e=new TextDecoder,t=new TextEncoder(`utf-8`),n=new Uint8Array(D.sabIO,D.sabS11nOffset,D.sabS11nSize),r=new DataView(D.sabIO,D.sabS11nOffset,D.sabS11nSize);D.s11n=Object.create(null);let i=Object.create(null);i.number={id:1,size:8,getter:`getFloat64`,setter:`setFloat64`},i.bigint={id:2,size:8,getter:`getBigInt64`,setter:`setBigInt64`},i.boolean={id:3,size:4,getter:`getInt32`,setter:`setInt32`},i.string={id:4};let a=e=>i[typeof e]||l(`Maintenance required: this value type cannot be serialized.`,e),o=e=>{switch(e){case i.number.id:return i.number;case i.bigint.id:return i.bigint;case i.boolean.id:return i.boolean;case i.string.id:return i.string;default:l(`Invalid type ID:`,e)}};return D.s11n.deserialize=function(t=!1){++O.s11n.deserialize.count;let i=performance.now(),a=n[0],s=a?[]:null;if(a){let t=[],i=1,c,l,u;for(c=0;c<a;++c,++i)t.push(o(n[i]));for(c=0;c<a;++c){let a=t[c];a.getter?(u=r[a.getter](i,D.littleEndian),i+=a.size):(l=r.getInt32(i,D.littleEndian),i+=4,u=e.decode(n.slice(i,i+l)),i+=l),s.push(u)}}return t&&(n[0]=0),O.s11n.deserialize.time+=performance.now()-i,s},D.s11n.serialize=function(...e){let i=performance.now();if(++O.s11n.serialize.count,e.length){let i=[],o=0,s=1;for(n[0]=e.length&255;o<e.length;++o,++s)i.push(a(e[o])),n[s]=i[o].id;for(o=0;o<e.length;++o){let a=i[o];if(a.setter)r[a.setter](s,e[o],D.littleEndian),s+=a.size;else{let i=t.encode(e[o]);r.setInt32(s,i.byteLength,D.littleEndian),s+=4,n.set(i,s),s+=i.byteLength}}}else n[0]=0;O.s11n.serialize.time+=performance.now()-i},D.s11n},j=function e(t=16){e._chars||(e._chars=`abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012346789`,e._n=e._chars.length);let n=[],r=0;for(;r<t;++r){let t=Math.random()*(e._n*64)%e._n|0;n[r]=e._chars[t]}return n.join(``)},M=Object.create(null),N=Object.create(null);N.op=void 0,N.start=void 0;let P=e=>{N.start=performance.now(),N.op=e,++O[e].count},F=()=>O[N.op].time+=performance.now()-N.start,I={xCheckReservedLock:function(e,t){return f.poke(t,0,`i32`),0},xClose:function(e){P(`xClose`);let t=0,n=M[e];return n&&(delete M[e],t=k(`xClose`,e),n.sq3File&&n.sq3File.dispose()),F(),t},xDeviceCharacteristics:function(e){return u.SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN},xFileControl:function(e,t,n){return u.SQLITE_NOTFOUND},xFileSize:function(e,t){P(`xFileSize`);let n=k(`xFileSize`,e);if(n==0)try{let e=D.s11n.deserialize()[0];f.poke(t,e,`i64`)}catch(e){c(`Unexpected error reading xFileSize() result:`,e),n=D.sq3Codes.SQLITE_IOERR}return F(),n},xLock:function(e,t){P(`xLock`);let n=M[e],r=0;return n.lockType?n.lockType=t:(r=k(`xLock`,e,t),r===0&&(n.lockType=t)),F(),r},xRead:function(e,t,n,r){P(`xRead`);let i=M[e],a;try{a=k(`xRead`,e,n,Number(r)),(a===0||u.SQLITE_IOERR_SHORT_READ===a)&&f.heap8u().set(i.sabView.subarray(0,n),t)}catch(e){c(`xRead(`,arguments,`) failed:`,e,i),a=u.SQLITE_IOERR_READ}return F(),a},xSync:function(e,t){P(`xSync`),++O.xSync.count;let n=k(`xSync`,e,t);return F(),n},xTruncate:function(e,t){P(`xTruncate`);let n=k(`xTruncate`,e,Number(t));return F(),n},xUnlock:function(e,t){P(`xUnlock`);let n=M[e],r=0;return u.SQLITE_LOCK_NONE===t&&n.lockType&&(r=k(`xUnlock`,e,t)),r===0&&(n.lockType=t),F(),r},xWrite:function(e,t,n,r){P(`xWrite`);let i=M[e],a;try{i.sabView.set(f.heap8u().subarray(t,t+n)),a=k(`xWrite`,e,n,Number(r))}catch(e){c(`xWrite(`,arguments,`) failed:`,e,i),a=u.SQLITE_IOERR_WRITE}return F(),a}},L={xAccess:function(e,t,n,r){P(`xAccess`);let i=k(`xAccess`,f.cstrToJs(t));return f.poke(r,+!i,`i32`),F(),0},xCurrentTime:function(e,t){return f.poke(t,2440587.5+new Date().getTime()/864e5,`double`),0},xCurrentTimeInt64:function(e,t){return f.poke(t,0xbfc83e532200+new Date().getTime(),`i64`),0},xDelete:function(e,t,n){P(`xDelete`);let r=k(`xDelete`,f.cstrToJs(t),n,!1);return F(),r},xFullPathname:function(e,t,n,r){return f.cstrncpy(r,t,n)<n?0:u.SQLITE_CANTOPEN},xGetLastError:function(e,t,n){return s(`OPFS xGetLastError() has nothing sensible to return.`),0},xOpen:function(t,n,r,i,a){P(`xOpen`);let o=0;n===0?n=j():f.isPtr(n)&&(u.sqlite3_uri_boolean(n,`opfs-unlock-asap`,0)&&(o|=D.opfsFlags.OPFS_UNLOCK_ASAP),u.sqlite3_uri_boolean(n,`delete-before-open`,0)&&(o|=D.opfsFlags.OPFS_UNLINK_BEFORE_OPEN),n=f.cstrToJs(n));let s=Object.create(null);s.fid=r,s.filename=n,s.sab=new SharedArrayBuffer(D.fileBufferSize),s.flags=i,s.readOnly=!(e.SQLITE_OPEN_CREATE&i)&&!!(i&u.SQLITE_OPEN_READONLY);let c=k(`xOpen`,r,n,i,o);return c||(s.readOnly&&f.poke(a,u.SQLITE_OPEN_READONLY,`i32`),M[r]=s,s.sabView=D.sabFileBufView,s.sq3File=new m(r),s.sq3File.$pMethods=y.pointer,s.lockType=u.SQLITE_LOCK_NONE),F(),c}};E&&(b.$xRandomness=E.$xRandomness,b.$xSleep=E.$xSleep),b.$xRandomness||(L.xRandomness=function(e,t,n){let r=f.heap8u(),i=0;for(;i<t;++i)r[n+i]=Math.random()*255e3&255;return i}),b.$xSleep||(L.xSleep=function(e,t){return Atomics.wait(D.sabOPView,D.opIds.xSleep,0,t),0}),g.getResolvedPath=function(e,t){let n=new URL(e,`file://irrelevant`).pathname;return t?n.split(`/`).filter(e=>!!e):n},g.getDirForFilename=async function(e,t=!1){let n=g.getResolvedPath(e,!0),r=n.pop(),i=g.rootDirectory;for(let e of n)e&&(i=await i.getDirectoryHandle(e,{create:!!t}));return[i,r]},g.mkdir=async function(e){try{return await g.getDirForFilename(e+`/filepart`,!0),!0}catch{return!1}},g.entryExists=async function(e){try{let[t,n]=await g.getDirForFilename(e);return await t.getFileHandle(n),!0}catch{return!1}},g.randomFilename=j,g.treeList=async function(){let e=async function e(t,n){n.name=t.name,n.dirs=[],n.files=[];for await(let r of t.values())if(r.kind===`directory`){let t=Object.create(null);n.dirs.push(t),await e(r,t)}else n.files.push(r.name)},t=Object.create(null);return await e(g.rootDirectory,t),t},g.rmfr=async function(){let e=g.rootDirectory,t={recurse:!0};for await(let n of e.values())e.removeEntry(n.name,t)},g.unlink=async function(e,t=!1,n=!1){try{let[n,r]=await g.getDirForFilename(e,!1);return await n.removeEntry(r,{recursive:t}),!0}catch(e){if(n)throw Error(`unlink(`,arguments[0],`) failed: `+e.message,{cause:e});return!1}},g.traverse=async function(e){let t={recursive:!0,directory:g.rootDirectory};typeof e==`function`&&(e={callback:e}),e=Object.assign(t,e||{}),async function t(n,r){for await(let i of n.values()){if(!1===e.callback(i,n,r))return!1;if(e.recursive&&i.kind===`directory`&&!1===await t(i,r+1))break}}(e.directory,0)};let ee=async function(e,t){let[n,r]=await g.getDirForFilename(e,!0),i=await(await n.getFileHandle(r,{create:!0})).createSyncAccessHandle(),a=0,o,s=!1;try{for(i.truncate(0);(o=await t())!==void 0;)o instanceof ArrayBuffer&&(o=new Uint8Array(o)),a===0&&o.byteLength>=15&&(d.affirmDbHeader(o),s=!0),i.write(o,{at:a}),a+=o.byteLength;if((a<512||a%512!=0)&&l(`Input size`,a,`is not correct for an SQLite database.`),!s){let e=new Uint8Array(20);i.read(e,{at:0}),d.affirmDbHeader(e)}return i.write(new Uint8Array([1,1]),{at:18}),a}catch(e){throw await i.close(),i=void 0,await n.removeEntry(r).catch(()=>{}),e}finally{i&&await i.close()}};if(g.importDb=async function(e,t){if(t instanceof Function)return ee(e,t);t instanceof ArrayBuffer&&(t=new Uint8Array(t)),d.affirmIsDb(t);let n=t.byteLength,[r,i]=await g.getDirForFilename(e,!0),a,o=0;try{return a=await(await r.getFileHandle(i,{create:!0})).createSyncAccessHandle(),a.truncate(0),o=a.write(t,{at:0}),o!=n&&l(`Expected to write `+n+` bytes but wrote `+o+`.`),a.write(new Uint8Array([1,1]),{at:18}),o}catch(e){throw a&&=(await a.close(),void 0),await r.removeEntry(i).catch(()=>{}),e}finally{a&&await a.close()}},e.oo1){let t=function(...t){let n=e.oo1.DB.dbCtorHelper.normalizeArgs(...t);n.vfs=b.$zName,e.oo1.DB.dbCtorHelper.call(this,n)};t.prototype=Object.create(e.oo1.DB.prototype),e.oo1.OpfsDb=t,t.importDb=g.importDb,e.oo1.DB.dbCtorHelper.setVfsPostOpenCallback(b.pointer,function(e,t){t.capi.sqlite3_busy_timeout(e,1e4)})}let te=function(){let e=f.scopedAllocPush(),t=new m;try{let e=t.pointer,n=u.SQLITE_OPEN_CREATE|u.SQLITE_OPEN_READWRITE|u.SQLITE_OPEN_MAIN_DB,r=f.scopedAlloc(8),i=`/sanity/check/file`+j(8),a=f.scopedAllocCString(i),d;if(D.s11n.serialize(`This is ä string.`),d=D.s11n.deserialize(),o(`deserialize() says:`,d),d[0]!==`This is ä string.`&&l(`String d13n error.`),L.xAccess(b.pointer,a,0,r),d=f.peek(r,`i32`),o(`xAccess(`,i,`) exists ?=`,d),d=L.xOpen(b.pointer,a,e,n,r),o(`open rc =`,d,`state.sabOPView[xOpen] =`,D.sabOPView[D.opIds.xOpen]),d!==0){c(`open failed with code`,d);return}L.xAccess(b.pointer,a,0,r),d=f.peek(r,`i32`),d||l(`xAccess() failed to detect file.`),d=I.xSync(t.pointer,0),d&&l(`sync failed w/ rc`,d),d=I.xTruncate(t.pointer,1024),d&&l(`truncate failed w/ rc`,d),f.poke(r,0,`i64`),d=I.xFileSize(t.pointer,r),d&&l(`xFileSize failed w/ rc`,d),o(`xFileSize says:`,f.peek(r,`i64`)),d=I.xWrite(t.pointer,a,10,1),d&&l(`xWrite() failed!`);let p=f.scopedAlloc(16);d=I.xRead(t.pointer,p,6,2),f.poke(p+6,0);let m=f.cstrToJs(p);o(`xRead() got:`,m),m!==`sanity`&&l(`Unexpected xRead() value.`),L.xSleep&&(o(`xSleep()ing before close()ing...`),L.xSleep(b.pointer,2e3),o(`waking up from xSleep()`)),d=I.xClose(e),o(`xClose rc =`,d,`sabOPView =`,D.sabOPView),o(`Deleting file:`,i),L.xDelete(b.pointer,a,4660),L.xAccess(b.pointer,a,0,r),d=f.peek(r,`i32`),d&&l(`Expecting 0 from xAccess(`,i,`) after xDelete().`),s(`End of OPFS sanity checks.`)}finally{t.dispose(),f.scopedAllocPop(e)}};w.onmessage=function({data:t}){switch(t.type){case`opfs-unavailable`:S(Error(t.payload.join(` `)));break;case`opfs-async-loaded`:w.postMessage({type:`opfs-async-init`,args:D});break;case`opfs-async-inited`:if(!0===x)break;try{e.vfs.installVfs({io:{struct:y,methods:I},vfs:{struct:b,methods:L}}),D.sabOPView=new Int32Array(D.sabOP),D.sabFileBufView=new Uint8Array(D.sabIO,0,D.fileBufferSize),D.sabS11nView=new Uint8Array(D.sabIO,D.sabS11nOffset,D.sabS11nSize),A(),n.sanityChecks&&(s(`Running sanity checks because of opfs-sanity-check URL arg...`),te()),_()?navigator.storage.getDirectory().then(t=>{w.onerror=w._originalOnError,delete w._originalOnError,e.opfs=g,g.rootDirectory=t,o(`End of OPFS sqlite3_vfs setup.`,b),C()}).catch(S):C()}catch(e){c(e),S(e)}break;default:{let e=`Unexpected message from the OPFS async worker: `+JSON.stringify(t);c(e),S(Error(e));break}}}}))};t.defaultProxyUri=`sqlite3-opfs-async-proxy.js`,globalThis.sqlite3ApiBootstrap.initializersAsync.push(async e=>{try{let n=t.defaultProxyUri;return e.scriptInfo.sqlite3Dir&&(t.defaultProxyUri=e.scriptInfo.sqlite3Dir+n),t().catch(t=>{e.config.warn(`Ignoring inability to install OPFS sqlite3_vfs:`,t.message)})}catch(t){return e.config.error(`installOpfsVfs() exception:`,t),Promise.reject(t)}})}),globalThis.sqlite3ApiBootstrap.initializers.push(function(e){let t=e.util.toss,n=e.util.toss3,r=Object.create(null),i=e.capi,a=e.util,o=e.wasm,s=4096,c=s,l=i.SQLITE_OPEN_MAIN_DB|i.SQLITE_OPEN_MAIN_JOURNAL|i.SQLITE_OPEN_SUPER_JOURNAL|i.SQLITE_OPEN_WAL,u=i.SQLITE_OPEN_MEMORY,d=`.opaque`,f=()=>Math.random().toString(36).slice(2),p=new TextDecoder,m=new TextEncoder,h=Object.assign(Object.create(null),{name:`opfs-sahpool`,directory:void 0,initialCapacity:6,clearOnInit:!1,verbosity:2,forceReinitIfPreviouslyFailed:!1}),g=[e.config.error,e.config.warn,e.config.log];e.config.log;let _=e.config.warn;e.config.error;let y=new Map,b=e=>y.get(e),x=(e,t)=>{t?y.set(e,t):y.delete(e)},S=new Map,C=e=>S.get(e),w=(e,t)=>{t?S.set(e,t):S.delete(e)},T={xCheckReservedLock:function(e,t){let n=C(e);return n.log(`xCheckReservedLock`),n.storeErr(),o.poke32(t,1),0},xClose:function(e){let t=C(e);t.storeErr();let n=t.getOFileForS3File(e);if(n)try{t.log(`xClose ${n.path}`),t.mapS3FileToOFile(e,!1),n.sah.flush(),n.flags&i.SQLITE_OPEN_DELETEONCLOSE&&t.deletePath(n.path)}catch(e){return t.storeErr(e,i.SQLITE_IOERR)}return 0},xDeviceCharacteristics:function(e){return i.SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN},xFileControl:function(e,t,n){return i.SQLITE_NOTFOUND},xFileSize:function(e,t){let n=C(e);n.log(`xFileSize`);let r=n.getOFileForS3File(e).sah.getSize()-c;return o.poke64(t,BigInt(r)),0},xLock:function(e,t){let n=C(e);n.log(`xLock ${t}`),n.storeErr();let r=n.getOFileForS3File(e);return r.lockType=t,0},xRead:function(e,t,n,r){let a=C(e);a.storeErr();let s=a.getOFileForS3File(e);a.log(`xRead ${s.path} ${n} @ ${r}`);try{let e=s.sah.read(o.heap8u().subarray(t,t+n),{at:c+Number(r)});return e<n?(o.heap8u().fill(0,t+e,t+n),i.SQLITE_IOERR_SHORT_READ):0}catch(e){return a.storeErr(e,i.SQLITE_IOERR)}},xSectorSize:function(e){return s},xSync:function(e,t){let n=C(e);n.log(`xSync ${t}`),n.storeErr();let r=n.getOFileForS3File(e);try{return r.sah.flush(),0}catch(e){return n.storeErr(e,i.SQLITE_IOERR)}},xTruncate:function(e,t){let n=C(e);n.log(`xTruncate ${t}`),n.storeErr();let r=n.getOFileForS3File(e);try{return r.sah.truncate(c+Number(t)),0}catch(e){return n.storeErr(e,i.SQLITE_IOERR)}},xUnlock:function(e,t){let n=C(e);n.log(`xUnlock`);let r=n.getOFileForS3File(e);return r.lockType=t,0},xWrite:function(e,n,r,a){let s=C(e);s.storeErr();let l=s.getOFileForS3File(e);s.log(`xWrite ${l.path} ${r} ${a}`);try{return r===l.sah.write(o.heap8u().subarray(n,n+r),{at:c+Number(a)})?0:t(`Unknown write() failure.`)}catch(e){return s.storeErr(e,i.SQLITE_IOERR)}}},E=new i.sqlite3_io_methods;E.$iVersion=1,e.vfs.installVfs({io:{struct:E,methods:T}});let D={xAccess:function(e,t,n,r){let i=b(e);i.storeErr();try{let e=i.getPath(t);o.poke32(r,+!!i.hasFilename(e))}catch{o.poke32(r,0)}return 0},xCurrentTime:function(e,t){return o.poke(t,2440587.5+new Date().getTime()/864e5,`double`),0},xCurrentTimeInt64:function(e,t){return o.poke(t,0xbfc83e532200+new Date().getTime(),`i64`),0},xDelete:function(e,t,n){let r=b(e);r.log(`xDelete ${o.cstrToJs(t)}`),r.storeErr();try{return r.deletePath(r.getPath(t)),0}catch(e){return r.storeErr(e),i.SQLITE_IOERR_DELETE}},xFullPathname:function(e,t,n,r){return o.cstrncpy(r,t,n)<n?0:i.SQLITE_CANTOPEN},xGetLastError:function(e,t,n){let r=b(e),a=r.popErr();if(r.log(`xGetLastError ${t} e =`,a),a){let e=o.scopedAllocPush();try{let[e,r]=o.scopedAllocCString(a.message,!0);o.cstrncpy(n,e,t),r>t&&o.poke8(n+t-1,0)}catch{return i.SQLITE_NOMEM}finally{o.scopedAllocPop(e)}}return a?a.sqlite3Rc||i.SQLITE_IOERR:0},xOpen:function(e,n,r,a,s){let c=b(e);try{a&=~u,c.log(`xOpen ${o.cstrToJs(n)} ${a}`);let e=n&&o.peek8(n)?c.getPath(n):f(),l=c.getSAHForPath(e);!l&&a&i.SQLITE_OPEN_CREATE&&(c.getFileCount()<c.getCapacity()?(l=c.nextAvailableSAH(),c.setAssociatedPath(l,e,a)):t(`SAH pool is full. Cannot create file`,e)),l||t(`file not found:`,e);let d={path:e,flags:a,sah:l};c.mapS3FileToOFile(r,d),d.lockType=i.SQLITE_LOCK_NONE;let p=new i.sqlite3_file(r);return p.$pMethods=E.pointer,p.dispose(),o.poke32(s,a),0}catch(e){return c.storeErr(e),i.SQLITE_CANTOPEN}}},O=function(t){e.capi.sqlite3_vfs_find(t)&&n(`VFS name is already registered:`,t);let r=new i.sqlite3_vfs,a=i.sqlite3_vfs_find(null),s=a?new i.sqlite3_vfs(a):null;return r.$iVersion=2,r.$szOsFile=i.sqlite3_file.structInfo.sizeof,r.$mxPathname=512,r.addOnDispose(r.$zName=o.allocCString(t),()=>x(r.pointer,0)),s&&(r.$xRandomness=s.$xRandomness,r.$xSleep=s.$xSleep,s.dispose()),!r.$xRandomness&&!D.xRandomness&&(D.xRandomness=function(e,t,n){let r=o.heap8u(),i=0;for(;i<t;++i)r[n+i]=Math.random()*255e3&255;return i}),!r.$xSleep&&!D.xSleep&&(D.xSleep=(e,t)=>0),e.vfs.installVfs({vfs:{struct:r,methods:D}}),r};class k{vfsDir;#e;#t;#n;#r=new Map;#i=new Map;#a=new Set;#o=new Map;#s=new Uint8Array(516);#c;#l;#u;constructor(e=Object.create(null)){this.#u=e.verbosity??h.verbosity,this.vfsName=e.name||h.name,this.#l=O(this.vfsName),x(this.#l.pointer,this),this.vfsDir=e.directory||`.`+this.vfsName,this.#c=new DataView(this.#s.buffer,this.#s.byteOffset),this.isReady=this.reset(!!(e.clearOnInit??h.clearOnInit)).then(()=>{if(this.$error)throw this.$error;return this.getCapacity()?Promise.resolve(void 0):this.addCapacity(e.initialCapacity||h.initialCapacity)})}#d(e,...t){this.#u>e&&g[e](this.vfsName+`:`,...t)}log(...e){this.#d(2,...e)}warn(...e){this.#d(1,...e)}error(...e){this.#d(0,...e)}getVfs(){return this.#l}getCapacity(){return this.#r.size}getFileCount(){return this.#i.size}getFileNames(){let e=[];for(let t of this.#i.keys())e.push(t);return e}async addCapacity(e){for(let t=0;t<e;++t){let e=f(),t=await(await this.#t.getFileHandle(e,{create:!0})).createSyncAccessHandle();this.#r.set(t,e),this.setAssociatedPath(t,``,0)}return this.getCapacity()}async reduceCapacity(e){let t=0;for(let n of Array.from(this.#a)){if(t===e||this.getFileCount()===this.getCapacity())break;let r=this.#r.get(n);n.close(),await this.#t.removeEntry(r),this.#r.delete(n),this.#a.delete(n),++t}return t}releaseAccessHandles(){for(let e of this.#r.keys())e.close();this.#r.clear(),this.#i.clear(),this.#a.clear()}async acquireAccessHandles(e=!1){let t=[];for await(let[e,n]of this.#t)n.kind===`file`&&t.push([e,n]);return Promise.all(t.map(async([t,n])=>{try{let r=await n.createSyncAccessHandle();if(this.#r.set(r,t),e)r.truncate(c),this.setAssociatedPath(r,``,0);else{let e=this.getAssociatedPath(r);e?this.#i.set(e,r):this.#a.add(r)}}catch(e){throw this.storeErr(e),this.releaseAccessHandles(),e}}))}getAssociatedPath(e){e.read(this.#s,{at:0});let t=this.#c.getUint32(512);if(this.#s[0]&&(t&i.SQLITE_OPEN_DELETEONCLOSE||(t&l)===0))return _(`Removing file with unexpected flags ${t.toString(16)}`,this.#s),this.setAssociatedPath(e,``,0),``;let n=new Uint32Array(2);e.read(n,{at:516});let r=this.computeDigest(this.#s,t);if(n.every((e,t)=>e===r[t])){let t=this.#s.findIndex(e=>e===0);return t===0&&e.truncate(c),t?p.decode(this.#s.subarray(0,t)):``}return _(`Disassociating file with bad digest.`),this.setAssociatedPath(e,``,0),``}setAssociatedPath(e,n,r){let i=m.encodeInto(n,this.#s);512<=i.written+1&&t(`Path too long:`,n),n&&r&&(r|=u),this.#s.fill(0,i.written,512),this.#c.setUint32(512,r);let a=this.computeDigest(this.#s,r);e.write(this.#s,{at:0}),e.write(a,{at:516}),e.flush(),n?(this.#i.set(n,e),this.#a.delete(e)):(e.truncate(c),this.#a.add(e))}computeDigest(e,t){if(t&u){let t=3735928559,n=1103547991;for(let r of e)t=Math.imul(t^r,2654435761),n=Math.imul(n^r,104729);return new Uint32Array([t>>>0,n>>>0])}return new Uint32Array([0,0])}async reset(e){await this.isReady;let t=await navigator.storage.getDirectory(),n;for(let e of this.vfsDir.split(`/`))e&&(n=t,t=await t.getDirectoryHandle(e,{create:!0}));return this.#e=t,this.#n=n,this.#t=await this.#e.getDirectoryHandle(d,{create:!0}),this.releaseAccessHandles(),this.acquireAccessHandles(e)}getPath(e){return o.isPtr(e)&&(e=o.cstrToJs(e)),(e instanceof URL?e:new URL(e,`file://localhost/`)).pathname}deletePath(e){let t=this.#i.get(e);return t&&(this.#i.delete(e),this.setAssociatedPath(t,``,0)),!!t}storeErr(e,t){return e&&(e.sqlite3Rc=t||i.SQLITE_IOERR,this.error(e)),this.$error=e,t}popErr(){let e=this.$error;return this.$error=void 0,e}nextAvailableSAH(){let[e]=this.#a.keys();return e}getOFileForS3File(e){return this.#o.get(e)}mapS3FileToOFile(e,t){t?(this.#o.set(e,t),w(e,this)):(this.#o.delete(e),w(e,!1))}hasFilename(e){return this.#i.has(e)}getSAHForPath(e){return this.#i.get(e)}async removeVfs(){if(!this.#l.pointer||!this.#t)return!1;i.sqlite3_vfs_unregister(this.#l.pointer),this.#l.dispose(),delete r[this.vfsName];try{this.releaseAccessHandles(),await this.#e.removeEntry(d,{recursive:!0}),this.#t=void 0,await this.#n.removeEntry(this.#e.name,{recursive:!0}),this.#e=this.#n=void 0}catch(t){e.config.error(this.vfsName,`removeVfs() failed with no recovery strategy:`,t)}return!0}pauseVfs(){return this.#o.size>0&&e.SQLite3Error.toss(i.SQLITE_MISUSE,`Cannot pause VFS`,this.vfsName,`because it has opened files.`),this.#r.size>0&&(i.sqlite3_vfs_unregister(this.vfsName),this.releaseAccessHandles()),this}isPaused(){return this.#r.size===0}async unpauseVfs(){return this.#r.size===0?this.acquireAccessHandles(!1).then(()=>i.sqlite3_vfs_register(this.#l,0),this):this}exportFile(e){let n=this.#i.get(e)||t(`File not found:`,e),r=n.getSize()-c,i=new Uint8Array(r>0?r:0);if(r>0){let e=n.read(i,{at:c});e!=r&&t(`Expected to read `+r+` bytes but read `+e+`.`)}return i}async importDbChunked(e,n){let r=this.#i.get(e)||this.nextAvailableSAH()||t(`No available handles to import to.`);r.truncate(0);let o=0,s,l=!1;try{for(;(s=await n())!==void 0;)s instanceof ArrayBuffer&&(s=new Uint8Array(s)),o===0&&s.byteLength>=15&&(a.affirmDbHeader(s),l=!0),r.write(s,{at:c+o}),o+=s.byteLength;if((o<512||o%512!=0)&&t(`Input size`,o,`is not correct for an SQLite database.`),!l){let e=new Uint8Array(20);r.read(e,{at:0}),a.affirmDbHeader(e)}r.write(new Uint8Array([1,1]),{at:4114})}catch(e){throw this.setAssociatedPath(r,``,0),e}return this.setAssociatedPath(r,e,i.SQLITE_OPEN_MAIN_DB),o}importDb(e,n){if(n instanceof ArrayBuffer)n=new Uint8Array(n);else if(n instanceof Function)return this.importDbChunked(e,n);let r=this.#i.get(e)||this.nextAvailableSAH()||t(`No available handles to import to.`),a=n.byteLength;(a<512||a%512!=0)&&t(`Byte array size is invalid for an SQLite db.`);for(let e=0;e<15;++e)`SQLite format 3`.charCodeAt(e)!==n[e]&&t(`Input does not contain an SQLite database header.`);let o=r.write(n,{at:c});return o==a?(r.write(new Uint8Array([1,1]),{at:4114}),this.setAssociatedPath(r,e,i.SQLITE_OPEN_MAIN_DB)):(this.setAssociatedPath(r,``,0),t(`Expected to write `+a+` bytes but wrote `+o+`.`)),o}}class A{#e;constructor(e){this.#e=e,this.vfsName=e.vfsName}async addCapacity(e){return this.#e.addCapacity(e)}async reduceCapacity(e){return this.#e.reduceCapacity(e)}getCapacity(){return this.#e.getCapacity(this.#e)}getFileCount(){return this.#e.getFileCount()}getFileNames(){return this.#e.getFileNames()}async reserveMinimumCapacity(e){let t=this.#e.getCapacity();return t<e?this.#e.addCapacity(e-t):t}exportFile(e){return this.#e.exportFile(e)}importDb(e,t){return this.#e.importDb(e,t)}async wipeFiles(){return this.#e.reset(!0)}unlink(e){return this.#e.deletePath(e)}async removeVfs(){return this.#e.removeVfs()}pauseVfs(){return this.#e.pauseVfs(),this}async unpauseVfs(){return this.#e.unpauseVfs().then(()=>this)}isPaused(){return this.#e.isPaused()}}let j=async()=>{let e=await navigator.storage.getDirectory(),n=`.opfs-sahpool-sync-check-`+f(),r=(await(await e.getFileHandle(n,{create:!0})).createSyncAccessHandle()).close();return await r,await e.removeEntry(n),r?.then&&t(`The local OPFS API is too old for opfs-sahpool:`,`it has an async FileSystemSyncAccessHandle.close() method.`),!0};e.installOpfsSAHPoolVfs=async function(t=Object.create(null)){t=Object.assign(Object.create(null),h,t||{});let n=t.name;if(t.$testThrowPhase1)throw t.$testThrowPhase1;if(r[n])try{return await r[n]}catch(e){if(t.forceReinitIfPreviouslyFailed)delete r[n];else throw e}return!globalThis.FileSystemHandle||!globalThis.FileSystemDirectoryHandle||!globalThis.FileSystemFileHandle||!globalThis.FileSystemFileHandle.prototype.createSyncAccessHandle||!navigator?.storage?.getDirectory?r[n]=Promise.reject(Error(`Missing required OPFS APIs.`)):r[n]=j().then(async function(){if(t.$testThrowPhase2)throw t.$testThrowPhase2;let n=new k(t);return n.isReady.then(async()=>{let t=new A(n);if(e.oo1){let r=e.oo1,i=n.getVfs(),a=function(...e){let t=r.DB.dbCtorHelper.normalizeArgs(...e);t.vfs=i.$zName,r.DB.dbCtorHelper.call(this,t)};a.prototype=Object.create(r.DB.prototype),t.OpfsSAHPoolDb=a}return n.log(`VFS initialized.`),t}).catch(async e=>{throw await n.removeVfs().catch(()=>{}),e})}).catch(e=>r[n]=Promise.reject(e))}}),n!==void 0){let e=Object.assign(Object.create(null),{exports:Wt===void 0?n.asm:Wt,memory:n.wasmMemory},globalThis.sqlite3ApiConfig||{});globalThis.sqlite3ApiConfig=e;let t;try{t=globalThis.sqlite3ApiBootstrap()}catch(e){throw console.error(`sqlite3ApiBootstrap() error:`,e),e}finally{delete globalThis.sqlite3ApiBootstrap,delete globalThis.sqlite3ApiConfig}n.sqlite3=t}else console.warn(`This is not running in an Emscripten module context, so`,`globalThis.sqlite3ApiBootstrap() is _not_ being called due to lack`,`of config info for the WASM environment.`,`It must be called manually.`)},t=D?n:new Promise((e,t)=>{_=e,y=t}),t};Em=(function(){let e=Em;if(!e)throw Error(`Expecting globalThis.sqlite3InitModule to be defined by the Emscripten build.`);let t=globalThis.sqlite3InitModuleState=Object.assign(Object.create(null),{moduleScript:globalThis?.document?.currentScript,isWorker:typeof WorkerGlobalScope<`u`,location:globalThis.location,urlParams:globalThis?.location?.href?new URL(globalThis.location.href).searchParams:new URLSearchParams});if(t.debugModule=t.urlParams.has(`sqlite3.debugModule`)?(...e)=>console.warn(`sqlite3.debugModule:`,...e):()=>{},t.urlParams.has(`sqlite3.dir`))t.sqlite3Dir=t.urlParams.get(`sqlite3.dir`)+`/`;else if(t.moduleScript){let e=t.moduleScript.src.split(`/`);e.pop(),t.sqlite3Dir=e.join(`/`)+`/`}if(globalThis.sqlite3InitModule=function n(...r){return e(...r).then(e=>{e.runSQLite3PostLoadInit(e);let r=e.sqlite3;r.scriptInfo=t,n.__isUnderTest&&(r.__isUnderTest=!0);let i=r.asyncPostInit;return delete r.asyncPostInit,i()}).catch(e=>{throw console.error(`Exception loading sqlite3 module:`,e),e})},globalThis.sqlite3InitModule.ready=e.ready,globalThis.sqlite3InitModuleState.moduleScript){let e=globalThis.sqlite3InitModuleState,t=e.moduleScript.src.split(`/`);t.pop(),e.scriptDir=t.join(`/`)+`/`}return t.debugModule(`sqlite3InitModuleState =`,t),globalThis.sqlite3InitModule})();var Dm=Em;globalThis.sqlite3Worker1Promiser=function e(t=e.defaultConfig){if(arguments.length===1&&typeof arguments[0]==`function`){let n=t;t=Object.assign(Object.create(null),e.defaultConfig),t.onready=n}else t=Object.assign(Object.create(null),e.defaultConfig,t);let n=Object.create(null),r=function(){},i=t.onerror||r,a=t.debug||r,o=t.generateMessageId?void 0:Object.create(null),s=t.generateMessageId||function(e){return e.type+`#`+(o[e.type]=(o[e.type]||0)+1)},c=(...e)=>{throw Error(e.join(` `))};t.worker||(t.worker=e.defaultConfig.worker),typeof t.worker==`function`&&(t.worker=t.worker());let l,u;return t.worker.onmessage=function(e){e=e.data,a(`worker1.onmessage`,e);let r=n[e.messageId];if(!r){if(e&&e.type===`sqlite3-api`&&e.result===`worker1-ready`){t.onready&&t.onready(u);return}if(r=n[e.type],r&&r.onrow){r.onrow(e);return}t.onunhandled?t.onunhandled(arguments[0]):i(`sqlite3Worker1Promiser() unhandled worker message:`,e);return}switch(delete n[e.messageId],e.type){case`error`:r.reject(e);return;case`open`:l||=e.dbId;break;case`close`:e.dbId===l&&(l=void 0)}try{r.resolve(e)}catch(e){r.reject(e)}},u=function(){let e;arguments.length===1?e=arguments[0]:arguments.length===2?(e=Object.create(null),e.type=arguments[0],e.args=arguments[1],e.dbId=e.args.dbId):c(`Invalid arguments for sqlite3Worker1Promiser()-created factory.`),!e.dbId&&e.type!==`open`&&(e.dbId=l),e.messageId=s(e),e.departureTime=performance.now();let r=Object.create(null);r.message=e;let i;e.type===`exec`&&e.args&&(typeof e.args.callback==`function`?(i=e.messageId+`:row`,r.onrow=e.args.callback,e.args.callback=i,n[i]=r):typeof e.args.callback==`string`&&c(`exec callback may not be a string when using the Promise interface.`));let o=new Promise(function(i,o){r.resolve=i,r.reject=o,n[e.messageId]=r,a(`Posting`,e.type,`message to Worker dbId=`+(l||`default`)+`:`,e),t.worker.postMessage(e)});return i&&(o=o.finally(()=>delete n[i])),o}},globalThis.sqlite3Worker1Promiser.defaultConfig={worker:function(){return new Worker(new URL(`sqlite3-worker1-bundler-friendly.mjs`,import.meta.url),{type:`module`})},onerror:(...e)=>console.error(`worker1 promiser error`,...e)},sqlite3Worker1Promiser.v2=function(e){let t;typeof e==`function`?(t=e,e={}):typeof e?.onready==`function`&&(t=e.onready,delete e.onready);let n=Object.create(null);e=Object.assign(e||Object.create(null),{onready:async function(e){try{t&&await t(e),n.resolve(e)}catch(e){n.reject(e)}}});let r=new Promise(function(e,t){n.resolve=e,n.reject=t});try{this.original(e)}catch(e){n.reject(e)}return r}.bind({original:sqlite3Worker1Promiser}),sqlite3Worker1Promiser.v2,globalThis.sqlite3Worker1Promiser;var Om=Dm,km=function(e,t,n){if(t!=null){if(typeof t!=`object`&&typeof t!=`function`)throw TypeError(`Object expected.`);var r,i;if(n){if(!Symbol.asyncDispose)throw TypeError(`Symbol.asyncDispose is not defined.`);r=t[Symbol.asyncDispose]}if(r===void 0){if(!Symbol.dispose)throw TypeError(`Symbol.dispose is not defined.`);r=t[Symbol.dispose],n&&(i=r)}if(typeof r!=`function`)throw TypeError(`Object not disposable.`);i&&(r=function(){try{i.call(this)}catch(e){return Promise.reject(e)}}),e.stack.push({value:t,dispose:r,async:n})}else n&&e.stack.push({async:!0});return t},Am=(function(e){return function(t){function n(n){t.error=t.hasError?new e(n,t.error,`An error was suppressed during disposal.`):n,t.hasError=!0}var r,i=0;function a(){for(;r=t.stack.pop();)try{if(!r.async&&i===1)return i=0,t.stack.push(r),Promise.resolve().then(a);if(r.dispose){var e=r.dispose.call(r.value);if(r.async)return i|=2,Promise.resolve(e).then(a,function(e){return n(e),a()})}else i|=1}catch(e){n(e)}if(i===1)return t.hasError?Promise.reject(t.error):Promise.resolve();if(t.hasError)throw t.error}return a()}})(typeof SuppressedError==`function`?SuppressedError:function(e,t,n){var r=Error(n);return r.name=`SuppressedError`,r.error=e,r.suppressed=t,r});globalThis.sqlite3ApiConfig={warn:e=>{typeof e==`string`&&e.startsWith(`Ignoring inability to install OPFS sqlite3_vfs`)||console.warn(e)}};const jm=Om(),Mm=`evolu1.db`,Nm=(e,t)=>async()=>{let n={stack:[],error:void 0,hasError:!1};try{let r=await jm,i=km(n,new DisposableStack,!1),a=e=>i.adopt(e,e=>{e.close()}),o=!1,s=async e=>{let t=await r.installOpfsSAHPoolVfs(e);return t.isPaused()&&await t.unpauseVfs(),i.defer(()=>{o&&t.unlink(`/${Mm}`),t.pauseVfs()}),t},c;switch(t?.mode){case`memory`:c=a(new r.oo1.DB(`:memory:`));break;case`encrypted`:r.capi.sqlite3mc_vfs_create(`opfs`,1),c=a(new(await(s({directory:`.${e}`}))).OpfsSAHPoolDb(`file:${Mm}?vfs=multipleciphers-opfs-sahpool`)),c.exec(`
          PRAGMA cipher = 'sqlcipher';
          PRAGMA key = "x'${Ce(t.encryptionKey)}'";
        `);break;case void 0:c=a(new(await(s({name:e}))).OpfsSAHPoolDb(`file:${Mm}`));break;default:F(t)}let l=i.use(Ha(e=>c.prepare(e),e=>{e.finalize()})),u=i.move();return G({exec:e=>{let t=l.get(e);if(t){e.parameters.length>0&&t.bind(e.parameters);let n=[];for(;t.step();)n.push(t.get({}));return t.reset(),{rows:n,changes:c.changes()}}return{rows:c.exec(e.sql,{returnValue:`resultRows`,rowMode:`object`,bind:e.parameters}),changes:c.changes()}},export:()=>r.capi.sqlite3_js_db_export(c),deleteDatabase:()=>{o=!0,u.dispose()},[Symbol.dispose]:()=>{u.dispose()}})}catch(e){n.error=e,n.hasError=!0}finally{Am(n)}};function Pm(e){let t=e=>{globalThis.reportError(e)};return ka(e===void 0?{reportDefect:t}:{reportDefect:t,...e})}var Fm=function(e,t,n){if(t!=null){if(typeof t!=`object`&&typeof t!=`function`)throw TypeError(`Object expected.`);var r,i;if(n){if(!Symbol.asyncDispose)throw TypeError(`Symbol.asyncDispose is not defined.`);r=t[Symbol.asyncDispose]}if(r===void 0){if(!Symbol.dispose)throw TypeError(`Symbol.dispose is not defined.`);r=t[Symbol.dispose],n&&(i=r)}if(typeof r!=`function`)throw TypeError(`Object not disposable.`);i&&(r=function(){try{i.call(this)}catch(e){return Promise.reject(e)}}),e.stack.push({value:t,dispose:r,async:n})}else n&&e.stack.push({async:!0});return t},Im=(function(e){return function(t){function n(n){t.error=t.hasError?new e(n,t.error,`An error was suppressed during disposal.`):n,t.hasError=!0}var r,i=0;function a(){for(;r=t.stack.pop();)try{if(!r.async&&i===1)return i=0,t.stack.push(r),Promise.resolve().then(a);if(r.dispose){var e=r.dispose.call(r.value);if(r.async)return i|=2,Promise.resolve(e).then(a,function(e){return n(e),a()})}else i|=1}catch(e){n(e)}if(i===1)return t.hasError?Promise.reject(t.error):Promise.resolve();if(t.hasError)throw t.error}return a()}})(typeof SuppressedError==`function`?SuppressedError:function(e,t,n){var r=Error(n);return r.name=`SuppressedError`,r.error=e,r.suppressed=t,r});const Lm=()=>{let e={stack:[],error:void 0,hasError:!1};try{let t=new globalThis.MessageChannel,n=Fm(e,new DisposableStack,!1),r=n.use(Hm(t.port1)),i=n.use(Hm(t.port2)),a=n.move();return{port1:r,port2:i,[Symbol.dispose]:()=>a.dispose()}}catch(t){e.error=t,e.hasError=!0}finally{Im(e)}},Rm=e=>Hm(e),zm=e=>{let t={stack:[],error:void 0,hasError:!1};try{let n=new globalThis.BroadcastChannel(e),r=Fm(t,new DisposableStack,!1),i=!1;r.defer(()=>{i=!0,n.onmessage=null,n.close()});let a=null;return L({postMessage:e=>{n.postMessage(e)},get onMessage(){return i?null:a},set onMessage(e){i||(a=e,n.onmessage=e?t=>{e(t.data)}:null)}},r)}catch(e){t.error=e,t.hasError=!0}finally{Im(t)}},Bm=e=>Hm(e),Vm=()=>{let e=$r();return{console:Zr({output:e}),consoleStoreOutputEntry:e.entry,createBroadcastChannel:zm,createMessageChannel:Lm,createMessagePort:Rm}},Hm=e=>{let t=null;return{postMessage:(t,n)=>{n==null?e.postMessage(t):e.postMessage(t,[...n])},get onMessage(){return t},set onMessage(n){t=n,e.onmessage=n?e=>{n(e.data)}:null},native:e,[Symbol.dispose]:()=>{e.onmessage=null,`terminate`in e?e.terminate():e.close()}}};e(),Pm({...Vm(),createSqliteDriver:Nm,lockManager:globalThis.navigator.locks,randomBytes:bi()})(pm(Bm(self)));
