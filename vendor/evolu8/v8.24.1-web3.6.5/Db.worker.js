// @ts-nocheck
// Generated from locked Evolu 8 packages; run npm run vendor:evolu8:check.
const e=()=>{t(),m()},t=()=>{d();let e=u(`dispose`,`Symbol.dispose`),t=u(`asyncDispose`,`Symbol.asyncDispose`);typeof globalThis.DisposableStack!=`function`&&i(globalThis,`DisposableStack`,f(e)),typeof globalThis.AsyncDisposableStack!=`function`&&i(globalThis,`AsyncDisposableStack`,p(e,t))},n=`An error was suppressed during disposal.`,r=(e,t)=>`Cannot call ${e}.prototype.${t} on an already-disposed DisposableStack`,i=(e,t,n)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:!0,value:n})},a=(e,t,n)=>{i(e,t,Object.getOwnPropertyDescriptor(e,n)?.value)},o=(e,t)=>{if(e)throw ReferenceError(t)},s=(e,t)=>new globalThis.SuppressedError(e,t,n),c=e=>{if((typeof e!=`object`||!e)&&typeof e!=`function`)throw TypeError(`Disposable value must be an object or function.`);return e},l=(e,t)=>{let n=e[t];if(n!==void 0){if(typeof n!=`function`)throw TypeError(`Disposable method must be a function.`);return n}},u=(e,t)=>{let n=globalThis.Symbol,r=Object.getOwnPropertyDescriptor(n,e)?.value,i=typeof r==`symbol`?r:void 0;if(i!=null)return i;let a=Symbol(t);return Object.defineProperty(n,e,{configurable:!1,enumerable:!1,writable:!1,value:a}),a},d=()=>{if(typeof globalThis.SuppressedError==`function`)return;class e extends Error{error;suppressed;constructor(e,t,r){super(r??n),this.name=`SuppressedError`,this.error=e,this.suppressed=t}}i(globalThis,`SuppressedError`,e)},f=e=>{class t{#e=!1;#t=[];get disposed(){return this.#e}use(t){if(o(this.#e,r(`DisposableStack`,`use`)),t==null)return t;let n=c(t),i=l(n,e);if(i==null)throw TypeError(`Resource does not implement Symbol.dispose.`);return this.#t.push({dispose:()=>{i.call(n)}}),t}adopt(e,t){if(o(this.#e,r(`DisposableStack`,`adopt`)),typeof t!=`function`)throw TypeError(`onDispose must be a function.`);return this.#t.push({dispose:()=>{t(e)}}),e}defer(e){if(o(this.#e,r(`DisposableStack`,`defer`)),typeof e!=`function`)throw TypeError(`onDispose must be a function.`);this.#t.push({dispose:()=>{e()}})}move(){o(this.#e,r(`DisposableStack`,`move`));let e=new t;return e.#t=this.#t,this.#t=[],this.#e=!0,e}dispose(){if(this.#e)return;this.#e=!0;let e=this.#t;this.#t=[];let t,n=!1;for(let r=e.length-1;r>=0;r--)try{e[r].dispose()}catch(e){t=n?s(e,t):e,n=!0}if(n)throw t}}return a(t.prototype,e,`dispose`),Object.defineProperty(t.prototype,Symbol.toStringTag,{configurable:!0,enumerable:!1,writable:!1,value:`DisposableStack`}),t},p=(e,t)=>{class n{#e=!1;#t=[];get disposed(){return this.#e}use(n){if(o(this.#e,r(`AsyncDisposableStack`,`use`)),n==null)return n;let i=c(n),a=l(i,t);if(a!=null)return this.#t.push({dispose:async()=>{await a.call(i)}}),n;let s=l(i,e);if(s!=null)return this.#t.push({dispose:()=>Promise.resolve().then(()=>{s.call(i)})}),n;throw TypeError(`Resource does not implement Symbol.asyncDispose or Symbol.dispose.`)}adopt(e,t){if(o(this.#e,r(`AsyncDisposableStack`,`adopt`)),typeof t!=`function`)throw TypeError(`onDisposeAsync must be a function.`);return this.#t.push({dispose:()=>Promise.resolve().then(()=>t(e))}),e}defer(e){if(o(this.#e,r(`AsyncDisposableStack`,`defer`)),typeof e!=`function`)throw TypeError(`onDisposeAsync must be a function.`);this.#t.push({dispose:()=>Promise.resolve().then(()=>e())})}move(){o(this.#e,r(`AsyncDisposableStack`,`move`));let e=new n;return e.#t=this.#t,this.#t=[],this.#e=!0,e}async disposeAsync(){if(this.#e)return;this.#e=!0;let e=this.#t;this.#t=[];let t,n=!1;for(let r=e.length-1;r>=0;r--)try{await e[r].dispose()}catch(e){t=n?s(e,t):e,n=!0}if(n)throw t}}return a(n.prototype,t,`disposeAsync`),Object.defineProperty(n.prototype,Symbol.toStringTag,{configurable:!0,enumerable:!1,writable:!1,value:`AsyncDisposableStack`}),n},m=()=>{let e=function(e,t){return this.has(e)||this.set(e,t),this.get(e)},t=function(e,t){return this.has(e)||this.set(e,t(e)),this.get(e)};typeof Map.prototype.getOrInsert!=`function`&&i(Map.prototype,`getOrInsert`,e),typeof Map.prototype.getOrInsertComputed!=`function`&&i(Map.prototype,`getOrInsertComputed`,t),typeof WeakMap.prototype.getOrInsert!=`function`&&i(WeakMap.prototype,`getOrInsert`,e),typeof WeakMap.prototype.getOrInsertComputed!=`function`&&i(WeakMap.prototype,`getOrInsertComputed`,t)},h=/*#__PURE__*/ Object.freeze(/*#__PURE__*/ Object.create(null)),g=e=>{if(typeof e!=`object`||!e)return!1;let t=Object.getPrototypeOf(e);return t===null||t===h?!0:t===Object.prototype?`hasOwnProperty`in t&&`isPrototypeOf`in t:Object.getPrototypeOf(t)===null&&(Object.hasOwn(t,`hasOwnProperty`)&&Object.hasOwn(t,`isPrototypeOf`)||Object.isFrozen(t)&&Reflect.ownKeys(t).length===0)},_=e=>typeof e==`function`,v=e=>Object.entries(e),y=(e,t)=>{let n=Object.create(null);for(let r in e)n[r]=t(e[r],r);return n};function b(e){let t=Object.create(null);return e===void 0?t:Object.assign(t,e)}const ee=(e,t)=>Object.hasOwn(e,t)?e[t]:void 0,x=(e,t)=>Object.is(e,t),S=(e,t)=>e===t||Object.is(e,t),C=x,w=x,T=e=>(t,n)=>{if(t===n)return!0;if(t.length!==n.length)return!1;for(let r=0;r<t.length;r++)if(!e(t[r],n[r]))return!1;return!0},E=/*#__PURE__*/ T(x),D=/*#__PURE__*/ T(w),O=D,k=e=>(t,n)=>{if(t===n)return!0;for(let r in e)if(!e[r](t[r],n[r]))return!1;return!0},A=(e,t,n={})=>{if(e)return;let r=Object.hasOwn(n,`actual`)?n.actual:e,i=!Object.hasOwn(n,`expected`)||n.expected,a=n.operator??`==`,o=n.stackStartFn??A;if(j!==void 0){let e=new j.AssertionError({message:t,actual:r,expected:i,operator:n.diff===`full`?`deepStrictEqual`:a,diff:n.diff,stackStartFn:o});throw n.diff===`full`&&(e.operator=a),n.cause!==void 0&&Object.defineProperty(e,"cause",{configurable:!0,value:n.cause,writable:!0}),e}let s=Object.assign(Error(t,n.cause===void 0?void 0:{cause:n.cause}),{name:`AssertionError`,code:`ERR_ASSERTION`,actual:r,expected:i,generatedMessage:!1,operator:a});throw Error.captureStackTrace?.(s,o),s},j=globalThis.process?.getBuiltinModule?.(`node:assert/strict`),M=(e,t=`Expected value to be non-nullable.`)=>{A(e!=null,t,{actual:e,expected:null,operator:`!=`,stackStartFn:M})},N=(e,t=`Expected value not to be undefined.`)=>{A(e!==void 0,t,{actual:e,expected:void 0,operator:`notStrictEqual`,stackStartFn:N})},P=(e,t=`Expected a non-empty readonly array.`)=>{A(e.length>0,t,{actual:e.length,expected:0,operator:`>`,stackStartFn:P})},F=e=>{A(!e.disposed,`Cannot use a disposed object.`,{actual:e.disposed,expected:!1,operator:`==`,stackStartFn:F})},te=e=>{throw Error(`exhaustiveCheck unhandled case: ${JSON.stringify(e)}`)},I=e=>e;function ne(e,t=null){let n=e,r=t?.move()??new DisposableStack;for(let[t,i]of Object.entries(e))_(i)&&(n[t]=(...e)=>(F(r),i(...e)));return r instanceof AsyncDisposableStack?e[Symbol.asyncDispose]=()=>r.disposeAsync():e[Symbol.dispose]=()=>r.dispose(),e}const re=e=>()=>e,ie=/*#__PURE__*/ re(!1),ae=/* @__PURE__ */ re(void 0),oe=[],se=e=>Array(e);function ce(e){return e.length>0}const le=(e,t)=>[...e,t];function ue(e,t){return e.map(t)}function de(e){if(e.length===0)return oe;let t=Math.min(...ue(e,e=>e.length)),n=se(t);for(let r=0;r<t;r++)n[r]=ue(e,e=>e[r]);return n}const fe=e=>e[0]
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
;function pe(e){return e instanceof Uint8Array||ArrayBuffer.isView(e)&&e.constructor.name===`Uint8Array`&&`BYTES_PER_ELEMENT`in e&&e.BYTES_PER_ELEMENT===1}const me=e=>e?`"${e}" `:``;function he(e,t=``){if(typeof e!=`boolean`)throw TypeError(me(t)+`expected boolean, got type=`+typeof e);return e}function ge(e,t=``){if(typeof e!=`number`)throw TypeError(me(t)+`expected number, got `+typeof e);if(!Number.isSafeInteger(e)||e<0)throw RangeError(me(t)+`expected integer >= 0, got `+e);return e}function _e(e,t,n=``){if(pe(e)&&(t===void 0||e.length===t))return e;t!==void 0&&ge(t,`length`);let r=pe(e),i=t===void 0?``:` of length ${t}`,a=r?`length=${e.length}`:`type=${typeof e}`,o=me(n)+`expected Uint8Array`+i+`, got `+a;throw r?RangeError(o):TypeError(o)}const ve=(e,t)=>{if(typeof e!=`object`||!e||Array.isArray(e))throw TypeError(t===`object`?`expected valid options object`:`"${t}" expected object, got type=${typeof e}`)};function ye(e,t=!0){if(e.destroyed)throw Error(`hash was destroyed`);if(t&&e.finished)throw Error(`digest() was already called`)}function be(e,t){_e(e,void 0,`output`);let n=t.outputLen;if(!(e.length>=n))throw RangeError(`"output" expected length >= `+n)}function xe(e){return new Uint32Array(e.buffer,e.byteOffset,Math.floor(e.byteLength/4))}function L(...e){for(let t=0;t<e.length;t++)e[t].fill(0)}function Se(e){return new DataView(e.buffer,e.byteOffset,e.byteLength)}const Ce=new Uint8Array(new Uint32Array([287454020]).buffer)[0]===68;function we(e){return e<<24&4278190080|e<<8&16711680|e>>>8&65280|e>>>24&255}function Te(e){for(let t=0;t<e.length;t++)e[t]=we(e[t]);return e}const Ee=Ce?e=>e:Te,De=typeof Uint8Array.from([]).toHex==`function`&&typeof Uint8Array.fromHex==`function`,Oe=/* @__PURE__ */ Array.from({length:256},(e,t)=>t.toString(16).padStart(2,`0`));function ke(e){if(_e(e),De)return e.toHex();let t=``;for(let n=0;n<e.length;n++)t+=Oe[e[n]];return t}function Ae(e){return e>=48&&e<=57?e-48:e>=65&&e<=70?e-55:e>=97&&e<=102?e-87:void 0}function je(e){if(typeof e!=`string`)throw TypeError(`hex string expected, got `+typeof e);if(De)try{return Uint8Array.fromHex(e)}catch(e){throw e instanceof SyntaxError?RangeError(e.message):e}let t=e.length,n=t/2;if(t%2)throw RangeError(`hex string expected, got unpadded hex of length `+t);let r=new Uint8Array(n);for(let t=0,i=0;t<n;t++,i+=2){let n=Ae(e.charCodeAt(i)),a=Ae(e.charCodeAt(i+1));if(n===void 0||a===void 0){let t=e[i]+e[i+1];throw RangeError(`hex string expected, got non-hex character "`+t+`" at index `+i)}r[t]=n*16+a}return r}function R(e){if(typeof e!=`string`)throw TypeError(`string expected`);return new Uint8Array(new TextEncoder().encode(e))}function Me(e){return new TextDecoder().decode(e)}function Ne(e,t){return!e.byteLength||!t.byteLength?!1:e.buffer===t.buffer&&e.byteOffset<t.byteOffset+t.byteLength&&t.byteOffset<e.byteOffset+e.byteLength}function Pe(e,t){if(Ne(e,t)&&e.byteOffset<t.byteOffset)throw Error(`complex overlap of input and output is not supported`)}function Fe(e,t){return ve(e,`defaults`),ve(t,`opts`),Object.assign(e,t)}function Ie(e,t){if(e=_e(e),t=_e(t),e.length!==t.length)return!1;let n=0;for(let r=0;r<e.length;r++)n|=e[r]^t[r];return n===0}function Le(e,t,n){let r=t,i=n||(()=>[]),a=(e,t)=>r(t,...i(e)).update(e).digest(),o=r(new Uint8Array(e),...i(/* @__PURE__ */ new Uint8Array));return a.outputLen=o.outputLen,a.blockLen=o.blockLen,a.create=(e,...t)=>r(e,...t),a}const Re=(e,t)=>{function n(n,...r){if(_e(n,void 0,`key`),e.nonceLength!==void 0){let t=r[0];_e(t,e.varSizeNonce?void 0:e.nonceLength,`nonce`)}let i=e.tagLength,a=e.nonceLength===void 0?0:1;if(!e.withAAD){for(let e=a;e<r.length;e++)if(pe(r[e]))throw Error(`AAD not supported`)}e.withAAD&&r[a]!==void 0&&_e(r[a],void 0,`AAD`);let o=t(n,...r),s=(e,t)=>{if(t!==void 0){if(e!==2)throw Error(`cipher output not supported`);_e(t,void 0,`output`)}},c=!1;return{encrypt(e,t){if(c)throw Error(`cannot encrypt() twice with same key + nonce`);return c=!0,_e(e,void 0,`data`),s(o.encrypt.length,t),o.encrypt(e,t)},decrypt(e,t){if(_e(e,void 0,`data`),i&&e.length<i)throw Error(`"ciphertext" expected length >= tagLength=`+i);return s(o.decrypt.length,t),o.decrypt(e,t)}}}return Object.assign(n,e),n};function ze(e,t,n=!0){if(t===void 0)return new Uint8Array(e);if(_e(t,e,`output`),n&&!Ve(t))throw Error(`invalid output, must be aligned`);return t}function Be(e,t,n){ge(e),ge(t),he(n);let r=/* @__PURE__ */ new Uint8Array(16),i=Se(r);return i.setBigUint64(0,BigInt(t),n),i.setBigUint64(8,BigInt(e),n),r}function Ve(e){return e.byteOffset%4==0}function He(e){return Uint8Array.from(_e(e))}function z(e){return e===void 0?Ue:{ok:!0,value:e}}const Ue={ok:!0,value:void 0},B=e=>({ok:!1,error:e}),We=e=>{if(e.ok)return e.value;throw Error(`getOrThrow`,{cause:e.error})},Ge=e=>e.ok?e.value:null,Ke=e=>e.value;function qe(e,t){try{return z(e())}catch(e){return B(t?t(e):e)}}async function Je(e,t){try{return z(await e())}catch(e){return B(t?t(e):e)}}const Ye=/* @__PURE__ */ BigInt(2**32-1),Xe=/* @__PURE__ */ BigInt(32);function Ze(e,t=!1){return t?{h:Number(e&Ye),l:Number(e>>Xe&Ye)}:{h:Number(e>>Xe&Ye)|0,l:Number(e&Ye)|0}}function Qe(e,t=!1){let n=e.length,r=new Uint32Array(n),i=new Uint32Array(n);for(let a=0;a<n;a++){let{h:n,l:o}=Ze(e[a],t);[r[a],i[a]]=[n,o]}return[r,i]}const $e=e=>e?`"${e}" `:``;function et(e,t=``){if(typeof e!=`number`)throw TypeError($e(t)+`expected number, got `+typeof e);if(!Number.isSafeInteger(e)||e<0)throw RangeError($e(t)+`expected integer >= 0, got `+e);return e}new Uint8Array(new Uint32Array([287454020]).buffer)[0],typeof Uint8Array.from([]).toHex==`function`&&Uint8Array.fromHex;function tt(e=32){et(e,`bytesLength`);let t=typeof globalThis==`object`?globalThis.crypto:null;if(typeof t?.getRandomValues!=`function`)throw Error(`crypto.getRandomValues must be defined`);if(e>65536)throw RangeError(`"bytesLength" expected <= 65536, got ${e}`);return t.getRandomValues(new Uint8Array(e))}const nt=/* @__PURE__ */ Qe((/* @__PURE__ */ `0x428a2f98d728ae22.0x7137449123ef65cd.0xb5c0fbcfec4d3b2f.0xe9b5dba58189dbbc.0x3956c25bf348b538.0x59f111f1b605d019.0x923f82a4af194f9b.0xab1c5ed5da6d8118.0xd807aa98a3030242.0x12835b0145706fbe.0x243185be4ee4b28c.0x550c7dc3d5ffb4e2.0x72be5d74f27b896f.0x80deb1fe3b1696b1.0x9bdc06a725c71235.0xc19bf174cf692694.0xe49b69c19ef14ad2.0xefbe4786384f25e3.0x0fc19dc68b8cd5b5.0x240ca1cc77ac9c65.0x2de92c6f592b0275.0x4a7484aa6ea6e483.0x5cb0a9dcbd41fbd4.0x76f988da831153b5.0x983e5152ee66dfab.0xa831c66d2db43210.0xb00327c898fb213f.0xbf597fc7beef0ee4.0xc6e00bf33da88fc2.0xd5a79147930aa725.0x06ca6351e003826f.0x142929670a0e6e70.0x27b70a8546d22ffc.0x2e1b21385c26c926.0x4d2c6dfc5ac42aed.0x53380d139d95b3df.0x650a73548baf63de.0x766a0abb3c77b2a8.0x81c2c92e47edaee6.0x92722c851482353b.0xa2bfe8a14cf10364.0xa81a664bbc423001.0xc24b8b70d0f89791.0xc76c51a30654be30.0xd192e819d6ef5218.0xd69906245565a910.0xf40e35855771202a.0x106aa07032bbd1b8.0x19a4c116b8d2d0c8.0x1e376c085141ab53.0x2748774cdf8eeb99.0x34b0bcb5e19b48a8.0x391c0cb3c5c95a63.0x4ed8aa4ae3418acb.0x5b9cca4f7763e373.0x682e6ff3d6b2b8a3.0x748f82ee5defb2fc.0x78a5636f43172f60.0x84c87814a1f0ab72.0x8cc702081a6439ec.0x90befffa23631e28.0xa4506cebde82bde9.0xbef9a3f7b2c67915.0xc67178f2e372532b.0xca273eceea26619c.0xd186b8c721c0c207.0xeada7dd6cde0eb1e.0xf57d4f7fee6ed178.0x06f067aa72176fba.0x0a637dc5a2c898a6.0x113f9804bef90dae.0x1b710b35131c471b.0x28db77f523047d84.0x32caab7b40c72493.0x3c9ebe0a15c9bebc.0x431d67c49c100d4c.0x4cc5d4becb3e42b6.0x597f299cfc657e2a.0x5fcb6fab3ad6faec.0x6c44198c4a475817`.split(`.`)).map(e=>BigInt(e)));nt[0],nt[1],new Uint8Array(new Uint32Array([287454020]).buffer)[0],typeof Uint8Array.from([]).toHex==`function`&&Uint8Array.fromHex;const rt=/* @__PURE__ */ BigInt(2**32-1),it=/* @__PURE__ */ BigInt(32);function at(e,t=!1){return t?{h:Number(e&rt),l:Number(e>>it&rt)}:{h:Number(e>>it&rt)|0,l:Number(e&rt)|0}}function ot(e,t=!1){let n=e.length,r=new Uint32Array(n),i=new Uint32Array(n);for(let a=0;a<n;a++){let{h:n,l:o}=at(e[a],t);[r[a],i[a]]=[n,o]}return[r,i]}const st=/* @__PURE__ */ ot((/* @__PURE__ */ `0x428a2f98d728ae22.0x7137449123ef65cd.0xb5c0fbcfec4d3b2f.0xe9b5dba58189dbbc.0x3956c25bf348b538.0x59f111f1b605d019.0x923f82a4af194f9b.0xab1c5ed5da6d8118.0xd807aa98a3030242.0x12835b0145706fbe.0x243185be4ee4b28c.0x550c7dc3d5ffb4e2.0x72be5d74f27b896f.0x80deb1fe3b1696b1.0x9bdc06a725c71235.0xc19bf174cf692694.0xe49b69c19ef14ad2.0xefbe4786384f25e3.0x0fc19dc68b8cd5b5.0x240ca1cc77ac9c65.0x2de92c6f592b0275.0x4a7484aa6ea6e483.0x5cb0a9dcbd41fbd4.0x76f988da831153b5.0x983e5152ee66dfab.0xa831c66d2db43210.0xb00327c898fb213f.0xbf597fc7beef0ee4.0xc6e00bf33da88fc2.0xd5a79147930aa725.0x06ca6351e003826f.0x142929670a0e6e70.0x27b70a8546d22ffc.0x2e1b21385c26c926.0x4d2c6dfc5ac42aed.0x53380d139d95b3df.0x650a73548baf63de.0x766a0abb3c77b2a8.0x81c2c92e47edaee6.0x92722c851482353b.0xa2bfe8a14cf10364.0xa81a664bbc423001.0xc24b8b70d0f89791.0xc76c51a30654be30.0xd192e819d6ef5218.0xd69906245565a910.0xf40e35855771202a.0x106aa07032bbd1b8.0x19a4c116b8d2d0c8.0x1e376c085141ab53.0x2748774cdf8eeb99.0x34b0bcb5e19b48a8.0x391c0cb3c5c95a63.0x4ed8aa4ae3418acb.0x5b9cca4f7763e373.0x682e6ff3d6b2b8a3.0x748f82ee5defb2fc.0x78a5636f43172f60.0x84c87814a1f0ab72.0x8cc702081a6439ec.0x90befffa23631e28.0xa4506cebde82bde9.0xbef9a3f7b2c67915.0xc67178f2e372532b.0xca273eceea26619c.0xd186b8c721c0c207.0xeada7dd6cde0eb1e.0xf57d4f7fee6ed178.0x06f067aa72176fba.0x0a637dc5a2c898a6.0x113f9804bef90dae.0x1b710b35131c471b.0x28db77f523047d84.0x32caab7b40c72493.0x3c9ebe0a15c9bebc.0x431d67c49c100d4c.0x4cc5d4becb3e42b6.0x597f299cfc657e2a.0x5fcb6fab3ad6faec.0x6c44198c4a475817`.split(`.`)).map(e=>BigInt(e)))
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
;st[0],st[1],`abandon
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
`);const ct=(e,t=2166136261)=>{for(let n=0;n<e.length;n++)t=Math.imul(t^e[n],16777619);return t>>>0},lt=!(`HermesInternal`in globalThis)&&globalThis.Buffer!==void 0,V=e=>{if(typeof e==`string`)return JSON.stringify(e);if(typeof e!=`object`||!e)return String(e);try{let t=JSON.stringify(e);if(typeof t==`string`)return t}catch{}try{return String(e)}catch{return`[Unserializable value]`}},ut=e=>`A value ${V(e.value)} is not a ${e.expected.toLowerCase()}.`,dt=e=>e.kind===`NotObject`?`A value ${V(e.value)} is not an object.`:`The value is an object, but an Object Output must be a plain object or have a null prototype.`,ft=ut,pt=ut,mt=ut,ht=ut,gt=e=>`A value ${V(e.value)} does not have the expected object tag ${V(e.expected)}.`,_t=e=>`The value ${V(e.value)} is not strictly equal to the expected literal: ${String(e.expected)}.`,vt=()=>`A value does not match any allowed variant.`,yt=e=>`The value ${V(e.value)} is not a canonical ISO date-time string.`,bt=e=>`The value ${V(e.value)} does not have the required length of ${e.exact}.`,xt=e=>`The value ${V(e.value)} is not a valid Base64Url string.`,St=e=>`The value ${V(e.value)} is not a valid Id.`,Ct=e=>`The value ${V(e.value)} must be non-negative (>= 0).`,wt=e=>`The value ${V(e.value)} must be positive (> 0).`,Tt=e=>`The value ${V(e.value)} must be a safe integer.`,Et=e=>`The value ${V(e.value)} must be less than ${e.max}.`,Dt=e=>`The value ${V(e.value)} must be less than or equal to ${e.max}.`,Ot=()=>`The value must not be NaN.`,kt=e=>`The value ${V(e.value)} must be finite.`,At=e=>{if(e.reason.kind===`NotRecord`)return`A value ${V(e.reason.value)} is not a Record.`;if(e.reason.kind===`NotPlainRecord`)return`The value is an object, but a Record Output must be a plain object or have a null prototype.`;let t=e.reason.issues[0];switch(t.kind){case`Key`:return`Property key ${V(t.key)} is invalid.`;case`Value`:return`The value of property ${V(t.key)} is invalid.`;case`Accessor`:return`A Record property ${V(t.key)} must be a data property.`;case`NonEnumerable`:return`A Record property ${V(t.key)} must be enumerable.`;case`Collision`:return`Record keys ${V(t.previousKey)} and ${V(t.key)} decode to the same key ${V(t.outputKey)}.`}},jt=e=>{if(e.reason.kind!==`Properties`)return dt(e.reason);let t=Reflect.ownKeys(e.reason.errors).at(0);M(t);let n=e.reason.errors[t];if(M(n),n.type===`ObjectPropertyAccess`)switch(n.reason){case`Accessor`:return`An Object property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.`;case`NonEnumerable`:return`An Object property must be enumerable. Make it enumerable or use a different Type.`}return n.type===`ObjectMissingProperty`?`The required property ${V(t)} is missing.`:typeof t==`symbol`?`An Object property key must be a string. Remove the symbol property or use a different Type.`:n.type===`ObjectExcessProperty`?`The property ${V(t)} is not allowed. Remove it or use a different Type.`:`The property ${V(t)} is invalid.`},Mt=e=>`The value ${V(e.value)} cannot be parsed into a JsonValue.`,Nt=/*#__PURE__*/ globalThis.Symbol(),Pt=/*#__PURE__*/ globalThis.Symbol(),Ft=(e,t)=>{let n=se(e.length+1);for(let t=0;t<e.length;t++)n[t]=e[t];return n[e.length]=t,n},It=(e,t,n,r)=>[{name:e,error:t,path:r,formatError:n}],Lt=(e,t,n,r)=>(i,a,o)=>{let s=i.reason;if(s.kind!==t)return It(e,i,n,o);let c=s.issues,l=a===`first`?1:c.length,u=[];for(let s=0;s<l;s++){let d=c[s],f=Ft(o,`key`in d?d.key:d.index);if(d.error===void 0){u.push({name:e,error:a===`first`?i:{type:e,reason:{kind:t,issues:[d]}},path:f,formatError:n});continue}let p=r(d)[Pt](d.error,a,f);if(l===1)return p;for(let e of p)u.push(e)}return u},Rt=e=>e.formatError(e.error),zt=(e,t=Rt)=>{let n=t(e);if(e.alternatives===void 0)return n;for(let{index:r,name:i,issues:a}of e.alternatives)for(let e of a){let a=``;for(let t of e.path)a+=typeof t==`string`?`[${JSON.stringify(t)}]`:`[${globalThis.String(t)}]`;let o=zt(e,t);n+=`\n- ${r}: ${i}${a}: ${o.includes(`
`)?o.replaceAll(`
`,`
  `):o}`}return n};function Bt(e,t){if(e===void 0)return;let n=e,r=n[Nt](t);r.ok||A(!1,`Expected ${n.name}.`,{cause:r.error,stackStartFn:Bt})}const Vt=(e,t,n,r,i=Kt)=>{if(t(r))return;let a=n(r,i).error;A(!1,`Expected ${e}.`,{cause:a})},Ht=(e,t,n)=>{let r=n.get(e);if(r)return r;let i=e.parent?Ht(e.parent,t,n):null,a=e=>({...e,formatError:()=>t(e),...e.alternatives===void 0?{}:{alternatives:e.alternatives.map(e=>({...e,issues:e.issues.map(a)}))}}),o=fn(e.name,i,e.fromUnknown,e.is,e[Nt],e[Yt],e[Jt].parent??e[Jt],(t,n,r)=>e[Pt](t,n,r).map(a),{formatIssue:t,check:e[$t],refinements:e[en]});globalThis.Object.assign(o,{from:e.from,orThrow:an(dn(e.from),o.formatError),orNull:e.orNull}),n.set(e,o),_r.has(e)&&_r.add(o);for(let r of Reflect.ownKeys(e)){if(globalThis.Object.hasOwn(o,r))continue;let i=globalThis.Object.getOwnPropertyDescriptor(e,r);`value`in i&&(i.value=Ut(i.value,t,n)),globalThis.Object.defineProperty(o,r,i)}return o},Ut=(e,t,n)=>{if(typeof e==`object`&&e&&globalThis.Object.hasOwn(e,`~evolu/instance`)&&e[`~evolu/instance`]===`Type`)return Ht(e,t,n);if(Array.isArray(e))return e.map(e=>Ut(e,t,n));if(!g(e))return e;let r=globalThis.Object.create(globalThis.Object.getPrototypeOf(e));for(let i of Reflect.ownKeys(e)){let a=e[i];r[i]=i===`value`&&globalThis.Object.hasOwn(e,cr)?a:Ut(a,t,n)}return r},Wt=(e,t,n,{getTypeIssues:r,isOutput:i,check:a}={})=>{let o=n,s=r??((t,n,r)=>It(t.type===`TypeOf`?e:t.type,t,o,r)),c=i??(a?e=>a(e,Kt)===void 0:e=>t(e).ok),l=(n,r=Kt)=>(Vt(e,c,t,n,r),z(n)),u=n=>(Vt(e,c,t,n),n);return{"~evolu/instance":`Type`,name:e,parent:null,fromUnknown:t,formatError:n,is:c,from:l,to:u,orThrow:(n,r=Kt)=>(Vt(e,c,t,n,r),n),orNull:u,"~standard":{version:1,vendor:`evolu`,validate:e=>{let n=t(e,qt);return n.ok?{value:n.value}:{issues:s(n.error,`all`,[]).map(e=>({message:zt(e),path:e.path}))}}},[Nt]:t,[Yt]:z,[Jt]:I,[Pt]:s,[$t]:a,[en]:void 0,[Zt]:void 0,[Qt]:void 0}},Gt=(e,t,n,r,i=!1,a)=>{let o=t,s=r,c=r?(t,n,r)=>t.type===e?It(e,t,s,a?[...r,...a]:r):o[Pt](t,n,r):o[Pt],l=n,u=i?e=>{if(!e.ok)return e;let t=l(e.value);return t.ok?e:t}:e=>e.ok?l(e.value):e,d=o.fromUnknown,f=o[Nt],p=o[Yt],m=(e,t=Kt)=>u(p(e,t));p.parent&&(m.parent=on(p.parent,e=>rn(e,u)));let h=sn(m),g=i?o[en]:void 0,_=g?[...g,l]:[l],v=_.length,y=o;if(i)for(;y[en];)y=y.parent;let b=y.is,ee=e=>{if(!b(e))return!1;for(let t=0;t<v;t++){let n=_[t];if(!n(e).ok)return!1}return!0},x=y[$t],S=x&&((e,t)=>{let n=x(e,t);if(n!==void 0)return n;for(let t=0;t<v;t++){let n=_[t],r=n(e);if(!r.ok)return r.error}}),C=y.fromUnknown,w=v>1?(e,t=Kt)=>{let n=C(e,t);if(!n.ok)return n;for(let e=0;e<v;e++){let t=_[e],r=t(n.value);if(!r.ok)return r}return n}:(e,t=Kt)=>u(d(e,t));return fn(e,o,w,ee,f===d?w:(e,t=Kt)=>u(f(e,t)),h,I,c,{check:S,refinements:i?_:void 0})},Kt={errors:`first`},qt={errors:`all`},Jt=/*#__PURE__*/ globalThis.Symbol(),Yt=/*#__PURE__*/ globalThis.Symbol(),Xt=/*#__PURE__*/ globalThis.Symbol(),Zt=/*#__PURE__*/ globalThis.Symbol(),Qt=/*#__PURE__*/ globalThis.Symbol(),$t=/*#__PURE__*/ globalThis.Symbol(),en=/*#__PURE__*/ globalThis.Symbol(),tn=e=>(t,n=Kt)=>{let r=e(t,n);return r===void 0?z(t):B(r)},nn=e=>{let t=[];for(let n of e){let e=n[$t];if(e===void 0)return;t.push(e)}return t},rn=(e,t)=>(n,r=Kt)=>t(e(n,r),r),an=(e,t)=>rn(e,e=>{if(e.ok)return e.value;throw Error(t(e.error),{cause:e.error})}),on=(e,t)=>{let n=t(e);return e.parent&&(n.parent=on(e.parent,t)),n},sn=e=>{if(!e)return z;let t=e=>z(e);return t.parent=e,t},cn=e=>e.fromUnknown,ln=e=>e[Nt],un=e=>e.is;function dn(e){for(;e.parent!=null;)e=e.parent;return e}const fn=(e,t,n,r,i,a,o,s,{additionalProperties:c,formatIssue:l=Rt,check:u,refinements:d}={})=>{let f=t,p=f?.[Jt],m=o;if(p){m=e=>p(o(e));let e=(e,t=Kt)=>o(e,t);p.parent&&(e.parent=on(p.parent,e=>t=>e(o(t)))),m.parent=e}let h=f?.[Pt]===s?f.formatError:e=>zt(s(e,`first`,[])[0],l),g=(t,n=Kt)=>(Vt(e,r,i,t,n),a(t,n));a.parent&&(g.parent=pn(f,a.parent));let _=dn(g),v=t=>(Vt(e,r,i,t),m(t));m.parent&&(v.parent=on(m.parent,t=>n=>(Vt(e,r,i,n),t(n))));let y={"~evolu/instance":`Type`,name:e,parent:t,fromUnknown:n,formatError:h,is:r,from:g,to:v,orThrow:(e,t=Kt)=>{let n=_(e,t);if(n.ok)return n.value;throw Error(h(n.error),{cause:n.error})},orNull:(e,t=Kt)=>Ge(_(e,t)),"~standard":{version:1,vendor:`evolu`,validate:e=>{let t=n(e,qt);return t.ok?{value:t.value}:{issues:s(t.error,`all`,[]).map(e=>({message:zt(e,l),path:e.path}))}}},[Nt]:i,[Yt]:a,[Jt]:m,[Pt]:s,[$t]:u,[en]:d,[Zt]:void 0,[Qt]:void 0};return c!==void 0&&globalThis.Object.assign(y,c),y},pn=(e,t)=>{let{name:n,is:r}=e,i=e[Nt],a=(e,a=Kt)=>(Vt(n,r,i,e,a),t(e,a));return t.parent&&(a.parent=pn(e.parent,t.parent)),a},mn=/*#__PURE__*/ Wt(`Unknown`,z,I,{isOutput:()=>!0,check:()=>void 0}),hn=(e,t)=>{let n=e.toLowerCase();return Wt(e,t=>typeof t===n?z(t):B({type:`TypeOf`,expected:e,value:t}),t,{isOutput:e=>typeof e===n,check:t=>typeof t===n?void 0:{type:`TypeOf`,expected:e,value:t}})},gn=/*#__PURE__*/ hn(`String`,ft),_n=/*#__PURE__*/ hn(`Number`,pt),vn=/*#__PURE__*/ hn(`BigInt`,mt),yn=/*#__PURE__*/ hn(`Boolean`,ht);function bn(e,t){let n=`[object ${e}]`;return t===void 0?Wt(e,t=>xn(t,n)?z(t):B({type:`ObjectTag`,expected:e,value:t}),gt,{isOutput:e=>xn(e,n),check:t=>xn(t,n)?void 0:{type:`ObjectTag`,expected:e,value:t}}):globalThis.Object.assign(Gt(`ObjectTag`,t,t=>xn(t,n)?z(t):B({type:`ObjectTag`,expected:e,value:t}),gt),{expected:e})}const xn=(e,t)=>e!==null&&(typeof e==`object`||typeof e==`function`)&&globalThis.Object.prototype.toString.call(e)===t,Sn=/*#__PURE__*/ bn(`Uint8Array`),Cn=e=>{let t=e,n=typeof t==`string`?gn:typeof t==`number`?_n:typeof t==`bigint`?vn:typeof t==`boolean`?yn:null;return globalThis.Object.assign(n?Gt(`Literal`,n,e=>e===t?z():B({type:`Literal`,expected:t,value:e}),_t,!0):Wt(`Literal`,e=>e===t?z(e):B({type:`Literal`,expected:t,value:e}),_t,{isOutput:e=>e===t,check:e=>e===t?void 0:{type:`Literal`,expected:t,value:e}}),{expected:t,[Xt]:!0})},wn=/*#__PURE__*/ Cn(null);function Tn(...e){let t=e.map(e=>typeof e==`object`&&e?e:Cn(e)),n=t.map(dn),r=On(n),i=r?tn(r):kn(n,cn),a=En(t),o=fn(`Union`,null,i,Dn(n),r?i:kn(n,ln),z,I,En(n),{check:r}),s=e.every(e=>typeof e!=`object`||!e),c=t=>e.indexOf(t)!==-1,l=On(t),u=l&&s?(e,t)=>c(e)?void 0:l(e,t):l,d=u?tn(u):kn(t,cn),f=u?d:kn(t,ln),p=kn(t,(e,t)=>{let r=dn(e[Yt]),i=n[t].is;return(e,t)=>i(e)?r(e,t):void 0}),m=e=>t.find(t=>t.is(e)),h=sn(p);return fn(`Union`,o,d,s?c:Dn(t),f,h,e=>{let t=m(e);return M(t),t[Jt](e)},a,{additionalProperties:{members:t,[Xt]:!0},check:u})}const En=e=>(t,n,r)=>[{name:`Union`,error:t,path:r,formatError:vt,alternatives:t.errors.map(({index:t,error:n})=>({index:t,name:e[t].name,issues:e[t][Pt](n,`all`,[])}))}],Dn=e=>{if(e.length===2){let t=e[0].is,n=e[1].is;return e=>t(e)||n(e)}let t;return n=>{let r=t??=e.map(un);for(let e=0;e<r.length;e++)if(r[e](n))return!0;return!1}},On=e=>{let t=nn(e);if(t!==void 0)return(e,n)=>{let r,i;for(let a=0;a<t.length;a++){let o=t[a](e,n);if(o===void 0)return;r===void 0?r={index:a,error:o}:n.errors===`all`&&(i??=[r]).push({index:a,error:o})}return M(r),{type:`Union`,errors:i??[r]}}},kn=(e,t)=>{let n;return(r,i=Kt)=>{let a=n??=e.map(t),o,s;for(let e=0;e<a.length;e++){let t=a[e](r,i);if(t!==void 0){if(t.ok)return t;o===void 0?o={index:e,error:t.error}:i.errors===`all`&&(s??=[o]).push({index:e,error:t.error})}}return M(o),B({type:`Union`,errors:s??[o]})}},An=e=>Tn(e,wn);function jn(e,t,n,r,i){return Gt(e,t,n??(()=>z()),r,!0,i?.path)}const Mn=/*#__PURE__*/ jn(`DateIso`,gn,e=>e.length===24&&new globalThis.Date(e).toJSON()===e?z():B({type:`DateIso`,value:e}),yt),Nn=e=>t=>{let n=`Length${e}`;return jn(n,t,t=>t.length===e?z():B({type:n,value:t,exact:e}),bt)},Pn={base64:{alphabet:`base64`,omitPadding:!1},base64url:{alphabet:`base64url`,omitPadding:!0}},Fn=(e,t)=>{if(lt)return globalThis.Buffer.from(e).toString(t);if(`toBase64`in globalThis.Uint8Array.prototype)return e.toBase64(Pn[t]);let n=Array.from(e,e=>globalThis.String.fromCodePoint(e)).join(``),r=btoa(n);return t===`base64`?r:r.replaceAll(`+`,`-`).replaceAll(`/`,`_`).replaceAll(`=`,``)},In=(e,t)=>{if(lt){let n=globalThis.Buffer.from(e,t);return new globalThis.Uint8Array(n)}if(`fromBase64`in globalThis.Uint8Array)return globalThis.Uint8Array.fromBase64(e,Pn[t]);let n=e;if(t===`base64url`)for(n=e.replaceAll(`-`,`+`).replaceAll(`_`,`/`);n.length%4!=0;)n+=`=`;let r=atob(n);return globalThis.Uint8Array.from(r,e=>e.charCodeAt(0))},Ln=/*#__PURE__*/ jn(`Base64Url`,gn,e=>{let t=qe(()=>In(e,`base64url`));return t.ok&&Fn(t.value,`base64url`)===e?z():B({type:`Base64Url`,value:e})},xt),Rn=e=>Fn(e,`base64url`),zn=e=>In(e,`base64url`),Bn=/*#__PURE__*/ jn(`Id`,gn,e=>e.length===22&&Ln.from.parent(e).ok?z():B({type:`Id`,value:e}),St),Vn=(e,...t)=>Rn(e.randomBytes.create(16)),Hn=e=>zn(e),Un=e=>Rn(e),Wn=e=>jn(`NonNegative`,e,e=>e>=0?z():B({type:`NonNegative`,value:e}),Ct),Gn=e=>jn(`Positive`,e,e=>e>0?z():B({type:`Positive`,value:e}),wt),Kn=/*#__PURE__*/ (e=>jn(`NonNaN`,e,e=>globalThis.Number.isNaN(e)?B({type:`NonNaN`,value:e}):z(),Ot))(_n),qn=/*#__PURE__*/ (e=>jn(`Finite`,e,e=>globalThis.Number.isFinite(e)?z():B({type:`Finite`,value:e}),kt))(Kn),Jn=/*#__PURE__*/ Wn(/* @__PURE__ */ (e=>jn(`Int`,e,e=>globalThis.Number.isSafeInteger(e)?z():B({type:`Int`,value:e}),Tt))(qn)),Yn=/*#__PURE__*/ Jn.orThrow(0),Xn=/*#__PURE__*/ Gn(Jn),Zn=/*#__PURE__*/ Xn.orThrow(1),Qn=e=>t=>{let n=`LessThan${e}`;return jn(n,t,t=>t<e?z():B({type:n,value:t,max:e}),Et)},$n=e=>t=>{let n=`LessThanOrEqualTo${e}`;return jn(n,t,t=>t<=e?z():B({type:n,value:t,max:e}),Dt)},er=(e,t)=>(n,r,i)=>{let a=n;if(a.reason.kind!==`Properties`)return It(`Object`,n,jt,i);let o=a.reason.errors,s=Reflect.ownKeys(o);M(s[0]);let c=r===`first`?1:s.length,l=[];for(let a=0;a<c;a++){let u=s[a],d=o[u],f=typeof u==`string`&&e!==void 0&&globalThis.Object.hasOwn(e,u)?e[u]:void 0;if(d.type===`ObjectPropertyAccess`||d.type===`ObjectMissingProperty`||d.type===`ObjectExcessProperty`||f===void 0&&t===void 0){let e=n;if(r===`all`){let t=b();t[u]=d,e={type:`Object`,reason:{kind:`Properties`,errors:t}}}l.push({name:`Object`,error:e,path:Ft(i,u),formatError:jt});continue}let p=f===void 0?t[Pt](d,r,i.slice()):mr(f)[Pt](d,r,Ft(i,u));if(c===1)return p;for(let e of p)l.push(e)}return l},tr=e=>{let t=globalThis.Object.getOwnPropertyNames(e);return globalThis.Object.getOwnPropertySymbols(e).length===0?t:Reflect.ownKeys(e)},nr=e=>{let t=[];for(let n of Reflect.ownKeys(e)){if(typeof n!=`string`)break;t.push(n)}return t},rr=(e,t)=>{let n=e,r=t,i=(e,t,n,r)=>typeof e!=`object`||!e?B({type:`Record`,reason:{kind:`NotRecord`,value:e}}):g(e)?ir(e,t,n,r):B({type:`Record`,reason:{kind:`NotPlainRecord`,value:e}}),a=n[$t],o=r[$t],s=a&&o&&((e,t)=>{if(typeof e!=`object`||!e)return{type:`Record`,reason:{kind:`NotRecord`,value:e}};if(!g(e))return{type:`Record`,reason:{kind:`NotPlainRecord`,value:e}};let n;for(let r of tr(e)){let i=a(r,t);if(i!==void 0&&((n??=[]).push({kind:`Key`,key:r,error:i}),t.errors===`first`))break;let s=globalThis.Object.getOwnPropertyDescriptor(e,r);if(A(s!==void 0,`Record property descriptor is missing.`),!(`value`in s)){if((n??=[]).push({kind:`Accessor`,key:r}),t.errors===`first`)break}else if(s.enumerable){let e=o(s.value,t);if(e!==void 0&&((n??=[]).push({kind:`Value`,key:r,error:e}),t.errors===`first`))break}else if((n??=[]).push({kind:`NonEnumerable`,key:r}),t.errors===`first`)break}return n===void 0?void 0:{type:`Record`,reason:{kind:`Entries`,issues:n}}}),c=s?tn(s):(e,t=Kt)=>i(e,n.fromUnknown,r.fromUnknown,t),l=s?c:(e,t=Kt)=>i(e,n[Nt],r[Nt],t),u=dn(n),d=dn(r),f=u!==n||d!==r?rr(u,d):null,p=sn(f?(e,t=Kt)=>ir(e,dn(n[Yt]),dn(r[Yt]),t):void 0),m=n[Jt],h=r[Jt],_=m===I&&h===I?I:e=>{let t=b(),n=!1;for(let r of globalThis.Object.keys(e)){let i=e[r],a=m(r),o=h(i);A(!globalThis.Object.hasOwn(t,a),`Record key Type encoding must not produce duplicate keys.`),t[a]=o,(r!==a||!globalThis.Object.is(i,o))&&(n=!0)}return n?t:e},v=e=>{if(typeof e!=`object`||!e||!g(e))return!1;let t=globalThis.Object.getOwnPropertySymbols(e).length!==0,i=t?nr(e):globalThis.Object.getOwnPropertyNames(e);for(let t=0;t<i.length;t++){let a=i[t];if(!n.is(a))return!1;let o=globalThis.Object.getOwnPropertyDescriptor(e,a);if(o===void 0||!(`value`in o)||!o.enumerable||!r.is(o.value))return!1}return!t},y=Lt(`Record`,`Entries`,At,e=>e.kind===`Key`?n:r);return fn(`Record`,f,c,v,l,p,_,y,{additionalProperties:{key:n,value:r},check:s})},ir=(e,t,n,r)=>{let i,a=b(),o=b(),s=!1;for(let c of tr(e)){let l=t(c,r);if(!l.ok&&((i??=[]).push({kind:`Key`,key:c,error:l.error}),r.errors===`first`))break;let u=globalThis.Object.getOwnPropertyDescriptor(e,c);A(u!==void 0,`Record property descriptor is missing.`);let d,f=!1;if(!(`value`in u)){if((i??=[]).push({kind:`Accessor`,key:c}),r.errors===`first`)break}else if(u.enumerable)d=u.value,f=!0;else if((i??=[]).push({kind:`NonEnumerable`,key:c}),r.errors===`first`)break;let p=f?n(d,r):void 0;if(p!==void 0&&!p.ok&&((i??=[]).push({kind:`Value`,key:c,error:p.error}),r.errors===`first`))break;if(!l.ok)continue;let m=l.value;if(globalThis.Object.hasOwn(o,m)){if((i??=[]).push({kind:`Collision`,key:c,previousKey:o[m],outputKey:m}),r.errors===`first`)break;continue}o[m]=c,f&&p?.ok&&(a[m]=p.value,(c!==m||!globalThis.Object.is(d,p.value))&&(s=!0))}return i==null?z(s?a:e):B({type:`Record`,reason:{kind:`Entries`,issues:i}})},ar=e=>sr(e),or=/*#__PURE__*/ globalThis.Symbol(),sr=e=>({type:e,[or]:!0}),cr=/*#__PURE__*/ globalThis.Symbol();function lr(e,t){return ur(dr(e),t)}const ur=(e,t,n=globalThis.Object.keys(e))=>{let r=e,i=n.length,a=se(i),o=se(i);for(let s=0;s<i;s++){let i=r[n[s]];if(pr(i))return i[cr].createObject(e,t);let c=fr(i),l=c?i.type:i;a[s]=l,o[s]=c}let s=a.map(e=>e[$t]),c=t?.value[$t],l=!s.includes(void 0)&&(t===void 0||c!==void 0),u,d=(e,u,d)=>{if(typeof e!=`object`||!e)return B({type:`Object`,reason:{kind:`NotObject`,value:e}});let p=e;if(!g(p))return B({type:`Object`,reason:{kind:`UnexpectedPrototype`,value:p}});let m=tr(p),h=l?void 0:se(i+m.length),_,v,y=m.length===i;for(let e=0;(_===void 0||u.errors!==`first`)&&e<i;e++){let t=n[e];y&&m[e]!==t&&(y=!1);let r=globalThis.Object.getOwnPropertyDescriptor(p,t);h!==void 0&&(h[e]=r);let i;if(r===void 0){if(o[e])continue;i={type:`ObjectMissingProperty`}}else if(!(`value`in r))i={type:`ObjectPropertyAccess`,reason:`Accessor`};else if(!r.enumerable)i={type:`ObjectPropertyAccess`,reason:`NonEnumerable`};else{let n=r.value,o=s[e];if(o!==void 0){let e=o(n,u);if(e===void 0){v!==void 0&&_===void 0&&(v[t]=n);continue}i=e}else{let r=d?a[e][Nt](n,u):a[e].fromUnknown(n,u);if(r.ok){if(_!==void 0||d)continue;if(v===void 0){if(globalThis.Object.is(r.value,n))continue;v=f(h,m,e)}v[t]=r.value;continue}i=r.error}}_??=b(),_[t]=i}let ee=y?0:m.length;for(let e=0;(_===void 0||u.errors!==`first`)&&e<ee;e++){let a=m[e],o=i+e;if(typeof a==`string`&&(e<i&&a===n[e]||globalThis.Object.hasOwn(r,a))){h!==void 0&&(h[o]=void 0);continue}let s=globalThis.Object.getOwnPropertyDescriptor(p,a);A(s!==void 0,`Object property is missing.`),h!==void 0&&(h[o]=s);let l;if(t===void 0)l={type:`ObjectExcessProperty`};else if(typeof a!=`string`)l=hr({kind:`Key`,key:a,error:{type:`TypeOf`,expected:`String`,value:a}});else if(!(`value`in s))l={type:`ObjectPropertyAccess`,reason:`Accessor`};else if(!s.enumerable)l={type:`ObjectPropertyAccess`,reason:`NonEnumerable`};else{let e=s.value,n;if(c!==void 0){let t=c(e,u);if(t===void 0){v!==void 0&&_===void 0&&(v[a]=e);continue}n=t}else{let r=d?t.value[Nt](e,u):t.value.fromUnknown(e,u);if(r.ok){if(_!==void 0||d)continue;if(v===void 0){if(globalThis.Object.is(r.value,e))continue;v=f(h,m,o)}v[a]=r.value;continue}n=r.error}l=hr({kind:`Value`,key:a,error:n})}_??=b(),_[a]=l}return _===void 0?v===void 0?void 0:z(v):B({type:`Object`,reason:{kind:`Properties`,errors:_}})},f=(e,t,r)=>{let a=globalThis.Object.create(null);for(let o=0;o<r;o++){let r=e[o];r!==void 0&&(a[o<i?n[o]:t[o-i]]=r.value)}return a},p=l?(e,t)=>{let n=d(e,t,!1);return n?.ok===!1?n.error:void 0}:void 0,m=(e,t=Kt)=>d(e,t,!1)??z(e),h=l?m:(e,t=Kt)=>d(e,t,!0)??z(e),_=!1,v=t===void 0||t.value[Jt]===I;for(let e=0;e<i;e++){let t=a[e];t[Jt]!==I&&(v=!1),t.parent!=null&&(_=!0)}let y=null;if(_||t?.parent){let e=b();for(let t=0;t<i;t++){let r=dn(a[t]);e[n[t]]=o[t]?ar(r):r}y=ur(e,t?.parent??t,n)}let ee,x=t?dn(t.value[Yt]):void 0,S=sn(y?(e,t=Kt)=>{let o=ee??=a.map(e=>dn(e[Yt])),s,c;for(let r=0;r<i;r++){let i=n[r];if(!globalThis.Object.hasOwn(e,i))continue;let a=e[i],l=o[r](a,t);if(l.ok){globalThis.Object.is(l.value,a)||((c??=b(e))[i]=l.value);continue}if((s??=b())[i]=l.error,t.errors===`first`)break}if(x!==void 0&&(s===void 0||t.errors===`all`))for(let n of globalThis.Object.keys(e)){if(globalThis.Object.hasOwn(r,n))continue;let i=e[n],a=x(i,t);if(a.ok){globalThis.Object.is(a.value,i)||((c??=b(e))[n]=a.value);continue}if((s??=b())[n]=hr({kind:`Value`,key:n,error:a.error}),t.errors===`first`)break}return s===void 0?z(c??e):B({type:`Object`,reason:{kind:`Properties`,errors:s}})}:void 0),C=v?I:e=>{let o;for(let t=0;t<i;t++){let r=n[t];if(!globalThis.Object.hasOwn(e,r))continue;let i=e[r],s=a[t][Jt](i);globalThis.Object.is(s,i)||((o??=b(e))[r]=s)}if(t)for(let n of globalThis.Object.keys(e)){if(globalThis.Object.hasOwn(r,n))continue;let i=e[n],a=t.value[Jt](i);globalThis.Object.is(i,a)||((o??=b(e))[n]=a)}return o??e},w=e=>{let t=u??=a.map(un);for(let r=0;r<i;r++){let i=globalThis.Object.getOwnPropertyDescriptor(e,n[r]);if(i===void 0){if(!o[r])return!1;continue}if(!(`value`in i)||!i.enumerable||!t[r](i.value))return!1}return!0},T=t===void 0?e=>{if(typeof e!=`object`||!e||!g(e)||!w(e))return!1;let t=globalThis.Object.getOwnPropertyNames(e);for(let e=0;e<t.length;e++){let a=t[e];if(!(e<i&&a===n[e])&&!globalThis.Object.hasOwn(r,a))return!1}return globalThis.Object.getOwnPropertySymbols(e).length===0}:e=>{if(typeof e!=`object`||!e||!g(e)||!w(e))return!1;let a=globalThis.Object.getOwnPropertySymbols(e).length!==0,o=a?nr(e):globalThis.Object.getOwnPropertyNames(e);for(let a=0;a<o.length;a++){let s=o[a];if(a<i&&s===n[a]||globalThis.Object.hasOwn(r,s))continue;let c=globalThis.Object.getOwnPropertyDescriptor(e,s);if(c===void 0||!(`value`in c)||!c.enumerable||!t.value.is(c.value))return!1}return!a},E=er(r,t);return fn(`Object`,y,m,T,h,S,C,E,{additionalProperties:t?{props:r,record:t}:{props:r},check:p})},dr=(e,t=b())=>{let n=`Object schema properties must be own string-keyed data properties.`;A(g(e),n);for(let r of tr(e)){let i=globalThis.Object.getOwnPropertyDescriptor(e,r);A(typeof r==`string`&&i!==void 0&&`value`in i,n),t[r]=i.value}return t},fr=e=>or in e,pr=e=>cr in e,mr=e=>pr(e)?e[cr].output:fr(e)?e.type:e,hr=e=>({type:`Record`,reason:{kind:`Entries`,issues:[e]}});function gr(e,t={},n){A(!globalThis.Object.hasOwn(t,`type`),`The "type" schema property is reserved by typed.`);let r=b();return r.type=Cn(e),ur(dr(t,r),n)}const _r=/*#__PURE__*/ new WeakSet,vr=/*#__PURE__*/ globalThis.Object.freeze([]),yr=e=>{if(e===null)return vr;let t=[],n=e;for(;n!==null;)t.push(n.key),n=n.parent;return t.reverse(),globalThis.Object.freeze(t)},br=(e,t)=>({parent:e,key:t}),xr=(e,t=Kt)=>{let n=[{kind:`Value`,value:e,path:null}],r=/* @__PURE__ */ new WeakMap,i,a=e=>((i??=[]).push(e),t.errors===`first`);for(;n.length>0;){let e=n.pop();if(e.kind===`Leave`){r.delete(e.value);continue}let{path:o,value:s}=e;if(s===null||typeof s==`string`||typeof s==`boolean`)continue;if(typeof s==`number`){if(!globalThis.Number.isFinite(s)&&a({kind:`NonFiniteNumber`,path:yr(o),value:s}))break;continue}if(typeof s!=`object`){if(a({kind:`InvalidType`,path:yr(o),value:s}))break;continue}let c=Array.isArray(s);if(!c&&!g(s)){if(a({kind:`UnexpectedPrototype`,path:yr(o),container:`Object`,value:s}))break;continue}if(r.has(s)){if(a({kind:`CircularReference`,path:yr(o),ancestorPath:yr(r.get(s))}))break;continue}let l=[];if(c){let e=Reflect.ownKeys(s);for(let t=0;t<e.length;t++){let n=e[t];if(n!==`length`){if(typeof n==`string`){if(n===globalThis.String(t)&&t<s.length)continue;let e=globalThis.Number(n)>>>0;if(e<s.length&&globalThis.String(e)===n)continue}if(a({kind:`ExcessProperty`,path:yr(br(o,n))}))break}}if(i!==void 0&&t.errors===`first`)break;for(let e=0;e<s.length;e++){let t=br(o,e),n=globalThis.Object.getOwnPropertyDescriptor(s,e);if(n===void 0){if(a({kind:`Hole`,path:yr(t)}))break;continue}if(!(`value`in n)){if(a({kind:`Accessor`,path:yr(t)}))break;continue}l.push({kind:`Value`,value:n.value,path:t})}}else for(let e of tr(s)){let t=br(o,e);if(typeof e==`symbol`){if(a({kind:`SymbolProperty`,path:yr(t)}))break;continue}let n=globalThis.Object.getOwnPropertyDescriptor(s,e);if(!(`value`in n)){if(a({kind:`Accessor`,path:yr(t)}))break;continue}if(!n.enumerable){if(a({kind:`NonEnumerable`,path:yr(t)}))break;continue}l.push({kind:`Value`,value:n.value,path:t})}if(i!==void 0&&t.errors===`first`)break;r.set(s,o),n.push({kind:`Leave`,value:s});for(let e=l.length-1;e>=0;e--)n.push(l[e])}return i===void 0?z(e):B({type:`JsonValue`,reason:{kind:`Issues`,issues:globalThis.Object.freeze(i)}})},Sr=e=>JSON.parse(e),Cr=e=>{let t=qe(()=>Sr(e));return t.ok&&xr(t.value).ok?z(t.value):B({type:`Json`,value:e})},wr=/*#__PURE__*/ jn(`Json`,gn,e=>{let t=Cr(e);return t.ok?z():t},Mt),Tr=e=>Sr(e),Er=ke,Dr=je,Or=R,kr=Me,Ar=e=>{let t=0;for(let n of e)t+=n.length;let n=new Uint8Array(t),r=0;for(let t of e)n.set(t,r),r+=t.length;return n};var jr=class extends Error{constructor(e){super(e),this.name=`BufferError`}};const Mr=e=>{let t=e?.length??0;xi(t,`arrayLike.length`);let n=e?new Uint8Array(e):/* @__PURE__ */ new Uint8Array(512),r=t;return{getCapacity:()=>n.length,getLength:()=>r,extend:e=>{let t=e.length;xi(t,`arg.length`);let i=r+t;if(xi(i,`Buffer length`),n.length<i){let e=n,t=Math.max(n.length*2,i);n=new Uint8Array(t),n.set(e)}n.set(e,r),r=i},shift:()=>{Si(r,1);let e=n[0];return n=n.subarray(1),r--,e},shiftN:e=>{Si(r,e);let t=n.subarray(0,e);return n=n.subarray(e),r-=e,t},truncate:e=>{if(e>r)throw new jr(`Cannot truncate to a length greater than current`);r=e},reset:()=>{r=0},unwrap:()=>n.length===r?n:n.subarray(0,r)}},Nr=(e,t)=>{ti(e,t)},Pr=e=>{let t=ni(e);if(typeof t!=`number`)throw new jr(`Expected an encoded number.`);return t},Fr=(e,t)=>{let n=0;for(let e=0;e<t.length&&e<8;e++)t[e]&&(n|=1<<e);e.extend([n])},Ir=(e,t)=>{let n=e.shift(),r=Math.min(t,8),i=Array(r);for(let e=0;e<r;e++)i[e]=!!(n&1<<e);return i},Lr=(e,t)=>{if(t===0){e.extend([0]);return}let n=BigInt(t),r=[];for(;n!==0n;){let e=Number(n&127n);r.push(e),n>>=7n}for(let e=0;e<r.length-1;e++)r[e]|=128;e.extend(r)},Rr=e=>{let t=0n,n=0n,r=0;for(let i=0;i<8&&(r=e.shift(),t|=BigInt(r&127)<<n,r&128);i++)n+=7n;if(r&128)throw new jr(`Variable-length quantity must terminate within 8 bytes.`);let i=Number(t);return xi(i,`Decoded integer`),i},zr=(e,t)=>{xi(t.length,`Array-like length`),Lr(e,t.length)},Br=Rr,Vr=(e,t)=>{let n=Or(t);zr(e,n),e.extend(n)},Hr=e=>{let t=Br(e),n=e.shiftN(t),r=kr(n);return n[0]===239&&n[1]===187&&n[2]===191?`\uFEFF${r}`:r},Ur=e=>{let t=Mr(),n=0,r=null,i=0;return{add:a=>{Object.is(a,r)?(i++,t.truncate(n)):(r=a,i=1),n=t.getLength(),e(t,a),Lr(t,i)},getLength:()=>t.getLength(),unwrap:()=>t.unwrap(),checkpoint:()=>{let a=n,o=r,s=i;return()=>{t.truncate(a),n=a,r=o,i=s,i>0&&(e(t,r),Lr(t,i))}}}},Wr=(e,t,n)=>{let r=Array(t),i=0;for(;i<t;){let a=n(),o=Rr(e);if(o===0)throw new jr(`Invalid RLE encoding: runLength must be positive`);let s=t-i;if(o>s)throw new jr(`Invalid RLE encoding: runLength ${o} exceeds remaining ${s}`);for(let e=0;e<o;e++)r[i]=a,i++}return r},Gr=1e3;let H=/* @__PURE__ */ new Uint8Array(8192),Kr=new DataView(H.buffer),U=0,qr=0,Jr=!1;const Yr=/* @__PURE__ */ new Uint8Array,Xr=new DataView(Yr.buffer);let W=Yr,Zr=Xr,G=0,Qr=0;const $r=globalThis.String.fromCharCode,ei=Array.from({length:4096},()=>void 0),ti=(e,t)=>{if(Jr)throw new jr(`Reentrant JSON encoding is not supported.`);Jr=!0,U=0;try{ri(t),e.extend(H.subarray(0,U))}finally{U=0,qr=0,Jr=!1,H.length>1048576&&(H=/* @__PURE__ */ new Uint8Array(8192),Kr=new DataView(H.buffer))}},ni=e=>{let t=e.unwrap();W=t,Zr=new DataView(t.buffer,t.byteOffset,t.byteLength),G=0;try{let t=li();return e.shiftN(G),t}catch(e){throw e instanceof jr?e:new jr(`Invalid MessagePack data`)}finally{W=Yr,Zr=Xr,G=0,Qr=0}},ri=e=>{if(e===null){oi(192);return}switch(typeof e){case`string`:ii(e);return;case`number`:if(Object.is(e,-0)){si(9),H[U++]=203,Kr.setFloat64(U,e),U+=8;return}if(e>>>0===e){e<128?oi(e):e<256?(si(2),H[U++]=204,H[U++]=e):e<65536?(si(3),H[U++]=205,Kr.setUint16(U,e),U+=2):(si(5),H[U++]=206,Kr.setUint32(U,e),U+=4);return}if(Number.isInteger(e)&&e>=-2147483648&&e<0){e>=-32?oi(256+e):e>=-128?(si(2),H[U++]=208,Kr.setInt8(U++,e)):e>=-32768?(si(3),H[U++]=209,Kr.setInt16(U,e),U+=2):(si(5),H[U++]=210,Kr.setInt32(U,e),U+=4);return}si(9),H[U++]=203,Kr.setFloat64(U,e),U+=8;return;case`boolean`:oi(e?195:194);return;case`object`:{if(qr>=Gr)throw new jr(`JSON nesting exceeds the maximum depth of ${Gr}.`);if(qr++,Array.isArray(e)){let t=e,n=t.length;ai(n,144,220,221);for(let e of t)ri(e);qr--;return}let t=e,n=Object.keys(t);ai(n.length,128,222,223);for(let e of n)ii(e),ri(t[e]);qr--}}},ii=e=>{let t=e.length,n=t<32?1:t<256?2:t<65536?3:5;si(5+t*3);let r=U;U+=n;for(let n=0;n<t;n++){let t=e.charCodeAt(n);if(t<128)H[U++]=t;else if(t<2048)H[U++]=t>>6|192,H[U++]=t&63|128;else if((t&64512)==55296&&(e.charCodeAt(n+1)&64512)==56320){let r=e.charCodeAt(++n);t=65536+((t&1023)<<10)+(r&1023),H[U++]=t>>18|240,H[U++]=t>>12&63|128,H[U++]=t>>6&63|128,H[U++]=t&63|128}else H[U++]=t>>12|224,H[U++]=t>>6&63|128,H[U++]=t&63|128}let i=U-r-n;if(ci(i,`String byte length`),i<32){H[r]=160|i;return}if(i<256){n===1&&(H.copyWithin(r+2,r+1,U),U++),H[r]=217,H[r+1]=i;return}if(i<65536){if(n<3){let e=3-n;H.copyWithin(r+3,r+n,U),U+=e}H[r]=218,Kr.setUint16(r+1,i);return}if(n<5){let e=5-n;H.copyWithin(r+5,r+n,U),U+=e}H[r]=219,Kr.setUint32(r+1,i)},ai=(e,t,n,r)=>{ci(e,`Collection length`),e<16?oi(t|e):e<65536?(si(3),H[U++]=n,Kr.setUint16(U,e),U+=2):(si(5),H[U++]=r,Kr.setUint32(U,e),U+=4)},oi=e=>{si(1),H[U++]=e},si=e=>{let t=U+e;if(xi(t,`Encoded JSON value length`),t<=H.length)return;let n=Math.max(H.length*2,t);xi(n,`JSON encoder capacity`);let r=H;H=new Uint8Array(n),H.set(r.subarray(0,U)),Kr=new DataView(H.buffer)},ci=(e,t)=>{if(e>4294967295)throw new jr(`${t} exceeds the MessagePack uint32 limit.`)},li=()=>{let e=_i();if(e<=127)return e;if(e<=143)return pi(e-128);if(e<=159)return fi(e-144);if(e<=191)return di(e-160);if(e>=224)return e-256;switch(e){case 192:return null;case 194:return!1;case 195:return!0;case 202:return ui(4);case 203:return ui(8);case 204:return _i();case 205:return vi();case 206:return yi();case 208:return bi(1),Zr.getInt8(G++);case 209:{bi(2);let e=Zr.getInt16(G);return G+=2,e}case 210:{bi(4);let e=Zr.getInt32(G);return G+=4,e}case 217:return di(_i());case 218:return di(vi());case 219:return di(yi());case 220:return fi(vi());case 221:return fi(yi());case 222:return pi(vi());case 223:return pi(yi());default:throw new jr(`Unsupported MessagePack marker 0x${e.toString(16).padStart(2,`0`)}.`)}},ui=e=>{bi(e);let t=e===4?Zr.getFloat32(G):Zr.getFloat64(G);if(G+=e,!Number.isFinite(t))throw new jr(`A decoded JSON number must be finite.`);return t},di=e=>{bi(e);shortAscii:if(e<16){if(e===0)return``;let t=G,n=W[G++];if(n&128){G=t;break shortAscii}if(e===1)return $r(n);let r=W[G++];if(r&128){G=t;break shortAscii}if(e===2)return $r(n,r);let i=W[G++];if(i&128){G=t;break shortAscii}if(e===3)return $r(n,r,i);let a=W[G++];if(a&128){G=t;break shortAscii}if(e===4)return $r(n,r,i,a);let o=W[G++];if(o&128){G=t;break shortAscii}if(e===5)return $r(n,r,i,a,o);let s=W[G++];if(s&128){G=t;break shortAscii}if(e===6)return $r(n,r,i,a,o,s);let c=W[G++];if(c&128){G=t;break shortAscii}if(e===7)return $r(n,r,i,a,o,s,c);let l=W[G++];if(l&128){G=t;break shortAscii}if(e===8)return $r(n,r,i,a,o,s,c,l);let u=W[G++];if(u&128){G=t;break shortAscii}if(e===9)return $r(n,r,i,a,o,s,c,l,u);let d=W[G++];if(d&128){G=t;break shortAscii}if(e===10)return $r(n,r,i,a,o,s,c,l,u,d);let f=W[G++];if(f&128){G=t;break shortAscii}if(e===11)return $r(n,r,i,a,o,s,c,l,u,d,f);let p=W[G++];if(p&128){G=t;break shortAscii}if(e===12)return $r(n,r,i,a,o,s,c,l,u,d,f,p);let m=W[G++];if(m&128){G=t;break shortAscii}if(e===13)return $r(n,r,i,a,o,s,c,l,u,d,f,p,m);let h=W[G++];if(h&128){G=t;break shortAscii}if(e===14)return $r(n,r,i,a,o,s,c,l,u,d,f,p,m,h);let g=W[G++];if(g&128){G=t;break shortAscii}return $r(n,r,i,a,o,s,c,l,u,d,f,p,m,h,g)}let t=G+e,n=[],r=``;for(;G<t;){let e=W[G++];if(e<128)n.push(e);else if(e>=194&&e<=223){gi(t,1);let r=hi();n.push((e&31)<<6|r)}else if(e>=224&&e<=239){gi(t,2);let r=W[G];if(e===224&&r<160)throw new jr(`Invalid UTF-8 string encoding.`);let i=hi(),a=hi();n.push((e&15)<<12|i<<6|a)}else if(e>=240&&e<=244){gi(t,3);let r=W[G];if(e===240&&r<144||e===244&&r>143)throw new jr(`Invalid UTF-8 string encoding.`);let i=hi(),a=hi(),o=hi(),s=((e&7)<<18|i<<12|a<<6|o)-65536;n.push(55296|s>>10,56320|s&1023)}else throw new jr(`Invalid UTF-8 string encoding.`);n.length>=4096&&(r+=$r(...n),n.length=0)}return n.length>0&&(r+=$r(...n)),r},fi=e=>{if(Qr>=Gr)throw new jr(`JSON nesting exceeds the maximum depth of ${Gr}.`);if(e>W.length-G)throw new jr(`Buffer parse ended prematurely`);let t=Array(e);Qr++;for(let n=0;n<e;n++)t[n]=li();return Qr--,t},pi=e=>{if(Qr>=Gr)throw new jr(`JSON nesting exceeds the maximum depth of ${Gr}.`);if(e>(W.length-G)/2)throw new jr(`Buffer parse ended prematurely`);let t={};Qr++;for(let n=0;n<e;n++){let e=_i(),n;if(e>=160&&e<=191)n=mi(e-160);else if(e===217)n=mi(_i());else if(e===218)n=mi(vi());else if(e===219)n=mi(yi());else throw G--,li(),new jr(`A decoded JSON object key must be a string.`);let r=li();n===`__proto__`?Object.defineProperty(t,n,{value:r,configurable:!0,enumerable:!0,writable:!0}):t[n]=r}return Qr--,t},mi=e=>{if(e>32)return di(e);bi(e);let t=G,n=t+e,r=e>1?Zr.getUint16(t):e===1?W[t]:0,i=(e<<5^r)&4095,a=ei[i];if(a?.bytes.length===e){let r=0;for(;r<e&&a.bytes[r]===W[t+r];)r++;if(r===e)return G=n,a.value}let o=di(e);return ei[i]={bytes:W.slice(t,n),value:o},o},hi=()=>{let e=W[G++];if((e&192)!=128)throw new jr(`Invalid UTF-8 string encoding.`);return e&63},gi=(e,t)=>{if(e-G<t)throw new jr(`Invalid UTF-8 string encoding.`)},_i=()=>(bi(1),W[G++]),vi=()=>{bi(2);let e=Zr.getUint16(G);return G+=2,e},yi=()=>{bi(4);let e=Zr.getUint32(G);return G+=4,e},bi=e=>{if(W.length-G<e)throw new jr(`Buffer parse ended prematurely`)},xi=(e,t)=>{if(!Number.isSafeInteger(e)||e<0)throw new jr(`${t} must be a non-negative safe integer.`)},Si=(e,t)=>{if(e<t)throw new jr(`Buffer parse ended prematurely`)},Ci=e=>{let t=e;return{get:()=>t,set:e=>{t=e},getAndSet:e=>{let n=t;return t=e,n},setAndGet:e=>(t=e,t),update:e=>{t=e(t)},getAndUpdate:e=>{let n=t;return t=e(t),n},updateAndGet:e=>(t=e(t),t),modify:e=>{let[n,r]=e(t);return t=r,n}}},wi=(e,t)=>{let n=t??S,r=Ci(e),i=/* @__PURE__ */ new Set,a=e=>{if(!n(e,r.get()))for(let e of i)e()};return{get:r.get,subscribe:e=>(i.add(e),()=>{i.delete(e)}),set:e=>{let t=r.get();r.set(e),a(t)},getAndSet:e=>{let t=r.getAndSet(e);return a(t),t},setAndGet:e=>{let t=r.get();return r.set(e),a(t),r.get()},update:e=>{let t=r.get();r.update(e),a(t)},getAndUpdate:e=>{let t=r.getAndUpdate(e);return a(t),t},updateAndGet:e=>{let t=r.get();return r.updateAndGet(e),a(t),r.get()},modify:e=>{let t=r.get(),n=r.modify(e);return a(t),n},[Symbol.dispose]:()=>{i.clear()}}},Ti=()=>{let e=Symbol(`Time`);function t(e){let t=Oi();return e===`DateIso`?Ni(t):t}return{now:t,performance:{timeOrigin:performance.timeOrigin,now:()=>performance.now()},setTimeout:(t,n)=>Ei(e,t,n),clearTimeout:t=>{ki(e,t)}}},Ei=(e,t,n)=>{let r=Fi(n),i=!1,a;if(r<=Di)a=setTimeout(()=>{i||(i=!0,t())},r);else{let e=Oi()+r,n=()=>{if(i)return;let r=e-Oi();if(r>0){a=setTimeout(n,Math.min(r,Di));return}i=!0,t()};a=setTimeout(n,Di)}return{owner:e,clear:()=>{i=!0,clearTimeout(a)}}},Di=2**31-1,Oi=()=>Ai.orThrow(Date.now()),ki=(e,t)=>{let n=t;A(n.owner===e,`TimeoutId was created by another Time instance`),n.clear()},Ai=/*#__PURE__*/ jn(`Millis`,/*#__PURE__*/ Qn(0xffffffffffff)(Jn)),ji=/*#__PURE__*/ Gn(Ai),Mi=e=>Ai.orNull(Math.max(0,Math.round(e)))??0xfffffffffffe,Ni=e=>new Date(e).toISOString(),Pi=(e,t)=>(A(t>=e,`Performance end time must not precede start time`),t-e);function Fi(e){if(typeof e==`number`)return e;let t=parseFloat(e),n=e.endsWith(`ms`)?`ms`:e.at(-1);return A(n in Ii,`Unknown duration unit: ${n}`),Ai.orThrow(Math.round(t*Ii[n]))}const Ii={ms:1,s:1e3,m:6e4,h:36e5,d:864e5,w:6048e5,y:31536e6},Li={trace:0,debug:1,log:2,info:3,warn:4,error:5,silent:6},Ri=({level:e=`log`,output:t=Bi(),path:n=[],formatter:r}={})=>zi({getInheritedLevel:()=>e,output:t,path:n,formatter:r}),zi=({getInheritedLevel:e,output:t,path:n,formatter:r})=>{let i=null,a=()=>i??e(),o=e=>Li[e]>=Li[a()],s=e=>(...i)=>{o(e)&&t.write({method:e,path:n,args:i},r)};return{getLevel:a,setLevel:e=>{i=e},hasOwnLevel:()=>i!==null,child:e=>zi({getInheritedLevel:a,output:t,path:[...n,e],formatter:r}),trace:s(`trace`),debug:s(`debug`),log:s(`log`),info:s(`info`),warn:s(`warn`),error:s(`error`),write:e=>{o(e.method)&&t.write(e,r)}}},Bi=()=>({write:(e,t)=>{let n=t?t(e):e.args;globalThis.console[e.method===`trace`?`debug`:e.method](...n)}}),Vi=()=>{let e=wi(null);return{write:e.set,entry:e}},Hi=e=>Uint8Array.from(e.split(``),e=>e.charCodeAt(0)),Ui=/* @__PURE__ */ Ee(xe(Hi(`expand 16-byte k`))),Wi=/* @__PURE__ */ Ee(xe(Hi(`expand 32-byte k`)));function K(e,t){return e<<t|e>>>32-t}const Gi=2**32-1,Ki=/* @__PURE__ */ Uint32Array.of();function qi(e,t,n,r,i,a,o,s){let c=i.length,l=/* @__PURE__ */ new Uint8Array(64),u=xe(l),d=Ce&&Ve(i)&&Ve(a),f=d?xe(i):Ki,p=d?xe(a):Ki;if(!Ce){for(let d=0;d<c;o++){if(e(t,n,r,u,o,s),Ee(u),o>=Gi)throw Error(`arx: counter overflow`);let f=Math.min(64,c-d);for(let e=0,t;e<f;e++)t=d+e,a[t]=i[t]^l[e];d+=f}return}for(let m=0;m<c;o++){if(e(t,n,r,u,o,s),o>=Gi)throw Error(`arx: counter overflow`);let h=Math.min(64,c-m);if(d&&h===64){let e=m/4;if(m%4!=0)throw Error(`arx: invalid block position`);for(let t=0,n;t<16;t++)n=e+t,p[n]=f[n]^u[t];m+=64;continue}for(let e=0,t;e<h;e++)t=m+e,a[t]=i[t]^l[e];m+=h}}function Ji(e,t){let{allowShortKeys:n,extendNonceFn:r,counterLength:i,counterRight:a,rounds:o}=Fe({allowShortKeys:!1,counterLength:8,counterRight:!1,rounds:20},t);if(typeof e!=`function`)throw Error(`core must be a function`);return ge(i),ge(o),he(a),he(n),(t,s,c,l,u=0)=>{_e(t,void 0,`key`),_e(s,void 0,`nonce`),_e(c,void 0,`data`);let d=c.length,f=l!==void 0;if(l=ze(d,l,!1),f&&Pe(c,l),ge(u),u<0||u>=Gi)throw Error(`arx: counter overflow`);let p=[],m=t.length,h,g;if(m===32)p.push(h=He(t)),g=Wi;else if(m===16&&n)h=/* @__PURE__ */ new Uint8Array(32),h.set(t),h.set(t,16),g=Ui,p.push(h);else throw _e(t,32,`arx key`),Error(`invalid key size`);(!Ce||!Ve(s))&&p.push(s=He(s));let _=xe(h);if(r){if(s.length!==24)throw Error(`arx: extended nonce must be 24 bytes`);let e=s.subarray(0,16);if(Ce)r(g,_,xe(e),_);else{let t=Ee(Uint32Array.from(g));r(t,_,xe(e),_),L(t),Ee(_)}s=s.subarray(16)}else Ce||Ee(_);let v=16-i;if(v!==s.length)throw Error(`arx: nonce must be ${v} or 16 bytes`);if(v!==12){let e=/* @__PURE__ */ new Uint8Array(12);e.set(s,a?0:12-s.length),s=e,p.push(s)}let y=Ee(xe(s));try{return qi(e,g,_,y,c,l,u,o),l}finally{L(...p)}}}function Yi(e,t){return e[t++]&255|(e[t++]&255)<<8}var Xi=class{blockLen=16;outputLen=16;buffer=/* @__PURE__ */ new Uint8Array(16);r=/* @__PURE__ */ new Uint16Array(10);h=/* @__PURE__ */ new Uint16Array(10);pad=/* @__PURE__ */ new Uint16Array(8);pos=0;finished=!1;destroyed=!1;constructor(e){e=He(_e(e,32,`key`));let t=Yi(e,0),n=Yi(e,2),r=Yi(e,4),i=Yi(e,6),a=Yi(e,8),o=Yi(e,10),s=Yi(e,12),c=Yi(e,14);this.r[0]=t&8191,this.r[1]=(t>>>13|n<<3)&8191,this.r[2]=(n>>>10|r<<6)&7939,this.r[3]=(r>>>7|i<<9)&8191,this.r[4]=(i>>>4|a<<12)&255,this.r[5]=a>>>1&8190,this.r[6]=(a>>>14|o<<2)&8191,this.r[7]=(o>>>11|s<<5)&8065,this.r[8]=(s>>>8|c<<8)&8191,this.r[9]=c>>>5&127;for(let t=0;t<8;t++)this.pad[t]=Yi(e,16+2*t)}process(e,t,n=!1){let r=n?0:2048,{h:i,r:a}=this,o=a[0],s=a[1],c=a[2],l=a[3],u=a[4],d=a[5],f=a[6],p=a[7],m=a[8],h=a[9],g=Yi(e,t+0),_=Yi(e,t+2),v=Yi(e,t+4),y=Yi(e,t+6),b=Yi(e,t+8),ee=Yi(e,t+10),x=Yi(e,t+12),S=Yi(e,t+14),C=i[0]+(g&8191),w=i[1]+((g>>>13|_<<3)&8191),T=i[2]+((_>>>10|v<<6)&8191),E=i[3]+((v>>>7|y<<9)&8191),D=i[4]+((y>>>4|b<<12)&8191),O=i[5]+(b>>>1&8191),k=i[6]+((b>>>14|ee<<2)&8191),A=i[7]+((ee>>>11|x<<5)&8191),j=i[8]+((x>>>8|S<<8)&8191),M=i[9]+(S>>>5|r),N=0,P=N+C*o+5*h*w+5*m*T+5*p*E+5*f*D;N=P>>>13,P&=8191,P+=5*d*O+5*u*k+5*l*A+5*c*j+5*s*M,N+=P>>>13,P&=8191;let F=N+C*s+w*o+5*h*T+5*m*E+5*p*D;N=F>>>13,F&=8191,F+=5*f*O+5*d*k+5*u*A+5*l*j+5*c*M,N+=F>>>13,F&=8191;let te=N+C*c+w*s+T*o+5*h*E+5*m*D;N=te>>>13,te&=8191,te+=5*p*O+5*f*k+5*d*A+5*u*j+5*l*M,N+=te>>>13,te&=8191;let I=N+C*l+w*c+T*s+E*o+5*h*D;N=I>>>13,I&=8191,I+=5*m*O+5*p*k+5*f*A+5*d*j+5*u*M,N+=I>>>13,I&=8191;let ne=N+C*u+w*l+T*c+E*s+D*o;N=ne>>>13,ne&=8191,ne+=5*h*O+5*m*k+5*p*A+5*f*j+5*d*M,N+=ne>>>13,ne&=8191;let re=N+C*d+w*u+T*l+E*c+D*s;N=re>>>13,re&=8191,re+=O*o+5*h*k+5*m*A+5*p*j+5*f*M,N+=re>>>13,re&=8191;let ie=N+C*f+w*d+T*u+E*l+D*c;N=ie>>>13,ie&=8191,ie+=O*s+k*o+5*h*A+5*m*j+5*p*M,N+=ie>>>13,ie&=8191;let ae=N+C*p+w*f+T*d+E*u+D*l;N=ae>>>13,ae&=8191,ae+=O*c+k*s+A*o+5*h*j+5*m*M,N+=ae>>>13,ae&=8191;let oe=N+C*m+w*p+T*f+E*d+D*u;N=oe>>>13,oe&=8191,oe+=O*l+k*c+A*s+j*o+5*h*M,N+=oe>>>13,oe&=8191;let se=N+C*h+w*m+T*p+E*f+D*d;N=se>>>13,se&=8191,se+=O*u+k*l+A*c+j*s+M*o,N+=se>>>13,se&=8191,N=(N<<2)+N|0,N=N+P|0,P=N&8191,N>>>=13,F+=N,i[0]=P,i[1]=F,i[2]=te,i[3]=I,i[4]=ne,i[5]=re,i[6]=ie,i[7]=ae,i[8]=oe,i[9]=se}finalize(){let{h:e,pad:t}=this,n=/* @__PURE__ */ new Uint16Array(10),r=e[1]>>>13;e[1]&=8191;for(let t=2;t<10;t++)e[t]+=r,r=e[t]>>>13,e[t]&=8191;e[0]+=r*5,r=e[0]>>>13,e[0]&=8191,e[1]+=r,r=e[1]>>>13,e[1]&=8191,e[2]+=r,n[0]=e[0]+5,r=n[0]>>>13,n[0]&=8191;for(let t=1;t<10;t++)n[t]=e[t]+r,r=n[t]>>>13,n[t]&=8191;n[9]-=8192;let i=(r^1)-1;for(let e=0;e<10;e++)n[e]&=i;i=~i;for(let t=0;t<10;t++)e[t]=e[t]&i|n[t];e[0]=(e[0]|e[1]<<13)&65535,e[1]=(e[1]>>>3|e[2]<<10)&65535,e[2]=(e[2]>>>6|e[3]<<7)&65535,e[3]=(e[3]>>>9|e[4]<<4)&65535,e[4]=(e[4]>>>12|e[5]<<1|e[6]<<14)&65535,e[5]=(e[6]>>>2|e[7]<<11)&65535,e[6]=(e[7]>>>5|e[8]<<8)&65535,e[7]=(e[8]>>>8|e[9]<<5)&65535;let a=e[0]+t[0];e[0]=a&65535;for(let n=1;n<8;n++)a=(e[n]+t[n]|0)+(a>>>16)|0,e[n]=a&65535;L(n)}update(e){ye(this),_e(e),e=He(e);let{buffer:t,blockLen:n}=this,r=e.length;for(let i=0;i<r;){let a=Math.min(n-this.pos,r-i);if(a===n){for(;n<=r-i;i+=n)this.process(e,i);continue}t.set(e.subarray(i,i+a),this.pos),this.pos+=a,i+=a,this.pos===n&&(this.process(t,0,!1),this.pos=0)}return this}destroy(){this.destroyed=!0,L(this.h,this.r,this.buffer,this.pad)}digestInto(e){ye(this),be(e,this),this.finished=!0;let{buffer:t,h:n}=this,{pos:r}=this;if(r){for(t[r++]=1;r<16;r++)t[r]=0;this.process(t,0,!0)}this.finalize();let i=0;for(let t=0;t<8;t++)e[i++]=n[t]>>>0,e[i++]=n[t]>>>8}digest(){let{buffer:e,outputLen:t}=this;this.digestInto(e);let n=e.slice(0,t);return this.destroy(),n}};const Zi=/* @__PURE__ */ Le(32,e=>new Xi(e));function Qi(e,t,n,r,i,a=20){let o=e[0],s=e[1],c=e[2],l=e[3],u=t[0],d=t[1],f=t[2],p=t[3],m=t[4],h=t[5],g=t[6],_=t[7],v=i,y=n[0],b=n[1],ee=n[2],x=o,S=s,C=c,w=l,T=u,E=d,D=f,O=p,k=m,A=h,j=g,M=_,N=v,P=y,F=b,te=ee;for(let e=0;e<a;e+=2)x=x+T|0,N=K(N^x,16),k=k+N|0,T=K(T^k,12),x=x+T|0,N=K(N^x,8),k=k+N|0,T=K(T^k,7),S=S+E|0,P=K(P^S,16),A=A+P|0,E=K(E^A,12),S=S+E|0,P=K(P^S,8),A=A+P|0,E=K(E^A,7),C=C+D|0,F=K(F^C,16),j=j+F|0,D=K(D^j,12),C=C+D|0,F=K(F^C,8),j=j+F|0,D=K(D^j,7),w=w+O|0,te=K(te^w,16),M=M+te|0,O=K(O^M,12),w=w+O|0,te=K(te^w,8),M=M+te|0,O=K(O^M,7),x=x+E|0,te=K(te^x,16),j=j+te|0,E=K(E^j,12),x=x+E|0,te=K(te^x,8),j=j+te|0,E=K(E^j,7),S=S+D|0,N=K(N^S,16),M=M+N|0,D=K(D^M,12),S=S+D|0,N=K(N^S,8),M=M+N|0,D=K(D^M,7),C=C+O|0,P=K(P^C,16),k=k+P|0,O=K(O^k,12),C=C+O|0,P=K(P^C,8),k=k+P|0,O=K(O^k,7),w=w+T|0,F=K(F^w,16),A=A+F|0,T=K(T^A,12),w=w+T|0,F=K(F^w,8),A=A+F|0,T=K(T^A,7);let I=0;r[I++]=o+x|0,r[I++]=s+S|0,r[I++]=c+C|0,r[I++]=l+w|0,r[I++]=u+T|0,r[I++]=d+E|0,r[I++]=f+D|0,r[I++]=p+O|0,r[I++]=m+k|0,r[I++]=h+A|0,r[I++]=g+j|0,r[I++]=_+M|0,r[I++]=v+N|0,r[I++]=y+P|0,r[I++]=b+F|0,r[I++]=ee+te|0}function $i(e,t,n,r){let i=Ce?e:Ee(e.slice(0,4)),a=Ce?t:Ee(t.slice(0,8)),o=Ce?n:Ee(n.slice(0,4)),s=/* @__PURE__ */ new Uint32Array(16);Qi(i,a,o.subarray(1),s,o[0]);let c=0;r[c++]=s[0]-i[0]|0,r[c++]=s[1]-i[1]|0,r[c++]=s[2]-i[2]|0,r[c++]=s[3]-i[3]|0,r[c++]=s[12]-o[0]|0,r[c++]=s[13]-o[1]|0,r[c++]=s[14]-o[2]|0,r[c++]=s[15]-o[3]|0,Ee(r),Ce||L(i,a,o),L(s)}const ea=/* @__PURE__ */ Ji(Qi,{counterRight:!1,counterLength:8,extendNonceFn:$i,allowShortKeys:!1}),ta=/* @__PURE__ */ new Uint8Array(16),na=(e,t)=>{e.update(t);let n=t.length%16;n&&e.update(ta.subarray(n))},ra=/* @__PURE__ */ new Uint8Array(32);function ia(e,t,n,r,i){i!==void 0&&_e(i,void 0,`AAD`);let a=e(t,n,ra),o=Be(r.length,i?i.length:0,!0),s=Zi.create(a);i&&na(s,i),na(s,r),s.update(o);let c=s.digest();return L(a,o),c}const aa=/* @__PURE__ */ Re({blockSize:64,nonceLength:24,tagLength:16,withAAD:!0},/* @__PURE__ */ (e=>(t,n,r)=>({encrypt(i,a){let o=i.length;a=ze(o+16,a,!1),a.set(i);let s=a.subarray(0,-16);e(t,n,s,s,1);let c=ia(e,t,n,s,r);return a.set(c,o),L(c),a},decrypt(i,a){a=ze(i.length-16,a,!1);let o=i.subarray(0,-16),s=i.subarray(-16),c=ia(e,t,n,o,r);if(!Ie(s,c))throw L(c),Error(`invalid tag`);return a.set(i.subarray(0,-16)),e(t,n,a,a,1),L(c),a}}))(ea)),oa=()=>({create:tt}),sa=(e,t,n)=>qe(()=>aa(n,t).decrypt(e),e=>({type:`DecryptWithXChaCha20Poly1305Error`,error:e})),ca=()=>({encrypt:(e,t,n)=>aa(n,t).encrypt(e),decrypt:sa}),la=e=>{if(A(e<=2**53-2**46,`The length exceeds 2^53 - 2^46, whose padded length would exceed Number.MAX_SAFE_INTEGER.`),e===0)return Yn;let t=Math.floor(e/2**32),n=t>0?63-Math.clz32(t):31-Math.clz32(e),r=32-Math.clz32(n),i=2**Math.max(0,n-r);return Math.ceil(e/i)*i},ua=e=>{let t=la(e)-e;return new globalThis.Uint8Array(t)},da={track:ae,untrack:ae},fa=/* @__PURE__ */ new WeakMap,pa=(e,t=/* @__PURE__ */ new Set)=>{switch(typeof e){case`string`:return`s:${JSON.stringify(e)}`;case`number`:return Number.isNaN(e)?`n:NaN`:e===1/0?`n:Infinity`:e===-1/0?`n:-Infinity`:Object.is(e,-0)?`n:-0`:`n:${e}`;case`boolean`:return e?`b:true`:`b:false`;case`object`:{if(e===null)return`l:null`;let n=fa.get(e);if(n)return n;let r;return Array.isArray(e)?(A(!t.has(e),`Structural lookup keys must not contain cycles.`),t.add(e),r=ma(e,t),t.delete(e)):g(e)?(A(!t.has(e),`Structural lookup keys must not contain cycles.`),t.add(e),r=ha(e,t),t.delete(e)):Sn.is(e)?r=`u:${Rn(e)}`:A(!1,`Structural lookup keys must be JSON-like values or Uint8Array.`),fa.set(e,r),r}default:A(!1,`Structural lookup keys must be JSON-like values or Uint8Array.`)}},ma=(e,t)=>`a:[${Array.from(e,e=>pa(e,t)).join(`,`)}]`,ha=(e,t)=>{let n=e;return`o:{${Object.keys(n).toSorted().map(e=>{let r=n[e];return`${JSON.stringify(e)}:${pa(r,t)}`}).join(`,`)}}`},ga=e=>e+1,_a=(e,t=16,n=2)=>{let r=t*n;if(A(Number.isSafeInteger(r),`numberOfBuckets times minNumberOfItemsPerBucket exceeds Number.MAX_SAFE_INTEGER.`),e<r)return B(r);let i=[],a=Math.floor(e/t),o=e%t,s=0;for(let e=0;e<t;e++){let t=a+ +(e<o);s+=t,i.push(s)}return z(i)};var va=class{};function ya(e){"@babel/helpers - typeof";return ya=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},ya(e)}function ba(e,t){if(ya(e)!=`object`||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var r=n.call(e,t||`default`);if(ya(r)!=`object`)return r;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(t===`string`?String:Number)(e)}function xa(e){var t=ba(e,`string`);return ya(t)==`symbol`?t:t+``}function Sa(e,t,n){return(t=xa(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}var Ca=class e extends va{constructor(e){super(),Sa(this,`_name`,void 0),Sa(this,`_rngFn`,void 0),this._name=e.name||`function`,this._rngFn=e}get name(){return this._name}next(){return this._rngFn()}clone(){return new e(this._rngFn)}};function wa(e,t){return e<<t|e>>>32-t}function Ta(e){let t=`${e}`,n=1779033703,r=3144134277,i=1013904242,a=2773480762;for(let e=0;e<t.length;e++){let o=t.charCodeAt(e);n=r^Math.imul(n^o,597399067),r=i^Math.imul(r^o,2869860233),i=a^Math.imul(i^o,951274213),a=n^Math.imul(a^o,2716044179)}return n=Math.imul(i^n>>>18,597399067),r=Math.imul(a^r>>>22,2869860233),i=Math.imul(n^i>>>17,951274213),a=Math.imul(r^a>>>19,2716044179),n^=r^i^a,r^=n,i^=n,a^=n,[n>>>0,r>>>0,i>>>0,a>>>0]}var Ea=class e extends va{constructor(e=crypto.randomUUID()){super(),Sa(this,`_seed`,void 0),Sa(this,`s0`,0),Sa(this,`s1`,0),Sa(this,`s2`,0),Sa(this,`s3`,0),this._seed=e,this.setState(Ta(e))}setState(e){this.s0=e[0],this.s1=e[1],this.s2=e[2],this.s3=e[3],(this.s0|this.s1|this.s2|this.s3)===0&&(this.s0=1831565813)}get name(){return`xoshiro128**`}next(){let e=this.nextUint32()>>>5,t=this.nextUint32()>>>6;return(e*67108864+t)/9007199254740992}clone(){let t=new e(this._seed);return t.setState([this.s0,this.s1,this.s2,this.s3]),t}nextUint32(){let e=Math.imul(wa(Math.imul(this.s1,5),7),9)>>>0,t=this.s1<<9;return this.s2^=this.s0,this.s3^=this.s1,this.s1^=this.s2,this.s0^=this.s3,this.s2^=t,this.s3=wa(this.s3,11),e}};function Da(e){switch(typeof e){case`object`:if(e instanceof va)return e;break;case`function`:return new Ca(e);case`number`:case`string`:case`undefined`:return new Ea(e)}throw TypeError(`Invalid seed or RNG: ${String(e)}`)}function Oa(e,t){for(let n=t.length-1;n>0;--n){let r=Math.floor(e.next()*(n+1)),i=t[n];t[n]=t[r],t[r]=i}}function ka(e,t,n){let r=/* @__PURE__ */ new Map,i=t.length-1,a=Array.from({length:n});for(let o=0;o<n;o++){let n=i-o+1,s=Math.floor(e.next()*n);a[o]=t[r.get(s)??s],r.set(s,r.get(i-o)??i-o)}return a}var Aa=class e extends va{get name(){return`Math.random`}next(){return Math.random()}clone(){return new e}};function ja(e){return new Ma(e)}var Ma=class{constructor(e){Sa(this,`n`,void 0),Sa(this,`isInt`,()=>{if(Number.isInteger(this.n))return this;throw Error(`Expected number to be an integer, got ${this.n}`)}),Sa(this,`isPositive`,()=>{if(this.n>0)return this;throw Error(`Expected number to be positive, got ${this.n}`)}),Sa(this,`lessThan`,e=>{if(this.n<e)return this;throw Error(`Expected number to be less than ${e}, got ${this.n}`)}),Sa(this,`lessThanOrEqual`,e=>{if(this.n<=e)return this;throw Error(`Expected number to be less than or equal to ${e}, got ${this.n}`)}),Sa(this,`greaterThanOrEqual`,e=>{if(this.n>=e)return this;throw Error(`Expected number to be greater than or equal to ${e}, got ${this.n}`)}),Sa(this,`greaterThan`,e=>{if(this.n>e)return this;throw Error(`Expected number to be greater than ${e}, got ${this.n}`)}),this.n=e}};function Na(e,t=1){ja(t).isInt().isPositive();let n=e.irwinHall(t);return()=>n()/t}function Pa(e,t=.5){return ja(t).greaterThanOrEqual(0).lessThanOrEqual(1),()=>Math.min(1,Math.floor(e.next()+t))}function Fa(e,t=1,n=.5){return ja(t).isInt().isPositive(),ja(n).greaterThanOrEqual(0).lessThan(1),()=>{let r=0,i=0;for(;r++<t;)e.next()<n&&i++;return i}}function Ia(e,t=1){return ja(t).isPositive(),()=>-Math.log(1-e.next())/t}function La(e,t=.5){ja(t).greaterThan(0).lessThan(1);let n=1/Math.log(1-t);return()=>Math.floor(1+Math.log(e.next())*n)}function Ra(e,t=1){return ja(t).isInt().greaterThanOrEqual(0),()=>{let n=0;for(let r=0;r<t;++r)n+=e.next();return n}}function za(e,t=0,n=1){let r=e.normal(t,n);return()=>Math.exp(r())}function Ba(e,t=0,n=1){return()=>{let r,i,a;do r=e.next()*2-1,i=e.next()*2-1,a=r*r+i*i;while(!a||a>1);return t+n*i*Math.sqrt(-2*Math.log(a)/a)}}function Va(e,t=1){ja(t).greaterThanOrEqual(0);let n=1/t;return()=>1/(1-e.next())**n}const Ha=[0,0,.6931471805599453,1.791759469228055,3.1780538303479458,4.787491742782046,6.579251212010101,8.525161361065415,10.60460290274525,12.801827480081469],Ua=e=>Ha[e];function Wa(e,t=1){if(ja(t).isPositive(),t<10){let n=Math.exp(-t);return()=>{let r=n,i=0,a=e.next();for(;a>r;)a-=r,r=t*r/++i;return i}}{let n=Math.sqrt(t),r=.931+2.53*n,i=-.059+.02483*r,a=1.1239+1.1328/(r-3.4),o=.9277-3.6224/(r-2);return()=>{for(;;){let s,c=e.next();if(c<=.86*o)return s=c/o-.43,Math.floor((2*i/(.5-Math.abs(s))+r)*s+t+.445);c>=o?s=e.next()-.5:(s=c/o-.93,s=(s<0?-.5:.5)-s,c=e.next()*o);let l=.5-Math.abs(s);if(l<.013&&c>l)continue;let u=Math.floor((2*i/l+r)*s+t+.445);if(c=c*a/(i/(l*l)+r),u>=10){let e=(u+.5)*Math.log(t/u)-t-.9189385332046727+u-(1/12-(1/360-1/(1260*u*u))/(u*u))/u;if(Math.log(c*n)<=e)return u}else if(u>=0){let e=Ua(u)??0;if(Math.log(c)<=u*Math.log(t)-t-e)return u}}}}}function Ga(e,t,n){return n===void 0&&(n=t===void 0?1:t,t=0),t??=0,()=>e.next()*(n-t)+t}function Ka(e){return()=>e.next()>=.5}function qa(e,t,n){return n===void 0&&(n=t===void 0?1:t,t=0),t??=0,ja(t).isInt(),ja(n).isInt(),()=>Math.floor(e.next()*(n-t+1)+t)}function Ja(e,t,n){return ja(t).greaterThan(0),ja(n).greaterThan(0),()=>{let r=1-e.next();return t*(-Math.log(r))**(1/n)}}new class e{constructor(e=new Aa){Sa(this,`_rng`,void 0),Sa(this,`_cache`,{}),this._rng=Da(e)}get rng(){return this._rng}clone(t=this.rng.clone()){return new e(t)}use(e){this._rng=Da(e),this._cache={}}next(){return this._rng.next()}float(e,t){return this.uniform(e,t)()}int(e,t){return this.uniformInt(e,t)()}integer(e,t){return this.uniformInt(e,t)()}bool(){return this.uniformBoolean()()}boolean(){return this.uniformBoolean()()}choice(e,t){if(!Array.isArray(e))throw TypeError(`Random.choice expected input to be an array, got ${typeof e}`);let n=e.length;if(n===0)return;if(!t)return e[this.uniformInt(0,n-1)()];if(!Array.isArray(t))throw TypeError(`Random.choice expected weights to be an array, got ${typeof t}`);if(t.length!==n)throw Error(`Random.choice expected weights array length (${t.length}) to match array length (${n})`);for(let[e,n]of t.entries())if(typeof n!=`number`||n<0||!Number.isFinite(n))throw Error(`Random.choice expected all weights to be non-negative finite numbers, got ${n} at index ${e}`);let r=t.reduce((e,t)=>e+t,0);if(r===0)throw Error(`Random.choice expected at least one positive weight, got all zeros`);let i=this.float(0,r),a=0;for(let r=0;r<n;r++)if(a+=t[r],i<=a)return e[r];return e[n-1]}sample(e,t){if(!Array.isArray(e))throw TypeError(`Random.sample expected input to be an array, got ${typeof e}`);if(t<0||t>e.length)throw Error(`Random.sample: k must be between 0 and array.length (${e.length}), got ${t}`);return ka(this.rng,e,t)}sampler(e,t){if(!Array.isArray(e))throw TypeError(`Random.sampler expected input to be an array, got ${typeof e}`);if(t<0||t>e.length)throw Error(`Random.sampler: k must be between 0 and array.length (${e.length}), got ${t}`);let n=this.rng;return()=>ka(n,e,t)}shuffle(e){if(!Array.isArray(e))throw TypeError(`Random.shuffle expected input to be an array, got ${typeof e}`);let t=[...e];return Oa(this.rng,t),t}shuffler(e){if(!Array.isArray(e))throw TypeError(`Random.shuffler expected input to be an array, got ${typeof e}`);let t=this.rng,n=[...e];return()=>(Oa(t,n),[...n])}uniform(e,t){return this._memoize(`uniform`,Ga,e,t)}uniformInt(e,t){return this._memoize(`uniformInt`,qa,e,t)}uniformBoolean(){return this._memoize(`uniformBoolean`,Ka)}normal(e,t){return Ba(this,e,t)}logNormal(e,t){return za(this,e,t)}bernoulli(e){return Pa(this,e)}binomial(e,t){return Fa(this,e,t)}geometric(e){return La(this,e)}poisson(e){return Wa(this,e)}exponential(e){return Ia(this,e)}irwinHall(e){return Ra(this,e)}bates(e){return Na(this,e)}pareto(e){return Va(this,e)}weibull(e,t){return Ja(this,e,t)}_memoize(e,t,...n){let r=`${n.join(`;`)}`,i=this._cache[e];return(i===void 0||i.key!==r)&&(i={key:r,distribution:t(this,...n)},this._cache[e]=i),i.distribution}};const Ya=()=>({next:()=>Math.random()}),Xa=/*#__PURE__*/ new Set;var Za=function(e,t,n){if(t!=null){if(typeof t!=`object`&&typeof t!=`function`)throw TypeError(`Object expected.`);var r,i;if(n){if(!Symbol.asyncDispose)throw TypeError(`Symbol.asyncDispose is not defined.`);r=t[Symbol.asyncDispose]}if(r===void 0){if(!Symbol.dispose)throw TypeError(`Symbol.dispose is not defined.`);r=t[Symbol.dispose],n&&(i=r)}if(typeof r!=`function`)throw TypeError(`Object not disposable.`);i&&(r=function(){try{i.call(this)}catch(e){return Promise.reject(e)}}),e.stack.push({value:t,dispose:r,async:n})}else n&&e.stack.push({async:!0});return t},Qa=(function(e){return function(t){function n(n){t.error=t.hasError?new e(n,t.error,`An error was suppressed during disposal.`):n,t.hasError=!0}var r,i=0;function a(){for(;r=t.stack.pop();)try{if(!r.async&&i===1)return i=0,t.stack.push(r),Promise.resolve().then(a);if(r.dispose){var e=r.dispose.call(r.value);if(r.async)return i|=2,Promise.resolve(e).then(a,function(e){return n(e),a()})}else i|=1}catch(e){n(e)}if(i===1)return t.hasError?Promise.reject(t.error):Promise.resolve();if(t.hasError)throw t.error}return a()}})(typeof SuppressedError==`function`?SuppressedError:function(e,t,n){var r=Error(n);return r.name=`SuppressedError`,r.error=e,r.suppressed=t,r});const $a=/*#__PURE__*/ gr(`AbortError`,{reason:/* @__PURE__ */ lr({type:gn},/*#__PURE__*/ rr(gn,mn))}),eo=e=>({type:`AbortError`,reason:e}),to=eo({type:`RunDisposedAbortReason`}),no={type:`ExplicitAbortReason`},ro=e=>({type:`PanicAbortReason`,defect:e}),io=e=>{queueMicrotask(()=>{throw e})},ao=({console:e=Ri()}={})=>({console:e,leakDetector:da,nativeFetch:globalThis.fetch.bind(globalThis),randomBytes:oa(),random:Ya(),reportDefect:io,time:Ti()}),oo=e=>uo({...ao(e),...e}),so=globalThis,co=Symbol(`evolu.Task.meta`),lo={type:`Running`},uo=(e,t,n,r)=>{let i=r?.abortBehavior;i!==void 0&&i!==`unabortable`&&A(t?.restoreTokens.has(i.restoreToken)===!0,`restore is only valid inside the unabortableMask that created it`);let a=t?.abortMask??0,o=i===void 0?a:i===`unabortable`?ga(a):i.abortMask,s=lo,c=s,l,u,d=/* @__PURE__ */ new Map,f=new AbortController,p=new AbortController,m,h,g,_=t=>{try{e.reportDefect(t)}catch(e){io(AggregateError([t,e],`ReportDefect failed while reporting a defect`))}},v=t=>{try{if(!e.runConfig?.eventsEnabled.get())return;let n={id:w.id,timestamp:T.deps.time.now(),data:t};for(let e=w;e;e=e.parent)try{e.onEvent?.(n)}catch(e){_(e)}}catch(e){_(e)}},y=()=>{c!==s&&(c=s,v({type:`StateChanged`,state:s}))},b=()=>({request:f.signal.reason.reason,observed:p.signal.aborted?p.signal.reason.reason:null}),ee=(e=no)=>{f.signal.aborted||(S(eo(e),o===0),y())},x=e=>{if(l??=e,m)return m;let t=()=>(l??=z(z()),s={type:`Settled`,abort:b(),exit:l},y(),l),n=h;m=n?Promise.all(d.values()).then(async()=>{try{await n.disposeAsync()}catch(e){g=fo(e)??T.panic(e),l??=B(g)}return t()}):Promise.all(d.values()).then(t);let r=l?.ok===!1?l.error:to,{aborted:i}=p.signal;return S(r,!0),i||y(),m},S=(e,t)=>{f.signal.aborted||(s={type:`Aborted`,abort:{request:e.reason,observed:null}},f.abort(e)),t&&!p.signal.aborted&&(s={type:`Aborted`,abort:{request:f.signal.reason.reason,observed:e.reason}},p.abort(e))},C=t=>t===void 0?e:{console:e.console,leakDetector:e.leakDetector,nativeFetch:e.nativeFetch,randomBytes:e.randomBytes,random:e.random,reportDefect:e.reportDefect,time:e.time,...e.runConfig&&{runConfig:e.runConfig},...t},w=((e,t,{abortable:n=!1}={})=>{F({disposed:!!m});let r=e[co],i=uo(C(t),w,T,r),a=Promise.withResolvers();d.set(i,a.promise),v({type:`ChildAdded`,childId:i.id});let o=()=>{i.requestAbort(w.requestAbortSignal.reason.reason)};w.requestAbortSignal.aborted?o():w.requestAbortSignal.addEventListener(`abort`,o,{once:!0,signal:i.requestAbortSignal});let s=(async()=>{let t;try{let n=r?.abortBehavior===`unabortable`?i.requestAbortSignal:i.signal,a=so.scheduler,o;r?.priority&&a?.postTask?o=await a.postTask(()=>(n.throwIfAborted(),e(i)),{priority:r.priority,signal:n}):(n.throwIfAborted(),o=await e(i)),A(typeof o?.ok==`boolean`,`Task must return Result.`),t=z(o)}catch(e){t=B(fo(e)??T.panic(e))}let o=await i.dispose(t);if(d.delete(i),v({type:`ChildRemoved`,childId:i.id}),a.resolve(),o.ok)return o.value;if(n)return B(o.error);throw s.catch(ae),o.error})();if(s.run=i,n){let e=s;e.abort=i.requestAbort,e[Symbol.asyncDispose]=async()=>{e.abort(),await e}}return s}),T=n??w;return w.orThrow=(async(e,t)=>We(await w(e,t))),w.ok=(async(e,t)=>Ke(await w(e,t))),w.abortable=((e,t)=>w(e,t,{abortable:!0})),w.daemon=((e,t)=>(F({disposed:!!m}),w.requestAbortSignal.throwIfAborted(),T.abortable(e,C(t)))),w.create=(e=>w.daemon(async e=>(await e.abortable(go),z()),e).run),w.id=Vn(e),w.parent=t??null,w.deps=e,w.signal=p.signal,w.requestAbortSignal=f.signal,w.onAbort=e=>{let t=()=>{try{e(w.signal.reason)}catch(e){T.panic(e)}};return w.signal.aborted?(t(),null):(w.signal.addEventListener(`abort`,t,{once:!0}),{[Symbol.dispose]:()=>{w.signal.removeEventListener(`abort`,t)}})},w.getState=()=>s,w.snapshot=()=>{let e=Array.from(d.keys(),e=>e.snapshot());return(u?.state!==s||!E(u.children,e))&&(u={id:w.id,state:s,children:e,abortMask:o}),u},w.onEvent=void 0,w.defer=e=>{F({disposed:!!m}),(h??=new AsyncDisposableStack).defer(e)},w.abort=(e=no)=>{m||x(B(eo(e)))},w.panic=e=>{let t=eo(ro(e));return _(t),T.dispose(B(t)),t},w[Symbol.dispose]=()=>{x()},w[Symbol.asyncDispose]=async()=>{if(await x(),g)throw g},w.abortMask=o,w.restoreTokens=t?.restoreTokens??Xa,w.requestAbort=ee,w.dispose=x,w},fo=e=>{try{let t=[e];for(;t.length>0;){let e=t.pop();if(po(e))t.push(e.error,e.suppressed);else if(!$a.is(e))return null}let n=e;for(;po(n);)n=n.error;return n}catch{return null}},po=e=>Object.prototype.toString.call(e)===`[object Error]`&&e.name===`SuppressedError`,mo=e=>t=>{let{promise:n,resolve:r,reject:i}=Promise.withResolvers(),a=e({run:t,resolve:r,reject:i});return t.onAbort(e=>{i(e),a?.()}),n},ho=e=>mo(({run:{deps:t},resolve:n})=>{let r=t.time.setTimeout(()=>n(z()),e);return()=>t.time.clearTimeout(r)}),go=async e=>{let t={stack:[],error:void 0,hasError:!1};try{let n=Promise.withResolvers();return Za(t,e.onAbort(n.reject),!1),await n.promise}catch(e){t.error=e,t.hasError=!0}finally{Qa(t)}},_o=e=>{let t=/* @__PURE__ */ new Map,n=e=>{if(e instanceof Error)return r(e);if(Array.isArray(e)){let r=t.get(e);if(r!==void 0)return r;let i=[];t.set(e,i);for(let t of e)i.push(n(t));return i}try{return structuredClone(e),e}catch{return V(e)}},r=e=>{let r=t.get(e);if(r!==void 0)return r;let i={};t.set(e,i);for(let t of Object.getOwnPropertyNames(e)){let r=e[t];typeof r!=`function`&&(i[t]=n(r))}for(let t of[`name`,`message`,`stack`]){let n=e[t];n!==void 0&&!(t in i)&&(i[t]=n)}return i};if(e instanceof Error)return{type:`UnknownError`,error:r(e)};try{return{type:`UnknownError`,error:structuredClone(e)}}catch{try{return{type:`UnknownError`,error:String(e)}}catch{return{type:`UnknownError`,error:`[Unserializable Object]`}}}},vo=e=>{let t=$a.is(e)&&e.reason.type===`PanicAbortReason`?e.reason.defect:e,n=Object.prototype.toString.call(t);if(n===`[object DOMException]`){let{name:e,message:n}=t;return Error(`${e}: ${n}`,{cause:t})}return t instanceof Error||n===`[object Error]`?t:Error(`Defect: ${V(t)}`,{cause:e})},yo=/* @__PURE__ */ Uint8Array.from([7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8]),bo=/* @__PURE__ */ Uint8Array.from(Array(16).fill(0).map((e,t)=>t)),xo=/* @__PURE__ */ bo.map(e=>(9*e+5)%16),So=/* @__PURE__ */ (()=>{let e=[[bo],[xo]];for(let t=0;t<4;t++)for(let n of e)n.push(n[t].map(e=>yo[e]));return e})();So[0],So[1];const Co=e=>async t=>{let n=Promise.withResolvers(),r=Promise.withResolvers(),i=t.deps.lockManager.request(To(e),{mode:`exclusive`,signal:t.signal},async()=>{n.resolve(),await r.promise});return i.catch(n.reject),await n.promise,z({[Symbol.asyncDispose]:async()=>{r.resolve(),await i}})},wo=e=>(t,n)=>{let r=new AbortController,i=null;return e.lockManager.request(To(t),{mode:`exclusive`,signal:r.signal},async()=>{let e=Promise.withResolvers();i=e.resolve,n(),await e.promise}).catch(ae),{[Symbol.dispose]:()=>{r.abort(),i?.()}}},To=e=>`evolu-leaderlock-${e}`,Eo=e=>(t,n)=>t===n?0:e(t,n)?-1:1,Do=/*#__PURE__*/ Eo((e,t)=>e<t),Oo=/*#__PURE__*/ Eo((e,t)=>e<t),ko=(e,t)=>{if(e.byteLength>t.byteLength)return 1;if(e.byteLength<t.byteLength)return-1;for(let n=0;n<e.byteLength;n++){if(e[n]<t[n])return-1;if(e[n]>t[n])return 1}return 0};var Ao=function(e,t,n){if(t!=null){if(typeof t!=`object`&&typeof t!=`function`)throw TypeError(`Object expected.`);var r,i;if(n){if(!Symbol.asyncDispose)throw TypeError(`Symbol.asyncDispose is not defined.`);r=t[Symbol.asyncDispose]}if(r===void 0){if(!Symbol.dispose)throw TypeError(`Symbol.dispose is not defined.`);r=t[Symbol.dispose],n&&(i=r)}if(typeof r!=`function`)throw TypeError(`Object not disposable.`);i&&(r=function(){try{i.call(this)}catch(e){return Promise.reject(e)}}),e.stack.push({value:t,dispose:r,async:n})}else n&&e.stack.push({async:!0});return t},jo=(function(e){return function(t){function n(n){t.error=t.hasError?new e(n,t.error,`An error was suppressed during disposal.`):n,t.hasError=!0}var r,i=0;function a(){for(;r=t.stack.pop();)try{if(!r.async&&i===1)return i=0,t.stack.push(r),Promise.resolve().then(a);if(r.dispose){var e=r.dispose.call(r.value);if(r.async)return i|=2,Promise.resolve(e).then(a,function(e){return n(e),a()})}else i|=1}catch(e){n(e)}if(i===1)return t.hasError?Promise.reject(t.error):Promise.resolve();if(t.hasError)throw t.error}return a()}})(typeof SuppressedError==`function`?SuppressedError:function(e,t,n){var r=Error(n);return r.name=`SuppressedError`,r.error=e,r.suppressed=t,r});const Mo=/*#__PURE__*/ Tn(qn,wn,gn,Sn),No=e=>{let[t,n,r]=JSON.parse(e),i=n.map(([e,t])=>e===`b`?Dr(t):t),a=r.length?Object.fromEntries(r):void 0;return{sql:t,parameters:i,...a!==void 0&&{options:a}}},Po=(e,t)=>async n=>{let r={stack:[],error:void 0,hasError:!1};try{let{createSqliteDriver:i,time:a}=n.deps,o=n.deps.console.child(`sql`),s=Ao(r,new AsyncDisposableStack,!0),c=s.use(await n.ok(i(e,t)));o.debug(`SQLite driver created`);let l=/* @__PURE__ */ new Map,u=/* @__PURE__ */ new Map;s.defer(()=>{let e={stack:[],error:void 0,hasError:!1};try{let t=Ao(e,new DisposableStack,!1);t.defer(()=>{l.clear(),u.clear()});for(let e of l.values())t.use(e);for(let e of u.values())for(let{statement:n}of e.values())t.use(n)}catch(t){e.error=t,e.hasError=!0}finally{jo(e)}});let d=(e,t)=>{let n=l.get(e);return n===void 0&&(n=c.prepare(e),l.set(e,n)),n.exec(t)},f=(e,t)=>{o.trace({query:e});let n=e.options?.logQueryExecutionTime===!0?a.performance.now():null,r=t();if(n!==null){let t=Pi(n,a.performance.now());o.log(`[logQueryExecutionTime]`,{query:e,duration:`${t.toFixed(3)}ms`})}if(e.options?.logExplainQueryPlan){let t=c.exec({...e,sql:`EXPLAIN QUERY PLAN ${e.sql}`});o.log(`[logExplainQueryPlan]`,e),o.log(Fo(t.rows))}return r};return z(ne({exec:e=>{let t=f(e,()=>e.options?.prepare===!0?d(e.sql,e.parameters):c.exec(e));return o.trace({result:t}),t},prepared:(e,...t)=>{let n=[],r=``;for(let e=0;e<t.length;e++){let i=t[e];typeof i==`object`&&i&&`type`in i?r+=`${e}:${i.sql.length}:${i.sql}`:n.push(typeof i==`number`?qn.orThrow(i):i)}let i=u.get(e),a=i?.get(r);if(a===void 0){let n=q(e,...t).sql;a={sql:n,statement:c.prepare(n)},i===void 0&&(i=/* @__PURE__ */ new Map,u.set(e,i)),i.set(r,a)}o.trace({query:{sql:a.sql,parameters:n}});let s=a.statement.exec(n);return o.trace({result:s}),s},iterate:(e,t)=>{f(e,()=>{c.iterate(e,t)})},transaction:(e=>{let t={stack:[],error:void 0,hasError:!1};try{o.trace(`begin`),d(`begin;`,[]);let n=Ao(t,new DisposableStack,!1),r=!0;n.defer(()=>{r&&(o.trace(`rollback`),d(`rollback;`,[]))});let i=e();return i!=null&&!i.ok?i:(o.trace(`commit`),d(`commit;`,[]),r=!1,i)}catch(e){t.error=e,t.hasError=!0}finally{jo(t)}}),export:()=>c.export()},s))}catch(e){r.error=e,r.hasError=!0}finally{let e=jo(r);e&&await e}},Fo=e=>e.map(t=>{let n=t.parent,r=0;do{let t=e.find(e=>e.id===n);if(!t)break;n=t.parent,r++}while(1);return`${`  `.repeat(r)}${t.detail}`}).join(`
`),q=(e,...t)=>{let n=``,r=[];for(let i=0;i<e.length;i++)if(n+=e[i],i<t.length){let e=t[i];typeof e==`object`&&e&&`type`in e?n+=e.sql:(n+=`?`,r.push(typeof e==`number`?qn.orThrow(e):e))}return{sql:n.trim(),parameters:r}};q.identifier=e=>({type:`SqlIdentifier`,sql:`"${e.replaceAll(`"`,`""`)}"`}),q.raw=e=>({type:`RawSql`,sql:e});const Io=/*#__PURE__*/ k({name:C,sql:C}),Lo=e=>({excludeIndexNamePrefix:t}={})=>{let n=b();e.sqlite.exec(q`
      select
        sqlite_master.name as tableName,
        table_info.name as columnName
      from sqlite_master
      join pragma_table_info(sqlite_master.name) as table_info;
    `).rows.forEach(({tableName:e,columnName:t})=>{(n[e]??=/* @__PURE__ */ new Set).add(t)});let r=t==null?``:` and name not like '${t.replaceAll(`'`,`''`)}%'`;return{tables:n,indexes:e.sqlite.exec(q`
        select name, sql
        from sqlite_master
        where
          type = 'index'
          and name not like 'sqlite_%'
          ${q.raw(r)};
      `).rows.map(e=>({name:e.name,sql:e.sql.replace(`CREATE INDEX`,`create index`).replace(`CREATE UNIQUE INDEX`,`create unique index`)}))}},Ro=/*#__PURE__*/ Tn(0,1),zo=e=>+!!e,Bo=e=>e===1;globalThis.WebSocket.CONNECTING,globalThis.WebSocket.OPEN,globalThis.WebSocket.CLOSING,globalThis.WebSocket.CLOSED;const Vo=/* @__PURE__ */ new Set;let Ho=null;const Uo=/* @__PURE__ */ new Map,Wo=/* @__PURE__ */ new Set;let Go;const Ko=e=>{Ho={scheduler:e,task:e.unstable_scheduleCallback(e.unstable_NormalPriority,()=>{Ho=null;let t=Vo.values().next().value;N(t),Vo.delete(t),Vo.size>0&&Ko(e);try{Jo(t)}catch(e){throw queueMicrotask(qo),e}})}},qo=()=>{if(!Ho)return;let{scheduler:e,task:t}=Ho;e.unstable_cancelCallback(t),Ko(e)},Jo=e=>{try{e.callback()}finally{queueMicrotask(Yo)}},Yo=()=>{Vo.size>0||Uo.size>0||Wo.size===0||Go!=null||(Go=setTimeout(()=>{Go=void 0;for(let e of Wo)e();Wo.clear()},0))},Xo=/*#__PURE__*/ jn(`OwnerId`,Bn),Zo=e=>Hn(e),Qo=e=>Un(e),$o=/*#__PURE__*/ Jn.orThrow(16);function es(e){return e===void 0||e===void 0}function ts(e){return typeof e==`string`}function ns(e){return typeof e==`number`}function rs(e){return typeof e==`boolean`}function is(e){return e===null}function as(e){return e instanceof Date}function os(e){return typeof e==`bigint`}function ss(e){return typeof e==`function`}function cs(e){return typeof e==`object`&&!!e}function J(e){return Object.freeze(e)}function ls(e){return us(e)?e:[e]}function us(e){return Array.isArray(e)}function ds(e){return e}function fs(e){return e instanceof Error?e.message:String(e)}const Y=J({is(e){return e.kind===`AlterTableNode`},create(e){return J({kind:`AlterTableNode`,table:e})},cloneWithTableProps(e,t){return J({...e,...t})},cloneWithColumnAlteration(e,t){return J({...e,columnAlterations:e.columnAlterations?[...e.columnAlterations,t]:[t]})}}),X=J({is(e){return e.kind===`IdentifierNode`},create(e){return J({kind:`IdentifierNode`,name:e})}}),ps=J({is(e){return e.kind===`CreateIndexNode`},create(e){return J({kind:`CreateIndexNode`,name:X.create(e)})},cloneWith(e,t){return J({...e,...t})},cloneWithColumns(e,t){return J({...e,columns:[...e.columns||[],...t]})}}),ms=J({is(e){return e.kind===`CreateSchemaNode`},create(e,t){return J({kind:`CreateSchemaNode`,schema:X.create(e),...t})},cloneWith(e,t){return J({...e,...t})}}),hs=[`preserve rows`,`delete rows`,`drop`],gs=J({is(e){return e.kind===`CreateTableNode`},create(e){return J({kind:`CreateTableNode`,table:e,columns:J([])})},cloneWithColumn(e,t){return J({...e,columns:J([...e.columns,t])})},cloneWithConstraint(e,t){return J({...e,constraints:e.constraints?J([...e.constraints,t]):J([t])})},cloneWithIndex(e,t){return J({...e,indexes:e.indexes?J([...e.indexes,t]):J([t])})},cloneWithFrontModifier(e,t){return J({...e,frontModifiers:e.frontModifiers?J([...e.frontModifiers,t]):J([t])})},cloneWithEndModifier(e,t){return J({...e,endModifiers:e.endModifiers?J([...e.endModifiers,t]):J([t])})},cloneWith(e,t){return J({...e,...t})}}),_s=J({is(e){return e.kind===`SchemableIdentifierNode`},create(e){return J({kind:`SchemableIdentifierNode`,identifier:X.create(e)})},createWithSchema(e,t){return J({kind:`SchemableIdentifierNode`,schema:X.create(e),identifier:X.create(t)})}}),vs=J({is(e){return e.kind===`DropIndexNode`},create(e,t){return J({kind:`DropIndexNode`,name:_s.create(e),...t})},cloneWith(e,t){return J({...e,...t})}}),ys=J({is(e){return e.kind===`DropSchemaNode`},create(e,t){return J({kind:`DropSchemaNode`,schema:X.create(e),...t})},cloneWith(e,t){return J({...e,...t})}}),bs=J({is(e){return e.kind===`DropTableNode`},create(e,t){return J({kind:`DropTableNode`,table:e,...t})},cloneWith(e,t){return J({...e,...t})}}),xs=J({is(e){return e.kind===`AliasNode`},create(e,t){return J({kind:`AliasNode`,node:e,alias:t})}}),Ss=J({is(e){return e.kind===`TableNode`},create(e){return J({kind:`TableNode`,table:_s.create(e)})},createWithSchema(e,t){return J({kind:`TableNode`,table:_s.createWithSchema(e,t)})}});function Cs(e){return cs(e)&&ss(e.toOperationNode)}function ws(e){return cs(e)&&`expressionType`in e&&Cs(e)}function Ts(e){return cs(e)&&`expression`in e&&ts(e.alias)&&Cs(e)}const Es=J({is(e){return e.kind===`SelectModifierNode`},create(e,t){return J({kind:`SelectModifierNode`,modifier:e,of:t})},createWithExpression(e){return J({kind:`SelectModifierNode`,rawModifier:e})}}),Ds=J({is(e){return e.kind===`AndNode`},create(e,t){return J({kind:`AndNode`,left:e,right:t})}}),Os=J({is(e){return e.kind===`OrNode`},create(e,t){return J({kind:`OrNode`,left:e,right:t})}}),ks=J({is(e){return e.kind===`OnNode`},create(e){return J({kind:`OnNode`,on:e})},cloneWithOperation(e,t,n){return J({...e,on:t===`And`?Ds.create(e.on,n):Os.create(e.on,n)})}}),As=J({is(e){return e.kind===`JoinNode`},create(e,t){return J({kind:`JoinNode`,joinType:e,table:t,on:void 0})},createWithOn(e,t,n){return J({kind:`JoinNode`,joinType:e,table:t,on:ks.create(n)})},cloneWithOn(e,t){return J({...e,on:e.on?ks.cloneWithOperation(e.on,`And`,t):ks.create(t)})}}),js=J({is(e){return e.kind===`BinaryOperationNode`},create(e,t,n){return J({kind:`BinaryOperationNode`,leftOperand:e,operator:t,rightOperand:n})}}),Ms=J({"=":!0,"==":!0,"!=":!0,"<>":!0,">":!0,">=":!0,"<":!0,"<=":!0,in:!0,"not in":!0,is:!0,"is not":!0,like:!0,"not like":!0,match:!0,ilike:!0,"not ilike":!0,"@>":!0,"<@":!0,"^@":!0,"&&":!0,"?":!0,"?&":!0,"?|":!0,"!<":!0,"!>":!0,"<=>":!0,"!~":!0,"~":!0,"~*":!0,"!~*":!0,"@@":!0,"@@@":!0,"!!":!0,"<->":!0,regexp:!0,"is distinct from":!0,"is not distinct from":!0});Object.keys(Ms);const Ns=J({"+":!0,"-":!0,"*":!0,"/":!0,"%":!0,"^":!0,"&":!0,"|":!0,"#":!0,"<<":!0,">>":!0});Object.keys(Ns);const Ps=J({"->":!0,"->>":!0}),Fs=Object.keys(Ps),Is=J({...Ms,...Ns,"||":!0}),Ls=Object.keys(Is),Rs=J({exists:!0,"not exists":!0});Object.keys(Rs);const zs=J({...Rs,"-":!0,not:!0}),Bs=Object.keys(zs);[...Ls,...Fs,...Bs];const Vs=J({is(e){return e.kind===`OperatorNode`},create(e){return J({kind:`OperatorNode`,operator:e})}});function Hs(e){return ts(e)&&Is[e]}function Us(e){return ts(e)&&Ps[e]}function Ws(e){return ts(e)&&zs[e]}const Gs=J({is(e){return e.kind===`ColumnNode`},create(e){return J({kind:`ColumnNode`,column:X.create(e)})}}),Ks=J({is(e){return e.kind===`SelectAllNode`},create(){return J({kind:`SelectAllNode`})}}),qs=J({is(e){return e.kind===`ReferenceNode`},create(e,t){return J({kind:`ReferenceNode`,table:t,column:e})},createSelectAll(e){return J({kind:`ReferenceNode`,table:e,column:Ks.create()})}});var Js=class{#e;get dynamicReference(){return this.#e}get refType(){}constructor(e){this.#e=e}toOperationNode(){return uc(this.#e)}};function Ys(e){return cs(e)&&Cs(e)&&ts(e.dynamicReference)}const Xs=J({is(e){return e.kind===`OrderByItemNode`},create(e,t){return J({kind:`OrderByItemNode`,orderBy:e,direction:t})},cloneWith(e,t){return J({...e,...t})}}),Zs=J({is(e){return e.kind===`RawNode`},create(e,t){return J({kind:`RawNode`,sqlFragments:J(e),parameters:J(t)})},createWithSql(e){return Zs.create([e],[])},createWithChild(e){return Zs.create([``,``],[e])},createWithChildren(e){return Zs.create(Array(e.length+1).fill(``),e)}}),Qs=J({is(e){return e.kind===`CollateNode`},create(e){return J({kind:`CollateNode`,collation:X.create(e)})}});var $s=class e{#e;constructor(e){this.#e=J(e)}desc(){return new e({node:Xs.cloneWith(this.#e.node,{direction:Zs.createWithSql(`desc`)})})}asc(){return new e({node:Xs.cloneWith(this.#e.node,{direction:Zs.createWithSql(`asc`)})})}nullsLast(){return new e({node:Xs.cloneWith(this.#e.node,{nulls:`last`})})}nullsFirst(){return new e({node:Xs.cloneWith(this.#e.node,{nulls:`first`})})}collate(t){return new e({node:Xs.cloneWith(this.#e.node,{collation:Qs.create(t)})})}toOperationNode(){return this.#e.node}};const ec=/* @__PURE__ */ new Set;function tc(e){ec.has(e)||(ec.add(e),console.log(e))}function nc(e){return e===`asc`||e===`desc`}function rc(e){if(e.length===2)return[ic(e[0],e[1])];if(e.length===1){let[t]=e;return Array.isArray(t)?(tc(`orderBy(array) is deprecated, use multiple orderBy calls instead.`),t.map(e=>ic(e))):[ic(t)]}throw Error(`Invalid number of arguments at order by! expected 1-2, received ${e.length}`)}function ic(e,t){let n=ac(e);if(Xs.is(n)){if(t)throw Error(`Cannot specify direction twice!`);return n}return oc(n,t)}function ac(e){if(Cd(e))return xd(e);if(Ys(e))return e.toOperationNode();let[t,n]=e.split(` `);return n?(tc("`orderBy('column asc')` is deprecated. Use `orderBy('column', 'asc')` instead."),oc(mc(t),n)):mc(e)}function oc(e,t){if(typeof t==`string`){if(!nc(t))throw Error(`Invalid order by direction: ${t}`);return Xs.create(e,Zs.createWithSql(t))}if(ws(t))return tc("`orderBy(..., expr)` is deprecated. Use `orderBy(..., 'asc')` or `orderBy(..., (ob) => ...)` instead."),Xs.create(e,t.toOperationNode());let n=Xs.create(e);return t?t(new $s({node:n})).toOperationNode():n}const sc=J({is(e){return e.kind===`JSONReferenceNode`},create(e,t){return J({kind:`JSONReferenceNode`,reference:e,traversal:t})},cloneWithTraversal(e,t){return J({...e,traversal:t})}}),cc=J({is(e){return e.kind===`JSONOperatorChainNode`},create(e){return J({kind:`JSONOperatorChainNode`,operator:e,values:J([])})},cloneWithValue(e,t){return J({...e,values:J([...e.values,t])})}}),lc=J({is(e){return e.kind===`JSONPathNode`},create(e){return J({kind:`JSONPathNode`,inOperator:e,pathLegs:J([])})},cloneWithLeg(e,t){return J({...e,pathLegs:J([...e.pathLegs,t])})}});function uc(e){return ts(e)?mc(e):e.toOperationNode()}function dc(e){return us(e)?e.map(e=>fc(e)):[fc(e)]}function fc(e){return Cd(e)?xd(e):uc(e)}function pc(e,t){if(Us(t))return sc.create(mc(e),cc.create(Vs.create(t)));if(t===`->$`||t===`->>$`)return sc.create(mc(e),lc.create(Vs.create(t.slice(0,-1))));throw Error(`Invalid JSON operator: ${t}`)}function mc(e){if(!e.includes(`.`))return qs.create(Gs.create(e));let t=e.split(`.`).map(bc);if(t.length===3)return vc(t);if(t.length===2)return yc(t);throw Error(`invalid column reference ${e}`)}function hc(e){let t=` as `;if(e.includes(t)){let[n,r]=e.split(t).map(bc);return xs.create(mc(n),X.create(r))}return mc(e)}function gc(e){return Gs.create(e)}function _c(e){if(e.includes(` `)){let[t,n]=e.split(` `).map(bc);if(!nc(n))throw Error(`invalid order direction "${n}" next to "${t}"`);return rc([t,n])[0]}return gc(e)}function vc(e){let[t,n,r]=e;return qs.create(Gs.create(r),Ss.createWithSchema(t,n))}function yc(e){let[t,n]=e;return qs.create(Gs.create(n),Ss.create(t))}function bc(e){return e.trim()}const xc=J({is(e){return e.kind===`PrimitiveValueListNode`},create(e){return J({kind:`PrimitiveValueListNode`,values:J([...e])})}}),Sc=J({is(e){return e.kind===`ValueListNode`},create(e){return J({kind:`ValueListNode`,values:J(e)})}}),Cc=J({is(e){return e.kind===`ValueNode`},create(e){return J({kind:`ValueNode`,value:e})},createImmediate(e){return J({kind:`ValueNode`,value:e,immediate:!0})}});function wc(e){return us(e)?Oc(e):Tc(e)}function Tc(e){return Cd(e)?xd(e):Cc.create(e)}function Ec(e){return ns(e)||rs(e)||is(e)}function Dc(e){if(!Ec(e))throw Error(`unsafe immediate value ${JSON.stringify(e)}`);return Cc.createImmediate(e)}function Oc(e){return e.some(Cd)?Sc.create(e.map(e=>Tc(e))):xc.create(e)}const kc=J({is(e){return e.kind===`ParensNode`},create(e){return J({kind:`ParensNode`,node:e})}});function Ac(e){if(e.length===3)return jc(e[0],e[1],e[2]);if(e.length===1)return Tc(e[0]);throw Error(`invalid arguments: ${JSON.stringify(e)}`)}function jc(e,t,n){return Fc(t)&&Ic(n)?js.create(fc(e),Lc(t),Cc.createImmediate(n)):js.create(fc(e),Lc(t),wc(n))}function Mc(e,t,n){return js.create(fc(e),Lc(t),fc(n))}function Nc(e,t){return Pc(Object.entries(e).filter(([,e])=>!es(e)).map(([e,t])=>jc(e,Ic(t)?`is`:`=`,t)),t)}function Pc(e,t,n=!0){let r=t===`and`?Ds.create:Os.create;if(e.length===0)return js.create(Cc.createImmediate(1),Vs.create(`=`),Cc.createImmediate(+(t===`and`)));let i=Rc(e[0]);for(let t=1;t<e.length;++t)i=r(i,Rc(e[t]));return e.length>1&&n?kc.create(i):i}function Fc(e){return e===`is`||e===`is not`}function Ic(e){return is(e)||rs(e)}function Lc(e){if(Hs(e))return Vs.create(e);if(Cs(e))return e.toOperationNode();throw Error(`invalid operator ${JSON.stringify(e)}`)}function Rc(e){return Cs(e)?e.toOperationNode():e}const zc=J({is(e){return e.kind===`OrderByNode`},create(e){return J({kind:`OrderByNode`,items:J([...e])})},cloneWithItems(e,t){return J({...e,items:J([...e.items,...t])})}}),Bc=J({is(e){return e.kind===`PartitionByNode`},create(e){return J({kind:`PartitionByNode`,items:J(e)})},cloneWithItems(e,t){return J({...e,items:J([...e.items,...t])})}}),Vc=J({is(e){return e.kind===`OverNode`},create(){return J({kind:`OverNode`})},cloneWithOrderByItems(e,t){return J({...e,orderBy:e.orderBy?zc.cloneWithItems(e.orderBy,t):zc.create(t)})},cloneWithPartitionByItems(e,t){return J({...e,partitionBy:e.partitionBy?Bc.cloneWithItems(e.partitionBy,t):Bc.create(t)})}}),Hc=J({is(e){return e.kind===`FromNode`},create(e){return J({kind:`FromNode`,froms:J(e)})},cloneWithFroms(e,t){return J({...e,froms:J([...e.froms,...t])})}}),Uc=J({is(e){return e.kind===`GroupByNode`},create(e){return J({kind:`GroupByNode`,items:J(e)})},cloneWithItems(e,t){return J({...e,items:J([...e.items,...t])})}}),Wc=J({is(e){return e.kind===`HavingNode`},create(e){return J({kind:`HavingNode`,having:e})},cloneWithOperation(e,t,n){return J({...e,having:t===`And`?Ds.create(e.having,n):Os.create(e.having,n)})}}),Gc=J({is(e){return e.kind===`InsertQueryNode`},create(e,t,n){return J({kind:`InsertQueryNode`,into:e,...t&&{with:t},replace:n})},createWithoutInto(){return J({kind:`InsertQueryNode`})},cloneWith(e,t){return J({...e,...t})}}),Kc=J({is(e){return e.kind===`ListNode`},create(e){return J({kind:`ListNode`,items:J(e)})}}),qc=J({is(e){return e.kind===`UpdateQueryNode`},create(e,t){return J({kind:`UpdateQueryNode`,table:e.length===1?e[0]:Kc.create(e),...t&&{with:t}})},createWithoutTable(){return J({kind:`UpdateQueryNode`})},cloneWithFromItems(e,t){return J({...e,from:e.from?Hc.cloneWithFroms(e.from,t):Hc.create(t)})},cloneWithUpdates(e,t){return J({...e,updates:e.updates?J([...e.updates,...t]):t})},cloneWithLimit(e,t){return J({...e,limit:t})}}),Jc=J({is(e){return e.kind===`UsingNode`},create(e){return J({kind:`UsingNode`,tables:J(e)})},cloneWithTables(e,t){return J({...e,tables:J([...e.tables,...t])})}}),Yc=J({is(e){return e.kind===`DeleteQueryNode`},create(e,t){return J({kind:`DeleteQueryNode`,from:Hc.create(e),...t&&{with:t}})},cloneWithOrderByItems:(e,t)=>Z.cloneWithOrderByItems(e,t),cloneWithoutOrderBy:e=>Z.cloneWithoutOrderBy(e),cloneWithLimit(e,t){return J({...e,limit:t})},cloneWithoutLimit(e){return J({...e,limit:void 0})},cloneWithUsing(e,t){return J({...e,using:e.using===void 0?Jc.create(t):Jc.cloneWithTables(e.using,t)})}}),Xc=J({is(e){return e.kind===`WhereNode`},create(e){return J({kind:`WhereNode`,where:e})},cloneWithOperation(e,t,n){return J({...e,where:t===`And`?Ds.create(e.where,n):Os.create(e.where,n)})}}),Zc=J({is(e){return e.kind===`ReturningNode`},create(e){return J({kind:`ReturningNode`,selections:J(e)})},cloneWithSelections(e,t){return J({...e,selections:e.selections?J([...e.selections,...t]):J(t)})}}),Qc=J({is(e){return e.kind===`ExplainNode`},create(e,t){return J({kind:`ExplainNode`,format:e,options:t})}}),$c=J({is(e){return e.kind===`WhenNode`},create(e){return J({kind:`WhenNode`,condition:e})},cloneWithResult(e,t){return J({...e,result:t})}}),el=J({is(e){return e.kind===`MergeQueryNode`},create(e,t){return J({kind:`MergeQueryNode`,into:e,...t&&{with:t}})},cloneWithUsing(e,t){return J({...e,using:t})},cloneWithWhen(e,t){return J({...e,whens:e.whens?J([...e.whens,t]):J([t])})},cloneWithThen(e,t){return J({...e,whens:e.whens?J([...e.whens.slice(0,-1),$c.cloneWithResult(e.whens[e.whens.length-1],t)]):void 0})}}),tl=J({is(e){return e.kind===`OutputNode`},create(e){return J({kind:`OutputNode`,selections:J(e)})},cloneWithSelections(e,t){return J({...e,selections:e.selections?J([...e.selections,...t]):J(t)})}}),Z=J({is(e){return nl.is(e)||Gc.is(e)||qc.is(e)||Yc.is(e)||el.is(e)},cloneWithEndModifier(e,t){return J({...e,endModifiers:e.endModifiers?J([...e.endModifiers,t]):J([t])})},cloneWithWhere(e,t){return J({...e,where:e.where?Xc.cloneWithOperation(e.where,`And`,t):Xc.create(t)})},cloneWithJoin(e,t){return J({...e,joins:e.joins?J([...e.joins,t]):J([t])})},cloneWithReturning(e,t){return J({...e,returning:e.returning?Zc.cloneWithSelections(e.returning,t):Zc.create(t)})},cloneWithoutReturning(e){return J({...e,returning:void 0})},cloneWithoutWhere(e){return J({...e,where:void 0})},cloneWithExplain(e,t,n){return J({...e,explain:Qc.create(t,n?.toOperationNode())})},cloneWithTop(e,t){return J({...e,top:t})},cloneWithOutput(e,t){return J({...e,output:e.output?tl.cloneWithSelections(e.output,t):tl.create(t)})},cloneWithOrderByItems(e,t){return J({...e,orderBy:e.orderBy?zc.cloneWithItems(e.orderBy,t):zc.create(t)})},cloneWithoutOrderBy(e){return J({...e,orderBy:void 0})}}),nl=J({is(e){return e.kind===`SelectQueryNode`},create(e){return J({kind:`SelectQueryNode`,...e&&{with:e}})},createFrom(e,t){return J({kind:`SelectQueryNode`,from:Hc.create(e),...t&&{with:t}})},cloneWithSelections(e,t){return J({...e,selections:e.selections?J([...e.selections,...t]):J(t)})},cloneWithDistinctOn(e,t){return J({...e,distinctOn:e.distinctOn?J([...e.distinctOn,...t]):J(t)})},cloneWithFrontModifier(e,t){return J({...e,frontModifiers:e.frontModifiers?J([...e.frontModifiers,t]):J([t])})},cloneWithOrderByItems:(e,t)=>Z.cloneWithOrderByItems(e,t),cloneWithGroupByItems(e,t){return J({...e,groupBy:e.groupBy?Uc.cloneWithItems(e.groupBy,t):Uc.create(t)})},cloneWithLimit(e,t){return J({...e,limit:t})},cloneWithOffset(e,t){return J({...e,offset:t})},cloneWithFetch(e,t){return J({...e,fetch:t})},cloneWithHaving(e,t){return J({...e,having:e.having?Wc.cloneWithOperation(e.having,`And`,t):Wc.create(t)})},cloneWithSetOperations(e,t){return J({...e,setOperations:e.setOperations?J([...e.setOperations,...t]):J([...t])})},cloneWithoutSelections(e){return J({...e,selections:[]})},cloneWithoutLimit(e){return J({...e,limit:void 0})},cloneWithoutOffset(e){return J({...e,offset:void 0})},cloneWithoutOrderBy:e=>Z.cloneWithoutOrderBy(e),cloneWithoutGroupBy(e){return J({...e,groupBy:void 0})}});var rl=class e{#e;constructor(e){this.#e=J(e)}on(...t){return new e({...this.#e,joinNode:As.cloneWithOn(this.#e.joinNode,Ac(t))})}onRef(t,n,r){return new e({...this.#e,joinNode:As.cloneWithOn(this.#e.joinNode,Mc(t,n,r))})}onTrue(){return new e({...this.#e,joinNode:As.cloneWithOn(this.#e.joinNode,Zs.createWithSql(`true`))})}$call(e){return e(this)}toOperationNode(){return this.#e.joinNode}};const il=J({is(e){return e.kind===`PartitionByItemNode`},create(e){return J({kind:`PartitionByItemNode`,partitionBy:e})}});function al(e){return dc(e).map(il.create)}var ol=class e{#e;constructor(e){this.#e=J(e)}orderBy(...t){return new e({overNode:Vc.cloneWithOrderByItems(this.#e.overNode,rc(t))})}clearOrderBy(){return new e({overNode:Z.cloneWithoutOrderBy(this.#e.overNode)})}partitionBy(t){return new e({overNode:Vc.cloneWithPartitionByItems(this.#e.overNode,al(t))})}$call(e){return e(this)}toOperationNode(){return this.#e.overNode}};const sl=J({is(e){return e.kind===`SelectionNode`},create(e){return J({kind:`SelectionNode`,selection:e})},createSelectAll(){return J({kind:`SelectionNode`,selection:Ks.create()})},createSelectAllFromTable(e){return J({kind:`SelectionNode`,selection:qs.createSelectAll(e)})}});function cl(e){return ss(e)?cl(e(bd())):us(e)?e.map(e=>ll(e)):[ll(e)]}function ll(e){return ts(e)?sl.create(hc(e)):Ys(e)?sl.create(e.toOperationNode()):sl.create(Sd(e))}function ul(e){return e?Array.isArray(e)?e.map(dl):[dl(e)]:[sl.createSelectAll()]}function dl(e){if(ts(e))return sl.createSelectAllFromTable(Ad(e));throw Error(`invalid value selectAll expression: ${JSON.stringify(e)}`)}const fl=J({is(e){return e.kind===`ValuesNode`},create(e){return J({kind:`ValuesNode`,values:J(e)})}}),pl=J({is(e){return e.kind===`DefaultInsertValueNode`},create(){return J({kind:`DefaultInsertValueNode`})}});function ml(e){let t=ss(e)?e(bd()):e;return hl(us(t)?t:J([t]))}function hl(e){let t=gl(e);return[J([...t.keys()].map(Gs.create)),fl.create(e.map(e=>_l(e,t)))]}function gl(e){let t=/* @__PURE__ */ new Map;for(let n of e){let e=Object.keys(n);for(let r of e)!t.has(r)&&n[r]!==void 0&&t.set(r,t.size)}return t}function _l(e,t){let n=Object.keys(e),r=Array.from({length:t.size}),i=!1,a=n.length;for(let o of n){let n=t.get(o);if(es(n)){a--;continue}let s=e[o];(es(s)||Cd(s))&&(i=!0),r[n]=s}if(a<t.size||i){let e=pl.create();return Sc.create(r.map(t=>es(t)?e:Tc(t)))}return xc.create(r)}const vl=J({is(e){return e.kind===`ColumnUpdateNode`},create(e,t){return J({kind:`ColumnUpdateNode`,column:e,value:t})}});function yl(...e){return e.length===2?[vl.create(fc(e[0]),Tc(e[1]))]:bl(e[0])}function bl(e){let t=ss(e)?e(bd()):e;return Object.entries(t).filter(([e,t])=>t!==void 0).map(([e,t])=>vl.create(Gs.create(e),Tc(t)))}const xl=J({is(e){return e.kind===`OnDuplicateKeyNode`},create(e){return J({kind:`OnDuplicateKeyNode`,updates:e})}});var Sl=class{insertId;numInsertedOrUpdatedRows;constructor(e,t){this.insertId=e,this.numInsertedOrUpdatedRows=t}},Cl=class extends Error{node;constructor(e){super(`no result`),this.node=e}};function wl(e){return Object.prototype.hasOwnProperty.call(e,`prototype`)}const Tl=J({is(e){return e.kind===`OnConflictNode`},create(){return J({kind:`OnConflictNode`})},cloneWith(e,t){return J({...e,...t})},cloneWithIndexWhere(e,t){return J({...e,indexWhere:e.indexWhere?Xc.cloneWithOperation(e.indexWhere,`And`,t):Xc.create(t)})},cloneWithIndexOrWhere(e,t){return J({...e,indexWhere:e.indexWhere?Xc.cloneWithOperation(e.indexWhere,`Or`,t):Xc.create(t)})},cloneWithUpdateWhere(e,t){return J({...e,updateWhere:e.updateWhere?Xc.cloneWithOperation(e.updateWhere,`And`,t):Xc.create(t)})},cloneWithUpdateOrWhere(e,t){return J({...e,updateWhere:e.updateWhere?Xc.cloneWithOperation(e.updateWhere,`Or`,t):Xc.create(t)})},cloneWithoutIndexWhere(e){return J({...e,indexWhere:void 0})},cloneWithoutUpdateWhere(e){return J({...e,updateWhere:void 0})}});var El=class e{#e;constructor(e){this.#e=J(e)}column(t){let n=Gs.create(t);return new e({...this.#e,onConflictNode:Tl.cloneWith(this.#e.onConflictNode,{columns:this.#e.onConflictNode.columns?J([...this.#e.onConflictNode.columns,n]):J([n])})})}columns(t){let n=t.map(Gs.create);return new e({...this.#e,onConflictNode:Tl.cloneWith(this.#e.onConflictNode,{columns:this.#e.onConflictNode.columns?J([...this.#e.onConflictNode.columns,...n]):J(n)})})}constraint(t){return new e({...this.#e,onConflictNode:Tl.cloneWith(this.#e.onConflictNode,{constraint:X.create(t)})})}expression(t){return new e({...this.#e,onConflictNode:Tl.cloneWith(this.#e.onConflictNode,{indexExpression:t.toOperationNode()})})}where(...t){return new e({...this.#e,onConflictNode:Tl.cloneWithIndexWhere(this.#e.onConflictNode,Ac(t))})}whereRef(t,n,r){return new e({...this.#e,onConflictNode:Tl.cloneWithIndexWhere(this.#e.onConflictNode,Mc(t,n,r))})}clearWhere(){return new e({...this.#e,onConflictNode:Tl.cloneWithoutIndexWhere(this.#e.onConflictNode)})}doNothing(){return new Dl({...this.#e,onConflictNode:Tl.cloneWith(this.#e.onConflictNode,{doNothing:!0})})}doUpdateSet(e){return new Ol({...this.#e,onConflictNode:Tl.cloneWith(this.#e.onConflictNode,{updates:bl(e)})})}$call(e){return e(this)}},Dl=class{#e;constructor(e){this.#e=J(e)}toOperationNode(){return this.#e.onConflictNode}},Ol=class e{#e;constructor(e){this.#e=J(e)}where(...t){return new e({...this.#e,onConflictNode:Tl.cloneWithUpdateWhere(this.#e.onConflictNode,Ac(t))})}whereRef(t,n,r){return new e({...this.#e,onConflictNode:Tl.cloneWithUpdateWhere(this.#e.onConflictNode,Mc(t,n,r))})}clearWhere(){return new e({...this.#e,onConflictNode:Tl.cloneWithoutUpdateWhere(this.#e.onConflictNode)})}$call(e){return e(this)}toOperationNode(){return this.#e.onConflictNode}};const kl=J({is(e){return e.kind===`TopNode`},create(e,t){return J({kind:`TopNode`,expression:e,modifiers:t})}});function Al(e,t){if(!ns(e)&&!os(e))throw Error(`Invalid top expression: ${e}`);if(!es(t)&&!jl(t))throw Error(`Invalid top modifiers: ${t}`);return kl.create(e,t)}function jl(e){return e===`percent`||e===`with ties`||e===`percent with ties`}const Ml=J({is(e){return e.kind===`OrActionNode`},create(e){return J({kind:`OrActionNode`,action:e})}});var Nl=class e{#e;constructor(e){this.#e=J(e)}values(t){let[n,r]=ml(t);return new e({...this.#e,queryNode:Gc.cloneWith(this.#e.queryNode,{columns:n,values:r})})}columns(t){return new e({...this.#e,queryNode:Gc.cloneWith(this.#e.queryNode,{columns:J(t.map(Gs.create))})})}expression(t){return new e({...this.#e,queryNode:Gc.cloneWith(this.#e.queryNode,{values:xd(t)})})}defaultValues(){return new e({...this.#e,queryNode:Gc.cloneWith(this.#e.queryNode,{defaultValues:!0})})}modifyEnd(t){return new e({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,t.toOperationNode())})}ignore(){return new e({...this.#e,queryNode:Gc.cloneWith(this.#e.queryNode,{orAction:Ml.create(`ignore`)})})}orIgnore(){return new e({...this.#e,queryNode:Gc.cloneWith(this.#e.queryNode,{orAction:Ml.create(`ignore`)})})}orAbort(){return new e({...this.#e,queryNode:Gc.cloneWith(this.#e.queryNode,{orAction:Ml.create(`abort`)})})}orFail(){return new e({...this.#e,queryNode:Gc.cloneWith(this.#e.queryNode,{orAction:Ml.create(`fail`)})})}orReplace(){return new e({...this.#e,queryNode:Gc.cloneWith(this.#e.queryNode,{orAction:Ml.create(`replace`)})})}orRollback(){return new e({...this.#e,queryNode:Gc.cloneWith(this.#e.queryNode,{orAction:Ml.create(`rollback`)})})}top(t,n){return new e({...this.#e,queryNode:Z.cloneWithTop(this.#e.queryNode,Al(t,n))})}onConflict(t){return new e({...this.#e,queryNode:Gc.cloneWith(this.#e.queryNode,{onConflict:t(new El({onConflictNode:Tl.create()})).toOperationNode()})})}onDuplicateKeyUpdate(t){return new e({...this.#e,queryNode:Gc.cloneWith(this.#e.queryNode,{onDuplicateKey:xl.create(bl(t))})})}returning(t){return new e({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,cl(t))})}returningAll(){return new e({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,ul())})}output(t){return new e({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,cl(t))})}outputAll(t){return new e({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,ul(t))})}clearReturning(){return new e({...this.#e,queryNode:Z.cloneWithoutReturning(this.#e.queryNode)})}$call(e){return e(this)}$if(t,n){return t?n(this):new e({...this.#e})}$castTo(){return new e(this.#e)}$narrowType(){return new e(this.#e)}$assertType(){return new e(this.#e)}withPlugin(t){return new e({...this.#e,executor:this.#e.executor.withPlugin(t)})}toOperationNode(){return this.#e.executor.transformQuery(this.#e.queryNode,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){let t=this.compile(),n=await this.#e.executor.executeQuery(t,e),{adapter:r}=this.#e.executor,i=t.query;return i.returning&&r.supportsReturning||i.output&&r.supportsOutput?n.rows:[new Sl(n.insertId,n.numAffectedRows??BigInt(0))]}async executeTakeFirst(e){let[t]=await this.execute(e);return t}async executeTakeFirstOrThrow(e){typeof e==`function`&&(e={errorConstructor:e});let t=await this.executeTakeFirst(e);if(t===void 0){let t=e?.errorConstructor??Cl;throw wl(t)?new t(this.toOperationNode()):t(this.toOperationNode())}return t}async*stream(e){typeof e!=`object`&&(e={chunkSize:e});let t=this.compile(),n=this.#e.executor.stream(t,e.chunkSize??100,e);for await(let e of n)yield*e.rows}async explain(t,n){return await new e({...this.#e,queryNode:Z.cloneWithExplain(this.#e.queryNode,t,n)}).execute()}},Pl=class{numDeletedRows;constructor(e){this.numDeletedRows=e}};const Fl=J({is(e){return e.kind===`LimitNode`},create(e){return J({kind:`LimitNode`,limit:e})}});var Il,Ll=class{#e;constructor(e){this.#e=J(e)}where(...e){return new Il({...this.#e,queryNode:Z.cloneWithWhere(this.#e.queryNode,Ac(e))})}whereRef(e,t,n){return new Il({...this.#e,queryNode:Z.cloneWithWhere(this.#e.queryNode,Mc(e,t,n))})}clearWhere(){return new Il({...this.#e,queryNode:Z.cloneWithoutWhere(this.#e.queryNode)})}top(e,t){return new Il({...this.#e,queryNode:Z.cloneWithTop(this.#e.queryNode,Al(e,t))})}using(e){return new Il({...this.#e,queryNode:Yc.cloneWithUsing(this.#e.queryNode,Dd(e))})}innerJoin(...e){return this.#t(`InnerJoin`,e)}leftJoin(...e){return this.#t(`LeftJoin`,e)}rightJoin(...e){return this.#t(`RightJoin`,e)}fullJoin(...e){return this.#t(`FullJoin`,e)}#t(e,t){return new Il({...this.#e,queryNode:Z.cloneWithJoin(this.#e.queryNode,Au(e,t))})}returning(e){return new Il({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,cl(e))})}returningAll(e){return new Il({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,ul(e))})}output(e){return new Il({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,cl(e))})}outputAll(e){return new Il({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,ul(e))})}clearReturning(){return new Il({...this.#e,queryNode:Z.cloneWithoutReturning(this.#e.queryNode)})}clearLimit(){return new Il({...this.#e,queryNode:Yc.cloneWithoutLimit(this.#e.queryNode)})}orderBy(...e){return new Il({...this.#e,queryNode:Z.cloneWithOrderByItems(this.#e.queryNode,rc(e))})}clearOrderBy(){return new Il({...this.#e,queryNode:Z.cloneWithoutOrderBy(this.#e.queryNode)})}limit(e){return new Il({...this.#e,queryNode:Yc.cloneWithLimit(this.#e.queryNode,Fl.create(Tc(e)))})}modifyEnd(e){return new Il({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,e.toOperationNode())})}$call(e){return e(this)}$if(e,t){return e?t(this):new Il({...this.#e})}$castTo(){return new Il(this.#e)}$narrowType(){return new Il(this.#e)}$assertType(){return new Il(this.#e)}withPlugin(e){return new Il({...this.#e,executor:this.#e.executor.withPlugin(e)})}toOperationNode(){return this.#e.executor.transformQuery(this.#e.queryNode,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){let t=this.compile(),n=await this.#e.executor.executeQuery(t,e),{adapter:r}=this.#e.executor,i=t.query;return i.returning&&r.supportsReturning||i.output&&r.supportsOutput?n.rows:[new Pl(n.numAffectedRows??BigInt(0))]}async executeTakeFirst(e){let[t]=await this.execute(e);return t}async executeTakeFirstOrThrow(e){typeof e==`function`&&(e={errorConstructor:e});let t=await this.executeTakeFirst(e);if(t===void 0){let t=e?.errorConstructor??Cl;throw wl(t)?new t(this.toOperationNode()):t(this.toOperationNode())}return t}async*stream(e){typeof e!=`object`&&(e={chunkSize:e});let t=this.compile(),n=this.#e.executor.stream(t,e.chunkSize??100,e);for await(let e of n)yield*e.rows}async explain(e,t){return await new Il({...this.#e,queryNode:Z.cloneWithExplain(this.#e.queryNode,e,t)}).execute()}};Il=Ll;var Rl=class{numUpdatedRows;numChangedRows;constructor(e,t){this.numUpdatedRows=e,this.numChangedRows=t}},zl,Bl=class{#e;constructor(e){this.#e=J(e)}where(...e){return new zl({...this.#e,queryNode:Z.cloneWithWhere(this.#e.queryNode,Ac(e))})}whereRef(e,t,n){return new zl({...this.#e,queryNode:Z.cloneWithWhere(this.#e.queryNode,Mc(e,t,n))})}clearWhere(){return new zl({...this.#e,queryNode:Z.cloneWithoutWhere(this.#e.queryNode)})}top(e,t){return new zl({...this.#e,queryNode:Z.cloneWithTop(this.#e.queryNode,Al(e,t))})}from(e){return new zl({...this.#e,queryNode:qc.cloneWithFromItems(this.#e.queryNode,Dd(e))})}innerJoin(...e){return this.#t(`InnerJoin`,e)}leftJoin(...e){return this.#t(`LeftJoin`,e)}rightJoin(...e){return this.#t(`RightJoin`,e)}fullJoin(...e){return this.#t(`FullJoin`,e)}#t(e,t){return new zl({...this.#e,queryNode:Z.cloneWithJoin(this.#e.queryNode,Au(e,t))})}orderBy(...e){return new zl({...this.#e,queryNode:Z.cloneWithOrderByItems(this.#e.queryNode,rc(e))})}clearOrderBy(){return new zl({...this.#e,queryNode:Z.cloneWithoutOrderBy(this.#e.queryNode)})}limit(e){return new zl({...this.#e,queryNode:qc.cloneWithLimit(this.#e.queryNode,Fl.create(Tc(e)))})}set(...e){return new zl({...this.#e,queryNode:qc.cloneWithUpdates(this.#e.queryNode,yl(...e))})}returning(e){return new zl({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,cl(e))})}returningAll(e){return new zl({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,ul(e))})}output(e){return new zl({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,cl(e))})}outputAll(e){return new zl({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,ul(e))})}modifyEnd(e){return new zl({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,e.toOperationNode())})}clearReturning(){return new zl({...this.#e,queryNode:Z.cloneWithoutReturning(this.#e.queryNode)})}$call(e){return e(this)}$if(e,t){return e?t(this):new zl({...this.#e})}$castTo(){return new zl(this.#e)}$narrowType(){return new zl(this.#e)}$assertType(){return new zl(this.#e)}withPlugin(e){return new zl({...this.#e,executor:this.#e.executor.withPlugin(e)})}toOperationNode(){return this.#e.executor.transformQuery(this.#e.queryNode,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){let t=this.compile(),n=await this.#e.executor.executeQuery(t,e),{adapter:r}=this.#e.executor,i=t.query;return i.returning&&r.supportsReturning||i.output&&r.supportsOutput?n.rows:[new Rl(n.numAffectedRows??BigInt(0),n.numChangedRows)]}async executeTakeFirst(e){let[t]=await this.execute(e);return t}async executeTakeFirstOrThrow(e){typeof e==`function`&&(e={errorConstructor:e});let t=await this.executeTakeFirst(e);if(t===void 0){let t=e?.errorConstructor??Cl;throw wl(t)?new t(this.toOperationNode()):t(this.toOperationNode())}return t}async*stream(e){typeof e!=`object`&&(e={chunkSize:e});let t=this.compile(),n=this.#e.executor.stream(t,e.chunkSize??100,e);for await(let e of n)yield*e.rows}async explain(e,t){return await new zl({...this.#e,queryNode:Z.cloneWithExplain(this.#e.queryNode,e,t)}).execute()}};zl=Bl;const Vl=J({is(e){return e.kind===`CommonTableExpressionNameNode`},create(e,t){return J({kind:`CommonTableExpressionNameNode`,table:Ss.create(e),columns:t?J(t.map(Gs.create)):void 0})}}),Hl=J({is(e){return e.kind===`CommonTableExpressionNode`},create(e,t){return J({kind:`CommonTableExpressionNode`,name:e,expression:t})},cloneWith(e,t){return J({...e,...t})}});var Ul=class e{#e;constructor(e){this.#e=J(e)}materialized(){return new e({...this.#e,node:Hl.cloneWith(this.#e.node,{materialized:!0})})}notMaterialized(){return new e({...this.#e,node:Hl.cloneWith(this.#e.node,{materialized:!1})})}toOperationNode(){return this.#e.node}};function Wl(e,t){let n=Cs(t)?t.toOperationNode():t(Du()).toOperationNode();return ss(e)?e(Gl(n)).toOperationNode():Hl.create(Kl(e),n)}function Gl(e){return t=>new Ul({node:Hl.create(Kl(t),e)})}function Kl(e){if(e.includes(`(`)){let t=e.split(/[\(\)]/),n=t[0],r=t[1].split(`,`).map(e=>e.trim());return Vl.create(n,r)}return Vl.create(e)}const ql=J({is(e){return e.kind===`WithNode`},create(e,t){return J({kind:`WithNode`,expressions:J([e]),...t})},cloneWithExpression(e,t){return J({...e,expressions:J([...e.expressions,t])})}}),Jl=/* @__PURE__ */ `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`.split(``);function Yl(e){let t=``;for(let n=0;n<e;++n)t+=Xl();return t}function Xl(){return Jl[~~(Math.random()*Jl.length)]}function Q(){return new Zl}var Zl=class{#e;get queryId(){return this.#e===void 0&&(this.#e=Yl(8)),this.#e}},Ql=class{nodeStack=[];#e=J({AliasNode:this.transformAlias.bind(this),ColumnNode:this.transformColumn.bind(this),IdentifierNode:this.transformIdentifier.bind(this),SchemableIdentifierNode:this.transformSchemableIdentifier.bind(this),RawNode:this.transformRaw.bind(this),ReferenceNode:this.transformReference.bind(this),SelectQueryNode:this.transformSelectQuery.bind(this),SelectionNode:this.transformSelection.bind(this),TableNode:this.transformTable.bind(this),FromNode:this.transformFrom.bind(this),SelectAllNode:this.transformSelectAll.bind(this),AndNode:this.transformAnd.bind(this),OrNode:this.transformOr.bind(this),ValueNode:this.transformValue.bind(this),ValueListNode:this.transformValueList.bind(this),PrimitiveValueListNode:this.transformPrimitiveValueList.bind(this),ParensNode:this.transformParens.bind(this),JoinNode:this.transformJoin.bind(this),OperatorNode:this.transformOperator.bind(this),WhereNode:this.transformWhere.bind(this),InsertQueryNode:this.transformInsertQuery.bind(this),DeleteQueryNode:this.transformDeleteQuery.bind(this),ReturningNode:this.transformReturning.bind(this),CreateTableNode:this.transformCreateTable.bind(this),AddColumnNode:this.transformAddColumn.bind(this),ColumnDefinitionNode:this.transformColumnDefinition.bind(this),DropTableNode:this.transformDropTable.bind(this),DataTypeNode:this.transformDataType.bind(this),OrderByNode:this.transformOrderBy.bind(this),OrderByItemNode:this.transformOrderByItem.bind(this),GroupByNode:this.transformGroupBy.bind(this),GroupByItemNode:this.transformGroupByItem.bind(this),UpdateQueryNode:this.transformUpdateQuery.bind(this),ColumnUpdateNode:this.transformColumnUpdate.bind(this),LimitNode:this.transformLimit.bind(this),OffsetNode:this.transformOffset.bind(this),OnConflictNode:this.transformOnConflict.bind(this),OnDuplicateKeyNode:this.transformOnDuplicateKey.bind(this),CreateIndexNode:this.transformCreateIndex.bind(this),DropIndexNode:this.transformDropIndex.bind(this),ListNode:this.transformList.bind(this),PrimaryKeyConstraintNode:this.transformPrimaryKeyConstraint.bind(this),UniqueConstraintNode:this.transformUniqueConstraint.bind(this),ReferencesNode:this.transformReferences.bind(this),CheckConstraintNode:this.transformCheckConstraint.bind(this),WithNode:this.transformWith.bind(this),CommonTableExpressionNode:this.transformCommonTableExpression.bind(this),CommonTableExpressionNameNode:this.transformCommonTableExpressionName.bind(this),HavingNode:this.transformHaving.bind(this),CreateSchemaNode:this.transformCreateSchema.bind(this),DropSchemaNode:this.transformDropSchema.bind(this),AlterTableNode:this.transformAlterTable.bind(this),DropColumnNode:this.transformDropColumn.bind(this),RenameColumnNode:this.transformRenameColumn.bind(this),AlterColumnNode:this.transformAlterColumn.bind(this),ModifyColumnNode:this.transformModifyColumn.bind(this),AddConstraintNode:this.transformAddConstraint.bind(this),DropConstraintNode:this.transformDropConstraint.bind(this),RenameConstraintNode:this.transformRenameConstraint.bind(this),ForeignKeyConstraintNode:this.transformForeignKeyConstraint.bind(this),CreateViewNode:this.transformCreateView.bind(this),RefreshMaterializedViewNode:this.transformRefreshMaterializedView.bind(this),DropViewNode:this.transformDropView.bind(this),GeneratedNode:this.transformGenerated.bind(this),DefaultValueNode:this.transformDefaultValue.bind(this),OnNode:this.transformOn.bind(this),ValuesNode:this.transformValues.bind(this),SelectModifierNode:this.transformSelectModifier.bind(this),CreateTypeNode:this.transformCreateType.bind(this),DropTypeNode:this.transformDropType.bind(this),ExplainNode:this.transformExplain.bind(this),DefaultInsertValueNode:this.transformDefaultInsertValue.bind(this),AggregateFunctionNode:this.transformAggregateFunction.bind(this),OverNode:this.transformOver.bind(this),PartitionByNode:this.transformPartitionBy.bind(this),PartitionByItemNode:this.transformPartitionByItem.bind(this),SetOperationNode:this.transformSetOperation.bind(this),BinaryOperationNode:this.transformBinaryOperation.bind(this),UnaryOperationNode:this.transformUnaryOperation.bind(this),UsingNode:this.transformUsing.bind(this),FunctionNode:this.transformFunction.bind(this),CaseNode:this.transformCase.bind(this),WhenNode:this.transformWhen.bind(this),JSONReferenceNode:this.transformJSONReference.bind(this),JSONPathNode:this.transformJSONPath.bind(this),JSONPathLegNode:this.transformJSONPathLeg.bind(this),JSONOperatorChainNode:this.transformJSONOperatorChain.bind(this),TupleNode:this.transformTuple.bind(this),MergeQueryNode:this.transformMergeQuery.bind(this),MatchedNode:this.transformMatched.bind(this),AddIndexNode:this.transformAddIndex.bind(this),CastNode:this.transformCast.bind(this),FetchNode:this.transformFetch.bind(this),TopNode:this.transformTop.bind(this),OutputNode:this.transformOutput.bind(this),OrActionNode:this.transformOrAction.bind(this),CollateNode:this.transformCollate.bind(this),AlterTypeNode:this.transformAlterType.bind(this),AddValueNode:this.transformAddValue.bind(this),RenameValueNode:this.transformRenameValue.bind(this)});transformNode(e,t){if(!e)return e;this.nodeStack.push(e);let n=this.transformNodeImpl(e,t);return this.nodeStack.pop(),J(n)}transformNodeImpl(e,t){return this.#e[e.kind](e,t)}transformNodeList(e,t){return e&&J(e.map(e=>this.transformNode(e,t)))}transformSelectQuery(e,t){return{kind:`SelectQueryNode`,from:this.transformNode(e.from,t),selections:this.transformNodeList(e.selections,t),distinctOn:this.transformNodeList(e.distinctOn,t),joins:this.transformNodeList(e.joins,t),groupBy:this.transformNode(e.groupBy,t),orderBy:this.transformNode(e.orderBy,t),where:this.transformNode(e.where,t),frontModifiers:this.transformNodeList(e.frontModifiers,t),endModifiers:this.transformNodeList(e.endModifiers,t),limit:this.transformNode(e.limit,t),offset:this.transformNode(e.offset,t),with:this.transformNode(e.with,t),having:this.transformNode(e.having,t),explain:this.transformNode(e.explain,t),setOperations:this.transformNodeList(e.setOperations,t),fetch:this.transformNode(e.fetch,t),top:this.transformNode(e.top,t)}}transformSelection(e,t){return{kind:`SelectionNode`,selection:this.transformNode(e.selection,t)}}transformColumn(e,t){return{kind:`ColumnNode`,column:this.transformNode(e.column,t)}}transformAlias(e,t){return{kind:`AliasNode`,node:this.transformNode(e.node,t),alias:this.transformNode(e.alias,t)}}transformTable(e,t){return{kind:`TableNode`,table:this.transformNode(e.table,t)}}transformFrom(e,t){return{kind:`FromNode`,froms:this.transformNodeList(e.froms,t)}}transformReference(e,t){return{kind:`ReferenceNode`,column:this.transformNode(e.column,t),table:this.transformNode(e.table,t)}}transformAnd(e,t){return{kind:`AndNode`,left:this.transformNode(e.left,t),right:this.transformNode(e.right,t)}}transformOr(e,t){return{kind:`OrNode`,left:this.transformNode(e.left,t),right:this.transformNode(e.right,t)}}transformValueList(e,t){return{kind:`ValueListNode`,values:this.transformNodeList(e.values,t)}}transformParens(e,t){return{kind:`ParensNode`,node:this.transformNode(e.node,t)}}transformJoin(e,t){return{kind:`JoinNode`,joinType:e.joinType,table:this.transformNode(e.table,t),on:this.transformNode(e.on,t)}}transformRaw(e,t){return{kind:`RawNode`,sqlFragments:J([...e.sqlFragments]),parameters:this.transformNodeList(e.parameters,t)}}transformWhere(e,t){return{kind:`WhereNode`,where:this.transformNode(e.where,t)}}transformInsertQuery(e,t){return{kind:`InsertQueryNode`,into:this.transformNode(e.into,t),columns:this.transformNodeList(e.columns,t),values:this.transformNode(e.values,t),returning:this.transformNode(e.returning,t),onConflict:this.transformNode(e.onConflict,t),onDuplicateKey:this.transformNode(e.onDuplicateKey,t),endModifiers:this.transformNodeList(e.endModifiers,t),with:this.transformNode(e.with,t),orAction:this.transformNode(e.orAction,t),replace:e.replace,explain:this.transformNode(e.explain,t),defaultValues:e.defaultValues,top:this.transformNode(e.top,t),output:this.transformNode(e.output,t)}}transformValues(e,t){return{kind:`ValuesNode`,values:this.transformNodeList(e.values,t)}}transformDeleteQuery(e,t){return{kind:`DeleteQueryNode`,from:this.transformNode(e.from,t),using:this.transformNode(e.using,t),joins:this.transformNodeList(e.joins,t),where:this.transformNode(e.where,t),returning:this.transformNode(e.returning,t),endModifiers:this.transformNodeList(e.endModifiers,t),with:this.transformNode(e.with,t),orderBy:this.transformNode(e.orderBy,t),limit:this.transformNode(e.limit,t),explain:this.transformNode(e.explain,t),top:this.transformNode(e.top,t),output:this.transformNode(e.output,t)}}transformReturning(e,t){return{kind:`ReturningNode`,selections:this.transformNodeList(e.selections,t)}}transformCreateTable(e,t){return{kind:`CreateTableNode`,table:this.transformNode(e.table,t),columns:this.transformNodeList(e.columns,t),constraints:this.transformNodeList(e.constraints,t),indexes:this.transformNodeList(e.indexes,t),temporary:e.temporary,ifNotExists:e.ifNotExists,onCommit:e.onCommit,frontModifiers:this.transformNodeList(e.frontModifiers,t),endModifiers:this.transformNodeList(e.endModifiers,t),selectQuery:this.transformNode(e.selectQuery,t)}}transformColumnDefinition(e,t){return{kind:`ColumnDefinitionNode`,column:this.transformNode(e.column,t),dataType:this.transformNode(e.dataType,t),references:this.transformNode(e.references,t),primaryKey:e.primaryKey,autoIncrement:e.autoIncrement,unique:e.unique,notNull:e.notNull,unsigned:e.unsigned,defaultTo:this.transformNode(e.defaultTo,t),check:this.transformNode(e.check,t),generated:this.transformNode(e.generated,t),frontModifiers:this.transformNodeList(e.frontModifiers,t),endModifiers:this.transformNodeList(e.endModifiers,t),nullsNotDistinct:e.nullsNotDistinct,identity:e.identity,ifNotExists:e.ifNotExists}}transformAddColumn(e,t){return{kind:`AddColumnNode`,column:this.transformNode(e.column,t)}}transformDropTable(e,t){return{kind:`DropTableNode`,table:this.transformNode(e.table,t),ifExists:e.ifExists,cascade:e.cascade,temporary:e.temporary}}transformOrderBy(e,t){return{kind:`OrderByNode`,items:this.transformNodeList(e.items,t)}}transformOrderByItem(e,t){return{kind:`OrderByItemNode`,orderBy:this.transformNode(e.orderBy,t),direction:this.transformNode(e.direction,t),collation:this.transformNode(e.collation,t),nulls:e.nulls}}transformGroupBy(e,t){return{kind:`GroupByNode`,items:this.transformNodeList(e.items,t)}}transformGroupByItem(e,t){return{kind:`GroupByItemNode`,groupBy:this.transformNode(e.groupBy,t)}}transformUpdateQuery(e,t){return{kind:`UpdateQueryNode`,table:this.transformNode(e.table,t),from:this.transformNode(e.from,t),joins:this.transformNodeList(e.joins,t),where:this.transformNode(e.where,t),updates:this.transformNodeList(e.updates,t),returning:this.transformNode(e.returning,t),endModifiers:this.transformNodeList(e.endModifiers,t),with:this.transformNode(e.with,t),explain:this.transformNode(e.explain,t),limit:this.transformNode(e.limit,t),top:this.transformNode(e.top,t),output:this.transformNode(e.output,t),orderBy:this.transformNode(e.orderBy,t)}}transformColumnUpdate(e,t){return{kind:`ColumnUpdateNode`,column:this.transformNode(e.column,t),value:this.transformNode(e.value,t)}}transformLimit(e,t){return{kind:`LimitNode`,limit:this.transformNode(e.limit,t)}}transformOffset(e,t){return{kind:`OffsetNode`,offset:this.transformNode(e.offset,t)}}transformOnConflict(e,t){return{kind:`OnConflictNode`,columns:this.transformNodeList(e.columns,t),constraint:this.transformNode(e.constraint,t),indexExpression:this.transformNode(e.indexExpression,t),indexWhere:this.transformNode(e.indexWhere,t),updates:this.transformNodeList(e.updates,t),updateWhere:this.transformNode(e.updateWhere,t),doNothing:e.doNothing}}transformOnDuplicateKey(e,t){return{kind:`OnDuplicateKeyNode`,updates:this.transformNodeList(e.updates,t)}}transformCreateIndex(e,t){return{kind:`CreateIndexNode`,name:this.transformNode(e.name,t),table:this.transformNode(e.table,t),columns:this.transformNodeList(e.columns,t),unique:e.unique,using:this.transformNode(e.using,t),ifNotExists:e.ifNotExists,where:this.transformNode(e.where,t),nullsNotDistinct:e.nullsNotDistinct}}transformList(e,t){return{kind:`ListNode`,items:this.transformNodeList(e.items,t)}}transformDropIndex(e,t){return{kind:`DropIndexNode`,name:this.transformNode(e.name,t),table:this.transformNode(e.table,t),ifExists:e.ifExists,cascade:e.cascade}}transformPrimaryKeyConstraint(e,t){return{kind:`PrimaryKeyConstraintNode`,columns:this.transformNodeList(e.columns,t),name:this.transformNode(e.name,t),deferrable:e.deferrable,initiallyDeferred:e.initiallyDeferred}}transformUniqueConstraint(e,t){return{kind:`UniqueConstraintNode`,columns:this.transformNodeList(e.columns,t),name:this.transformNode(e.name,t),nullsNotDistinct:e.nullsNotDistinct,deferrable:e.deferrable,initiallyDeferred:e.initiallyDeferred}}transformForeignKeyConstraint(e,t){return{kind:`ForeignKeyConstraintNode`,columns:this.transformNodeList(e.columns,t),references:this.transformNode(e.references,t),name:this.transformNode(e.name,t),onDelete:e.onDelete,onUpdate:e.onUpdate,deferrable:e.deferrable,initiallyDeferred:e.initiallyDeferred}}transformSetOperation(e,t){return{kind:`SetOperationNode`,operator:e.operator,expression:this.transformNode(e.expression,t),all:e.all}}transformReferences(e,t){return{kind:`ReferencesNode`,table:this.transformNode(e.table,t),columns:this.transformNodeList(e.columns,t),onDelete:e.onDelete,onUpdate:e.onUpdate}}transformCheckConstraint(e,t){return{kind:`CheckConstraintNode`,expression:this.transformNode(e.expression,t),name:this.transformNode(e.name,t)}}transformWith(e,t){return{kind:`WithNode`,expressions:this.transformNodeList(e.expressions,t),recursive:e.recursive}}transformCommonTableExpression(e,t){return{kind:`CommonTableExpressionNode`,name:this.transformNode(e.name,t),materialized:e.materialized,expression:this.transformNode(e.expression,t)}}transformCommonTableExpressionName(e,t){return{kind:`CommonTableExpressionNameNode`,table:this.transformNode(e.table,t),columns:this.transformNodeList(e.columns,t)}}transformHaving(e,t){return{kind:`HavingNode`,having:this.transformNode(e.having,t)}}transformCreateSchema(e,t){return{kind:`CreateSchemaNode`,schema:this.transformNode(e.schema,t),ifNotExists:e.ifNotExists}}transformDropSchema(e,t){return{kind:`DropSchemaNode`,schema:this.transformNode(e.schema,t),ifExists:e.ifExists,cascade:e.cascade}}transformAlterTable(e,t){return{kind:`AlterTableNode`,table:this.transformNode(e.table,t),renameTo:this.transformNode(e.renameTo,t),setSchema:this.transformNode(e.setSchema,t),columnAlterations:this.transformNodeList(e.columnAlterations,t),addConstraint:this.transformNode(e.addConstraint,t),dropConstraint:this.transformNode(e.dropConstraint,t),renameConstraint:this.transformNode(e.renameConstraint,t),addIndex:this.transformNode(e.addIndex,t),dropIndex:this.transformNode(e.dropIndex,t)}}transformDropColumn(e,t){return{kind:`DropColumnNode`,column:this.transformNode(e.column,t),ifExists:e.ifExists}}transformRenameColumn(e,t){return{kind:`RenameColumnNode`,column:this.transformNode(e.column,t),renameTo:this.transformNode(e.renameTo,t)}}transformAlterColumn(e,t){return{kind:`AlterColumnNode`,column:this.transformNode(e.column,t),dataType:this.transformNode(e.dataType,t),dataTypeExpression:this.transformNode(e.dataTypeExpression,t),setDefault:this.transformNode(e.setDefault,t),dropDefault:e.dropDefault,setNotNull:e.setNotNull,dropNotNull:e.dropNotNull}}transformModifyColumn(e,t){return{kind:`ModifyColumnNode`,column:this.transformNode(e.column,t)}}transformAddConstraint(e,t){return{kind:`AddConstraintNode`,constraint:this.transformNode(e.constraint,t)}}transformDropConstraint(e,t){return{kind:`DropConstraintNode`,constraintName:this.transformNode(e.constraintName,t),ifExists:e.ifExists,modifier:e.modifier}}transformRenameConstraint(e,t){return{kind:`RenameConstraintNode`,oldName:this.transformNode(e.oldName,t),newName:this.transformNode(e.newName,t)}}transformCreateView(e,t){return{kind:`CreateViewNode`,name:this.transformNode(e.name,t),temporary:e.temporary,orReplace:e.orReplace,ifNotExists:e.ifNotExists,materialized:e.materialized,columns:this.transformNodeList(e.columns,t),as:this.transformNode(e.as,t)}}transformRefreshMaterializedView(e,t){return{kind:`RefreshMaterializedViewNode`,name:this.transformNode(e.name,t),concurrently:e.concurrently,withNoData:e.withNoData}}transformDropView(e,t){return{kind:`DropViewNode`,name:this.transformNode(e.name,t),ifExists:e.ifExists,materialized:e.materialized,cascade:e.cascade}}transformGenerated(e,t){return{kind:`GeneratedNode`,byDefault:e.byDefault,always:e.always,identity:e.identity,stored:e.stored,expression:this.transformNode(e.expression,t)}}transformDefaultValue(e,t){return{kind:`DefaultValueNode`,defaultValue:this.transformNode(e.defaultValue,t)}}transformOn(e,t){return{kind:`OnNode`,on:this.transformNode(e.on,t)}}transformSelectModifier(e,t){return{kind:`SelectModifierNode`,modifier:e.modifier,rawModifier:this.transformNode(e.rawModifier,t),of:this.transformNodeList(e.of,t)}}transformCreateType(e,t){return{kind:`CreateTypeNode`,name:this.transformNode(e.name,t),enum:this.transformNode(e.enum,t)}}transformDropType(e,t){return{kind:`DropTypeNode`,name:this.transformNode(e.name,t),additionalNames:this.transformNodeList(e.additionalNames,t),cascade:e.cascade,ifExists:e.ifExists}}transformExplain(e,t){return{kind:`ExplainNode`,format:e.format,options:this.transformNode(e.options,t)}}transformSchemableIdentifier(e,t){return{kind:`SchemableIdentifierNode`,schema:this.transformNode(e.schema,t),identifier:this.transformNode(e.identifier,t)}}transformAggregateFunction(e,t){return{kind:`AggregateFunctionNode`,func:e.func,aggregated:this.transformNodeList(e.aggregated,t),distinct:e.distinct,orderBy:this.transformNode(e.orderBy,t),withinGroup:this.transformNode(e.withinGroup,t),filter:this.transformNode(e.filter,t),over:this.transformNode(e.over,t)}}transformOver(e,t){return{kind:`OverNode`,orderBy:this.transformNode(e.orderBy,t),partitionBy:this.transformNode(e.partitionBy,t)}}transformPartitionBy(e,t){return{kind:`PartitionByNode`,items:this.transformNodeList(e.items,t)}}transformPartitionByItem(e,t){return{kind:`PartitionByItemNode`,partitionBy:this.transformNode(e.partitionBy,t)}}transformBinaryOperation(e,t){return{kind:`BinaryOperationNode`,leftOperand:this.transformNode(e.leftOperand,t),operator:this.transformNode(e.operator,t),rightOperand:this.transformNode(e.rightOperand,t)}}transformUnaryOperation(e,t){return{kind:`UnaryOperationNode`,operator:this.transformNode(e.operator,t),operand:this.transformNode(e.operand,t)}}transformUsing(e,t){return{kind:`UsingNode`,tables:this.transformNodeList(e.tables,t)}}transformFunction(e,t){return{kind:`FunctionNode`,func:e.func,arguments:this.transformNodeList(e.arguments,t)}}transformCase(e,t){return{kind:`CaseNode`,value:this.transformNode(e.value,t),when:this.transformNodeList(e.when,t),else:this.transformNode(e.else,t),isStatement:e.isStatement}}transformWhen(e,t){return{kind:`WhenNode`,condition:this.transformNode(e.condition,t),result:this.transformNode(e.result,t)}}transformJSONReference(e,t){return{kind:`JSONReferenceNode`,reference:this.transformNode(e.reference,t),traversal:this.transformNode(e.traversal,t)}}transformJSONPath(e,t){return{kind:`JSONPathNode`,inOperator:this.transformNode(e.inOperator,t),pathLegs:this.transformNodeList(e.pathLegs,t)}}transformJSONPathLeg(e,t){return{kind:`JSONPathLegNode`,type:e.type,value:e.value}}transformJSONOperatorChain(e,t){return{kind:`JSONOperatorChainNode`,operator:this.transformNode(e.operator,t),values:this.transformNodeList(e.values,t)}}transformTuple(e,t){return{kind:`TupleNode`,values:this.transformNodeList(e.values,t)}}transformMergeQuery(e,t){return{kind:`MergeQueryNode`,into:this.transformNode(e.into,t),using:this.transformNode(e.using,t),whens:this.transformNodeList(e.whens,t),with:this.transformNode(e.with,t),top:this.transformNode(e.top,t),endModifiers:this.transformNodeList(e.endModifiers,t),output:this.transformNode(e.output,t),returning:this.transformNode(e.returning,t)}}transformMatched(e,t){return{kind:`MatchedNode`,not:e.not,bySource:e.bySource}}transformAddIndex(e,t){return{kind:`AddIndexNode`,name:this.transformNode(e.name,t),columns:this.transformNodeList(e.columns,t),unique:e.unique,using:this.transformNode(e.using,t),ifNotExists:e.ifNotExists}}transformCast(e,t){return{kind:`CastNode`,expression:this.transformNode(e.expression,t),dataType:this.transformNode(e.dataType,t)}}transformFetch(e,t){return{kind:`FetchNode`,rowCount:this.transformNode(e.rowCount,t),modifier:e.modifier}}transformTop(e,t){return{kind:`TopNode`,expression:e.expression,modifiers:e.modifiers}}transformOutput(e,t){return{kind:`OutputNode`,selections:this.transformNodeList(e.selections,t)}}transformAlterType(e,t){return{kind:`AlterTypeNode`,name:this.transformNode(e.name,t),addValue:this.transformNode(e.addValue,t),renameTo:this.transformNode(e.renameTo,t),renameValue:this.transformNode(e.renameValue,t),setSchema:this.transformNode(e.setSchema,t)}}transformAddValue(e,t){return{kind:`AddValueNode`,value:this.transformNode(e.value,t),ifNotExists:e.ifNotExists,isBefore:e.isBefore,neighborValue:this.transformNode(e.neighborValue,t)}}transformRenameValue(e,t){return{kind:`RenameValueNode`,oldValue:this.transformNode(e.oldValue,t),newValue:this.transformNode(e.newValue,t)}}transformDataType(e,t){return e}transformSelectAll(e,t){return e}transformIdentifier(e,t){return e}transformValue(e,t){return e}transformPrimitiveValueList(e,t){return e}transformOperator(e,t){return e}transformDefaultInsertValue(e,t){return e}transformOrAction(e,t){return e}transformCollate(e,t){return e}};function $l(e){return cs(e)&&ts(e.kind)}const eu={AlterTableNode:!0,AlterTypeNode:!0,CreateIndexNode:!0,CreateSchemaNode:!0,CreateTableNode:!0,CreateTypeNode:!0,CreateViewNode:!0,DeleteQueryNode:!0,DropIndexNode:!0,DropSchemaNode:!0,DropTableNode:!0,DropTypeNode:!0,RefreshMaterializedViewNode:!0,DropViewNode:!0,InsertQueryNode:!0,RawNode:!0,SelectQueryNode:!0,UpdateQueryNode:!0,MergeQueryNode:!0};function tu(e){return $l(e)&&eu[e.kind]===!0}const nu=J({json_agg:!0,to_json:!0});var ru=class extends Ql{#e;#t=/* @__PURE__ */ new Set;#n=/* @__PURE__ */ new Set;constructor(e){super(),this.#e=e}transformNodeImpl(e,t){if(!tu(e))return super.transformNodeImpl(e,t);let n=this.#a(e);for(let e of n)this.#n.add(e);let r=this.#i(e);for(let e of r)this.#t.add(e);let i=super.transformNodeImpl(e,t);for(let e of r)this.#t.delete(e);for(let e of n)this.#n.delete(e);return i}transformSchemableIdentifier(e,t){let n=super.transformSchemableIdentifier(e,t);return n.schema||!this.#t.has(e.identifier.name)?n:{...n,schema:X.create(this.#e)}}transformReferences(e,t){let n=super.transformReferences(e,t);return n.table.table.schema?n:{...n,table:Ss.createWithSchema(this.#e,n.table.table.identifier.name)}}transformAggregateFunction(e,t){return{...super.transformAggregateFunction({...e,aggregated:[]},t),aggregated:this.#r(e,t,`aggregated`)}}transformFunction(e,t){return{...super.transformFunction({...e,arguments:[]},t),arguments:this.#r(e,t,`arguments`)}}transformSelectModifier(e,t){return{...super.transformSelectModifier({...e,of:void 0},t),of:e.of?.map(e=>Ss.is(e)&&!e.table.schema?{...e,table:this.transformIdentifier(e.table.identifier,t)}:this.transformNode(e,t))}}#r(e,t,n){return nu[e.func]?e[n].map(e=>!Ss.is(e)||e.table.schema?this.transformNode(e,t):{...e,table:this.transformIdentifier(e.table.identifier,t)}):this.transformNodeList(e[n],t)}#i(e){let t=/* @__PURE__ */ new Set;if(`name`in e&&e.name&&_s.is(e.name)&&this.#s(e.name,t),`from`in e&&e.from)for(let n of e.from.froms)this.#o(n,t);if(`into`in e&&e.into&&this.#o(e.into,t),`table`in e&&e.table&&this.#o(e.table,t),`joins`in e&&e.joins)for(let n of e.joins)this.#o(n.table,t);return`using`in e&&e.using&&(As.is(e.using)?this.#o(e.using.table,t):this.#o(e.using,t)),t}#a(e){let t=/* @__PURE__ */ new Set;return`with`in e&&e.with&&this.#c(e.with,t),t}#o(e,t){if(Ss.is(e))return this.#s(e.table,t);if(xs.is(e)&&Ss.is(e.node))return this.#s(e.node.table,t);if(Kc.is(e)){for(let n of e.items)this.#o(n,t);return}if(Jc.is(e)){for(let n of e.tables)this.#o(n,t);return}}#s(e,t){let n=e.identifier.name;!this.#t.has(n)&&!this.#n.has(n)&&t.add(n)}#c(e,t){for(let n of e.expressions){let e=n.name.table.table.identifier.name;this.#n.has(e)||t.add(e)}}},iu=class{#e;constructor(e){this.#e=new ru(e)}transformQuery(e){return this.#e.transformNode(e.node,e.queryId)}async transformResult(e){return e.result}};const au=J({is(e){return e.kind===`MatchedNode`},create(e,t=!1){return J({kind:`MatchedNode`,not:e,bySource:t})}});function ou(e,t,n){return $c.create(Pc([au.create(!e.isMatched,e.bySource),...t&&t.length>0?[t.length===3&&n?Mc(t[0],t[1],t[2]):Ac(t)]:[]],`and`,!1))}function su(e){return ts(e)?Zs.create([e],[]):Cs(e)?e.toOperationNode():e}var cu=class{#e;#t;#n;constructor(){this.#e=new Promise((e,t)=>{this.#n=t,this.#t=e})}get promise(){return this.#e}resolve=e=>{this.#t?.(e),this.#t=this.#n=void 0};reject=e=>{this.#n?.(e),this.#n=this.#t=void 0}};async function lu(e,t){let n=new cu,r=new cu;return e.provideConnection(async e=>(n.resolve(e),await r.promise),t).catch(e=>n.reject(e)),J({connection:await n.promise,release:r.resolve})}function uu(e=`ignore query`,t,n){if(e!==`ignore query`){if(e===`cancel query`){let r=t.cancelQuery;return r||(n(),du(e,t.killSession?`kill session`:void 0)),r.bind(t)}if(e===`kill session`){let r=t.killSession;return r||(n(),du(e,t.cancelQuery?`cancel query`:void 0)),r.bind(t)}throw n(),Error(`Unexpected \`inflightQueryAbortStrategy\`: "${e}"`)}}function du(e,t){throw Error(`This dialect doesn't support \`inflightQueryAbortStrategy\` "${e}". Use "ignore query"${t?` or "${t}"`:``} instead.`)}function fu(e,t,n){e?.aborted&&(n?.(),pu(e.reason,t))}function pu(e,t){throw _u(e,t),e}const mu={};async function hu(e,t,n,r){if(!t)return e;fu(t,`before ${n}`,r);let{promise:i,resolve:a}=new cu,o=()=>a(mu);t.addEventListener(`abort`,o);try{fu(t,`before ${n}`,r);let a=await Promise.race([e,i]);if(a!==mu)return a;r?.(),pu(t.reason,`during ${n}`)}finally{t.removeEventListener(`abort`,o),a(mu)}}function gu(e){return t=>console.error(`\`${e}\` failed in the background after abortion: ${fs(t)}`)}function _u(e,t){typeof e==`object`&&e&&!Object.isFrozen(e)&&Object.defineProperty(e,"__kysely_timing__",{configurable:!0,enumerable:!1,value:t,writable:!1})}const vu=J([]);var yu=class{#e;constructor(e=vu){this.#e=e}get plugins(){return this.#e}transformQuery(e,t){for(let n of this.#e){let r=n.transformQuery({node:e,queryId:t});if(r.kind===e.kind)e=r;else throw Error([`KyselyPlugin.transformQuery must return a node`,`of the same kind that was given to it.`,`The plugin was given a ${e.kind}`,`but it returned a ${r.kind}`].join(` `))}return e}async executeQuery(e,t){let{inflightQueryAbortStrategy:n=`ignore query`,signal:r}=t||{};if(!r){let n=await this.provideConnection(async t=>await t.executeQuery(e),t);return await this.#t(n,e.queryId)}fu(r,`before query execution`),t=J({signal:r});let{connection:i,release:a}=await lu(this,t),o=this.provideConnection.bind(this),{promise:s,resolve:c}=new cu,l=()=>c(mu);r.addEventListener(`abort`,l,{once:!0});try{fu(r,`before query execution`,a);let c=uu(n,i,a);if(c&&i.collectSessionInfo){fu(r,`before query execution`,a);let e=i.collectSessionInfo();await Promise.race([s,e]).catch(e=>{throw a(),e})===mu&&(e.catch(gu(`collectSessionInfo`)).finally(a),pu(r.reason,`before query execution`))}let l=i.executeQuery(e,t),u=await Promise.race([s,l]).catch(e=>{throw a(),e});u===mu?(Promise.allSettled([l.catch(gu(`query`)),c?.(o).catch(gu(`inflightQueryAbortHandler`))]).finally(a),pu(r.reason,`during query execution`)):a();let d=this.#t(u,e.queryId,t),f=await Promise.race([s,d]);return f===mu&&(d.catch(gu(`plugins.transformResult`)),pu(r.reason,`during result transformation`)),f}finally{c(mu),r.removeEventListener(`abort`,l)}}async*stream(e,t,n){let{signal:r}=n||{};if(!r){let{connection:r,release:i}=await lu(this);try{for await(let i of r.streamQuery(e,t))yield await this.#t(i,e.queryId,n)}finally{i()}return}n=J({signal:r}),fu(r,`before connection acquisition`);let{connection:i,release:a}=await lu(this,n),{promise:o,resolve:s}=new cu,c=()=>s(mu);r.addEventListener(`abort`,c,{once:!0});let l,u;fu(r,`before query streaming`,a);let{queryId:d}=e;try{for(l=i.streamQuery(e,t,n);;){fu(r,`during query streaming`);let e=l.next(),t=await Promise.race([o,e]);if(t===mu&&(u=e.catch(gu(`iterator.next`)),pu(r.reason,`during query streaming`)),t.done)break;let i=this.#t(t.value,d,n),a=await Promise.race([o,i]);a===mu&&(u=i.catch(gu(`plugins.transformResult`)),pu(r.reason,`during result transformation`)),yield a}}finally{s(mu),r.removeEventListener(`abort`,c);let e=(l?.return?.()||Promise.resolve()).finally(()=>u).finally(a);u||await e}}async#t(e,t,n){let{signal:r}=n||{};for(let n of this.#e)e=await n.transformResult(J({queryId:t,result:e,signal:r}));return e}};const bu=new class e extends yu{get adapter(){throw Error(`this query cannot be compiled to SQL`)}compileQuery(){throw Error(`this query cannot be compiled to SQL`)}provideConnection(){throw Error(`this query cannot be executed`)}withConnectionProvider(){throw Error(`this query cannot have a connection provider`)}withPlugin(t){return new e([...this.plugins,t])}withPlugins(t){return new e([...this.plugins,...t])}withPluginAtFront(t){return new e([t,...this.plugins])}withoutPlugins(){return new e([])}};var xu=class{numChangedRows;constructor(e){this.numChangedRows=e}},Su=class e{#e;constructor(e){this.#e=J(e)}modifyEnd(t){return new e({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,t.toOperationNode())})}top(t,n){return new e({...this.#e,queryNode:Z.cloneWithTop(this.#e.queryNode,Al(t,n))})}using(...e){return new Cu({...this.#e,queryNode:el.cloneWithUsing(this.#e.queryNode,Au(`Using`,e))})}returning(t){return new e({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,cl(t))})}returningAll(t){return new e({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,ul(t))})}output(t){return new e({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,cl(t))})}outputAll(t){return new e({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,ul(t))})}},Cu=class e{#e;constructor(e){this.#e=J(e)}modifyEnd(t){return new e({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,t.toOperationNode())})}top(t,n){return new e({...this.#e,queryNode:Z.cloneWithTop(this.#e.queryNode,Al(t,n))})}whenMatched(){return this.#t([])}whenMatchedAnd(...e){return this.#t(e)}whenMatchedAndRef(e,t,n){return this.#t([e,t,n],!0)}#t(e,t){return new wu({...this.#e,queryNode:el.cloneWithWhen(this.#e.queryNode,ou({isMatched:!0},e,t))})}whenNotMatched(){return this.#n([])}whenNotMatchedAnd(...e){return this.#n(e)}whenNotMatchedAndRef(e,t,n){return this.#n([e,t,n],!0)}whenNotMatchedBySource(){return this.#n([],!1,!0)}whenNotMatchedBySourceAnd(...e){return this.#n(e,!1,!0)}whenNotMatchedBySourceAndRef(e,t,n){return this.#n([e,t,n],!0,!0)}returning(t){return new e({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,cl(t))})}returningAll(t){return new e({...this.#e,queryNode:Z.cloneWithReturning(this.#e.queryNode,ul(t))})}output(t){return new e({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,cl(t))})}outputAll(t){return new e({...this.#e,queryNode:Z.cloneWithOutput(this.#e.queryNode,ul(t))})}#n(e,t=!1,n=!1){let r={...this.#e,queryNode:el.cloneWithWhen(this.#e.queryNode,ou({isMatched:!1,bySource:n},e,t))};return new(n?wu:Tu)(r)}$call(e){return e(this)}$if(t,n){return t?n(this):new e({...this.#e})}toOperationNode(){return this.#e.executor.transformQuery(this.#e.queryNode,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){let t=this.compile(),n=await this.#e.executor.executeQuery(t,e),{adapter:r}=this.#e.executor,i=t.query;return i.returning&&r.supportsReturning||i.output&&r.supportsOutput?n.rows:[new xu(n.numAffectedRows)]}async executeTakeFirst(e){let[t]=await this.execute(e);return t}async executeTakeFirstOrThrow(e){typeof e==`function`&&(e={errorConstructor:e});let t=await this.executeTakeFirst(e);if(t===void 0){let t=e?.errorConstructor??Cl;throw wl(t)?new t(this.toOperationNode()):t(this.toOperationNode())}return t}},wu=class{#e;constructor(e){this.#e=J(e)}thenDelete(){return new Cu({...this.#e,queryNode:el.cloneWithThen(this.#e.queryNode,su(`delete`))})}thenDoNothing(){return new Cu({...this.#e,queryNode:el.cloneWithThen(this.#e.queryNode,su(`do nothing`))})}thenUpdate(e){return new Cu({...this.#e,queryNode:el.cloneWithThen(this.#e.queryNode,su(e(new Bl({queryId:this.#e.queryId,executor:bu,queryNode:qc.createWithoutTable()}))))})}thenUpdateSet(...e){return this.thenUpdate(t=>t.set(...e))}},Tu=class{#e;constructor(e){this.#e=J(e)}thenDoNothing(){return new Cu({...this.#e,queryNode:el.cloneWithThen(this.#e.queryNode,su(`do nothing`))})}thenInsertValues(e){let[t,n]=ml(e);return new Cu({...this.#e,queryNode:el.cloneWithThen(this.#e.queryNode,su(Gc.cloneWith(Gc.createWithoutInto(),{columns:t,values:n})))})}},Eu=class e{#e;constructor(e){this.#e=J(e)}selectFrom(e){return qu({queryId:Q(),executor:this.#e.executor,queryNode:nl.createFrom(Dd(e),this.#e.withNode)})}selectNoFrom(e){return qu({queryId:Q(),executor:this.#e.executor,queryNode:nl.cloneWithSelections(nl.create(this.#e.withNode),cl(e))})}insertInto(e){return new Nl({queryId:Q(),executor:this.#e.executor,queryNode:Gc.create(Ad(e),this.#e.withNode)})}replaceInto(e){return new Nl({queryId:Q(),executor:this.#e.executor,queryNode:Gc.create(Ad(e),this.#e.withNode,!0)})}deleteFrom(e){return new Ll({queryId:Q(),executor:this.#e.executor,queryNode:Yc.create(Dd(e),this.#e.withNode)})}updateTable(e){return new Bl({queryId:Q(),executor:this.#e.executor,queryNode:qc.create(Dd(e),this.#e.withNode)})}mergeInto(e){return new Su({queryId:Q(),executor:this.#e.executor,queryNode:el.create(kd(e),this.#e.withNode)})}with(t,n){let r=Wl(t,n);return new e({...this.#e,withNode:this.#e.withNode?ql.cloneWithExpression(this.#e.withNode,r):ql.create(r)})}withRecursive(t,n){let r=Wl(t,n);return new e({...this.#e,withNode:this.#e.withNode?ql.cloneWithExpression(this.#e.withNode,r):ql.create(r,{recursive:!0})})}withPlugin(t){return new e({...this.#e,executor:this.#e.executor.withPlugin(t)})}withoutPlugins(){return new e({...this.#e,executor:this.#e.executor.withoutPlugins()})}withSchema(t){return new e({...this.#e,executor:this.#e.executor.withPluginAtFront(new iu(t))})}};function Du(){return new Eu({executor:bu})}function Ou(e,t){return new rl({joinNode:As.create(e,Od(t))})}function ku(){return new ol({overNode:Vc.create()})}function Au(e,t){if(t.length===3)return Mu(e,t[0],t[1],t[2]);if(t.length===2)return ju(e,t[0],t[1]);if(t.length===1)return Nu(e,t[0]);throw Error(`not implemented`)}function ju(e,t,n){return n(Ou(e,t)).toOperationNode()}function Mu(e,t,n,r){return As.createWithOn(e,Od(t),Mc(n,`=`,r))}function Nu(e,t){return As.create(e,Od(t))}const Pu=J({is(e){return e.kind===`OffsetNode`},create(e){return J({kind:`OffsetNode`,offset:e})}}),Fu=J({is(e){return e.kind===`GroupByItemNode`},create(e){return J({kind:`GroupByItemNode`,groupBy:e})}});function Iu(e){return e=ss(e)?e(bd()):e,dc(e).map(Fu.create)}const Lu=J({is(e){return e.kind===`SetOperationNode`},create(e,t,n){return J({kind:`SetOperationNode`,operator:e,expression:t,all:n})}});function Ru(e,t,n){return ss(t)&&(t=t(yd())),us(t)||(t=[t]),t.map(t=>Lu.create(e,xd(t),n))}var zu=class e{#e;constructor(e){this.#e=e}get expressionType(){}as(e){return new Bu(this,e)}or(...e){return new Vu(Os.create(this.#e,Ac(e)))}and(...e){return new Hu(Ds.create(this.#e,Ac(e)))}$castTo(){return new e(this.#e)}$notNull(){return new e(this.#e)}toOperationNode(){return this.#e}},Bu=class{#e;#t;constructor(e,t){this.#e=e,this.#t=t}get expression(){return this.#e}get alias(){return this.#t}toOperationNode(){return xs.create(this.#e.toOperationNode(),Cs(this.#t)?this.#t.toOperationNode():X.create(this.#t))}},Vu=class e{#e;constructor(e){this.#e=e}get expressionType(){}as(e){return new Bu(this,e)}or(...t){return new e(Os.create(this.#e,Ac(t)))}$castTo(){return new e(this.#e)}toOperationNode(){return kc.create(this.#e)}},Hu=class e{#e;constructor(e){this.#e=e}get expressionType(){}as(e){return new Bu(this,e)}and(...t){return new e(Ds.create(this.#e,Ac(t)))}$castTo(){return new e(this.#e)}toOperationNode(){return kc.create(this.#e)}};const Uu=J({is(e){return e.kind===`FetchNode`},create(e,t){return{kind:`FetchNode`,rowCount:Cc.create(e),modifier:t}}});function Wu(e,t){if(!ns(e)&&!os(e))throw Error(`Invalid fetch row count: ${e}`);if(!Gu(t))throw Error(`Invalid fetch modifier: ${t}`);return Uu.create(e,t)}function Gu(e){return e===`only`||e===`with ties`}var $,Ku=class{#e;constructor(e){this.#e=J(e)}get expressionType(){}get isSelectQueryBuilder(){return!0}where(...e){return new $({...this.#e,queryNode:Z.cloneWithWhere(this.#e.queryNode,Ac(e))})}whereRef(e,t,n){return new $({...this.#e,queryNode:Z.cloneWithWhere(this.#e.queryNode,Mc(e,t,n))})}having(...e){return new $({...this.#e,queryNode:nl.cloneWithHaving(this.#e.queryNode,Ac(e))})}havingRef(e,t,n){return new $({...this.#e,queryNode:nl.cloneWithHaving(this.#e.queryNode,Mc(e,t,n))})}select(e){return new $({...this.#e,queryNode:nl.cloneWithSelections(this.#e.queryNode,cl(e))})}distinctOn(e){return new $({...this.#e,queryNode:nl.cloneWithDistinctOn(this.#e.queryNode,dc(e))})}modifyFront(e){return new $({...this.#e,queryNode:nl.cloneWithFrontModifier(this.#e.queryNode,Es.createWithExpression(e.toOperationNode()))})}modifyEnd(e){return new $({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,Es.createWithExpression(e.toOperationNode()))})}distinct(){return new $({...this.#e,queryNode:nl.cloneWithFrontModifier(this.#e.queryNode,Es.create(`Distinct`))})}forUpdate(e){return new $({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,Es.create(`ForUpdate`,e?ls(e).map(Ad):void 0))})}forShare(e){return new $({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,Es.create(`ForShare`,e?ls(e).map(Ad):void 0))})}forKeyShare(e){return new $({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,Es.create(`ForKeyShare`,e?ls(e).map(Ad):void 0))})}forNoKeyUpdate(e){return new $({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,Es.create(`ForNoKeyUpdate`,e?ls(e).map(Ad):void 0))})}skipLocked(){return new $({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,Es.create(`SkipLocked`))})}noWait(){return new $({...this.#e,queryNode:Z.cloneWithEndModifier(this.#e.queryNode,Es.create(`NoWait`))})}selectAll(e){return new $({...this.#e,queryNode:nl.cloneWithSelections(this.#e.queryNode,ul(e))})}innerJoin(...e){return this.#t(`InnerJoin`,e)}leftJoin(...e){return this.#t(`LeftJoin`,e)}rightJoin(...e){return this.#t(`RightJoin`,e)}fullJoin(...e){return this.#t(`FullJoin`,e)}crossJoin(...e){return this.#t(`CrossJoin`,e)}innerJoinLateral(...e){return this.#t(`LateralInnerJoin`,e)}leftJoinLateral(...e){return this.#t(`LateralLeftJoin`,e)}crossJoinLateral(...e){return this.#t(`LateralCrossJoin`,e)}crossApply(...e){return this.#t(`CrossApply`,e)}outerApply(...e){return this.#t(`OuterApply`,e)}#t(e,t){return new $({...this.#e,queryNode:Z.cloneWithJoin(this.#e.queryNode,Au(e,t))})}orderBy(...e){return new $({...this.#e,queryNode:Z.cloneWithOrderByItems(this.#e.queryNode,rc(e))})}groupBy(e){return new $({...this.#e,queryNode:nl.cloneWithGroupByItems(this.#e.queryNode,Iu(e))})}limit(e){return new $({...this.#e,queryNode:nl.cloneWithLimit(this.#e.queryNode,Fl.create(Tc(e)))})}offset(e){return new $({...this.#e,queryNode:nl.cloneWithOffset(this.#e.queryNode,Pu.create(Tc(e)))})}fetch(e,t=`only`){return new $({...this.#e,queryNode:nl.cloneWithFetch(this.#e.queryNode,Wu(e,t))})}top(e,t){return new $({...this.#e,queryNode:Z.cloneWithTop(this.#e.queryNode,Al(e,t))})}union(e){return new $({...this.#e,queryNode:nl.cloneWithSetOperations(this.#e.queryNode,Ru(`union`,e,!1))})}unionAll(e){return new $({...this.#e,queryNode:nl.cloneWithSetOperations(this.#e.queryNode,Ru(`union`,e,!0))})}intersect(e){return new $({...this.#e,queryNode:nl.cloneWithSetOperations(this.#e.queryNode,Ru(`intersect`,e,!1))})}intersectAll(e){return new $({...this.#e,queryNode:nl.cloneWithSetOperations(this.#e.queryNode,Ru(`intersect`,e,!0))})}except(e){return new $({...this.#e,queryNode:nl.cloneWithSetOperations(this.#e.queryNode,Ru(`except`,e,!1))})}exceptAll(e){return new $({...this.#e,queryNode:nl.cloneWithSetOperations(this.#e.queryNode,Ru(`except`,e,!0))})}as(e){return new Ju(this,e)}clearSelect(){return new $({...this.#e,queryNode:nl.cloneWithoutSelections(this.#e.queryNode)})}clearWhere(){return new $({...this.#e,queryNode:Z.cloneWithoutWhere(this.#e.queryNode)})}clearLimit(){return new $({...this.#e,queryNode:nl.cloneWithoutLimit(this.#e.queryNode)})}clearOffset(){return new $({...this.#e,queryNode:nl.cloneWithoutOffset(this.#e.queryNode)})}clearOrderBy(){return new $({...this.#e,queryNode:Z.cloneWithoutOrderBy(this.#e.queryNode)})}clearGroupBy(){return new $({...this.#e,queryNode:nl.cloneWithoutGroupBy(this.#e.queryNode)})}$call(e){return e(this)}$if(e,t){return e?t(this):new $({...this.#e})}$castTo(){return new $(this.#e)}$narrowType(){return new $(this.#e)}$assertType(){return new $(this.#e)}$asTuple(){return new zu(this.toOperationNode())}$asScalar(){return new zu(this.toOperationNode())}withPlugin(e){return new $({...this.#e,executor:this.#e.executor.withPlugin(e)})}toOperationNode(){return this.#e.executor.transformQuery(this.#e.queryNode,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){let t=this.compile();return(await this.#e.executor.executeQuery(t,e)).rows}async executeTakeFirst(e){let[t]=await this.execute(e);return t}async executeTakeFirstOrThrow(e){typeof e==`function`&&(e={errorConstructor:e});let t=await this.executeTakeFirst(e);if(t===void 0){let t=e?.errorConstructor??Cl;throw wl(t)?new t(this.toOperationNode()):t(this.toOperationNode())}return t}async*stream(e){typeof e!=`object`&&(e={chunkSize:e});let t=this.compile(),n=this.#e.executor.stream(t,e.chunkSize??100,e);for await(let e of n)yield*e.rows}async explain(e,t){return await new $({...this.#e,queryNode:Z.cloneWithExplain(this.#e.queryNode,e,t)}).execute()}};$=Ku;function qu(e){return new Ku(e)}var Ju=class{#e;#t;constructor(e,t){this.#e=e,this.#t=t}get expression(){return this.#e}get alias(){return this.#t}get isAliasedSelectQueryBuilder(){return!0}toOperationNode(){return xs.create(this.#e.toOperationNode(),X.create(this.#t))}};const Yu=J({is(e){return e.kind===`AggregateFunctionNode`},create(e,t=[]){return J({kind:`AggregateFunctionNode`,func:e,aggregated:t})},cloneWithDistinct(e){return J({...e,distinct:!0})},cloneWithOrderBy(e,t,n=!1){let r=n?`withinGroup`:`orderBy`;return J({...e,[r]:e[r]?zc.cloneWithItems(e[r],t):zc.create(t)})},cloneWithFilter(e,t){return J({...e,filter:e.filter?Xc.cloneWithOperation(e.filter,`And`,t):Xc.create(t)})},cloneWithOrFilter(e,t){return J({...e,filter:e.filter?Xc.cloneWithOperation(e.filter,`Or`,t):Xc.create(t)})},cloneWithOver(e,t){return J({...e,over:t})}}),Xu=J({is(e){return e.kind===`FunctionNode`},create(e,t){return J({kind:`FunctionNode`,func:e,arguments:t})}});var Zu=class e{#e;constructor(e){this.#e=J(e)}get expressionType(){}as(e){return new Qu(this,e)}distinct(){return new e({...this.#e,aggregateFunctionNode:Yu.cloneWithDistinct(this.#e.aggregateFunctionNode)})}orderBy(...t){return new e({...this.#e,aggregateFunctionNode:Z.cloneWithOrderByItems(this.#e.aggregateFunctionNode,rc(t))})}clearOrderBy(){return new e({...this.#e,aggregateFunctionNode:Z.cloneWithoutOrderBy(this.#e.aggregateFunctionNode)})}withinGroupOrderBy(...t){return new e({...this.#e,aggregateFunctionNode:Yu.cloneWithOrderBy(this.#e.aggregateFunctionNode,rc(t),!0)})}filterWhere(...t){return new e({...this.#e,aggregateFunctionNode:Yu.cloneWithFilter(this.#e.aggregateFunctionNode,Ac(t))})}filterWhereRef(t,n,r){return new e({...this.#e,aggregateFunctionNode:Yu.cloneWithFilter(this.#e.aggregateFunctionNode,Mc(t,n,r))})}over(t){let n=ku();return new e({...this.#e,aggregateFunctionNode:Yu.cloneWithOver(this.#e.aggregateFunctionNode,(t?t(n):n).toOperationNode())})}$call(e){return e(this)}$castTo(){return new e(this.#e)}$notNull(){return new e(this.#e)}toOperationNode(){return this.#e.aggregateFunctionNode}},Qu=class{#e;#t;constructor(e,t){this.#e=e,this.#t=t}get expression(){return this.#e}get alias(){return this.#t}toOperationNode(){return xs.create(this.#e.toOperationNode(),X.create(this.#t))}};function $u(){let e=(e,t)=>new zu(Xu.create(e,dc(t??[]))),t=(e,t)=>new Zu({aggregateFunctionNode:Yu.create(e,t?dc(t):void 0)});return Object.assign(e,{agg:t,avg(e){return t(`avg`,[e])},coalesce(...t){return e(`coalesce`,t)},count(e){return t(`count`,[e])},countAll(e){return new Zu({aggregateFunctionNode:Yu.create(`count`,ul(e))})},max(e){return t(`max`,[e])},min(e){return t(`min`,[e])},sum(e){return t(`sum`,[e])},any(t){return e(`any`,[t])},jsonAgg(e){return new Zu({aggregateFunctionNode:Yu.create(`json_agg`,[ts(e)?Ad(e):e.toOperationNode()])})},toJson(e){return new zu(Xu.create(`to_json`,[ts(e)?Ad(e):e.toOperationNode()]))}})}const ed=J({is(e){return e.kind===`UnaryOperationNode`},create(e,t){return J({kind:`UnaryOperationNode`,operator:e,operand:t})}});function td(e,t){if(Ws(e))return ed.create(Vs.create(e),fc(t));throw Error(`invalid unary operator ${JSON.stringify(e)}`)}const nd=J({is(e){return e.kind===`CaseNode`},create(e){return J({kind:`CaseNode`,value:e})},cloneWithWhen(e,t){return J({...e,when:J(e.when?[...e.when,t]:[t])})},cloneWithThen(e,t){return J({...e,when:e.when?J([...e.when.slice(0,-1),$c.cloneWithResult(e.when[e.when.length-1],t)]):void 0})},cloneWith(e,t){return J({...e,...t})}});var rd=class{#e;constructor(e){this.#e=J(e)}when(...e){return new id({...this.#e,node:nd.cloneWithWhen(this.#e.node,$c.create(Ac(e)))})}whenRef(e,t,n){return new id({...this.#e,node:nd.cloneWithWhen(this.#e.node,$c.create(Mc(e,t,n)))})}},id=class{#e;constructor(e){this.#e=J(e)}then(e){return new ad({...this.#e,node:nd.cloneWithThen(this.#e.node,Ec(e)?Dc(e):Tc(e))})}thenRef(e){return new ad({...this.#e,node:nd.cloneWithThen(this.#e.node,fc(e))})}},ad=class{#e;constructor(e){this.#e=J(e)}when(...e){return new id({...this.#e,node:nd.cloneWithWhen(this.#e.node,$c.create(Ac(e)))})}whenRef(e,t,n){return new id({...this.#e,node:nd.cloneWithWhen(this.#e.node,$c.create(Mc(e,t,n)))})}else(e){return new od({...this.#e,node:nd.cloneWith(this.#e.node,{else:Ec(e)?Dc(e):Tc(e)})})}elseRef(e){return new od({...this.#e,node:nd.cloneWith(this.#e.node,{else:fc(e)})})}end(){return new zu(nd.cloneWith(this.#e.node,{isStatement:!1}))}endCase(){return new zu(nd.cloneWith(this.#e.node,{isStatement:!0}))}},od=class{#e;constructor(e){this.#e=J(e)}end(){return new zu(nd.cloneWith(this.#e.node,{isStatement:!1}))}endCase(){return new zu(nd.cloneWith(this.#e.node,{isStatement:!0}))}};const sd=J({is(e){return e.kind===`JSONPathLegNode`},create(e,t){return J({kind:`JSONPathLegNode`,type:e,value:t})}}),cd=/^#-\d+$/;var ld=class{#e;constructor(e){this.#e=e}at(e){if(typeof e!=`number`&&typeof e!=`string`||typeof e==`number`&&!Number.isInteger(e)||typeof e==`string`&&e!==`last`&&!cd.test(e))throw Error(`Unexpected index value in .at(...): ${e}`);return this.#t(`ArrayLocation`,e)}key(e){return this.#t(`Member`,e)}#t(e,t){return sc.is(this.#e)?new ud(sc.cloneWithTraversal(this.#e,lc.is(this.#e.traversal)?lc.cloneWithLeg(this.#e.traversal,sd.create(e,t)):cc.cloneWithValue(this.#e.traversal,Cc.createImmediate(t)))):new ud(lc.cloneWithLeg(this.#e,sd.create(e,t)))}},ud=class e extends ld{#e;constructor(e){super(e),this.#e=e}get expressionType(){}as(e){return new dd(this,e)}$castTo(){return new e(this.#e)}$notNull(){return new e(this.#e)}toOperationNode(){return this.#e}},dd=class{#e;#t;constructor(e,t){this.#e=e,this.#t=t}get expression(){return this.#e}get alias(){return this.#t}toOperationNode(){return xs.create(this.#e.toOperationNode(),Cs(this.#t)?this.#t.toOperationNode():X.create(this.#t))}};const fd=J({is(e){return e.kind===`TupleNode`},create(e){return J({kind:`TupleNode`,values:J(e)})}}),pd=J({bigint:!0,bigserial:!0,binary:!0,blob:!0,boolean:!0,bytea:!0,char:!0,date:!0,datemultirange:!0,daterange:!0,datetime:!0,datetime2:!0,decimal:!0,"double precision":!0,float4:!0,float8:!0,int2:!0,int4:!0,int4multirange:!0,int4range:!0,int8:!0,int8multirange:!0,int8range:!0,integer:!0,json:!0,jsonb:!0,numeric:!0,nummultirange:!0,numrange:!0,real:!0,serial:!0,smallint:!0,text:!0,time:!0,timestamp:!0,timestamptz:!0,timetz:!0,tsmultirange:!0,tsrange:!0,tstzmultirange:!0,tstzrange:!0,uuid:!0,varbinary:!0,varchar:!0}),md=J([/^varchar\(\d+\)$/,/^char\(\d+\)$/,/^decimal\(\d+, \d+\)$/,/^numeric\(\d+, \d+\)$/,/^binary\(\d+\)$/,/^datetime\(\d+\)$/,/^time\(\d+\)$/,/^timetz\(\d+\)$/,/^timestamp\(\d+\)$/,/^timestamptz\(\d+\)$/,/^datetime2\(\d+\)$/,/^varbinary\(\d+\)$/]),hd=J({is(e){return e.kind===`DataTypeNode`},create(e){return J({kind:`DataTypeNode`,dataType:e})}});function gd(e){return pd[e]||md.some(t=>t.test(e))}function _d(e){if(Cs(e))return e.toOperationNode();if(gd(e))return hd.create(e);throw Error(`invalid column data type ${JSON.stringify(e)}`)}const vd=J({is(e){return e.kind===`CastNode`},create(e,t){return J({kind:`CastNode`,expression:e,dataType:t})}});function yd(e=bu){function t(e,t,n){return new zu(jc(e,t,n))}function n(e,t){return new zu(td(e,t))}let r=Object.assign(t,{fn:void 0,eb:void 0,selectFrom(t){return qu({queryId:Q(),executor:e,queryNode:nl.createFrom(Dd(t))})},case(e){return new rd({node:nd.create(es(e)?void 0:fc(e))})},ref(e,t){return es(t)?new zu(mc(e)):new ld(pc(e,t))},jsonPath(){return new ld(lc.create())},table(e){return new zu(Ad(e))},val(e){return new zu(Tc(e))},refTuple(...e){return new zu(fd.create(e.map(fc)))},tuple(...e){return new zu(fd.create(e.map(Tc)))},lit(e){return new zu(Dc(e))},unary:n,not(e){return n(`not`,e)},exists(e){return n(`exists`,e)},neg(e){return n(`-`,e)},between(e,t,n){return new zu(js.create(fc(e),Vs.create(`between`),Ds.create(Tc(t),Tc(n))))},betweenSymmetric(e,t,n){return new zu(js.create(fc(e),Vs.create(`between symmetric`),Ds.create(Tc(t),Tc(n))))},and(e){return us(e)?new zu(Pc(e,`and`)):new zu(Nc(e,`and`))},or(e){return us(e)?new zu(Pc(e,`or`)):new zu(Nc(e,`or`))},parens(...e){let t=Ac(e);return kc.is(t)?new zu(t):new zu(kc.create(t))},cast(e,t){return new zu(vd.create(fc(e),_d(t)))}});return r.fn=$u(),r.eb=r,r}function bd(e){return yd()}function xd(e){if(Cs(e))return e.toOperationNode();if(ss(e))return e(bd()).toOperationNode();throw Error(`invalid expression: ${JSON.stringify(e)}`)}function Sd(e){if(Cs(e))return e.toOperationNode();if(ss(e))return e(bd()).toOperationNode();throw Error(`invalid aliased expression: ${JSON.stringify(e)}`)}function Cd(e){return ws(e)||Ts(e)||ss(e)}var wd=class{#e;get table(){return this.#e}constructor(e){this.#e=e}as(e){return new Td(this.#e,e)}},Td=class{#e;#t;get table(){return this.#e}get alias(){return this.#t}constructor(e,t){this.#e=e,this.#t=t}toOperationNode(){return xs.create(Ad(this.#e),X.create(this.#t))}};function Ed(e){return cs(e)&&Cs(e)&&ts(e.table)&&ts(e.alias)}function Dd(e){return us(e)?e.map(e=>Od(e)):[Od(e)]}function Od(e){return ts(e)?kd(e):Ed(e)?e.toOperationNode():Sd(e)}function kd(e){let t=` as `;if(e.includes(t)){let[n,r]=e.split(t).map(jd);return xs.create(Ad(n),X.create(r))}return Ad(e)}function Ad(e){if(e.includes(`.`)){let[t,n]=e.split(`.`).map(jd);return Ss.createWithSchema(t,n)}return Ss.create(e)}function jd(e){return e.trim()}const Md=J({is(e){return e.kind===`AddColumnNode`},create(e){return J({kind:`AddColumnNode`,column:e})}}),Nd=J({is(e){return e.kind===`ColumnDefinitionNode`},create(e,t){return J({kind:`ColumnDefinitionNode`,column:Gs.create(e),dataType:t})},cloneWithFrontModifier(e,t){return J({...e,frontModifiers:e.frontModifiers?J([...e.frontModifiers,t]):[t]})},cloneWithEndModifier(e,t){return J({...e,endModifiers:e.endModifiers?J([...e.endModifiers,t]):[t]})},cloneWith(e,t){return J({...e,...t})}}),Pd=J({is(e){return e.kind===`DropColumnNode`},create(e){return J({kind:`DropColumnNode`,column:Gs.create(e)})},cloneWith(e,t){return J({...e,...t})}}),Fd=J({is(e){return e.kind===`RenameColumnNode`},create(e,t){return J({kind:`RenameColumnNode`,column:Gs.create(e),renameTo:Gs.create(t)})}}),Id=J({is(e){return e.kind===`CheckConstraintNode`},create(e,t){return J({kind:`CheckConstraintNode`,expression:e,name:t?X.create(t):void 0})}}),Ld=J({cascade:!0,"no action":!0,restrict:!0,"set default":!0,"set null":!0});Object.keys(Ld);const Rd=J({is(e){return e.kind===`ReferencesNode`},create(e,t){return J({kind:`ReferencesNode`,table:e,columns:J([...t])})},cloneWithOnDelete(e,t){return J({...e,onDelete:t})},cloneWithOnUpdate(e,t){return J({...e,onUpdate:t})}});function zd(e){return ts(e)&&Ld[e]}function Bd(e){return Cs(e)?e.toOperationNode():Cc.createImmediate(e)}const Vd=J({is(e){return e.kind===`GeneratedNode`},create(e){return J({kind:`GeneratedNode`,...e})},createWithExpression(e){return J({kind:`GeneratedNode`,always:!0,expression:e})},cloneWith(e,t){return J({...e,...t})}}),Hd=J({is(e){return e.kind===`DefaultValueNode`},create(e){return J({kind:`DefaultValueNode`,defaultValue:e})}});function Ud(e){if(zd(e))return e;throw Error(`invalid OnModifyForeignAction ${e}`)}var Wd=class e{#e;constructor(e){this.#e=e}autoIncrement(){return new e(Nd.cloneWith(this.#e,{autoIncrement:!0}))}identity(){return new e(Nd.cloneWith(this.#e,{identity:!0}))}primaryKey(){return new e(Nd.cloneWith(this.#e,{primaryKey:!0}))}references(t){let n=mc(t);if(!n.table||Ks.is(n.column))throw Error(`invalid call references('${t}'). The reference must have format table.column or schema.table.column`);return new e(Nd.cloneWith(this.#e,{references:Rd.create(n.table,[n.column])}))}onDelete(t){if(!this.#e.references)throw Error(`on delete constraint can only be added for foreign keys`);return new e(Nd.cloneWith(this.#e,{references:Rd.cloneWithOnDelete(this.#e.references,Ud(t))}))}onUpdate(t){if(!this.#e.references)throw Error(`on update constraint can only be added for foreign keys`);return new e(Nd.cloneWith(this.#e,{references:Rd.cloneWithOnUpdate(this.#e.references,Ud(t))}))}unique(){return new e(Nd.cloneWith(this.#e,{unique:!0}))}notNull(){return new e(Nd.cloneWith(this.#e,{notNull:!0}))}unsigned(){return new e(Nd.cloneWith(this.#e,{unsigned:!0}))}defaultTo(t){return new e(Nd.cloneWith(this.#e,{defaultTo:Hd.create(Bd(t))}))}check(t){return new e(Nd.cloneWith(this.#e,{check:Id.create(t.toOperationNode())}))}generatedAlwaysAs(t){return new e(Nd.cloneWith(this.#e,{generated:Vd.createWithExpression(t.toOperationNode())}))}generatedAlwaysAsIdentity(){return new e(Nd.cloneWith(this.#e,{generated:Vd.create({identity:!0,always:!0})}))}generatedByDefaultAsIdentity(){return new e(Nd.cloneWith(this.#e,{generated:Vd.create({identity:!0,byDefault:!0})}))}stored(){if(!this.#e.generated)throw Error(`stored() can only be called after generatedAlwaysAs`);return new e(Nd.cloneWith(this.#e,{generated:Vd.cloneWith(this.#e.generated,{stored:!0})}))}modifyFront(t){return new e(Nd.cloneWithFrontModifier(this.#e,t.toOperationNode()))}nullsNotDistinct(){return new e(Nd.cloneWith(this.#e,{nullsNotDistinct:!0}))}ifNotExists(){return new e(Nd.cloneWith(this.#e,{ifNotExists:!0}))}modifyEnd(t){return new e(Nd.cloneWithEndModifier(this.#e,t.toOperationNode()))}$call(e){return e(this)}toOperationNode(){return this.#e}};const Gd=J({is(e){return e.kind===`ModifyColumnNode`},create(e){return J({kind:`ModifyColumnNode`,column:e})}}),Kd=J({is(e){return e.kind===`ForeignKeyConstraintNode`},create(e,t,n,r){return J({kind:`ForeignKeyConstraintNode`,columns:e,references:Rd.create(t,n),name:r?X.create(r):void 0})},cloneWith(e,t){return J({...e,...t})}});var qd=class e{#e;constructor(e){this.#e=e}onDelete(t){return new e(Kd.cloneWith(this.#e,{onDelete:Ud(t)}))}onUpdate(t){return new e(Kd.cloneWith(this.#e,{onUpdate:Ud(t)}))}deferrable(){return new e(Kd.cloneWith(this.#e,{deferrable:!0}))}notDeferrable(){return new e(Kd.cloneWith(this.#e,{deferrable:!1}))}initiallyDeferred(){return new e(Kd.cloneWith(this.#e,{initiallyDeferred:!0}))}initiallyImmediate(){return new e(Kd.cloneWith(this.#e,{initiallyDeferred:!1}))}$call(e){return e(this)}toOperationNode(){return this.#e}};const Jd=J({is(e){return e.kind===`AddConstraintNode`},create(e){return J({kind:`AddConstraintNode`,constraint:e})}}),Yd=J({is(e){return e.kind===`UniqueConstraintNode`},create(e,t,n){return ts(e.at(0))&&(tc("`UniqueConstraintNode.create(columns: string[], ...)` is deprecated - pass `ColumnNode[]` instead."),e=e.map(Gs.create)),J({kind:`UniqueConstraintNode`,columns:J(e),name:t?X.create(t):void 0,nullsNotDistinct:n})},cloneWith(e,t){return J({...e,...t})}}),Xd=J({is(e){return e.kind===`DropConstraintNode`},create(e){return J({kind:`DropConstraintNode`,constraintName:X.create(e)})},cloneWith(e,t){return J({...e,...t})}}),Zd=J({is(e){return e.kind===`AlterColumnNode`},create(e,t,n){return J({kind:`AlterColumnNode`,column:Gs.create(e),[t]:n})}});var Qd=class{#e;constructor(e){this.#e=e}setDataType(e){return new $d(Zd.create(this.#e,`dataType`,_d(e)))}setDefault(e){return new $d(Zd.create(this.#e,`setDefault`,Bd(e)))}dropDefault(){return new $d(Zd.create(this.#e,`dropDefault`,!0))}setNotNull(){return new $d(Zd.create(this.#e,`setNotNull`,!0))}dropNotNull(){return new $d(Zd.create(this.#e,`dropNotNull`,!0))}$call(e){return e(this)}},$d=class{#e;constructor(e){this.#e=e}toOperationNode(){return this.#e}},ef=class{#e;constructor(e){this.#e=J(e)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},tf=class e{#e;constructor(e){this.#e=J(e)}onDelete(t){return new e({...this.#e,constraintBuilder:this.#e.constraintBuilder.onDelete(t)})}onUpdate(t){return new e({...this.#e,constraintBuilder:this.#e.constraintBuilder.onUpdate(t)})}deferrable(){return new e({...this.#e,constraintBuilder:this.#e.constraintBuilder.deferrable()})}notDeferrable(){return new e({...this.#e,constraintBuilder:this.#e.constraintBuilder.notDeferrable()})}initiallyDeferred(){return new e({...this.#e,constraintBuilder:this.#e.constraintBuilder.initiallyDeferred()})}initiallyImmediate(){return new e({...this.#e,constraintBuilder:this.#e.constraintBuilder.initiallyImmediate()})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(Y.cloneWithTableProps(this.#e.node,{addConstraint:Jd.create(this.#e.constraintBuilder.toOperationNode())}),this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},nf=class e{#e;constructor(e){this.#e=J(e)}ifExists(){return new e({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{dropConstraint:Xd.cloneWith(this.#e.node.dropConstraint,{ifExists:!0})})})}cascade(){return new e({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{dropConstraint:Xd.cloneWith(this.#e.node.dropConstraint,{modifier:`cascade`})})})}restrict(){return new e({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{dropConstraint:Xd.cloneWith(this.#e.node.dropConstraint,{modifier:`restrict`})})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};const rf=J({is(e){return e.kind===`PrimaryKeyConstraintNode`},create(e,t){return J({kind:`PrimaryKeyConstraintNode`,columns:J(e.map(Gs.create)),name:t?X.create(t):void 0})},cloneWith(e,t){return J({...e,...t})}}),af=J({is(e){return e.kind===`AddIndexNode`},create(e){return J({kind:`AddIndexNode`,name:X.create(e)})},cloneWith(e,t){return J({...e,...t})},cloneWithColumns(e,t){return J({...e,columns:[...e.columns||[],...t]})}});var of=class e{#e;constructor(e){this.#e=J(e)}unique(){return new e({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{addIndex:af.cloneWith(this.#e.node.addIndex,{unique:!0})})})}column(t){return new e({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{addIndex:af.cloneWithColumns(this.#e.node.addIndex,[ts(t)?_c(t):t.toOperationNode()])})})}columns(t){return new e({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{addIndex:af.cloneWithColumns(this.#e.node.addIndex,t.map(e=>ts(e)?_c(e):e.toOperationNode()))})})}expression(t){return new e({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{addIndex:af.cloneWithColumns(this.#e.node.addIndex,[t.toOperationNode()])})})}using(t){return new e({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{addIndex:af.cloneWith(this.#e.node.addIndex,{using:Zs.createWithSql(t)})})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},sf=class e{#e;constructor(e){this.#e=e}nullsNotDistinct(){return new e(Yd.cloneWith(this.#e,{nullsNotDistinct:!0}))}deferrable(){return new e(Yd.cloneWith(this.#e,{deferrable:!0}))}notDeferrable(){return new e(Yd.cloneWith(this.#e,{deferrable:!1}))}initiallyDeferred(){return new e(Yd.cloneWith(this.#e,{initiallyDeferred:!0}))}initiallyImmediate(){return new e(Yd.cloneWith(this.#e,{initiallyDeferred:!1}))}$call(e){return e(this)}toOperationNode(){return this.#e}},cf=class e{#e;constructor(e){this.#e=e}deferrable(){return new e(rf.cloneWith(this.#e,{deferrable:!0}))}notDeferrable(){return new e(rf.cloneWith(this.#e,{deferrable:!1}))}initiallyDeferred(){return new e(rf.cloneWith(this.#e,{initiallyDeferred:!0}))}initiallyImmediate(){return new e(rf.cloneWith(this.#e,{initiallyDeferred:!1}))}$call(e){return e(this)}toOperationNode(){return this.#e}},lf=class{#e;constructor(e){this.#e=e}$call(e){return e(this)}toOperationNode(){return this.#e}};const uf=J({is(e){return e.kind===`RenameConstraintNode`},create(e,t){return J({kind:`RenameConstraintNode`,oldName:X.create(e),newName:X.create(t)})}});var df=class e{#e;constructor(e){this.#e=J({...e})}ifExists(){return new e({...this.#e,node:Pd.cloneWith(this.#e.node,{ifExists:!0})})}toOperationNode(){return this.#e.node}},ff=class{#e;constructor(e){this.#e=J(e)}renameTo(e){return new ef({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{renameTo:Ad(e)})})}setSchema(e){return new ef({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{setSchema:X.create(e)})})}alterColumn(e,t){let n=t(new Qd(e));return new pf({...this.#e,node:Y.cloneWithColumnAlteration(this.#e.node,n.toOperationNode())})}dropColumn(e,t=ds){let n=t(new df({node:Pd.create(e)}));return new pf({...this.#e,node:Y.cloneWithColumnAlteration(this.#e.node,n.toOperationNode())})}renameColumn(e,t){return new pf({...this.#e,node:Y.cloneWithColumnAlteration(this.#e.node,Fd.create(e,t))})}addColumn(e,t,n=ds){let r=n(new Wd(Nd.create(e,_d(t))));return new pf({...this.#e,node:Y.cloneWithColumnAlteration(this.#e.node,Md.create(r.toOperationNode()))})}modifyColumn(e,t,n=ds){let r=n(new Wd(Nd.create(e,_d(t))));return new pf({...this.#e,node:Y.cloneWithColumnAlteration(this.#e.node,Gd.create(r.toOperationNode()))})}addUniqueConstraint(e,t,n=ds){let r=n(new sf(Yd.create(t.map(e=>ts(e)?Gs.create(e):xd(e)),e)));return new ef({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{addConstraint:Jd.create(r.toOperationNode())})})}addCheckConstraint(e,t,n=ds){let r=n(new lf(Id.create(t.toOperationNode(),e)));return new ef({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{addConstraint:Jd.create(r.toOperationNode())})})}addForeignKeyConstraint(e,t,n,r,i=ds){let a=i(new qd(Kd.create(t.map(Gs.create),Ad(n),r.map(Gs.create),e)));return new tf({...this.#e,constraintBuilder:a})}addPrimaryKeyConstraint(e,t,n=ds){let r=n(new cf(rf.create(t,e)));return new ef({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{addConstraint:Jd.create(r.toOperationNode())})})}dropConstraint(e){return new nf({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{dropConstraint:Xd.create(e)})})}renameConstraint(e,t){return new nf({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{renameConstraint:uf.create(e,t)})})}addIndex(e){return new of({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{addIndex:af.create(e)})})}dropIndex(e){return new ef({...this.#e,node:Y.cloneWithTableProps(this.#e.node,{dropIndex:vs.create(e)})})}$call(e){return e(this)}},pf=class e{#e;constructor(e){this.#e=J(e)}alterColumn(t,n){let r=n(new Qd(t));return new e({...this.#e,node:Y.cloneWithColumnAlteration(this.#e.node,r.toOperationNode())})}dropColumn(t,n=ds){let r=n(new df({node:Pd.create(t)}));return new e({...this.#e,node:Y.cloneWithColumnAlteration(this.#e.node,r.toOperationNode())})}renameColumn(t,n){return new e({...this.#e,node:Y.cloneWithColumnAlteration(this.#e.node,Fd.create(t,n))})}addColumn(t,n,r=ds){let i=r(new Wd(Nd.create(t,_d(n))));return new e({...this.#e,node:Y.cloneWithColumnAlteration(this.#e.node,Md.create(i.toOperationNode()))})}modifyColumn(t,n,r=ds){let i=r(new Wd(Nd.create(t,_d(n))));return new e({...this.#e,node:Y.cloneWithColumnAlteration(this.#e.node,Gd.create(i.toOperationNode()))})}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},mf=class extends Ql{transformPrimitiveValueList(e){return Sc.create(e.values.map(Cc.createImmediate))}transformValue(e){return Cc.createImmediate(e.value)}},hf=class e{#e;constructor(e){this.#e=J(e)}ifNotExists(){return new e({...this.#e,node:ps.cloneWith(this.#e.node,{ifNotExists:!0})})}unique(){return new e({...this.#e,node:ps.cloneWith(this.#e.node,{unique:!0})})}nullsNotDistinct(){return new e({...this.#e,node:ps.cloneWith(this.#e.node,{nullsNotDistinct:!0})})}on(t){return new e({...this.#e,node:ps.cloneWith(this.#e.node,{table:Ad(t)})})}column(t){return new e({...this.#e,node:ps.cloneWithColumns(this.#e.node,[ts(t)?_c(t):t.toOperationNode()])})}columns(t){return new e({...this.#e,node:ps.cloneWithColumns(this.#e.node,t.map(e=>ts(e)?_c(e):e.toOperationNode()))})}expression(t){return new e({...this.#e,node:ps.cloneWithColumns(this.#e.node,[t.toOperationNode()])})}using(t){return new e({...this.#e,node:ps.cloneWith(this.#e.node,{using:Zs.createWithSql(t)})})}where(...t){let n=new mf;return new e({...this.#e,node:Z.cloneWithWhere(this.#e.node,n.transformNode(Ac(t),this.#e.queryId))})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},gf=class e{#e;constructor(e){this.#e=J(e)}ifNotExists(){return new e({...this.#e,node:ms.cloneWith(this.#e.node,{ifNotExists:!0})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};function _f(e){if(hs.includes(e))return e;throw Error(`invalid OnCommitAction ${e}`)}var vf=class e{#e;constructor(e){this.#e=e}using(t){return new e(af.cloneWith(this.#e,{using:Zs.createWithSql(t)}))}$call(e){return e(this)}toOperationNode(){return this.#e}},yf=class e{#e;constructor(e){this.#e=J(e)}temporary(){return new e({...this.#e,node:gs.cloneWith(this.#e.node,{temporary:!0})})}onCommit(t){return new e({...this.#e,node:gs.cloneWith(this.#e.node,{onCommit:_f(t)})})}ifNotExists(){return new e({...this.#e,node:gs.cloneWith(this.#e.node,{ifNotExists:!0})})}addColumn(t,n,r=ds){let i=r(new Wd(Nd.create(t,_d(n))));return new e({...this.#e,node:gs.cloneWithColumn(this.#e.node,i.toOperationNode())})}addPrimaryKeyConstraint(t,n,r=ds){let i=r(new cf(rf.create(n,t)));return new e({...this.#e,node:gs.cloneWithConstraint(this.#e.node,i.toOperationNode())})}addUniqueConstraint(t,n,r=ds){let i=r(new sf(Yd.create(n.map(e=>ts(e)?Gs.create(e):xd(e)),t)));return new e({...this.#e,node:gs.cloneWithConstraint(this.#e.node,i.toOperationNode())})}addIndex(t,n,r=ds){let i=r(new vf(af.cloneWithColumns(af.create(t),n.map(e=>ts(e)?Gs.create(e):xd(e)))));return new e({...this.#e,node:gs.cloneWithIndex(this.#e.node,i.toOperationNode())})}addCheckConstraint(t,n,r=ds){let i=r(new lf(Id.create(n.toOperationNode(),t)));return new e({...this.#e,node:gs.cloneWithConstraint(this.#e.node,i.toOperationNode())})}addForeignKeyConstraint(t,n,r,i,a=ds){let o=a(new qd(Kd.create(n.map(Gs.create),Ad(r),i.map(Gs.create),t)));return new e({...this.#e,node:gs.cloneWithConstraint(this.#e.node,o.toOperationNode())})}modifyFront(t){return new e({...this.#e,node:gs.cloneWithFrontModifier(this.#e.node,t.toOperationNode())})}modifyEnd(t){return new e({...this.#e,node:gs.cloneWithEndModifier(this.#e.node,t.toOperationNode())})}as(t){return new e({...this.#e,node:gs.cloneWith(this.#e.node,{selectQuery:xd(t)})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},bf=class e{#e;constructor(e){this.#e=J(e)}on(t){return new e({...this.#e,node:vs.cloneWith(this.#e.node,{table:Ad(t)})})}ifExists(){return new e({...this.#e,node:vs.cloneWith(this.#e.node,{ifExists:!0})})}cascade(){return new e({...this.#e,node:vs.cloneWith(this.#e.node,{cascade:!0})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},xf=class e{#e;constructor(e){this.#e=J(e)}ifExists(){return new e({...this.#e,node:ys.cloneWith(this.#e.node,{ifExists:!0})})}cascade(){return new e({...this.#e,node:ys.cloneWith(this.#e.node,{cascade:!0})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}},Sf=class e{#e;constructor(e){this.#e=J(e)}temporary(){return new e({...this.#e,node:bs.cloneWith(this.#e.node,{temporary:!0})})}ifExists(){return new e({...this.#e,node:bs.cloneWith(this.#e.node,{ifExists:!0})})}cascade(){return new e({...this.#e,node:bs.cloneWith(this.#e.node,{cascade:!0})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};const Cf=J({is(e){return e.kind===`CreateViewNode`},create(e){return J({kind:`CreateViewNode`,name:_s.create(e)})},cloneWith(e,t){return J({...e,...t})}});var wf=class{#e=new mf;transformQuery(e){return this.#e.transformNode(e.node,e.queryId)}transformResult(e){return Promise.resolve(e.result)}},Tf=class e{#e;constructor(e){this.#e=J(e)}temporary(){return new e({...this.#e,node:Cf.cloneWith(this.#e.node,{temporary:!0})})}materialized(){return new e({...this.#e,node:Cf.cloneWith(this.#e.node,{materialized:!0})})}ifNotExists(){return new e({...this.#e,node:Cf.cloneWith(this.#e.node,{ifNotExists:!0})})}orReplace(){return new e({...this.#e,node:Cf.cloneWith(this.#e.node,{orReplace:!0})})}columns(t){return new e({...this.#e,node:Cf.cloneWith(this.#e.node,{columns:t.map(gc)})})}as(t){let n=t.withPlugin(new wf).toOperationNode();return new e({...this.#e,node:Cf.cloneWith(this.#e.node,{as:n})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};const Ef=J({is(e){return e.kind===`DropViewNode`},create(e){return J({kind:`DropViewNode`,name:_s.create(e)})},cloneWith(e,t){return J({...e,...t})}});var Df=class e{#e;constructor(e){this.#e=J(e)}materialized(){return new e({...this.#e,node:Ef.cloneWith(this.#e.node,{materialized:!0})})}ifExists(){return new e({...this.#e,node:Ef.cloneWith(this.#e.node,{ifExists:!0})})}cascade(){return new e({...this.#e,node:Ef.cloneWith(this.#e.node,{cascade:!0})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};const Of=J({is(e){return e.kind===`CreateTypeNode`},create(e){return J({kind:`CreateTypeNode`,name:e})},cloneWithEnum(e,t){return J({...e,enum:Sc.create(t.map(Cc.createImmediate))})}});var kf=class e{#e;constructor(e){this.#e=J(e)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}asEnum(t){return new e({...this.#e,node:Of.cloneWithEnum(this.#e.node,t)})}$call(e){return e(this)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};const Af=J({is(e){return e.kind===`DropTypeNode`},create(e){return Array.isArray(e)||(e=[e]),J({kind:`DropTypeNode`,name:e[0],additionalNames:e.slice(1)})},cloneWith(e,t){return J({...e,...t})}});var jf=class e{#e;constructor(e){this.#e=J(e)}ifExists(){return new e({...this.#e,node:Af.cloneWith(this.#e.node,{ifExists:!0})})}cascade(){return new e({...this.#e,node:Af.cloneWith(this.#e.node,{cascade:!0})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};function Mf(e){if(e.includes(`.`)){let t=e.split(`.`).map(Pf);if(t.length===2)return _s.createWithSchema(t[0],t[1]);throw Error(`invalid schemable identifier ${e}`)}return _s.create(e)}function Nf(e){return Array.isArray(e)||(e=[e]),e.map(Mf)}function Pf(e){return e.trim()}const Ff=J({is(e){return e.kind===`RefreshMaterializedViewNode`},create(e){return J({kind:`RefreshMaterializedViewNode`,name:_s.create(e)})},cloneWith(e,t){return J({...e,...t})}});var If=class e{#e;constructor(e){this.#e=J(e)}concurrently(){return new e({...this.#e,node:Ff.cloneWith(this.#e.node,{concurrently:!0,withNoData:!1})})}withData(){return new e({...this.#e,node:Ff.cloneWith(this.#e.node,{withNoData:!1})})}withNoData(){return new e({...this.#e,node:Ff.cloneWith(this.#e.node,{withNoData:!0,concurrently:!1})})}$call(e){return e(this)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){await this.#e.executor.executeQuery(this.compile(),e)}};const Lf=J({is(e){return e.kind===`AlterTypeNode`},create(e){return J({kind:`AlterTypeNode`,name:e})},cloneWith(e,t){return J({...e,...t})}}),Rf=J({is(e){return e.kind===`AddValueNode`},create(e){return J({kind:`AddValueNode`,value:e})},cloneWith(e,t){return J({...e,...t})}});var zf=class{#e;constructor(e){this.#e=J(e)}toOperationNode(){return this.#e.executor.transformQuery(this.#e.node,this.#e.queryId)}compile(){return this.#e.executor.compileQuery(this.toOperationNode(),this.#e.queryId)}async execute(e){return await this.#e.executor.executeQuery(this.compile(),e)}},Bf,Vf=class extends zf{#e;constructor(e){super(e),this.#e=e}ifNotExists(){return new Bf({...this.#e,node:Lf.cloneWith(this.#e.node,{addValue:Rf.cloneWith(this.#e.node.addValue,{ifNotExists:!0})})})}before(e){return this.#t(e,!0)}after(e){return this.#t(e,!1)}#t(e,t){return new Bf({...this.#e,node:Lf.cloneWith(this.#e.node,{addValue:Rf.cloneWith(this.#e.node.addValue,{isBefore:t,neighborValue:Cc.createImmediate(e)})})})}};Bf=Vf;const Hf=J({is(e){return e.kind===`RenameValueNode`},create(e,t){return J({kind:`RenameValueNode`,oldValue:e,newValue:t})}});var Uf=class{#e;constructor(e){this.#e=J(e)}addValue(e){return new Vf({...this.#e,node:Lf.cloneWith(this.#e.node,{addValue:Rf.create(Cc.createImmediate(e))})})}renameTo(e){return new zf({...this.#e,node:Lf.cloneWith(this.#e.node,{renameTo:X.create(e)})})}renameValue(e,t){return new zf({...this.#e,node:Lf.cloneWith(this.#e.node,{renameValue:Hf.create(Cc.createImmediate(e),Cc.createImmediate(t))})})}setSchema(e){return new zf({...this.#e,node:Lf.cloneWith(this.#e.node,{setSchema:X.create(e)})})}},Wf=class e{#e;constructor(e){this.#e=e}createTable(e){return new yf({queryId:Q(),executor:this.#e,node:gs.create(Ad(e))})}dropTable(e){return new Sf({queryId:Q(),executor:this.#e,node:bs.create(Ad(e))})}createIndex(e){return new hf({queryId:Q(),executor:this.#e,node:ps.create(e)})}dropIndex(e){return new bf({queryId:Q(),executor:this.#e,node:vs.create(e)})}createSchema(e){return new gf({queryId:Q(),executor:this.#e,node:ms.create(e)})}dropSchema(e){return new xf({queryId:Q(),executor:this.#e,node:ys.create(e)})}alterTable(e){return new ff({queryId:Q(),executor:this.#e,node:Y.create(Ad(e))})}createView(e){return new Tf({queryId:Q(),executor:this.#e,node:Cf.create(e)})}refreshMaterializedView(e){return new If({queryId:Q(),executor:this.#e,node:Ff.create(e)})}dropView(e){return new Df({queryId:Q(),executor:this.#e,node:Ef.create(e)})}createType(e){return new kf({queryId:Q(),executor:this.#e,node:Of.create(Mf(e))})}alterType(e){return new Uf({executor:this.#e,node:Lf.create(Mf(e)),queryId:Q()})}dropType(e){return new jf({queryId:Q(),executor:this.#e,node:Af.create(Nf(e))})}withPlugin(t){return new e(this.#e.withPlugin(t))}withoutPlugins(){return new e(this.#e.withoutPlugins())}withSchema(t){return new e(this.#e.withPluginAtFront(new iu(t)))}},Gf=class{ref(e){return new Js(e)}table(e){return new wd(e)}},Kf=class{#e;constructor(e){this.#e=e}async provideConnection(e,t){let n=await this.#e.acquireConnection(t);try{return await e(n)}finally{await this.#e.releaseConnection(n,t)}}},qf=class e extends yu{#e;#t;#n;constructor(e,t,n,r=[]){super(r),this.#e=e,this.#t=t,this.#n=n}get adapter(){return this.#t}compileQuery(e,t){return this.#e.compileQuery(e,t)}provideConnection(e,t){return this.#n.provideConnection(e,t)}withPlugins(t){return new e(this.#e,this.#t,this.#n,[...this.plugins,...t])}withPlugin(t){return new e(this.#e,this.#t,this.#n,[...this.plugins,t])}withPluginAtFront(t){return new e(this.#e,this.#t,this.#n,[t,...this.plugins])}withConnectionProvider(t){return new e(this.#e,this.#t,t,[...this.plugins])}withoutPlugins(){return new e(this.#e,this.#t,this.#n,[])}};function Jf(){return typeof performance<`u`&&ss(performance.now)?performance.now():Date.now()}var Yf=class{#e;#t;async obtainLock(){for(;this.#e;)await this.#e;this.#e=new Promise(e=>{this.#t=e})}releaseLock(){let e=this.#t;this.#e=void 0,this.#t=void 0,e?.()}},Xf=class{#e;#t;#n;#r;#i;#a=/* @__PURE__ */ new WeakSet;#o;constructor(e,t,n){this.#e=e,this.#r=!1,this.#t=n,t.supportsMultipleConnections===!1&&(this.#o=new Yf)}async init(e){if(this.#i)throw Error(`driver has already been destroyed`);this.#n??=this.#e.init(e).then(()=>{this.#r=!0}).catch(e=>{throw this.#n=void 0,e}),await hu(this.#n,e?.signal,`init`)}async acquireConnection(e){if(this.#i)throw Error(`driver has already been destroyed`);if(this.#r||await this.init(e),this.#o){let t=this.#o.obtainLock();await hu(t,e?.signal,`acquireConnection:mutex`,()=>t.then(()=>this.#o?.releaseLock()))}let t=this.#e.acquireConnection(e),n=await hu(t,e?.signal,`acquireConnection:acquire`,()=>t?.then(e=>this.releaseConnection(e).catch(gu(`driver.releaseConnection`))).catch(gu(`driver.acquireConnection`)));return this.#a.has(n)||(this.#s()&&this.#c(n),this.#a.add(n)),n}async releaseConnection(e,t){await this.#e.releaseConnection(e,t),this.#o?.releaseLock()}async beginTransaction(e,t){return await this.#e.beginTransaction(e,t)}async commitTransaction(e){return await this.#e.commitTransaction(e)}async rollbackTransaction(e){return await this.#e.rollbackTransaction(e)}async savepoint(e,t,n){if(this.#e.savepoint)return await this.#e.savepoint(e,t,n);throw Error("The `savepoint` method is not supported by this driver")}async rollbackToSavepoint(e,t,n){if(this.#e.rollbackToSavepoint)return await this.#e.rollbackToSavepoint(e,t,n);throw Error("The `rollbackToSavepoint` method is not supported by this driver")}async releaseSavepoint(e,t,n){if(this.#e.releaseSavepoint)return await this.#e.releaseSavepoint(e,t,n);throw Error("The `releaseSavepoint` method is not supported by this driver")}async destroy(e){this.#n&&(await hu(this.#n,e?.signal,`destroy:initPromise`),this.#i??=this.#e.destroy(e).catch(e=>{throw this.#i=void 0,e}),await hu(this.#i,e?.signal,`destroy`))}#s(){return this.#t.isLevelEnabled(`query`)||this.#t.isLevelEnabled(`error`)}#c(e){let t=e.executeQuery,n=e.streamQuery,r=this;e.executeQuery=async(n,i)=>{let a,o=Jf();try{return await t.call(e,n,i)}catch(e){throw a=e,await r.#l(e,n,o),e}finally{a||await r.#u(n,o)}},e.streamQuery=async function*(t,i,a){let o,s=Jf();try{for await(let r of n.call(e,t,i,a))yield r}catch(e){throw o=e,await r.#l(e,t,s),e}finally{o||await r.#u(t,s,!0)}}}async#l(e,t,n){await this.#t.error(()=>({level:`error`,error:e,query:t,queryDurationMillis:this.#d(n)}))}async#u(e,t,n=!1){await this.#t.query(()=>({level:`query`,isStream:n,query:e,queryDurationMillis:this.#d(t)}))}#d(e){return Jf()-e}};const Zf=()=>{};var Qf=class{#e;#t;constructor(e){this.#e=e}async provideConnection(e){for(;this.#t;)await this.#t.catch(Zf);return this.#t=this.#n(e).finally(()=>{this.#t=void 0}),this.#t}async#n(e){return await e(this.#e)}};const $f=[`read only`,`read write`],ep=[`read uncommitted`,`read committed`,`repeatable read`,`serializable`,`snapshot`];function tp(e){if(e.accessMode&&!$f.includes(e.accessMode))throw Error(`invalid transaction access mode ${e.accessMode}`);if(e.isolationLevel&&!ep.includes(e.isolationLevel))throw Error(`invalid transaction isolation level ${e.isolationLevel}`)}J([`query`,`error`]);var np=class{#e;#t;constructor(e){ss(e)?(this.#t=e,this.#e=J({query:!0,error:!0})):(this.#t=rp,this.#e=J({query:e.includes(`query`),error:e.includes(`error`)}))}isLevelEnabled(e){return this.#e[e]}async query(e){this.#e.query&&await this.#t(e())}async error(e){this.#e.error&&await this.#t(e())}};function rp(e){if(e.level===`query`){let t=`kysely:query:${e.isStream?`stream:`:``}`;console.log(`${t} ${e.query.sql}`),console.log(`${t} duration: ${e.queryDurationMillis.toFixed(1)}ms`)}else e.level===`error`&&(e.error instanceof Error?console.error(`kysely:error: ${e.error.stack??e.error.message}`):console.error(`kysely:error: ${JSON.stringify({error:e.error,query:e.query.sql,queryDurationMillis:e.queryDurationMillis})}`))}function ip(e){return cs(e)&&ss(e.compile)}Symbol.asyncDispose??=Symbol(`Symbol.asyncDispose`);var ap=class e extends Eu{#e;constructor(e){let t,n;if(sp(e))t={executor:e.executor},n={...e};else{let r=e.dialect,i=r.createDriver(),a=r.createQueryCompiler(),o=r.createAdapter(),s=new Xf(i,o,new np(e.log??[])),c=new qf(a,o,new Kf(s),e.plugins??[]);t={executor:c},n={config:e,executor:c,dialect:r,driver:s}}super(t),this.#e=J(n)}get schema(){return new Wf(this.#e.executor)}get dynamic(){return new Gf}get introspection(){return this.#e.dialect.createIntrospector(this.withoutPlugins())}case(e){return new rd({node:nd.create(es(e)?void 0:xd(e))})}get fn(){return $u()}transaction(){return new lp({...this.#e})}startTransaction(){return new up({...this.#e})}connection(){return new cp({...this.#e})}withPlugin(t){return new e({...this.#e,executor:this.#e.executor.withPlugin(t)})}withoutPlugins(){return new e({...this.#e,executor:this.#e.executor.withoutPlugins()})}withSchema(t){return new e({...this.#e,executor:this.#e.executor.withPluginAtFront(new iu(t))})}$extendTables(){return new e({...this.#e})}$omitTables(){return new e({...this.#e})}$pickTables(){return new e({...this.#e})}withTables(){return this.$extendTables()}async destroy(){await this.#e.driver.destroy()}get isTransaction(){return!1}getExecutor(){return this.#e.executor}async executeQuery(e,t){let n=ip(e)?e.compile():e;return await this.#e.executor.executeQuery(n,t)}async[Symbol.asyncDispose](){await this.destroy()}},op=class e extends ap{#e;constructor(e){super(e),this.#e=e}get isTransaction(){return!0}transaction(){throw Error(`calling the transaction method for a Transaction is not supported`)}startTransaction(){throw Error(`calling the controlled transaction method for a Transaction is not supported`)}connection(){throw Error(`calling the connection method for a Transaction is not supported`)}destroy(){throw Error(`calling the destroy method for a Transaction is not supported`)}withPlugin(t){return new e({...this.#e,executor:this.#e.executor.withPlugin(t)})}withoutPlugins(){return new e({...this.#e,executor:this.#e.executor.withoutPlugins()})}withSchema(t){return new e({...this.#e,executor:this.#e.executor.withPluginAtFront(new iu(t))})}withTables(){return new e({...this.#e})}$extendTables(){return new e({...this.#e})}$omitTables(){return new e({...this.#e})}$pickTables(){return new e({...this.#e})}};function sp(e){return cs(e)&&cs(e.config)&&cs(e.driver)&&cs(e.executor)&&cs(e.dialect)}var cp=class{#e;constructor(e){this.#e=J(e)}async execute(e,t){return this.#e.executor.provideConnection(async t=>{let n=this.#e.executor.withConnectionProvider(new Qf(t));return await e(new ap({...this.#e,executor:n}))},J({signal:t?.signal}))}},lp=class e{#e;constructor(e){this.#e=J(e)}setAccessMode(t){return new e({...this.#e,accessMode:t})}setIsolationLevel(t){return new e({...this.#e,isolationLevel:t})}async execute(e){let{isolationLevel:t,accessMode:n,...r}=this.#e,i={isolationLevel:t,accessMode:n};return tp(i),this.#e.executor.provideConnection(async t=>{let n={isCommitted:!1,isRolledBack:!1},a=new mp(this.#e.executor.withConnectionProvider(new Qf(t)),n),o=new op({...r,executor:a}),s=!1;try{await this.#e.driver.beginTransaction(t,i),s=!0;let r=await e(o);return await this.#e.driver.commitTransaction(t),n.isCommitted=!0,r}catch(e){throw s&&(await this.#e.driver.rollbackTransaction(t),n.isRolledBack=!0),e}})}},up=class e{#e;constructor(e){this.#e=J(e)}setAccessMode(t){return new e({...this.#e,accessMode:t})}setIsolationLevel(t){return new e({...this.#e,isolationLevel:t})}async execute(){let{isolationLevel:e,accessMode:t,...n}=this.#e,r={isolationLevel:e,accessMode:t};tp(r);let i=await lu(this.#e.executor);try{await this.#e.driver.beginTransaction(i.connection,r)}catch(e){throw i.release(),e}return new dp({...n,connection:i,state:{isCommitted:!1,isRolledBack:!1},executor:this.#e.executor.withConnectionProvider(new Qf(i.connection))})}},dp=class e extends op{#e;#t;constructor(e){e={...e,executor:new mp(e.executor,e.state)};let{connection:t,state:n,...r}=e;super(r),this.#e=J(e);let i=Q();this.#t=t=>e.executor.compileQuery(t,i)}get isCommitted(){return this.#e.state.isCommitted}get isRolledBack(){return this.#e.state.isRolledBack}commit(){return new fp(async()=>{await this.#e.executor.provideConnection(async e=>{await this.#e.driver.commitTransaction(e),this.#e.state.isCommitted=!0,this.#e.connection.release()})})}rollback(){return new fp(async()=>{await this.#e.executor.provideConnection(async e=>{try{await this.#e.driver.rollbackTransaction(e)}finally{this.#e.state.isRolledBack=!0,this.#e.connection.release()}})})}savepoint(t){return new fp(async()=>(await this.#e.executor.provideConnection(async e=>{await this.#e.driver.savepoint?.(e,t,this.#t)}),new e({...this.#e})))}rollbackToSavepoint(t){return new fp(async()=>(await this.#e.executor.provideConnection(async e=>{await this.#e.driver.rollbackToSavepoint?.(e,t,this.#t)}),new e({...this.#e})))}releaseSavepoint(t){return new fp(async()=>(await this.#e.executor.provideConnection(async e=>{await this.#e.driver.releaseSavepoint?.(e,t,this.#t)}),new e({...this.#e})))}withPlugin(t){return new e({...this.#e,executor:this.#e.executor.withPlugin(t)})}withoutPlugins(){return new e({...this.#e,executor:this.#e.executor.withoutPlugins()})}withSchema(t){return new e({...this.#e,executor:this.#e.executor.withPluginAtFront(new iu(t))})}withTables(){return new e({...this.#e})}$extendTables(){return new e({...this.#e})}$omitTables(){return new e({...this.#e})}$pickTables(){return new e({...this.#e})}},fp=class{#e;constructor(e){this.#e=e}async execute(){return await this.#e()}};function pp(e){if(e.isCommitted)throw Error(`Transaction is already committed`);if(e.isRolledBack)throw Error(`Transaction is already rolled back`)}var mp=class e{#e;#t;constructor(t,n){this.#e=t instanceof e?t.#e:t,this.#t=n}get adapter(){return this.#e.adapter}get plugins(){return this.#e.plugins}transformQuery(e,t){return this.#e.transformQuery(e,t)}compileQuery(e,t){return this.#e.compileQuery(e,t)}provideConnection(e,t){return pp(this.#t),this.#e.provideConnection(async t=>(pp(this.#t),await e(t)),t)}executeQuery(e,t){return pp(this.#t),this.#e.withConnectionProvider(this).executeQuery(e,t)}stream(e,t,n){return pp(this.#t),this.#e.withConnectionProvider(this).stream(e,t,n)}withConnectionProvider(t){return new e(this.#e.withConnectionProvider(t),this.#t)}withPlugin(t){return new e(this.#e.withPlugin(t),this.#t)}withPlugins(t){return new e(this.#e.withPlugins(t),this.#t)}withPluginAtFront(t){return new e(this.#e.withPluginAtFront(t),this.#t)}withoutPlugins(){return new e(this.#e.withoutPlugins(),this.#t)}},hp=class e{#e;constructor(e){this.#e=J(e)}get expressionType(){}get isRawBuilder(){return!0}as(e){return new _p(this,e)}$castTo(){return new e({...this.#e})}$notNull(){return new e(this.#e)}withPlugin(t){return new e({...this.#e,plugins:this.#e.plugins===void 0?J([t]):J([...this.#e.plugins,t])})}toOperationNode(){return this.#n(this.#t())}compile(e){return this.#r(this.#t(e))}async execute(e,t){let n=this.#t(e);return n.executeQuery(this.#r(n),t)}#t(e){let t=e===void 0?bu:e.getExecutor();return this.#e.plugins===void 0?t:t.withPlugins(this.#e.plugins)}#n(e){return e.transformQuery(this.#e.rawNode,this.#e.queryId)}#r(e){return e.compileQuery(this.#n(e),this.#e.queryId)}};function gp(e){return new hp(e)}var _p=class{#e;#t;constructor(e,t){this.#e=e,this.#t=t}get expression(){return this.#e}get alias(){return this.#t}get rawBuilder(){return this.#e}toOperationNode(){return xs.create(this.#e.toOperationNode(),Cs(this.#t)?this.#t.toOperationNode():X.create(this.#t))}};const vp=Object.assign((e,...t)=>gp({queryId:Q(),rawNode:Zs.create(e,t?.map(yp)??[])}),{ref(e){return gp({queryId:Q(),rawNode:Zs.createWithChild(mc(e))})},val(e){return gp({queryId:Q(),rawNode:Zs.createWithChild(Tc(e))})},table(e){return gp({queryId:Q(),rawNode:Zs.createWithChild(Ad(e))})},id(...e){let t=Array(e.length+1).fill(`.`);return t[0]=``,t[t.length-1]=``,gp({queryId:Q(),rawNode:Zs.create(t,e.map(X.create))})},lit(e){return gp({queryId:Q(),rawNode:Zs.createWithChild(Cc.createImmediate(e))})},raw(e){return gp({queryId:Q(),rawNode:Zs.createWithSql(e)})},join(e,t=vp`, `){let n=Array(Math.max(2*e.length-1,0)),r=t.toOperationNode();for(let t=0;t<e.length;++t)n[2*t]=yp(e[t]),t!==e.length-1&&(n[2*t+1]=r);return gp({queryId:Q(),rawNode:Zs.createWithChildren(n)})}});function yp(e){return Cs(e)?e.toOperationNode():Tc(e)}var bp=class{nodeStack=[];get parentNode(){return this.nodeStack[this.nodeStack.length-2]}#e=J({AliasNode:this.visitAlias.bind(this),ColumnNode:this.visitColumn.bind(this),IdentifierNode:this.visitIdentifier.bind(this),SchemableIdentifierNode:this.visitSchemableIdentifier.bind(this),RawNode:this.visitRaw.bind(this),ReferenceNode:this.visitReference.bind(this),SelectQueryNode:this.visitSelectQuery.bind(this),SelectionNode:this.visitSelection.bind(this),TableNode:this.visitTable.bind(this),FromNode:this.visitFrom.bind(this),SelectAllNode:this.visitSelectAll.bind(this),AndNode:this.visitAnd.bind(this),OrNode:this.visitOr.bind(this),ValueNode:this.visitValue.bind(this),ValueListNode:this.visitValueList.bind(this),PrimitiveValueListNode:this.visitPrimitiveValueList.bind(this),ParensNode:this.visitParens.bind(this),JoinNode:this.visitJoin.bind(this),OperatorNode:this.visitOperator.bind(this),WhereNode:this.visitWhere.bind(this),InsertQueryNode:this.visitInsertQuery.bind(this),DeleteQueryNode:this.visitDeleteQuery.bind(this),ReturningNode:this.visitReturning.bind(this),CreateTableNode:this.visitCreateTable.bind(this),AddColumnNode:this.visitAddColumn.bind(this),ColumnDefinitionNode:this.visitColumnDefinition.bind(this),DropTableNode:this.visitDropTable.bind(this),DataTypeNode:this.visitDataType.bind(this),OrderByNode:this.visitOrderBy.bind(this),OrderByItemNode:this.visitOrderByItem.bind(this),GroupByNode:this.visitGroupBy.bind(this),GroupByItemNode:this.visitGroupByItem.bind(this),UpdateQueryNode:this.visitUpdateQuery.bind(this),ColumnUpdateNode:this.visitColumnUpdate.bind(this),LimitNode:this.visitLimit.bind(this),OffsetNode:this.visitOffset.bind(this),OnConflictNode:this.visitOnConflict.bind(this),OnDuplicateKeyNode:this.visitOnDuplicateKey.bind(this),CreateIndexNode:this.visitCreateIndex.bind(this),DropIndexNode:this.visitDropIndex.bind(this),ListNode:this.visitList.bind(this),PrimaryKeyConstraintNode:this.visitPrimaryKeyConstraint.bind(this),UniqueConstraintNode:this.visitUniqueConstraint.bind(this),ReferencesNode:this.visitReferences.bind(this),CheckConstraintNode:this.visitCheckConstraint.bind(this),WithNode:this.visitWith.bind(this),CommonTableExpressionNode:this.visitCommonTableExpression.bind(this),CommonTableExpressionNameNode:this.visitCommonTableExpressionName.bind(this),HavingNode:this.visitHaving.bind(this),CreateSchemaNode:this.visitCreateSchema.bind(this),DropSchemaNode:this.visitDropSchema.bind(this),AlterTableNode:this.visitAlterTable.bind(this),DropColumnNode:this.visitDropColumn.bind(this),RenameColumnNode:this.visitRenameColumn.bind(this),AlterColumnNode:this.visitAlterColumn.bind(this),ModifyColumnNode:this.visitModifyColumn.bind(this),AddConstraintNode:this.visitAddConstraint.bind(this),DropConstraintNode:this.visitDropConstraint.bind(this),RenameConstraintNode:this.visitRenameConstraint.bind(this),ForeignKeyConstraintNode:this.visitForeignKeyConstraint.bind(this),CreateViewNode:this.visitCreateView.bind(this),RefreshMaterializedViewNode:this.visitRefreshMaterializedView.bind(this),DropViewNode:this.visitDropView.bind(this),GeneratedNode:this.visitGenerated.bind(this),DefaultValueNode:this.visitDefaultValue.bind(this),OnNode:this.visitOn.bind(this),ValuesNode:this.visitValues.bind(this),SelectModifierNode:this.visitSelectModifier.bind(this),CreateTypeNode:this.visitCreateType.bind(this),DropTypeNode:this.visitDropType.bind(this),ExplainNode:this.visitExplain.bind(this),DefaultInsertValueNode:this.visitDefaultInsertValue.bind(this),AggregateFunctionNode:this.visitAggregateFunction.bind(this),OverNode:this.visitOver.bind(this),PartitionByNode:this.visitPartitionBy.bind(this),PartitionByItemNode:this.visitPartitionByItem.bind(this),SetOperationNode:this.visitSetOperation.bind(this),BinaryOperationNode:this.visitBinaryOperation.bind(this),UnaryOperationNode:this.visitUnaryOperation.bind(this),UsingNode:this.visitUsing.bind(this),FunctionNode:this.visitFunction.bind(this),CaseNode:this.visitCase.bind(this),WhenNode:this.visitWhen.bind(this),JSONReferenceNode:this.visitJSONReference.bind(this),JSONPathNode:this.visitJSONPath.bind(this),JSONPathLegNode:this.visitJSONPathLeg.bind(this),JSONOperatorChainNode:this.visitJSONOperatorChain.bind(this),TupleNode:this.visitTuple.bind(this),MergeQueryNode:this.visitMergeQuery.bind(this),MatchedNode:this.visitMatched.bind(this),AddIndexNode:this.visitAddIndex.bind(this),CastNode:this.visitCast.bind(this),FetchNode:this.visitFetch.bind(this),TopNode:this.visitTop.bind(this),OutputNode:this.visitOutput.bind(this),OrActionNode:this.visitOrAction.bind(this),CollateNode:this.visitCollate.bind(this),AlterTypeNode:this.visitAlterType.bind(this),AddValueNode:this.visitAddValue.bind(this),RenameValueNode:this.visitRenameValue.bind(this)});visitNode=e=>{this.nodeStack.push(e),this.#e[e.kind](e),this.nodeStack.pop()}};const xp=/'/g,Sp=/['"]/g;var Cp=class extends bp{#e=``;#t=[];get numParameters(){return this.#t.length}compileQuery(e,t){return this.#e=``,this.#t=[],this.nodeStack.splice(0,this.nodeStack.length),this.visitNode(e),J({query:e,queryId:t,sql:this.getSql(),parameters:[...this.#t]})}getSql(){return this.#e}visitSelectQuery(e){let t=this.parentNode!==void 0&&!kc.is(this.parentNode)&&!Gc.is(this.parentNode)&&!gs.is(this.parentNode)&&!Cf.is(this.parentNode)&&!Lu.is(this.parentNode);this.parentNode===void 0&&e.explain&&(this.visitNode(e.explain),this.append(` `)),t&&this.append(`(`),e.with&&(this.visitNode(e.with),this.append(` `)),this.append(`select`),e.distinctOn&&(this.append(` `),this.compileDistinctOn(e.distinctOn)),e.frontModifiers?.length&&(this.append(` `),this.compileList(e.frontModifiers,` `)),e.top&&(this.append(` `),this.visitNode(e.top)),e.selections&&(this.append(` `),this.compileList(e.selections)),e.from&&(this.append(` `),this.visitNode(e.from)),e.joins&&(this.append(` `),this.compileList(e.joins,` `)),e.where&&(this.append(` `),this.visitNode(e.where)),e.groupBy&&(this.append(` `),this.visitNode(e.groupBy)),e.having&&(this.append(` `),this.visitNode(e.having)),e.setOperations&&(this.append(` `),this.compileList(e.setOperations,` `)),e.orderBy&&(this.append(` `),this.visitNode(e.orderBy)),e.limit&&(this.append(` `),this.visitNode(e.limit)),e.offset&&(this.append(` `),this.visitNode(e.offset)),e.fetch&&(this.append(` `),this.visitNode(e.fetch)),e.endModifiers?.length&&(this.append(` `),this.compileList(this.sortSelectModifiers(e.endModifiers),` `)),t&&this.append(`)`)}visitFrom(e){this.append(`from `),this.compileList(e.froms)}visitSelection(e){this.visitNode(e.selection)}visitColumn(e){this.visitNode(e.column)}compileDistinctOn(e){this.append(`distinct on (`),this.compileList(e),this.append(`)`)}compileList(e,t=`, `){let n=e.length-1;for(let r=0;r<=n;r++)this.visitNode(e[r]),r<n&&this.append(t)}visitWhere(e){this.append(`where `),this.visitNode(e.where)}visitHaving(e){this.append(`having `),this.visitNode(e.having)}visitInsertQuery(e){let t=this.parentNode!==void 0&&!kc.is(this.parentNode)&&!Zs.is(this.parentNode)&&!$c.is(this.parentNode);this.parentNode===void 0&&e.explain&&(this.visitNode(e.explain),this.append(` `)),t&&this.append(`(`),e.with&&(this.visitNode(e.with),this.append(` `)),this.append(e.replace?`replace`:`insert`),e.orAction&&(this.append(` `),this.visitNode(e.orAction)),e.top&&(this.append(` `),this.visitNode(e.top)),e.into&&(this.append(` into `),this.visitNode(e.into)),e.columns&&(this.append(` (`),this.compileList(e.columns),this.append(`)`)),e.output&&(this.append(` `),this.visitNode(e.output)),e.values&&(this.append(` `),this.visitNode(e.values)),e.defaultValues&&(this.append(` `),this.append(`default values`)),e.onConflict&&(this.append(` `),this.visitNode(e.onConflict)),e.onDuplicateKey&&(this.append(` `),this.visitNode(e.onDuplicateKey)),e.returning&&(this.append(` `),this.visitNode(e.returning)),t&&this.append(`)`),e.endModifiers?.length&&(this.append(` `),this.compileList(e.endModifiers,` `))}visitValues(e){this.append(`values `),this.compileList(e.values)}visitDeleteQuery(e){let t=this.parentNode!==void 0&&!kc.is(this.parentNode)&&!Zs.is(this.parentNode);this.parentNode===void 0&&e.explain&&(this.visitNode(e.explain),this.append(` `)),t&&this.append(`(`),e.with&&(this.visitNode(e.with),this.append(` `)),this.append(`delete `),e.top&&(this.visitNode(e.top),this.append(` `)),this.visitNode(e.from),e.output&&(this.append(` `),this.visitNode(e.output)),e.using&&(this.append(` `),this.visitNode(e.using)),e.joins&&(this.append(` `),this.compileList(e.joins,` `)),e.where&&(this.append(` `),this.visitNode(e.where)),e.returning&&(this.append(` `),this.visitNode(e.returning)),e.orderBy&&(this.append(` `),this.visitNode(e.orderBy)),e.limit&&(this.append(` `),this.visitNode(e.limit)),t&&this.append(`)`),e.endModifiers?.length&&(this.append(` `),this.compileList(e.endModifiers,` `))}visitReturning(e){this.append(`returning `),this.compileList(e.selections)}visitAlias(e){this.visitNode(e.node),this.append(` as `),this.visitNode(e.alias)}visitReference(e){e.table&&(this.visitNode(e.table),this.append(`.`)),this.visitNode(e.column)}visitSelectAll(e){this.append(`*`)}visitIdentifier(e){this.append(this.getLeftIdentifierWrapper()),this.compileUnwrappedIdentifier(e),this.append(this.getRightIdentifierWrapper())}compileUnwrappedIdentifier(e){if(!ts(e.name))throw Error(`a non-string identifier was passed to compileUnwrappedIdentifier.`);this.append(this.sanitizeIdentifier(e.name))}visitAnd(e){this.visitNode(e.left),this.append(` and `),this.visitNode(e.right)}visitOr(e){this.visitNode(e.left),this.append(` or `),this.visitNode(e.right)}visitValue(e){e.immediate?this.appendImmediateValue(e.value):this.appendValue(e.value)}visitValueList(e){this.append(`(`),this.compileList(e.values),this.append(`)`)}visitTuple(e){this.append(`(`),this.compileList(e.values),this.append(`)`)}visitPrimitiveValueList(e){this.append(`(`);let{values:t}=e;for(let e=0;e<t.length;++e)this.appendValue(t[e]),e!==t.length-1&&this.append(`, `);this.append(`)`)}visitParens(e){this.append(`(`),this.visitNode(e.node),this.append(`)`)}visitJoin(e){this.append(Ep[e.joinType]),this.append(` `),this.visitNode(e.table),e.on&&(this.append(` `),this.visitNode(e.on))}visitOn(e){this.append(`on `),this.visitNode(e.on)}visitRaw(e){let{sqlFragments:t,parameters:n}=e;for(let e=0;e<t.length;++e)this.append(t[e]),n.length>e&&this.visitNode(n[e])}visitOperator(e){this.append(e.operator)}visitTable(e){this.visitNode(e.table)}visitSchemableIdentifier(e){e.schema&&(this.visitNode(e.schema),this.append(`.`)),this.visitNode(e.identifier)}visitCreateTable(e){this.append(`create `),e.frontModifiers?.length&&(this.compileList(e.frontModifiers,` `),this.append(` `)),e.temporary&&this.append(`temporary `),this.append(`table `),e.ifNotExists&&this.append(`if not exists `),this.visitNode(e.table),e.selectQuery||(this.append(` (`),this.compileList([...e.columns,...e.constraints??[],...e.indexes??[]]),this.append(`)`)),e.onCommit&&(this.append(` on commit `),this.append(e.onCommit)),e.endModifiers?.length&&(this.append(` `),this.compileList(e.endModifiers,` `)),e.selectQuery&&(this.append(` as `),this.visitNode(e.selectQuery))}visitColumnDefinition(e){e.ifNotExists&&this.append(`if not exists `),this.visitNode(e.column),this.append(` `),this.visitNode(e.dataType),e.unsigned&&this.append(` unsigned`),e.frontModifiers&&e.frontModifiers.length>0&&(this.append(` `),this.compileList(e.frontModifiers,` `)),e.generated&&(this.append(` `),this.visitNode(e.generated)),e.identity&&this.append(` identity`),e.defaultTo&&(this.append(` `),this.visitNode(e.defaultTo)),e.notNull&&this.append(` not null`),e.unique&&this.append(` unique`),e.nullsNotDistinct&&this.append(` nulls not distinct`),e.primaryKey&&this.append(` primary key`),e.autoIncrement&&(this.append(` `),this.append(this.getAutoIncrement())),e.references&&(this.append(` `),this.visitNode(e.references)),e.check&&(this.append(` `),this.visitNode(e.check)),e.endModifiers&&e.endModifiers.length>0&&(this.append(` `),this.compileList(e.endModifiers,` `))}getAutoIncrement(){return`auto_increment`}visitReferences(e){this.append(`references `),this.visitNode(e.table),this.append(` (`),this.compileList(e.columns),this.append(`)`),e.onDelete&&(this.append(` on delete `),this.append(e.onDelete)),e.onUpdate&&(this.append(` on update `),this.append(e.onUpdate))}visitDropTable(e){this.append(`drop `),e.temporary&&this.append(`temporary `),this.append(`table `),e.ifExists&&this.append(`if exists `),this.visitNode(e.table),e.cascade&&this.append(` cascade`)}visitDataType(e){this.append(e.dataType)}visitOrderBy(e){this.append(`order by `),this.compileList(e.items)}visitOrderByItem(e){this.visitNode(e.orderBy),e.collation&&(this.append(` `),this.visitNode(e.collation)),e.direction&&(this.append(` `),this.visitNode(e.direction)),e.nulls&&(this.append(` nulls `),this.append(e.nulls))}visitGroupBy(e){this.append(`group by `),this.compileList(e.items)}visitGroupByItem(e){this.visitNode(e.groupBy)}visitUpdateQuery(e){let t=this.parentNode!==void 0&&!kc.is(this.parentNode)&&!Zs.is(this.parentNode)&&!$c.is(this.parentNode);if(this.parentNode===void 0&&e.explain&&(this.visitNode(e.explain),this.append(` `)),t&&this.append(`(`),e.with&&(this.visitNode(e.with),this.append(` `)),this.append(`update `),e.top&&(this.visitNode(e.top),this.append(` `)),e.table&&(this.visitNode(e.table),this.append(` `)),this.append(`set `),e.updates&&this.compileList(e.updates),e.output&&(this.append(` `),this.visitNode(e.output)),e.from&&(this.append(` `),this.visitNode(e.from)),e.joins){if(!e.from)throw Error(`Joins in an update query are only supported as a part of a PostgreSQL 'update set from join' query. If you want to create a MySQL 'update join set' query, see https://kysely.dev/docs/examples/update/my-sql-joins`);this.append(` `),this.compileList(e.joins,` `)}e.where&&(this.append(` `),this.visitNode(e.where)),e.returning&&(this.append(` `),this.visitNode(e.returning)),e.orderBy&&(this.append(` `),this.visitNode(e.orderBy)),e.limit&&(this.append(` `),this.visitNode(e.limit)),t&&this.append(`)`),e.endModifiers?.length&&(this.append(` `),this.compileList(e.endModifiers,` `))}visitColumnUpdate(e){this.visitNode(e.column),this.append(` = `),this.visitNode(e.value)}visitLimit(e){this.append(`limit `),this.visitNode(e.limit)}visitOffset(e){this.append(`offset `),this.visitNode(e.offset)}visitOnConflict(e){this.append(`on conflict`),e.columns?(this.append(` (`),this.compileList(e.columns),this.append(`)`)):e.constraint?(this.append(` on constraint `),this.visitNode(e.constraint)):e.indexExpression&&(this.append(` (`),this.visitNode(e.indexExpression),this.append(`)`)),e.indexWhere&&(this.append(` `),this.visitNode(e.indexWhere)),e.doNothing===!0?this.append(` do nothing`):e.updates&&(this.append(` do update set `),this.compileList(e.updates),e.updateWhere&&(this.append(` `),this.visitNode(e.updateWhere)))}visitOnDuplicateKey(e){this.append(`on duplicate key update `),this.compileList(e.updates)}visitCreateIndex(e){this.append(`create `),e.unique&&this.append(`unique `),this.append(`index `),e.ifNotExists&&this.append(`if not exists `),this.visitNode(e.name),e.table&&(this.append(` on `),this.visitNode(e.table)),e.using&&(this.append(` using `),this.visitNode(e.using)),e.columns&&(this.append(` (`),this.compileList(e.columns),this.append(`)`)),e.nullsNotDistinct&&this.append(` nulls not distinct`),e.where&&(this.append(` `),this.visitNode(e.where))}visitDropIndex(e){this.append(`drop index `),e.ifExists&&this.append(`if exists `),this.visitNode(e.name),e.table&&(this.append(` on `),this.visitNode(e.table)),e.cascade&&this.append(` cascade`)}visitCreateSchema(e){this.append(`create schema `),e.ifNotExists&&this.append(`if not exists `),this.visitNode(e.schema)}visitDropSchema(e){this.append(`drop schema `),e.ifExists&&this.append(`if exists `),this.visitNode(e.schema),e.cascade&&this.append(` cascade`)}visitPrimaryKeyConstraint(e){e.name&&(this.append(`constraint `),this.visitNode(e.name),this.append(` `)),this.append(`primary key (`),this.compileList(e.columns),this.append(`)`),this.buildDeferrable(e)}buildDeferrable(e){e.deferrable!==void 0&&(e.deferrable?this.append(` deferrable`):this.append(` not deferrable`)),e.initiallyDeferred!==void 0&&(e.initiallyDeferred?this.append(` initially deferred`):this.append(` initially immediate`))}visitUniqueConstraint(e){e.name&&(this.append(`constraint `),this.visitNode(e.name),this.append(` `)),this.append(`unique`),e.nullsNotDistinct&&this.append(` nulls not distinct`),this.append(` (`),this.compileList(e.columns),this.append(`)`),this.buildDeferrable(e)}visitCheckConstraint(e){e.name&&(this.append(`constraint `),this.visitNode(e.name),this.append(` `)),this.append(`check (`),this.visitNode(e.expression),this.append(`)`)}visitForeignKeyConstraint(e){e.name&&(this.append(`constraint `),this.visitNode(e.name),this.append(` `)),this.append(`foreign key (`),this.compileList(e.columns),this.append(`) `),this.visitNode(e.references),e.onDelete&&(this.append(` on delete `),this.append(e.onDelete)),e.onUpdate&&(this.append(` on update `),this.append(e.onUpdate)),this.buildDeferrable(e)}visitList(e){this.compileList(e.items)}visitWith(e){this.append(`with `),e.recursive&&this.append(`recursive `),this.compileList(e.expressions)}visitCommonTableExpression(e){this.visitNode(e.name),this.append(` as `),rs(e.materialized)&&(e.materialized||this.append(`not `),this.append(`materialized `)),this.visitNode(e.expression)}visitCommonTableExpressionName(e){this.visitNode(e.table),e.columns&&(this.append(`(`),this.compileList(e.columns),this.append(`)`))}visitAlterTable(e){this.append(`alter table `),this.visitNode(e.table),this.append(` `),e.renameTo&&(this.append(`rename to `),this.visitNode(e.renameTo)),e.setSchema&&(this.append(`set schema `),this.visitNode(e.setSchema)),e.addConstraint&&this.visitNode(e.addConstraint),e.dropConstraint&&this.visitNode(e.dropConstraint),e.renameConstraint&&this.visitNode(e.renameConstraint),e.columnAlterations&&this.compileColumnAlterations(e.columnAlterations),e.addIndex&&this.visitNode(e.addIndex),e.dropIndex&&this.visitNode(e.dropIndex)}visitAddColumn(e){this.append(`add column `),this.visitNode(e.column)}visitRenameColumn(e){this.append(`rename column `),this.visitNode(e.column),this.append(` to `),this.visitNode(e.renameTo)}visitDropColumn(e){this.append(`drop column `),e.ifExists&&this.append(`if exists `),this.visitNode(e.column)}visitAlterColumn(e){this.append(`alter column `),this.visitNode(e.column),this.append(` `),e.dataType&&(this.announcesNewColumnDataType()&&this.append(`type `),this.visitNode(e.dataType),e.dataTypeExpression&&(this.append(`using `),this.visitNode(e.dataTypeExpression))),e.setDefault&&(this.append(`set default `),this.visitNode(e.setDefault)),e.dropDefault&&this.append(`drop default`),e.setNotNull&&this.append(`set not null`),e.dropNotNull&&this.append(`drop not null`)}visitModifyColumn(e){this.append(`modify column `),this.visitNode(e.column)}visitAddConstraint(e){this.append(`add `),this.visitNode(e.constraint)}visitDropConstraint(e){this.append(`drop constraint `),e.ifExists&&this.append(`if exists `),this.visitNode(e.constraintName),e.modifier===`cascade`?this.append(` cascade`):e.modifier===`restrict`&&this.append(` restrict`)}visitRenameConstraint(e){this.append(`rename constraint `),this.visitNode(e.oldName),this.append(` to `),this.visitNode(e.newName)}visitSetOperation(e){this.append(e.operator),this.append(` `),e.all&&this.append(`all `),this.visitNode(e.expression)}visitCreateView(e){this.append(`create `),e.orReplace&&this.append(`or replace `),e.materialized&&this.append(`materialized `),e.temporary&&this.append(`temporary `),this.append(`view `),e.ifNotExists&&this.append(`if not exists `),this.visitNode(e.name),this.append(` `),e.columns&&(this.append(`(`),this.compileList(e.columns),this.append(`) `)),e.as&&(this.append(`as `),this.visitNode(e.as))}visitRefreshMaterializedView(e){this.append(`refresh materialized view `),e.concurrently&&this.append(`concurrently `),this.visitNode(e.name),e.withNoData?this.append(` with no data`):this.append(` with data`)}visitDropView(e){this.append(`drop `),e.materialized&&this.append(`materialized `),this.append(`view `),e.ifExists&&this.append(`if exists `),this.visitNode(e.name),e.cascade&&this.append(` cascade`)}visitGenerated(e){this.append(`generated `),e.always&&this.append(`always `),e.byDefault&&this.append(`by default `),this.append(`as `),e.identity&&this.append(`identity`),e.expression&&(this.append(`(`),this.visitNode(e.expression),this.append(`)`)),e.stored&&this.append(` stored`)}visitDefaultValue(e){this.append(`default `),this.visitNode(e.defaultValue)}visitSelectModifier(e){e.rawModifier?this.visitNode(e.rawModifier):this.append(wp[e.modifier]),e.of&&(this.append(` of `),this.compileList(e.of,`, `))}visitCreateType(e){this.append(`create type `),this.visitNode(e.name),e.enum&&(this.append(` as enum `),this.visitNode(e.enum))}visitDropType(e){this.append(`drop type `),e.ifExists&&this.append(`if exists `),this.visitNode(e.name),e.additionalNames?.length&&(this.append(`, `),this.compileList(e.additionalNames)),e.cascade&&this.append(` cascade`)}visitAlterType(e){this.append(`alter type `),this.visitNode(e.name),this.append(` `),e.addValue?this.visitNode(e.addValue):e.renameTo?(this.append(`rename to `),this.visitNode(e.renameTo)):e.renameValue?this.visitNode(e.renameValue):e.setSchema&&(this.append(`set schema `),this.visitNode(e.setSchema))}visitAddValue(e){this.append(`add value `),e.ifNotExists&&this.append(`if not exists `),this.visitNode(e.value),e.neighborValue&&(this.append(e.isBefore?` before `:` after `),this.visitNode(e.neighborValue))}visitRenameValue(e){this.append(`rename value `),this.visitNode(e.oldValue),this.append(` to `),this.visitNode(e.newValue)}visitExplain(e){this.append(`explain`),(e.options||e.format)&&(this.append(` `),this.append(this.getLeftExplainOptionsWrapper()),e.options&&(this.visitNode(e.options),e.format&&this.append(this.getExplainOptionsDelimiter())),e.format&&(this.append(`format`),this.append(this.getExplainOptionAssignment()),this.append(e.format)),this.append(this.getRightExplainOptionsWrapper()))}visitDefaultInsertValue(e){this.append(`default`)}visitAggregateFunction(e){this.append(e.func),this.append(`(`),e.distinct&&this.append(`distinct `),this.compileList(e.aggregated),e.orderBy&&(this.append(` `),this.visitNode(e.orderBy)),this.append(`)`),e.withinGroup&&(this.append(` within group (`),this.visitNode(e.withinGroup),this.append(`)`)),e.filter&&(this.append(` filter(`),this.visitNode(e.filter),this.append(`)`)),e.over&&(this.append(` `),this.visitNode(e.over))}visitOver(e){this.append(`over(`),e.partitionBy&&(this.visitNode(e.partitionBy),e.orderBy&&this.append(` `)),e.orderBy&&this.visitNode(e.orderBy),this.append(`)`)}visitPartitionBy(e){this.append(`partition by `),this.compileList(e.items)}visitPartitionByItem(e){this.visitNode(e.partitionBy)}visitBinaryOperation(e){this.visitNode(e.leftOperand),this.append(` `),this.visitNode(e.operator),this.append(` `),this.visitNode(e.rightOperand)}visitUnaryOperation(e){this.visitNode(e.operator),this.isMinusOperator(e.operator)||this.append(` `),this.visitNode(e.operand)}isMinusOperator(e){return Vs.is(e)&&e.operator===`-`}visitUsing(e){this.append(`using `),this.compileList(e.tables)}visitFunction(e){this.append(e.func),this.append(`(`),this.compileList(e.arguments),this.append(`)`)}visitCase(e){this.append(`case`),e.value&&(this.append(` `),this.visitNode(e.value)),e.when&&(this.append(` `),this.compileList(e.when,` `)),e.else&&(this.append(` else `),this.visitNode(e.else)),this.append(` end`),e.isStatement&&this.append(` case`)}visitWhen(e){this.append(`when `),this.visitNode(e.condition),e.result&&(this.append(` then `),this.visitNode(e.result))}visitJSONReference(e){this.visitNode(e.reference),this.visitNode(e.traversal)}visitJSONPath(e){e.inOperator&&this.visitNode(e.inOperator),this.append(`'$`);for(let t of e.pathLegs)this.visitNode(t);this.append(`'`)}visitJSONPathLeg(e){let t=e.type===`ArrayLocation`,n=String(e.value);t?(this.append(`[`),this.append(this.sanitizeStringLiteral(n)),this.append(`]`)):(this.append(`."`),this.append(this.sanitizeJSONPathMemberValue(n)),this.append(`"`))}visitJSONOperatorChain(e){for(let t=0,n=e.values.length;t<n;t++)t===n-1?this.visitNode(e.operator):this.append(`->`),this.visitNode(e.values[t])}visitMergeQuery(e){e.with&&(this.visitNode(e.with),this.append(` `)),this.append(`merge `),e.top&&(this.visitNode(e.top),this.append(` `)),this.append(`into `),this.visitNode(e.into),e.using&&(this.append(` `),this.visitNode(e.using)),e.whens&&(this.append(` `),this.compileList(e.whens,` `)),e.returning&&(this.append(` `),this.visitNode(e.returning)),e.output&&(this.append(` `),this.visitNode(e.output)),e.endModifiers?.length&&(this.append(` `),this.compileList(e.endModifiers,` `))}visitMatched(e){e.not&&this.append(`not `),this.append(`matched`),e.bySource&&this.append(` by source`)}visitAddIndex(e){(!this.parentNode||!gs.is(this.parentNode))&&this.append(`add `),e.unique&&this.append(`unique `),this.append(`index `),this.visitNode(e.name),e.columns&&(this.append(` (`),this.compileList(e.columns),this.append(`)`)),e.using&&(this.append(` using `),this.visitNode(e.using))}visitCast(e){this.append(`cast(`),this.visitNode(e.expression),this.append(` as `),this.visitNode(e.dataType),this.append(`)`)}visitFetch(e){this.append(`fetch next `),this.visitNode(e.rowCount),this.append(` rows ${e.modifier}`)}visitOutput(e){this.append(`output `),this.compileList(e.selections)}visitTop(e){this.append(`top(${e.expression})`),e.modifiers&&this.append(` ${e.modifiers}`)}visitOrAction(e){this.append(e.action)}visitCollate(e){this.append(`collate `),this.visitNode(e.collation)}append(e){this.#e+=e}appendValue(e){this.addParameter(e),this.append(this.getCurrentParameterPlaceholder())}getLeftIdentifierWrapper(){return`"`}getRightIdentifierWrapper(){return`"`}getCurrentParameterPlaceholder(){return`$`+this.numParameters}getLeftExplainOptionsWrapper(){return`(`}getExplainOptionAssignment(){return` `}getExplainOptionsDelimiter(){return`, `}getRightExplainOptionsWrapper(){return`)`}sanitizeIdentifier(e){let t=this.getLeftIdentifierWrapper(),n=this.getRightIdentifierWrapper(),r=``;for(let i of e)r+=i,i===t?r+=t:i===n&&(r+=n);return r}sanitizeStringLiteral(e){return e.replace(xp,`''`)}sanitizeJSONPathMemberValue(e){return e.replace(Sp,e=>e===`'`?`''`:`\\"`)}addParameter(e){this.#t.push(e)}appendImmediateValue(e){if(ts(e))this.appendStringLiteral(e);else if(ns(e)||rs(e)||os(e))this.append(e.toString());else if(is(e))this.append(`null`);else if(as(e))this.appendImmediateValue(e.toISOString());else throw Error(`invalid immediate value ${e}`)}appendStringLiteral(e){this.append(`'`),this.append(this.sanitizeStringLiteral(e)),this.append(`'`)}sortSelectModifiers(e){return J(e.toSorted((e,t)=>e.modifier&&t.modifier?Tp[e.modifier]-Tp[t.modifier]:1))}compileColumnAlterations(e){this.compileList(e)}announcesNewColumnDataType(){return!0}};const wp=J({ForKeyShare:`for key share`,ForNoKeyUpdate:`for no key update`,ForUpdate:`for update`,ForShare:`for share`,NoWait:`nowait`,SkipLocked:`skip locked`,Distinct:`distinct`}),Tp=J({ForKeyShare:1,ForNoKeyUpdate:1,ForUpdate:1,ForShare:1,NoWait:2,SkipLocked:2,Distinct:0}),Ep=J({InnerJoin:`inner join`,LeftJoin:`left join`,RightJoin:`right join`,FullJoin:`full join`,CrossJoin:`cross join`,LateralInnerJoin:`inner join lateral`,LateralLeftJoin:`left join lateral`,LateralCrossJoin:`cross join lateral`,OuterApply:`outer apply`,CrossApply:`cross apply`,Using:`using`});J({raw(e,t=[]){return J({sql:e,query:Zs.createWithSql(e),parameters:J(t),queryId:Q()})}});var Dp=class{async init(){}async acquireConnection(){return new Op}async beginTransaction(){}async commitTransaction(){}async rollbackTransaction(){}async releaseConnection(){}async destroy(){}async releaseSavepoint(){}async rollbackToSavepoint(){}async savepoint(){}},Op=class{async executeQuery(){return{rows:[]}}async*streamQuery(){}},kp=class{get supportsCreateIfNotExists(){return!0}get supportsMultipleConnections(){return!0}get supportsTransactionalDdl(){return!1}get supportsReturning(){return!1}get supportsOutput(){return!1}};const Ap=/"/g,jp=/[\\'"]/g;var Mp=class extends Cp{visitOrAction(e){this.append(`or `),this.append(e.action)}getCurrentParameterPlaceholder(){return`?`}getLeftExplainOptionsWrapper(){return``}getRightExplainOptionsWrapper(){return``}getLeftIdentifierWrapper(){return`"`}getRightIdentifierWrapper(){return`"`}getAutoIncrement(){return`autoincrement`}sanitizeIdentifier(e){return e.replace(Ap,`""`)}sanitizeJSONPathMemberValue(e){return e.replace(jp,e=>e===`\\`?`\\\\`:e===`'`?`''`:`\\"`)}visitDefaultInsertValue(e){this.append(`null`)}};J({__noMigrations__:!0});var Np=class extends kp{get supportsMultipleConnections(){return!1}get supportsTransactionalDdl(){return!1}get supportsReturning(){return!0}async acquireMigrationLock(e,t){}async releaseMigrationLock(e,t){}};const Pp=/*#__PURE__*/ jn(`Counter`,/*#__PURE__*/ $n(65535)(Jn)),Fp=`0000000000000000`,Ip=/*#__PURE__*/ Jn.orThrow(8),Lp=e=>Dr(e),Rp=e=>Er(e),zp=/*#__PURE__*/ k({millis:w,counter:w,nodeId:C}),Bp=(e,t)=>Oo(e.millis,t.millis)||Oo(e.counter,t.counter)||Do(e.nodeId,t.nodeId),Vp=({millis:e=0,counter:t=0,nodeId:n=Fp}={})=>({millis:e,counter:t,nodeId:n}),Hp=e=>{let t=Er(e.randomBytes.create(8));return Vp({nodeId:t})},Up=e=>(t,n)=>{let r=Math.max(n,t.millis),i=r===t.millis?ga(t.counter):0;i>65535&&(r=Ai.orThrow(ga(r)),i=0);let a={millis:r,counter:i,nodeId:t.nodeId};return Gp(e)(r,n)?B({type:`TimestampDriftError`,timestamp:a,cause:`local`,now:n}):z(a)},Wp=e=>(t,n,r)=>{if(Gp(e)(n.millis,r))return B({type:`TimestampDriftError`,timestamp:n,cause:`remote`,now:r});let i=Bp(t,n)>=0?t:n;return Up(e)({...i,nodeId:t.nodeId},r)},Gp=e=>(t,n)=>t-n>e.timestampConfig.maxDrift,Kp=/*#__PURE__*/ jn(`TimestampBytes`,/*#__PURE__*/ Nn(16)(Sn),e=>e[0]===255&&e[1]===255&&e[2]===255&&e[3]===255&&e[4]===255&&e[5]===255?B({type:`TimestampBytes`,value:e}):z(),e=>`The millis part of ${Er(e.value)} is 2^48 - 1, which Millis reserves for infinity.`),qp=/*#__PURE__*/ Jn.orThrow(16);let Jp=Fp,Yp=/*#__PURE__*/ new globalThis.Uint8Array(Ip);const Xp=e=>{let{millis:t,counter:n,nodeId:r}=e,i=new globalThis.Uint8Array(16),a=Math.floor(t/2**32);return i[0]=a>>8&255,i[1]=a&255,i[2]=t>>>24&255,i[3]=t>>>16&255,i[4]=t>>>8&255,i[5]=t&255,i[6]=n>>8&255,i[7]=n&255,r!==Jp&&(Yp=Lp(r),Jp=r),i.set(Yp,8),i},Zp=e=>{let t=(e[0]<<8|e[1])*2**32+((e[2]<<24|e[3]<<16|e[4]<<8|e[5])>>>0),n=e[6]<<8|e[7],r=0;for(;r<Ip&&e[8+r]===Yp[r];)r++;return r<Ip&&(Yp=new globalThis.Uint8Array(e.subarray(8,16)),Jp=Rp(Yp)),{millis:t,counter:n,nodeId:Jp}},Qp=ko,$p=e=>e.startsWith(`_`),em={Schema:0,TimestampDrift:1},tm={LocalMutation:0,ReceivedMessage:1},nm=/*#__PURE__*/ new Set(/*#__PURE__*/ Object.keys((/* @__PURE__ */ lr({createdAt:Mn,updatedAt:/*#__PURE__*/ An(Mn),isDeleted:/*#__PURE__*/ An(Ro),ownerId:Xo})).props)),rm=[...nm,`id`],im=e=>(t,n)=>{let r=[];n??=am(e)();for(let[e,i]of Object.entries(t.tables)){M(i);let t=ee(n.tables,e);if(!t)r.push(sm(e,i));else for(let n of i.difference(t))r.push(q`
            alter table ${q.identifier(e)}
            add column ${q.identifier(n)} any;
          `)}n.indexes.filter(e=>!t.indexes.some(t=>Io(t,e))).forEach(e=>{r.push(q`drop index ${q.identifier(e.name)};`)}),t.indexes.filter(e=>!n.indexes.some(t=>Io(e,t))).forEach(e=>{r.push({sql:`${e.sql};`,parameters:[]})});for(let t of r)e.sqlite.exec(t)},am=e=>()=>Lo(e)({excludeIndexNamePrefix:`evolu_`}),om=/*#__PURE__*/ new ap({dialect:{createAdapter:()=>new Np,createDriver:()=>new Dp,createIntrospector(){throw Error(`Not implemeneted`)},createQueryCompiler:()=>new Mp}});om.schema.createIndex.bind(om.schema);const sm=(e,t)=>q`
  create table ${q.identifier(e)} (
    "id" text,
    ${q.raw([...nm,...t].map(e=>`${q.identifier(e).sql} any`).join(`, `))},
    primary key ("ownerId", "id")
  )
  without rowid, strict;
`,cm=/*#__PURE__*/ Jn.orThrow(12),lm=/*#__PURE__*/ new Uint8Array(cm),um=/*#__PURE__*/ Symbol(`evolu.local-first.Storage.InfiniteUpperBound`),dm={Fingerprint:1,Skip:0,Timestamps:2},fm=/*#__PURE__*/ lr({table:gn,id:Bn,values:/* @__PURE__ */ jn(`ValidDbChangeValues`,/* @__PURE__ */ rr(gn,Mo),e=>{let t=rm.filter(t=>t in e);return t.length>0?B({type:`ValidDbChangeValues`,value:e,invalidColumns:t}):z()},e=>`DbChange values contain reserved system columns: ${e.invalidColumns.join(`, `)}.`),isInsert:yn,isDelete:/*#__PURE__*/ An(yn)}),pm=e=>({insertTimestamp:(t,n)=>{let r=_m(e),{rows:i}=e.sqlite.prepared`
      select evolu_skiplist_insert(
        ${t},
        ${n},
        ${r}
      ) as inserted;
    `;return i[0].inserted===1},getExistingTimestamps:(t,n)=>{let r=Ar(n);return e.sqlite.prepared`
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
      from split_timestamps s
      cross join evolu_timestamp t
      where t.ownerId = ${t} and s.timestampBytes = t.t;
    `.rows.map(e=>e.timestampBytes)},getSize:t=>{let{rows:n}=e.sqlite.prepared`
      select evolu_skiplist_size(${t}) as size;
    `;return n[0].size},fingerprint:(t,n,r)=>(mm(n,r),bm(e)(t,n,r)),fingerprintRanges:xm(e),findLowerBound:(t,n,r,i)=>{if(mm(n,r),r===0||n===r||i===um)return r;let{rows:a}=e.sqlite.prepared`
      select evolu_skiplist_lower_bound(
        ${t},
        ${i}
      ) as lowerBound;
    `;return a[0].lowerBound??r},iterate:(t,n,r,i)=>{mm(n,r);let a=r-n;if(a===0)return;let o=Sm(e)(t,n);if(!i(o,n)||a===1)return;let s=n;e.sqlite.iterate(q`
        select t
        from evolu_timestamp
        where ownerId = ${t} and t > ${o}
        order by t
        limit ${a-1};
      `,e=>(s++,i(e.t,s)))},deleteOwner:t=>{e.sqlite.exec(q`
      delete from evolu_timestamp where ownerId = ${t};
    `),e.sqlite.exec(q`
      delete from evolu_usage where ownerId = ${t};
    `)}}),mm=(e,t)=>{A(e<=t,`invalid begin or end`)},hm=e=>{for(let t of[q`
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
    `,q`
      create index evolu_timestamp_index
      on evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c");
    `,q`
      create table evolu_usage (
        "ownerId" blob primary key,
        "storedBytes" integer not null,
        "firstTimestamp" blob,
        "lastTimestamp" blob
      )
      strict;
    `])e.sqlite.exec(t)},gm=(e,t,n)=>Qp(e,n)===1?[t,e]:Qp(e,t)===-1?[e,n]:[t,n],_m=e=>{let t=1;for(;e.random.next()<=vm&&t<ym;)t+=1;return t},vm=.25,ym=10,bm=e=>(t,n,r)=>r-n===0?lm:n===0?xm(e)(t,[r])[0].fingerprint:xm(e)(t,[n,r])[1].fingerprint,xm=e=>(t,n,r=um)=>{let i=new Uint8Array(n.length*8),a=new DataView(i.buffer);for(let[e,t]of n.entries())a.setBigUint64(e*8,BigInt(t));let{rows:o}=e.sqlite.prepared`
      select evolu_skiplist_fingerprints(
        ${t},
        ${i}
      ) as ranges;
    `,{ranges:s}=o[0];return n.map((e,t)=>({type:dm.Fingerprint,upperBound:t===n.length-1?r:s.slice(t*28+12,t*28+28),fingerprint:s.slice(t*28,t*28+12)}))},Sm=e=>(t,n)=>{let{rows:r}=e.sqlite.prepared`
      select evolu_skiplist_timestamp_at(${t}, ${n}) as t;
    `,{t:i}=r[0];return A(i,`index out of range`),i},Cm=e=>(t,n)=>{let r=e.sqlite.prepared`
      select storedBytes, firstTimestamp, lastTimestamp
      from evolu_usage
      where ownerId = ${t};
    `;if(!ce(r.rows))return{storedBytes:null,firstTimestamp:n,lastTimestamp:n};let i=fe(r.rows);return M(i.firstTimestamp),M(i.lastTimestamp),{storedBytes:i.storedBytes,firstTimestamp:i.firstTimestamp,lastTimestamp:i.lastTimestamp}},wm=e=>(t,n,r,i)=>{e.sqlite.prepared`
      insert into evolu_usage
        ("ownerId", "storedBytes", "firstTimestamp", "lastTimestamp")
      values
        (${t}, ${n}, ${r}, ${i})
      on conflict (ownerId) do update
        set
          storedBytes = ${n},
          firstTimestamp = ${r},
          lastTimestamp = ${i};
    `},Tm=Zn,Em={Request:0,Response:1,Broadcast:2},Dm={None:0,Subscribe:1,Unsubscribe:2},Om={NoError:0,WriteKeyError:1,WriteError:2,QuotaError:3,SyncError:4},km=e=>(t,n)=>{let r=Am(t,{messageType:Em.Request,subscriptionFlag:n??Dm.None}),i=Zo(t),a=e.storage.getSize(i),o=Vm(e)(i,Yn,a,um);for(let e of o)r.addRange(e);return r.unwrap()},Am=(e,t)=>{let{totalMaxSize:n=1e6,rangesMaxSize:r=3e4,version:i=Tm}=t,a={header:Mr(),messages:{timestamps:jm(),dbChangeLengths:Mr()},ranges:{timestamps:jm(),types:Mr(),payloads:Mr()}};if(Lr(a.header,i),a.header.extend(Zo(e)),a.header.extend([t.messageType]),t.messageType===Em.Request){t.writeKey?(a.header.extend([1]),a.header.extend(t.writeKey)):a.header.extend([0]);let e=t.subscriptionFlag??Dm.None;a.header.extend([e])}else t.messageType===Em.Response&&a.header.extend([t.errorCode]);let o=[],s=0,c=!1,l=!1,u=()=>d()<=n,d=()=>a.header.getLength()+a.messages.timestamps.getLength()+a.messages.dbChangeLengths.getLength()+s+f(),f=()=>a.ranges.timestamps.getCount()>0?a.ranges.timestamps.getLength()+a.ranges.types.getLength()+a.ranges.payloads.getLength():0;return{addMessage:e=>{a.messages.timestamps.add(e.timestamp),zr(a.messages.dbChangeLengths,e.change),o.push(e.change),s+=e.change.length,A(l||u(),`the message is too big`)},addRange:e=>{switch(A(t.messageType!==Em.Broadcast,`Cannot add a range into broadcast message`),A(!c,`Cannot add a range after an InfiniteUpperBound range`),c=e.upperBound===um,e.upperBound===um?a.ranges.timestamps.addInfinite():a.ranges.timestamps.add(Zp(e.upperBound)),Lr(a.ranges.types,e.type),e.type){case dm.Skip:break;case dm.Fingerprint:a.ranges.payloads.extend(e.fingerprint);break;case dm.Timestamps:e.timestamps.append(a.ranges.payloads)}A(l||u(),`the range ${e.type} is too big`)},tryWrite:(e,i=Yn)=>{let u=a.messages.timestamps.checkpoint(),p=a.messages.dbChangeLengths.getLength(),m=o.length,h=s,g=a.ranges.timestamps.checkpoint(),_=a.ranges.types.getLength(),v=a.ranges.payloads.getLength(),y=c,b=l,ee=!1;l=!0;try{e();let o=a.ranges.timestamps.getCount()+1;for(;o%128==0;)o/=128;let s=(t.messageType===Em.Broadcast||c?0:1+cm+ +(o===1))+i;ee=d()+s<=n&&f()+s<=r}finally{l=b,ee||(u(),a.messages.dbChangeLengths.truncate(p),o.length=m,s=h,g(),a.ranges.types.truncate(_),a.ranges.payloads.truncate(v),c=y)}return ee},unwrap:()=>{a.ranges.timestamps.getCount()>0&&A(c,`The last range's upperBound must be InfiniteUpperBound`);let e=new Uint8Array(d());e.set(a.header.unwrap());let t=a.header.getLength(),n=Mr();a.messages.timestamps.append(n),e.set(n.unwrap(),t),t+=n.getLength();let r=a.messages.dbChangeLengths.unwrap(),i=0;for(let n of o){do e[t++]=r[i];while(r[i++]>=128);e.set(n,t),t+=n.length}if(a.ranges.timestamps.getCount()>0){let n=Mr();a.ranges.timestamps.append(n),n.extend(a.ranges.types.unwrap()),n.extend(a.ranges.payloads.unwrap()),e.set(n.unwrap(),t),t+=n.getLength()}return A(t===e.length,`the frame size is exact`),e},getSize:d}},jm=()=>{let e=Yn,t=Mr(),n=()=>{t.reset(),Lr(t,e)};n();let r=Mr(),i=0,a=Ur((e,t)=>{Lr(e,t)}),o=Ur((e,t)=>{e.extend(Lp(t))});return{add:t=>{let s=t.millis-i;Bt(Jn,s),e++,n(),i=t.millis,Lr(r,s),a.add(t.counter),o.add(t.nodeId)},addInfinite:()=>{e++,n()},getCount:()=>e,getLength:()=>t.getLength()+r.getLength()+a.getLength()+o.getLength(),append:e=>{e.extend(t.unwrap()),e.extend(r.unwrap()),e.extend(a.unwrap()),e.extend(o.unwrap())},checkpoint:()=>{let t=e,s=r.getLength(),c=i,l=a.checkpoint(),u=o.checkpoint();return()=>{e=t,n(),r.truncate(s),i=c,l(),u()}}}},Mm=(e,t={})=>async n=>{let{storage:r}=n.deps,i=t.version??Tm,a=Nm(e,i);if(!a.ok)return a;let o=a.value;if(o.type===`OtherVersion`)return B({type:`ProtocolVersionError`,version:o.version,isInitiator:i<o.version,ownerId:o.ownerId});if(o.type===`Request`)return B({type:`ProtocolInvalidDataError`,error:new Im(`Expected a Response or a Broadcast`)});let{ownerId:s}=o;if(o.type===`ErrorResponse`)switch(o.errorCode){case Om.WriteKeyError:return B({type:`ProtocolWriteKeyError`,ownerId:s});case Om.WriteError:return B({type:`ProtocolWriteError`,ownerId:s});case Om.QuotaError:return B({type:`ProtocolQuotaError`,ownerId:s});case Om.SyncError:return B({type:`ProtocolSyncError`,ownerId:s})}let{messages:c}=o,l=Zo(s);if(ce(c))try{let e=await n(r.writeMessages(l,c));if(!e.ok)return e}catch(e){if($a.is(e))throw e;return n.deps.console.error(e),z({type:`Failed`,cause:`Write`})}if(o.type===`Broadcast`)return z({type:`Broadcast`});let u=t.writeKey;if(u==null)return z({type:`Readonly`});let{ranges:d}=o;if(!ce(d))return z({type:`Converged`});let f=()=>Am(s,{messageType:Em.Request,writeKey:u,rangesMaxSize:t.rangesMaxSize}),p=f(),m,h=zm(n.deps)(d,p,l,{createEmptyOutput:f,onChangeTooLarge:t.onChangeTooLarge??n.deps.console.warn,onMessage:e=>{m??=Am(s,{messageType:Em.Broadcast}),m.addMessage(e)}});return h.ok?h.value?z({type:`Response`,message:p.unwrap(),...m&&{broadcast:m.unwrap()}}):z({type:`Converged`}):z({type:`Failed`,cause:`Sync`})},Nm=(e,t)=>{try{let n=Mr(e),[r,i]=Pm(n);if(r!==t)return z({type:`OtherVersion`,version:r,ownerId:i});switch(Fm(n)){case Em.Request:{let e=n.shift();if(e>1)throw new Im(`Invalid hasWriteKey: ${e}`);let t=e===1?n.shiftN($o):null,r=n.shift();switch(r){case Dm.None:case Dm.Subscribe:case Dm.Unsubscribe:break;default:throw new Im(`Invalid SubscriptionFlag: ${r}`)}let a=Lm(n);for(let{change:e}of a)if(e.length<Rm)throw new Im(`EncryptedDbChange is too short`);return z({type:`Request`,ownerId:i,writeKey:t,subscriptionFlag:r,messages:a,ranges:Um(n)})}case Em.Response:{let e=n.shift();switch(e){case Om.NoError:return z({type:`Response`,ownerId:i,messages:Lm(n),ranges:Um(n)});case Om.WriteKeyError:case Om.WriteError:case Om.QuotaError:case Om.SyncError:return z({type:`ErrorResponse`,ownerId:i,errorCode:e});default:throw new Im(`Invalid ProtocolErrorCode: ${e}`)}}case Em.Broadcast:return z({type:`Broadcast`,ownerId:i,messages:Lm(n)})}}catch(e){return B({type:`ProtocolInvalidDataError`,error:e})}},Pm=e=>[Rr(e),Gm(e)],Fm=e=>{let t=e.shift();switch(t){case Em.Request:case Em.Response:case Em.Broadcast:return t;default:throw new Im(`Invalid MessageType`)}};var Im=class extends Error{constructor(e){super(e),this.name=`ProtocolDecodeError`}};const Lm=e=>{let t=Wm(e),n=se(t.length);for(let r=0;r<t.length;r++){let i=t[r],a=Br(e),o=e.shiftN(a);n[r]={timestamp:i,change:o}}return n},Rm=41,zm=e=>(t,n,r,{createEmptyOutput:i,onChangeTooLarge:a,onMessage:o})=>{let s=n.getSize(),c;try{c=e.storage.getSize(r)}catch(t){return e.console.error(t),B(Om.SyncError)}let l=null,u=Yn,d=Yn,f=!1,p=!1,m=0,h=(e=1)=>m+e>8192?!1:(m+=e,!0),g=e=>{p&&e.upperBound===um?n.addRange({type:dm.Skip,upperBound:um}):f=!0},_=(e,t)=>{let r=n.tryWrite(()=>{f&&(M(l,`prevUpperBound is null`),n.addRange({type:dm.Skip,upperBound:l})),t()});return r&&(f=!1,p=!0,d=e),r},v=()=>{let t;try{t=e.storage.fingerprint(r,d,c)}catch(t){return e.console.error(t),B(Om.SyncError)}return n.addRange({type:dm.Fingerprint,upperBound:um,fingerprint:t}),z(!0)};for(let s of t){let t=s.upperBound;if(u<c&&t!==um&&!h())return v();let d=u,p;try{p=e.storage.findLowerBound(r,u,c,t)}catch(t){return e.console.error(t),B(Om.SyncError)}switch(s.type){case dm.Skip:g(s);break;case dm.Fingerprint:{if(d<p&&!h())return v();let i;try{i=e.storage.fingerprint(r,d,p)}catch(t){return e.console.error(t),B(Om.SyncError)}if(D(s.fingerprint,i)){g(s);break}if(p-d>=32&&!h(16))return v();let a;try{a=Vm(e)(r,d,p,t)}catch(t){if($a.is(t))throw t;return e.console.error(t),B(Om.SyncError)}if(!_(p,()=>{for(let e of a)n.addRange(e)}))return v();break}case dm.Timestamps:{if(d<p&&!h())return v();let c=t,l=new Map(s.timestamps.map(e=>[e.join(),!0])),u=jm(),m=!1,y=!1,b=f,ee=null,x=[];try{e.storage.iterate(r,d,p,(t,a)=>{try{if(a>d&&(a-d)%32==0&&!h())return m=!0,c=t,p=a,!1;let s=t.join(),f=Zp(t),g=null;if(l.has(s))l.delete(s);else try{g={timestamp:f,change:e.storage.readDbChange(r,t)}}catch(t){return e.console.error(t),y=!0,!1}let _=u.checkpoint();if(u.add(f),n.tryWrite(()=>{g&&n.addMessage(g)},Bm(u,b)))return g&&o?.(g),!0;if(_(),g){let e=i(),t=jm();if(t.add(g.timestamp),!e.tryWrite(()=>{e.addMessage(g)},Bm(t,!0))&&h(Math.ceil(g.change.length/131072)))return x.push({type:`ProtocolChangeTooLargeError`,timestamp:f,size:g.change.length}),!0}return m=!0,c=t,p=a,!1}catch(e){return ee={error:e},!1}})}catch(t){e.console.error(t),y=!0}if(ee)throw ee.error;for(let e of x)a(e);if(y)return B(Om.SyncError);let S=()=>_(p,()=>{n.addRange({type:dm.Timestamps,upperBound:c,timestamps:u})});if(m)return S(),v();if(l.size>0){if(!S())return v()}else g(s);break}}u=p,l=t}return z(n.getSize()>s)},Bm=(e,t)=>e.getLength()+22+(t?22:0),Vm=e=>(t,n,r,i)=>{let a=Jn.orThrow(r-n),o=_a(a);if(!o.ok){let a={type:dm.Timestamps,upperBound:i,timestamps:jm()};return e.storage.iterate(t,n,r,e=>(a.timestamps.add(Zp(e)),!0)),[a]}let s=n===0?o.value:[n,...o.value.map(e=>e+n)],c=e.storage.fingerprintRanges(t,s,i);return n>0?c.slice(1):c},Hm=2e5,Um=e=>{if(e.getLength()>Hm)throw new Im(`Ranges section exceeds ${Hm} bytes`);if(e.getLength()===0)return[];let t=Rr(e);if(t===0)return[];let n=t-1,r=Wm(e,n);for(let e=1;e<r.length;e++)if(Bp(r[e-1],r[e])>0)throw new Im(`Range upper bounds must be non-decreasing`);let i=se(t);for(let n=0;n<t;n++){let t=Rr(e);switch(t){case dm.Fingerprint:case dm.Skip:case dm.Timestamps:i[n]=t;break;default:throw new Im(`Invalid RangeType: ${t}`)}}let a=se(t);for(let o=0;o<t;o++){let t=o<n?Xp(r[o]):um;switch(i[o]){case dm.Skip:a[o]={type:dm.Skip,upperBound:t};break;case dm.Fingerprint:{let n=e.shiftN(cm);a[o]={type:dm.Fingerprint,upperBound:t,fingerprint:n};break}case dm.Timestamps:{let n=Wm(e).map(Xp);a[o]={type:dm.Timestamps,upperBound:t,timestamps:n};break}}}return a},Wm=(e,t)=>{if(t??=Rr(e),t>e.getLength())throw new Im(`Invalid timestamps count`);let n=0,r=se(t);for(let i=0;i<t;i++){let t=Rr(e),a=Ai.fromUnknown(n+t);if(!a.ok)throw new Im(a.error.type);r[i]=a.value,n=a.value}let i=Wr(e,t,()=>{let t=Pp.fromUnknown(Rr(e));if(!t.ok)throw new Im(t.error.type);return t.value}),a=Wr(e,t,()=>Rp(e.shiftN(Ip))),o=se(t);for(let e=0;e<t;e++)o[e]={millis:r[e],counter:i[e],nodeId:a[e]};return o},Gm=e=>{let t=e.shiftN(16);return Un(t)},Km=Zn,qm=e=>(t,n)=>{let r=Mr();Jm(r,t),r.extend(ua(r.getLength()));let i=e.randomBytes.create(24),a=e.xChaCha20Poly1305.encrypt(r.unwrap(),i,n);return r.reset(),r.extend(i),zr(r,a),r.extend(a),r.unwrap()},Jm=(e,t)=>{Lr(e,Km),e.extend(Xp(t.timestamp)),Fr(e,[t.change.isInsert,t.change.isDelete!=null,t.change.isDelete??!1]),Vr(e,t.change.table),e.extend(Hn(t.change.id));let n=v(t.change.values);zr(e,n);for(let[t,r]of n)Vr(e,t),Zm(e,r)},Ym=e=>(t,n)=>{try{let r=Mr(t.change),i=r.shiftN(24),a=r.shiftN(Br(r)),o=e.xChaCha20Poly1305.decrypt(a,i,n);if(!o.ok)return o;if(r.reset(),r.extend(o.value),Rr(r)>Km)throw new Im(`Unsupported EncryptedDbChange version`);let s=Kp.fromUnknown(r.shiftN(qp));if(!s.ok)throw new Im(s.error.type);let c=Zp(s.value);if(!zp(c,t.timestamp))return B({type:`ProtocolTimestampMismatchError`,expected:t.timestamp,timestamp:c});let l=Ir(r,3),u=Hr(r),d=Gm(r),f=Br(r),p=b();for(let e=0;e<f;e++){let e=Hr(r);p[e]=Qm(r)}let m=fm.fromUnknown({table:u,id:d,values:p,isInsert:l[0],isDelete:l[1]?l[2]:null});if(!m.ok)throw new Im(`Invalid DbChange`);return z(m.value)}catch(e){return B({type:`ProtocolInvalidDataError`,error:e})}},Xm={String:/*#__PURE__*/ Jn.orThrow(20),Number:/*#__PURE__*/ Jn.orThrow(21),Null:/*#__PURE__*/ Jn.orThrow(22),Bytes:/*#__PURE__*/ Jn.orThrow(23),NonNegativeInt:/*#__PURE__*/ Jn.orThrow(30),EmptyString:/*#__PURE__*/ Jn.orThrow(31),Base64Url:/*#__PURE__*/ Jn.orThrow(32),Id:/*#__PURE__*/ Jn.orThrow(33),Json:/*#__PURE__*/ Jn.orThrow(34),DateIsoWithNonNegativeTime:/*#__PURE__*/ Jn.orThrow(35),DateIsoWithNegativeTime:/*#__PURE__*/ Jn.orThrow(36)},Zm=(e,t)=>{if(t===null){Lr(e,Xm.Null);return}switch(typeof t){case`string`:{if(t===``){Lr(e,Xm.EmptyString);return}let n=Mn.from.parent(t);if(n.ok){let t=new Date(n.value).getTime();Jn.is(t)?(Lr(e,Xm.DateIsoWithNonNegativeTime),Lr(e,t)):(Lr(e,Xm.DateIsoWithNegativeTime),Nr(e,t));return}let r=Bn.from.parent(t);if(r.ok){Lr(e,Xm.Id),e.extend(Hn(r.value));return}let i=t[0],a=t[t.length-1],o=i===`"`&&a===`"`||i===`[`&&a===`]`||i===`{`&&a===`}`||(i===`-`||i>=`0`&&i<=`9`)&&a>=`0`&&a<=`9`||t===`true`||t===`false`||t===`null`?wr.from.parent(t):null;if(o?.ok&&!t.includes(`\\ud`)){let n=Tr(o.value),r=Mr();try{if(ti(r,n),JSON.stringify(n)===t){let t=r.unwrap();Lr(e,Xm.Json),zr(e,t),e.extend(t);return}}catch(e){if(!(e instanceof jr))throw e}}let s=Ln.from.parent(t);if(s.ok){Lr(e,Xm.Base64Url);let t=zn(s.value);zr(e,t),e.extend(t);return}Lr(e,Xm.String),Vr(e,t);return}case`number`:if(!Object.is(t,-0)&&Jn.is(t)){if($m(t)){Lr(e,t);return}Lr(e,Xm.NonNegativeInt),Lr(e,t);return}Lr(e,Xm.Number),Nr(e,t);return}Lr(e,Xm.Bytes),zr(e,t),e.extend(t)},Qm=e=>{let t=Rr(e);if($m(t))return t;switch(t){case Xm.String:return Hr(e);case Xm.Number:return Pr(e);case Xm.Null:return null;case Xm.Bytes:{let t=Br(e);return e.shiftN(t)}case Xm.Id:return Gm(e);case Xm.NonNegativeInt:return Rr(e);case Xm.Json:{let t=Br(e),n=Mr(e.shiftN(t)),r=ni(n);if(n.getLength()!==0)throw new Im(`Invalid JSON MessagePack length`);return JSON.stringify(r)}case Xm.DateIsoWithNonNegativeTime:case Xm.DateIsoWithNegativeTime:{let n=t===Xm.DateIsoWithNonNegativeTime?Rr(e):Pr(e),r=Mn.from.parent(new Date(n).toISOString());if(!r.ok)throw new Im(r.error.type);return r.value}case Xm.EmptyString:return``;case Xm.Base64Url:{let t=Br(e),n=e.shiftN(t);return Rn(n)}default:throw new Im(`invalid ProtocolValueType`)}},$m=e=>e>=0&&e<20,eh=/*#__PURE__*/ Vn({randomBytes:/*#__PURE__*/ oa()}),th=e=>{let t=se(e.length);for(let n=0;n<e.length;++n)t[n]=nh(e[n]);return t},nh=e=>gn.is(e)&&e.startsWith(eh)?nh(JSON.parse(e.slice(eh.length))):Array.isArray(e)?th(e):g(e)?rh(e):e,rh=e=>{let t=b();for(let n in e)t[n]=nh(e[n]);return t},ih=(e,t)=>{qe(()=>e.postMessage({type:`ConsoleEntry`,entry:t})).ok||e.postMessage({type:`ConsoleEntry`,entry:{...t,args:t.args.map(e=>qe(()=>structuredClone(e)).ok?e:e instanceof Error?_o(e).error:V(e))}})},ah=ji.orThrow(9e4);ji.orThrow(16*ah),`A`.repeat(22);var oh=function(e,t,n){if(t!=null){if(typeof t!=`object`&&typeof t!=`function`)throw TypeError(`Object expected.`);var r,i;if(n){if(!Symbol.asyncDispose)throw TypeError(`Symbol.asyncDispose is not defined.`);r=t[Symbol.asyncDispose]}if(r===void 0){if(!Symbol.dispose)throw TypeError(`Symbol.dispose is not defined.`);r=t[Symbol.dispose],n&&(i=r)}if(typeof r!=`function`)throw TypeError(`Object not disposable.`);i&&(r=function(){try{i.call(this)}catch(e){return Promise.reject(e)}}),e.stack.push({value:t,dispose:r,async:n})}else n&&e.stack.push({async:!0});return t},sh=(function(e){return function(t){function n(n){t.error=t.hasError?new e(n,t.error,`An error was suppressed during disposal.`):n,t.hasError=!0}var r,i=0;function a(){for(;r=t.stack.pop();)try{if(!r.async&&i===1)return i=0,t.stack.push(r),Promise.resolve().then(a);if(r.dispose){var e=r.dispose.call(r.value);if(r.async)return i|=2,Promise.resolve(e).then(a,function(e){return n(e),a()})}else i|=1}catch(e){n(e)}if(i===1)return t.hasError?Promise.reject(t.error):Promise.resolve();if(t.hasError)throw t.error}return a()}})(typeof SuppressedError==`function`?SuppressedError:function(e,t,n){var r=Error(n);return r.name=`SuppressedError`,r.error=e,r.suppressed=t,r});const ch=Xn.orThrow(2),lh=e=>async t=>{let n={stack:[],error:void 0,hasError:!1};try{let r=oh(n,new AsyncDisposableStack,!0);r.use(e);let{deps:i}=t,a=await t.ok(mo(({resolve:t})=>{e.onMessage=e=>t(z(e))})),o=r.use(i.createMessagePort(a.port));try{i.console.setLevel(a.consoleLevel===`silent`?`error`:a.consoleLevel);let e=r.use(i.createBroadcastChannel(`evolu:console-entry-or-error`));if(r.defer(i.consoleStoreOutputEntry.subscribe(()=>{let t=i.consoleStoreOutputEntry.get();t&&ih(e,t)})),r.use(await t.ok(Co(a.name))),!a.memoryOnly&&i.waitForDatabaseRelease){let e=await t(i.waitForDatabaseRelease(a.name));if(!e.ok)return o.postMessage({type:`LeaderRefused`,error:e.error}),z()}let n=r.use(await t.ok(Po(a.name,a.memoryOnly?{mode:`memory`}:{mode:`encrypted`,encryptionKey:a.encryptionKey}))),s=pm({sqlite:n,...i}),c={...i,sqlite:n,sqliteSchema:a.sqliteSchema,baseSqliteStorage:s,timestampConfig:{maxDrift:3e5}},l=n.transaction(()=>{let{rows:e}=n.exec(q`
            select "name" from pragma_table_info('evolu_version');
          `),t=new Set(e.map(e=>e.name)),r;if(t.size===0)r=Hp(c),ph(c)(r);else{let e=dh(c)(t);if(!e.ok)return e;let{rows:i}=n.exec(q`
              select "clock" from evolu_config limit 1;
            `);P(i),r=Zp(fe(i).clock)}im(c)(a.sqliteSchema);let i=hh(c)(r);return i&&(r=i,uh(c)(i)),mh(c),z(r)});if(!l.ok)return o.postMessage({type:`LeaderRefused`,error:l.error}),z();let u=l.value,d=yh({...c,xChaCha20Poly1305:i.xChaCha20Poly1305??ca()}),f=r.use(t.create({storage:d}));return o.postMessage({type:`LeaderAcquired`,clock:u}),await t.ok(mo(({resolve:e,reject:t})=>{o.onMessage=r=>{try{if(r.type===`Dispose`){e(z());return}let{attemptId:t}=r,a=e=>{o.postMessage({type:`OnQueuedResponse`,attemptId:t,response:e},e.type===`ForEvolu`&&e.message.type===`Export`?[e.message.file.buffer]:void 0)};if(`clock`in r){let{clock:e,now:t}=r,n=e,i={now:t,clock:{get:()=>n,set:e=>{n=e}}},o=r.request;if(o.type===`ForSharedWorker`){let{owner:e,inputMessage:t,continues:n}=o.message;f(async r=>{d.setRequestContext(e.encryptionKey,i);let o=await r(Mm(t,{...n&&{writeKey:e.writeKey},onChangeTooLarge:d.onChangeTooLarge}));return a({type:`ForSharedWorker`,message:{type:`ApplySyncMessage`,clock:i.clock.get(),ownerId:e.id,didWriteMessages:d.didWriteMessages(),skippedError:d.skippedError(),result:o}}),z()})}else{let e=qe(()=>bh({...c,clock:i.clock})(o.message,t),_o);a({type:`ForEvolu`,id:o.id,message:e.ok?e.value:{type:`MutateFailed`,error:e.error}})}return}let s=r.request;if(s.type===`ForSharedWorker`){let e=/* @__PURE__ */ new Map,t=/* @__PURE__ */ new Set;for(let n of s.message.owners){d.setRequestContext(n.encryptionKey);try{e.set(n.id,km({storage:d})(n.id,Dm.Subscribe))}catch(e){i.console.error(e),t.add(n.id)}}a({type:`ForSharedWorker`,message:{type:`CreateSyncMessages`,protocolMessagesByOwnerId:e,failedOwnerIds:t}});return}if(s.message.type===`Query`){qe(()=>n.prepared`begin;`);let e=wh(c)(s.message.queries);qe(()=>n.prepared`commit;`),a({type:`ForEvolu`,id:s.id,message:{type:`Query`,rowsByQuery:e}});return}if(s.message.type===`Export`){let e=qe(()=>n.export(),_o);a({type:`ForEvolu`,id:s.id,message:e.ok?{type:`Export`,file:e.value}:{type:`ExportFailed`,error:e.error}})}}catch(e){t(e)}};let r=wo(i)(a.sharedWorkerId,()=>e(z()));return()=>{o.onMessage=null,r[Symbol.dispose]()}})),z()}catch(e){throw(!$a.is(e)||e.reason.type===`PanicAbortReason`)&&o.postMessage({type:`LeaderRefused`,error:_o(vo(e))}),e}}catch(e){n.error=e,n.hasError=!0}finally{let e=sh(n);e&&await e}},uh=e=>t=>{let n=Xp(t);e.sqlite.prepared`
      update evolu_config
      set "clock" = ${n}
      where "clock" < ${n};
    `},dh=({sqlite:e})=>t=>{t.has(`dbVersion`)||e.exec(q`
        alter table evolu_version
        rename column "protocolVersion" to "dbVersion";
      `);let{rows:n}=e.exec(q`
      select "dbVersion" from evolu_version;
    `),r=n[0].dbVersion;return r>ch?B({type:`UnsupportedDbVersionError`,storedVersion:r,supportedVersion:ch}):(r<ch&&(r<2&&fh({sqlite:e}),e.exec(q`update evolu_version set "dbVersion" = ${ch};`)),z())},fh=({sqlite:e})=>{for(let t of[q`
      alter table evolu_message_quarantine
      add column "reason" integer not null default ${q.raw(String(em.Schema))};
    `,q`
      alter table evolu_message_quarantine
      add column "origin" integer not null default ${q.raw(String(tm.ReceivedMessage))};
    `,q`
      alter table evolu_message_quarantine
      add column "quarantinedAt" integer;
    `,q`
      create index evolu_message_quarantine_reason_timestamp
      on evolu_message_quarantine ("reason", "timestamp");
    `])e.exec(t)},ph=({sqlite:e})=>t=>{for(let n of[q`
        create table evolu_version (
          "dbVersion" integer not null
        )
        strict;
      `,q`
        insert into evolu_version ("dbVersion")
        values (${ch});
      `,q`
        create table evolu_config (
          "clock" blob not null
        )
        strict;
      `,q`
        insert into evolu_config ("clock")
        values (${Xp(t)});
      `,q`
        create table evolu_history (
          "ownerId" blob not null,
          "table" text not null,
          "id" blob not null,
          "column" text not null,
          "timestamp" blob not null,
          "value" any
        )
        strict;
      `,q`
        create index evolu_history_ownerId_timestamp
        on evolu_history ("ownerId", "timestamp");
      `,q`
        create unique index evolu_history_ownerId_table_id_column_timestampDesc
        on evolu_history ("ownerId", "table", "id", "column", "timestamp" desc);
      `,q`
        create table evolu_message_quarantine (
          "ownerId" blob not null,
          "timestamp" blob not null,
          "table" text not null,
          "id" blob not null,
          "column" text not null,
          "value" any,
          "reason" integer not null default ${q.raw(String(em.Schema))},
          "origin" integer not null default ${q.raw(String(tm.ReceivedMessage))},
          "quarantinedAt" integer,
          primary key ("ownerId", "timestamp", "table", "id", "column")
        )
        strict;
      `])e.exec(n);hm({sqlite:e}),e.exec(q`
      create index evolu_message_quarantine_reason_timestamp
      on evolu_message_quarantine ("reason", "timestamp");
    `)},mh=e=>{let{rows:t}=e.sqlite.exec(q`
    select "ownerId", "timestamp", "table", "id", "column", "value"
    from evolu_message_quarantine
    where "reason" = ${em.Schema};
  `);for(let n of t)gh(e)(n.table,n.column,n.value)&&(vh(e)(n.ownerId,Qo(n.ownerId),n.table,n.id,Un(n.id),n.column,n.value,n.timestamp),e.sqlite.prepared`
      delete from evolu_message_quarantine
      where
        "ownerId" = ${n.ownerId}
        and "timestamp" = ${n.timestamp}
        and "table" = ${n.table}
        and "id" = ${n.id}
        and "column" = ${n.column};
    `)},hh=e=>t=>{let n=e.time.now(),r=n+Math.floor(e.timestampConfig.maxDrift);Bt(Kn,r);let i=Xp({millis:Mi(r),counter:65535,nodeId:`ffffffffffffffff`}),{rows:a}=e.sqlite.exec(q`
      select distinct "timestamp"
      from evolu_message_quarantine
      where
        "reason" = ${em.TimestampDrift}
        and "timestamp" <= ${i}
      order by "timestamp";
    `);if(a.length===0)return null;let o=Wp(e),s=t;for(let{timestamp:e}of a){let t=Zp(e),r=o(s,t,n);r.ok?s=r.value:(A(r.error.cause===`local`,`The query bound excludes remote drift at the captured time.`),s=r.error.timestamp)}return e.sqlite.exec(q`
      update evolu_message_quarantine
      set "reason" = ${em.Schema}
      where
        "reason" = ${em.TimestampDrift}
        and "timestamp" <= ${i};
    `),s},gh=e=>(t,n,r)=>{if($p(t))return!1;let i=ee(e.sqliteSchema.tables,t);return i!=null&&(_h.has(n)||i.has(n))},_h=nm.difference(/* @__PURE__ */ new Set([`ownerId`])),vh=e=>(t,n,r,i,a,o,s,c)=>{let l=o===`createdAt`||o===`updatedAt`;l||e.sqlite.prepared`
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
        insert into ${q.identifier(r)}
          ("ownerId", "id", ${q.identifier(o)})
        select ${n}, ${a}, ${s}
        where not exists (select 1 from existingTimestamp)
        on conflict ("ownerId", "id") do update
          set ${q.identifier(o)} = ${s}
          where not exists (select 1 from existingTimestamp);
      `,e.sqlite.prepared`
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
    `,l&&e.sqlite.prepared`
        with
          firstChange as (
            select *
            from (
              select *
              from (
                select "timestamp", "value"
                from evolu_history
                where
                  "ownerId" = ${t}
                  and "table" = ${r}
                  and "id" = ${i}
                  and "column" = 'createdAt'
                order by "timestamp"
                limit 1
              )
              union all
              select *
              from (
                select "timestamp", "value"
                from evolu_history
                where
                  "ownerId" = ${t}
                  and "table" = ${r}
                  and "id" = ${i}
                  and "column" = 'updatedAt'
                order by "timestamp"
                limit 1
              )
            )
            order by "timestamp"
            limit 1
          ),
          lastChange as (
            select *
            from (
              select *
              from (
                select "timestamp", "value"
                from evolu_history
                where
                  "ownerId" = ${t}
                  and "table" = ${r}
                  and "id" = ${i}
                  and "column" = 'createdAt'
                order by "timestamp" desc
                limit 1
              )
              union all
              select *
              from (
                select "timestamp", "value"
                from evolu_history
                where
                  "ownerId" = ${t}
                  and "table" = ${r}
                  and "id" = ${i}
                  and "column" = 'updatedAt'
                order by "timestamp" desc
                limit 1
              )
            )
            order by "timestamp" desc
            limit 1
          )
        insert into ${q.identifier(r)}
          ("ownerId", "id", "createdAt", "updatedAt")
        select
          ${n},
          ${a},
          firstChange."value",
          case
            when lastChange."timestamp" = firstChange."timestamp" then null
            else lastChange."value"
          end
        from
          firstChange,
          lastChange
        where true
        on conflict ("ownerId", "id") do update
          set
            "createdAt" = excluded."createdAt",
            "updatedAt" = excluded."updatedAt";
      `},yh=e=>{let t=null,n=!1,r=null,i,a=()=>(M(t,`ClientStorage encryption key must be set`),t);return{...e.baseSqliteStorage,setRequestContext:(e,a)=>{t=e,i=a,n=!1,r=null},didWriteMessages:()=>n,skippedError:()=>r,onChangeTooLarge:e=>{r??=e},validateWriteKey:ie,writeMessages:(t,o)=>()=>{let s=[],c=a();for(let t of o){let n=Ym(e)(t,c);if(!n.ok){r??=n.error;continue}s.push({timestamp:t.timestamp,change:n.value})}if(!ce(s))return z();M(i);let{clock:l,now:u}=i,d=l.get(),f=Wp(e);for(let e of s){let t=f(d,e.timestamp,u);if(t.ok)d=t.value;else{if(t.error.cause===`remote`)continue;d=t.error.timestamp}}let p=!1,m=qe(()=>{e.sqlite.transaction(()=>{p=Sh(e)(Qo(t),s,tm.ReceivedMessage,u),uh(e)(d)})},_o);return m.ok?(l.set(d),p&&(n=!0),z()):m},readDbChange:(t,n)=>{let{rows:r}=e.sqlite.prepared`
        select "table", "id", "column", "value"
        from evolu_history
        where "ownerId" = ${t} and "timestamp" = ${n}
        union all
        select "table", "id", "column", "value"
        from evolu_message_quarantine
        where "ownerId" = ${t} and "timestamp" = ${n};
      `;P(r,`Every timestamp must have rows`);let i=fe(r),o=b(),s=!1,c=null;for(let e of r)switch(e.column){case`createdAt`:s=!0;break;case`updatedAt`:s=!1;break;case`isDeleted`:Bt(Ro,e.value),c=Bo(e.value);break;default:o[e.column]=e.value}let l={timestamp:Zp(n),change:fm.orThrow({table:i.table,id:Un(i.id),values:o,isInsert:s,isDelete:c})};return qm(e)(l,a())}}},bh=e=>(t,n)=>Ke(e.sqlite.transaction(()=>{let r=/* @__PURE__ */ new Map,i=e.clock.get();for(let a of t.changes){if($p(a.table)){xh(e)(a,n);continue}let t=Up(e)(i,n);i=t.ok?t.value:t.error.timestamp;let{ownerId:o,...s}=a,c={timestamp:i,change:s},l=r.get(o);l?l.push(c):r.set(o,[c])}for(let[t,i]of r)Sh(e)(t,i,tm.LocalMutation,n);return r.size>0&&uh(e)(i),z({type:`Mutate`,clock:i,messagesByOwnerId:r,rowsByQuery:wh(e)(t.subscribedQueries)})})),xh=e=>(t,n)=>{let r=q.identifier(t.table),{ownerId:i,id:a}=t;if(t.isDelete)e.sqlite.prepared`
        delete from ${r}
        where "ownerId" = ${i} and "id" = ${a};
      `;else{let o=Ni(n);e.sqlite.prepared`
        insert into ${r} ("ownerId", "id", "createdAt")
        values (${i}, ${a}, ${o})
        on conflict ("ownerId", "id") do update
          set
            "createdAt" = coalesce("createdAt", "updatedAt", ${o}),
            "updatedAt" = case
              when "createdAt" = ${o} then "updatedAt"
              else ${o}
            end;
      `;for(let[n,o]of Ch(t))e.sqlite.prepared`
          update ${r}
          set ${q.identifier(n)} = ${o}
          where "ownerId" = ${i} and "id" = ${a};
        `}},Sh=e=>(t,n,r,i)=>{let a=Zo(t),o=!1,{firstTimestamp:s,lastTimestamp:c}=Cm(e)(a,Xp(fe(n).timestamp));for(let{timestamp:l,change:u}of n){let n=Xp(l);if([s,c]=gm(n,s,c),!e.baseSqliteStorage.insertTimestamp(a,n))continue;o=!0;let d=Gp(e)(l.millis,i),f=le(Ch(u),[u.isInsert?`createdAt`:`updatedAt`,Ni(l.millis)]),p=Hn(u.id);for(let[o,s]of f)!d&&gh(e)(u.table,o,s)?vh(e)(a,t,u.table,p,u.id,o,s,n):e.sqlite.prepared`
            insert into evolu_message_quarantine
              (
                "ownerId",
                "timestamp",
                "table",
                "id",
                "column",
                "value",
                "reason",
                "origin",
                "quarantinedAt"
              )
            values
              (
                ${a},
                ${n},
                ${u.table},
                ${p},
                ${o},
                ${s},
                ${d?em.TimestampDrift:em.Schema},
                ${r},
                ${i}
              )
            on conflict do nothing;
          `}return o&&wm(e)(a,Zn,s,c),o},Ch=e=>{let t=v(e.values);return e.isDelete==null?t:le(t,[`isDeleted`,zo(e.isDelete)])},wh=e=>t=>{let n=/* @__PURE__ */ new Map;for(let r of t)n.set(r,qe(()=>e.sqlite.exec(No(r)).rows,_o));return n},Th=1034,Eh=1546,Dh=2570,Oh={sizeof:88,members:{iVersion:{offset:0,signature:`i`},szOsFile:{offset:4,signature:`i`},mxPathname:{offset:8,signature:`i`},pNext:{offset:12,signature:`p`},zName:{offset:16,signature:`s`},pAppData:{offset:20,signature:`p`},xOpen:{offset:24,signature:`i(pppip)`},xDelete:{offset:28,signature:`i(ppi)`},xAccess:{offset:32,signature:`i(ppip)`},xFullPathname:{offset:36,signature:`i(ppip)`},xDlOpen:{offset:40,signature:`v(pp)`},xDlError:{offset:44,signature:`v(pip)`},xDlSym:{offset:48,signature:`p()`},xDlClose:{offset:52,signature:`v(pp)`},xRandomness:{offset:56,signature:`i(pip)`},xSleep:{offset:60,signature:`i(pi)`},xCurrentTime:{offset:64,signature:`i(pp)`},xGetLastError:{offset:68,signature:`i(pip)`},xCurrentTimeInt64:{offset:72,signature:`i(pp)`},xSetSystemCall:{offset:76,signature:`i(ppp)`},xGetSystemCall:{offset:80,signature:`p(pp)`},xNextSystemCall:{offset:84,signature:`p(pp)`}}},kh={sizeof:76,members:{iVersion:{offset:0,signature:`i`},xClose:{offset:4,signature:`i(p)`},xRead:{offset:8,signature:`i(ppij)`},xWrite:{offset:12,signature:`i(ppij)`},xTruncate:{offset:16,signature:`i(pj)`},xSync:{offset:20,signature:`i(pi)`},xFileSize:{offset:24,signature:`i(pp)`},xLock:{offset:28,signature:`i(pi)`},xUnlock:{offset:32,signature:`i(pi)`},xCheckReservedLock:{offset:36,signature:`i(pp)`},xFileControl:{offset:40,signature:`i(pip)`},xSectorSize:{offset:44,signature:`i(p)`},xDeviceCharacteristics:{offset:48,signature:`i(p)`},xShmMap:{offset:52,signature:`i(piiip)`},xShmLock:{offset:56,signature:`i(piii)`},xShmBarrier:{offset:60,signature:`v(p)`},xShmUnmap:{offset:64,signature:`i(pi)`},xFetch:{offset:68,signature:`i(pjip)`},xUnfetch:{offset:72,signature:`i(pjp)`}}},Ah={sizeof:4,members:{pMethods:{offset:0,signature:`p`}}},jh=e=>e.sqliteWasm.exports.sqlite3_free,Mh=e=>e.sqliteWasm.exports.sqlite3_open_v2,Nh=e=>e.sqliteWasm.exports.sqlite3_close_v2,Ph=e=>e.sqliteWasm.exports.sqlite3_get_autocommit,Fh=e=>e.sqliteWasm.exports.sqlite3_changes64,Ih=e=>e.sqliteWasm.exports.sqlite3_total_changes64,Lh=e=>e.sqliteWasm.exports.sqlite3_serialize,Rh=e=>e.sqliteWasm.exports.sqlite3_errcode,zh=e=>e.sqliteWasm.exports.sqlite3_extended_errcode,Bh=e=>e.sqliteWasm.exports.sqlite3_errmsg,Vh=e=>e.sqliteWasm.exports.sqlite3_errstr,Hh=e=>e.sqliteWasm.exports.sqlite3_error_offset,Uh=e=>e.sqliteWasm.exports.sqlite3_set_errmsg,Wh=e=>e.sqliteWasm.exports.sqlite3_prepare_v3,Gh=e=>e.sqliteWasm.exports.sqlite3_step,Kh=e=>e.sqliteWasm.exports.sqlite3_reset,qh=e=>e.sqliteWasm.exports.sqlite3_finalize,Jh=e=>e.sqliteWasm.exports.sqlite3_stmt_readonly,Yh=e=>e.sqliteWasm.exports.sqlite3_stmt_status,Xh=e=>e.sqliteWasm.exports.sqlite3_bind_parameter_count,Zh=e=>e.sqliteWasm.exports.sqlite3_bind_null,Qh=e=>e.sqliteWasm.exports.sqlite3_bind_int,$h=e=>e.sqliteWasm.exports.sqlite3_bind_int64,eg=e=>e.sqliteWasm.exports.sqlite3_bind_double,tg=e=>e.sqliteWasm.exports.sqlite3_bind_text,ng=e=>e.sqliteWasm.exports.sqlite3_bind_blob,rg=e=>e.sqliteWasm.exports.sqlite3_clear_bindings,ig=e=>e.sqliteWasm.exports.sqlite3_column_count,ag=e=>e.sqliteWasm.exports.sqlite3_column_name,og=e=>e.sqliteWasm.exports.sqlite3_column_type,sg=e=>e.sqliteWasm.exports.sqlite3_column_double,cg=e=>e.sqliteWasm.exports.sqlite3_column_text,lg=e=>e.sqliteWasm.exports.sqlite3_column_blob,ug=e=>e.sqliteWasm.exports.sqlite3_column_bytes,dg=e=>e.sqliteWasm.exports.evolu_codec_register,fg=e=>e.sqliteWasm.exports.evolu_codec_open,pg=e=>e.sqliteWasm.exports.evolu_codec_take_failure,mg=e=>e.sqliteWasm.exports.evolu_core_register,hg=e=>e.sqliteWasm.exports.evolu_skiplist_finalize;var gg=function(e,t,n){if(t!=null){if(typeof t!=`object`&&typeof t!=`function`)throw TypeError(`Object expected.`);var r,i;if(n){if(!Symbol.asyncDispose)throw TypeError(`Symbol.asyncDispose is not defined.`);r=t[Symbol.asyncDispose]}if(r===void 0){if(!Symbol.dispose)throw TypeError(`Symbol.dispose is not defined.`);r=t[Symbol.dispose],n&&(i=r)}if(typeof r!=`function`)throw TypeError(`Object not disposable.`);i&&(r=function(){try{i.call(this)}catch(e){return Promise.reject(e)}}),e.stack.push({value:t,dispose:r,async:n})}else n&&e.stack.push({async:!0});return t},_g=(function(e){return function(t){function n(n){t.error=t.hasError?new e(n,t.error,`An error was suppressed during disposal.`):n,t.hasError=!0}var r,i=0;function a(){for(;r=t.stack.pop();)try{if(!r.async&&i===1)return i=0,t.stack.push(r),Promise.resolve().then(a);if(r.dispose){var e=r.dispose.call(r.value);if(r.async)return i|=2,Promise.resolve(e).then(a,function(e){return n(e),a()})}else i|=1}catch(e){n(e)}if(i===1)return t.hasError?Promise.reject(t.error):Promise.resolve();if(t.hasError)throw t.error}return a()}})(typeof SuppressedError==`function`?SuppressedError:function(e,t,n){var r=Error(n);return r.name=`SuppressedError`,r.error=e,r.suppressed=t,r});const vg=/*#__PURE__*/ new TextEncoder,yg=/*#__PURE__*/ new TextDecoder(`utf-8`,{ignoreBOM:!0}),bg=e=>t=>{let n=t>2147483647?0:e.sqliteWasm.exports.sqlite3_malloc(Math.max(1,t));return n===0?B({type:`SqliteNoMem`,byteLength:t}):z(n)},xg=e=>t=>{let n=vg.encode(t),r=bg(e)(n.length+1);if(!r.ok)return r;let i=r.value,a=e.sqliteWasm.getHeapU8();return a.set(n,i),a[i+n.length]=0,z(i)},Sg=e=>(t,n,r)=>vg.encodeInto(t,e.sqliteWasm.getHeapU8().subarray(n,n+r)).written,Cg=e=>t=>{let n=e.sqliteWasm.getHeapU8();return yg.decode(n.subarray(t,n.indexOf(0,t)))},wg=e=>(t,n)=>yg.decode(e.sqliteWasm.getHeapU8().subarray(t,t+n)),Tg=e=>(t,n)=>e.sqliteWasm.getHeapU8().slice(t,t+n),Eg=e=>(t,n)=>{e.sqliteWasm.getHeapU8().set(n,t)},Dg=e=>{let t={stack:[],error:void 0,hasError:!1};try{let n=bg(e)(16);if(!n.ok)return n;let r=null,i=0,a=gg(t,new DisposableStack,!1);return a.defer(()=>{e.sqliteWasm.isBroken()||e.sqliteWasm.call(()=>{e.sqliteWasm.exports.sqlite3_free(n.value)})}),a.defer(()=>{let t=r;t!=null&&!e.sqliteWasm.isBroken()&&e.sqliteWasm.call(()=>{e.sqliteWasm.exports.sqlite3_free(t)})}),z(ne({out:n.value,reserve:t=>{if(r!=null){if(t<=i)return z(r);e.sqliteWasm.exports.sqlite3_free(r),r=null}let n=Math.max(t,i*2),a=bg(e)(n);return!a.ok&&n>t&&(n=t,a=bg(e)(n)),a.ok?(r=a.value,i=n,z(r)):(i=0,a)}},a))}catch(e){t.error=e,t.hasError=!0}finally{_g(t)}},Og=e=>Number.isInteger(e)&&e>=-2147483648&&e<=2147483647;var kg=function(e,t,n){if(t!=null){if(typeof t!=`object`&&typeof t!=`function`)throw TypeError(`Object expected.`);var r,i;if(n){if(!Symbol.asyncDispose)throw TypeError(`Symbol.asyncDispose is not defined.`);r=t[Symbol.asyncDispose]}if(r===void 0){if(!Symbol.dispose)throw TypeError(`Symbol.dispose is not defined.`);r=t[Symbol.dispose],n&&(i=r)}if(typeof r!=`function`)throw TypeError(`Object not disposable.`);i&&(r=function(){try{i.call(this)}catch(e){return Promise.reject(e)}}),e.stack.push({value:t,dispose:r,async:n})}else n&&e.stack.push({async:!0});return t},Ag=(function(e){return function(t){function n(n){t.error=t.hasError?new e(n,t.error,`An error was suppressed during disposal.`):n,t.hasError=!0}var r,i=0;function a(){for(;r=t.stack.pop();)try{if(!r.async&&i===1)return i=0,t.stack.push(r),Promise.resolve().then(a);if(r.dispose){var e=r.dispose.call(r.value);if(r.async)return i|=2,Promise.resolve(e).then(a,function(e){return n(e),a()})}else i|=1}catch(e){n(e)}if(i===1)return t.hasError?Promise.reject(t.error):Promise.resolve();if(t.hasError)throw t.error}return a()}})(typeof SuppressedError==`function`?SuppressedError:function(e,t,n){var r=Error(n);return r.name=`SuppressedError`,r.error=e,r.suppressed=t,r});const jg=e=>async t=>{let n=e=>({type:`SqliteWasmCompileError`,cause:e}),r=await Je(async()=>{if(e instanceof WebAssembly.Module)return e;if(e instanceof ArrayBuffer||ArrayBuffer.isView(e))return WebAssembly.compile(e);let t=await e;if(!t.ok)throw TypeError(`Fetching the SQLite wasm failed with HTTP status ${t.status}.`);return t.headers.get(`Content-Type`)===`application/wasm`?WebAssembly.compileStreaming(t):WebAssembly.compile(await t.arrayBuffer())},n);if(!r.ok)return r;let i=r.value,a=WebAssembly.Module.imports(i).filter(e=>!Object.hasOwn(zg,e.module)||!Object.hasOwn(zg[e.module],e.name)).map(e=>`${e.module}.${e.name}`);if(ce(a))return B({type:`SqliteWasmUnknownImport`,imports:a});let o=qe(()=>new WebAssembly.Memory({initial:Fg,maximum:Ig}),n);if(!o.ok)return o;let s=o.value,c=new Uint8Array(s.buffer),l=new DataView(s.buffer),u=()=>(c.buffer!==s.buffer&&(c=new Uint8Array(s.buffer)),c),d=()=>(l.buffer!==s.buffer&&(l=new DataView(s.buffer)),l),f=null,p=()=>f!=null,m=()=>{if(f)throw Error(`The SQLite wasm instance is broken: an exception escaped a wasm call.`,{cause:f.error})},h={...t.deps,memory:s,getHeapU8:u,getHeapDataView:d,isBroken:p,refuseIfBroken:m},g=y(zg,e=>y(e,e=>e(h))),_=await Je(async()=>{let e=await WebAssembly.instantiate(i,g);return Pg(e,`emscripten_stack_init`),Pg(e,`__set_stack_limits`,Pg(e,`emscripten_stack_get_base`),Pg(e,`emscripten_stack_get_end`)),Pg(e,`__wasm_call_ctors`),e},n);if(!_.ok)return _;let v=_.value,b=Pg(v,`sqlite3__wasm_enum_json`),ee=u(),x=ct(b===0?Uint8Array.of(0):ee.subarray(b,ee.indexOf(0,b)+1)),S=new TextEncoder;for(let e of WebAssembly.Module.exports(i).map(e=>e.name).toSorted())x=ct(S.encode(`${e}\0`),x);if(x!==942866108)return B({type:`SqliteWasmBuildMismatch`,expectedHash:942866108,actualHash:x});let C=v.exports,w=C.sqlite3_initialize();if(w!==0)return B({type:`SqliteWasmInitializeError`,code:w});let T={exports:C,functionTable:v.exports.__indirect_function_table,getHeapU8:u,getHeapDataView:d,call:e=>{m();try{return e()}catch(e){throw f??={error:e},e}},isBroken:p},E=S.encode(`${Ng}\0`),D=bg({sqliteWasm:T})(Oh.sizeof+E.length);if(!D.ok)return B({type:`SqliteWasmInitializeError`,code:7});let O=D.value,k=O+Oh.sizeof,{members:A}=Oh,j=[[`xAccess`,(e,t,n,r)=>(d().setInt32(r,0,!0),0)],[`xDelete`,()=>5898],[`xFullPathname`,()=>14],[`xRandomness`,(e,n,r)=>{for(let e=0;e<n;e+=65536){let i=t.deps.randomBytes.create(Math.min(65536,n-e));u().set(i,r+e)}return n}],[`xSleep`,()=>0],[`xGetLastError`,()=>0],[`xCurrentTime`,(e,t)=>(d().setFloat64(t,h.time.now()/864e5+2440587.5,!0),0)],[`xCurrentTimeInt64`,(e,t)=>(d().setBigInt64(t,BigInt(h.time.now())+210866760000000n,!0),0)]],M=qe(()=>Bg({...t.deps,sqliteWasm:T})(ue(j,([e,t])=>({signature:A[e].signature,fn:t}))),n);if(!M.ok)return M;let{pointers:N}=M.value;u().fill(0,O,k),u().set(E,k);let P=d();for(let[e,t]of[[`iVersion`,2],[`szOsFile`,Ah.sizeof],[`mxPathname`,1024],[`zName`,k]])P.setInt32(O+A[e].offset,t,!0);for(let[[e],t]of de([j,N]))P.setInt32(O+A[e].offset,t,!0);let F=C.sqlite3_vfs_register(O,0);if(F!==0)return B({type:`SqliteWasmInitializeError`,code:F});let te=Mg({sqliteWasm:T})();return te.ok?z(T):te},Mg=e=>()=>e.sqliteWasm.call(()=>{let{exports:t}=e.sqliteWasm,n=t.sqlite3_initialize();if(n!==0)return B({type:`SqliteWasmInitializeError`,code:n});let r=xg(e)(`${Ng}\0kvvfs`);if(!r.ok)return B({type:`SqliteWasmInitializeError`,code:7});let i=t.sqlite3_vfs_find(r.value),a=t.sqlite3_vfs_find(r.value+Ng.length+1);if(t.sqlite3_free(r.value),i===0)return B({type:`SqliteWasmInitializeError`,code:21});a!==0&&t.sqlite3_vfs_unregister(a);let o=t.sqlite3_vfs_register(i,1);return o===0?(t.sqlite3_randomness(0,0),z()):B({type:`SqliteWasmInitializeError`,code:o})}),Ng=`evolu-memory`,Pg=(e,t,...n)=>{let r=e.exports[t];return typeof r==`function`?r(...n):0},Fg=256,Ig=32768,Lg=()=>-52,Rg=(e,t)=>{try{e(t)}catch(e){io(AggregateError([t,e],`ReportDefect failed while reporting a defect`))}},zg={env:{__handle_stack_overflow:()=>()=>{throw new WebAssembly.RuntimeError(`SQLite's C stack overflowed.`)},__syscall_chmod:()=>Lg,__syscall_faccessat:()=>Lg,__syscall_fchmod:()=>Lg,__syscall_fchown32:()=>Lg,__syscall_fcntl64:()=>Lg,__syscall_fstat64:()=>Lg,__syscall_ftruncate64:()=>Lg,__syscall_getcwd:()=>Lg,__syscall_ioctl:()=>Lg,__syscall_lstat64:()=>Lg,__syscall_mkdirat:()=>Lg,__syscall_newfstatat:()=>Lg,__syscall_openat:()=>Lg,__syscall_readlinkat:()=>Lg,__syscall_rmdir:()=>Lg,__syscall_stat64:()=>Lg,__syscall_unlinkat:()=>Lg,__syscall_utimensat:()=>Lg,_localtime_js:({getHeapDataView:e})=>(t,n)=>{let r=/* @__PURE__ */ new Date(Number(t)*1e3);if(Number.isNaN(r.getTime()))return 1;let i=e();for(let[e,t]of[r.getSeconds(),r.getMinutes(),r.getHours(),r.getDate(),r.getMonth(),r.getFullYear()-1900,0,0,0,0].entries())i.setInt32(n+e*4,t,!0);return 0},_tzset_js:()=>()=>{},emscripten_date_now:({time:e})=>()=>e.now(),emscripten_get_now:({time:e})=>()=>e.performance.now(),emscripten_resize_heap:({memory:e})=>t=>{try{return e.grow(Math.ceil(((t>>>0)-e.buffer.byteLength)/65536)),1}catch{return 0}},memory:({memory:e})=>e},wasi_snapshot_preview1:{clock_time_get:({time:e,getHeapDataView:t})=>(n,r,i)=>{if(n<0||n>3)return 28;let a=n===0?e.now():e.performance.now();return t().setBigInt64(i,BigInt(Math.round(a*1e3))*1000n,!0),0},environ_get:()=>()=>0,environ_sizes_get:({getHeapDataView:e})=>(t,n)=>{let r=e();return r.setUint32(t,0,!0),r.setUint32(n,0,!0),0},fd_close:()=>()=>52,fd_fdstat_get:()=>()=>52,fd_read:()=>()=>52,fd_seek:()=>()=>52,fd_sync:()=>()=>52,fd_write:({console:e,getHeapU8:t,getHeapDataView:n})=>{let r=new Map([e.log,e.error].map((e,t)=>[t+1,{write:e,decoder:new TextDecoder,line:``}]));return(e,i,a,o)=>{let s=r.get(e);if(s==null)return 8;let c=n(),l=0;for(let e=0;e<a;e++){let n=c.getUint32(i+e*8,!0),r=c.getUint32(i+e*8+4,!0);s.line+=s.decoder.decode(t().subarray(n,n+r),{stream:!0}),l+=r}let u=s.line.split(`
`);s.line=u.pop();for(let e of u)s.write(e);return n().setUint32(o,l,!0),0}},random_get:({randomBytes:e,reportDefect:t,getHeapU8:n,isBroken:r,refuseIfBroken:i})=>(a,o)=>{try{let t=e.create(o);return i(),n().set(t,a),0}catch(e){if(e instanceof WebAssembly.RuntimeError||r())throw e;return Rg(t,e),i(),29}}}},Bg=e=>t=>{let n={stack:[],error:void 0,hasError:!1};try{let r=e.sqliteWasm.functionTable,i=Vg.get(r)??[];Vg.set(r,i);let a=t.map(({signature:e})=>{let t=/^([iv])\(([ipsjd]*)\)$/u.exec(e);if(t==null)throw Error(`Invalid wasm function signature: ${e}`);let[,n,r]=t;return[96,...Yg(Array.from(r,e=>[qg[e]])),...Yg(n===`v`?[]:[[qg.i]])]}),o=t.map((e,t)=>Xg(String(t))),s=new WebAssembly.Module(Uint8Array.from([...Hg,...Zg(Ug,a),...Zg(Wg,o.map((e,t)=>[...Xg(``),...e,Kg,...Jg(t)])),...Zg(Gg,o.map((e,t)=>[...e,Kg,...Jg(t)]))])),c=t.map(({signature:t,fn:n})=>{let r=n,i=t.startsWith(`i`),a=i?1:void 0;return(...t)=>{try{let n=r(...t);if(e.sqliteWasm.isBroken()&&e.sqliteWasm.call(ae),!i)return;if(n===void 0||typeof n==`number`)return n;throw TypeError(`A wasm function with an int result returned a ${typeof n}`)}catch(t){if(t instanceof WebAssembly.RuntimeError||e.sqliteWasm.isBroken())throw t;return Rg(e.reportDefect,t),e.sqliteWasm.isBroken()&&e.sqliteWasm.call(ae),a}}}),{exports:l}=new WebAssembly.Instance(s,{"":Object.fromEntries(c.entries())}),u=ue(t,(e,t)=>{let n=i.pop()??r.grow(1);return r.set(n,l[t]),n}),d=kg(n,new DisposableStack,!1);return d.defer(()=>{for(let e of u)r.set(e,null),i.push(e)}),ne({pointers:u},d)}catch(e){n.error=e,n.hasError=!0}finally{Ag(n)}},Vg=/*#__PURE__*/ new WeakMap,Hg=[0,97,115,109,1,0,0,0],Ug=1,Wg=2,Gg=7,Kg=0,qg={i:127,p:127,s:127,j:126,d:124},Jg=e=>{let t=[];do{let n=e&127;e>>>=7,t.push(e===0?n:n|128)}while(e!==0);return t},Yg=e=>[...Jg(e.length),...e.flat()],Xg=e=>Yg(Array.from(e,e=>[e.charCodeAt(0)])),Zg=(e,t)=>{let n=Yg(t);return[e,...Jg(n.length),...n]};var Qg=function(e,t,n){if(t!=null){if(typeof t!=`object`&&typeof t!=`function`)throw TypeError(`Object expected.`);var r,i;if(n){if(!Symbol.asyncDispose)throw TypeError(`Symbol.asyncDispose is not defined.`);r=t[Symbol.asyncDispose]}if(r===void 0){if(!Symbol.dispose)throw TypeError(`Symbol.dispose is not defined.`);r=t[Symbol.dispose],n&&(i=r)}if(typeof r!=`function`)throw TypeError(`Object not disposable.`);i&&(r=function(){try{i.call(this)}catch(e){return Promise.reject(e)}}),e.stack.push({value:t,dispose:r,async:n})}else n&&e.stack.push({async:!0});return t},$g=(function(e){return function(t){function n(n){t.error=t.hasError?new e(n,t.error,`An error was suppressed during disposal.`):n,t.hasError=!0}var r,i=0;function a(){for(;r=t.stack.pop();)try{if(!r.async&&i===1)return i=0,t.stack.push(r),Promise.resolve().then(a);if(r.dispose){var e=r.dispose.call(r.value);if(r.async)return i|=2,Promise.resolve(e).then(a,function(e){return n(e),a()})}else i|=1}catch(e){n(e)}if(i===1)return t.hasError?Promise.reject(t.error):Promise.resolve();if(t.hasError)throw t.error}return a()}})(typeof SuppressedError==`function`?SuppressedError:function(e,t,n){var r=Error(n);return r.name=`SuppressedError`,r.error=e,r.suppressed=t,r});const e_=({directory:e,heldTimeout:t})=>async n=>{let r={stack:[],error:void 0,hasError:!1};try{let{opfsRoot:i,random:a,sqliteWasm:o,time:s}=n.deps,c=`opfs-sahpool:${e.join(`/`)}`,l=c_.get(o.functionTable)??/* @__PURE__ */ new Set;if(c_.set(o.functionTable,l),l.has(c))return B({type:`SahPoolAlreadyOpenError`,directory:e});l.add(c);let u=Qg(r,new DisposableStack,!1);u.defer(()=>{l.delete(c)});let d=e=>({type:`SahPoolSetupError`,cause:e}),f=s.performance.now(),p=[];u.defer(()=>{for(let e of p)e.handle.close()});let m;for(let r=50;;r=Math.min(r*2,1e3)){let a=await Je(async()=>{let t=await i.getDirectory();for(let n of e)t=await t.getDirectoryHandle(n,{create:!0});t=await t.getDirectoryHandle(i_,{create:!0});let n=[];for await(let e of t.values())e.kind===`file`&&n.push(e);return{opaque:t,files:n}},d);if(!a.ok)return a;let{files:o}=a.value,c=await Promise.allSettled(o.map(async e=>e.createSyncAccessHandle())),l=[];for(let[e,t]of de([o,c]))t.status===`fulfilled`?p.push({fileName:e.name,handle:t.value}):l.push({fileName:e.name,cause:t.reason});if(!ce(l)){m=a.value.opaque;break}let u=l.find(({cause:e})=>h_(e));if(u==null)return B(d(l[0].cause));if(t==null||Pi(f,s.performance.now())>=Fi(t))return B({type:`SahPoolHeldError`,...u});for(let e of p.splice(0))e.handle.close();await n.ok(ho(r))}let h=/* @__PURE__ */ new Map,g=/* @__PURE__ */ new Set,_=/* @__PURE__ */ new Map,v=await Je(async()=>{let e=[];for(let t of p){let n=/* @__PURE__ */ new Uint8Array(524),r=t.handle.getSize(),i=t.handle.read(n,{at:0}),a=Math.min(n.length,r);if(i<a)return B({type:`SahPoolShortHeaderRead`,requested:a,read:i});e.push({slot:t,size:r,header:n})}for(let{slot:t,size:n,header:r}of e){let e=new DataView(r.buffer).getUint32(512),i=r.subarray(0,516),a=a_(i,e),o=new Uint32Array(r.buffer,516,2),s=i.indexOf(0);if(!(s>0&&n>4096&&!(e&8))&&(s!==0&&(e&8||(e&r_)===0)||o[0]!==a[0]||o[1]!==a[1])){let e=d_(t.handle,``,0);if(!e.ok)return e;t.handle.flush(),t.handle.truncate(t_)}else if(s===0)t.handle.truncate(t_),g.add(t);else{let e=s_.decode(i.subarray(0,s)),n=h.get(e);n!=null&&_.set(n,e),h.set(e,t)}}for(;p.length<6;){let e=p_(a),t=await(await m.getFileHandle(e,{create:!0})).createSyncAccessHandle();p.push({fileName:e,handle:t}),t.truncate(t_)}return z()},B),y=v.ok?v.value:v.error;if(!y.ok)return B(d(y.error));let b=/* @__PURE__ */ new Map,ee=/* @__PURE__ */ new Map,x=null,S=e=>{let t=b.get(e);return A(t!=null,`The file is not open.`),t},C=(e,t,n)=>{x??={type:`SqliteVfsFailure`,method:e,path:t,error:n}},w=(e,t,n,r)=>{try{return r(t.slot.handle)}catch(r){return C(e,t.path,r),n}},T=l_.get(o.functionTable)??/* @__PURE__ */ new Map;l_.set(o.functionTable,T);let E=T.get(c);if(E==null){let e=u_(n.deps,c);if(!e.ok)return B(d(e.error));E=e.value,T.set(c,E)}let{ioMethods:D}=E,O=()=>{for(let e of g){let t=qe(()=>e.handle.flush(),e=>e);if(!t.ok)return t;g.delete(e)}return z()},k=e=>{let t=h.get(e);if(t==null)return z(!1);let n=[..._].filter(([,t])=>t===e).map(([e])=>e);n.push(t);for(let e of n){let t=O();if(!t.ok)return t;let n=d_(e.handle,``,0);if(!(n.ok||v_(n.error)&&n.error.written>0&&n.error.written<n.error.requested))return n;qe(()=>e.handle.flush(),e=>e).ok||g.add(e),_.delete(e),qe(()=>e.handle.truncate(t_),e=>e)}return h.delete(e),z(!0)},j=(e,t)=>{let n=S(e);if(n.lock<=t)return;let r=ee.get(n.path);A(r!=null,`The path is not locked.`);let i=t===0?r.shared-1:r.shared;i===0?ee.delete(n.path):ee.set(n.path,{level:n.lock>1?1:r.level,shared:i}),b.set(e,{...n,lock:t})},M=e=>y_(Cg({sqliteWasm:o})(e));E.setMethods({xOpen:(e,t,n,r,i)=>{let a=Cg({sqliteWasm:o})(t),s=y_(a);if(!s.ok)return C(`xOpen`,null,s.error),14;let c=s.value,l=()=>(C(`xOpen`,c,{type:`SahPoolInvalidPath`,name:a}),14);if(r&256&&o_.encode(c).length>498)return l();let u=h.get(c);if(u!=null&&(r&20)==20)return 14;if(u==null&&r&4){if(!f_(c))return l();let e=/* @__PURE__ */ new Set([...h.values(),..._.keys()]);if(u=p.find(t=>!e.has(t)),u==null)return C(`xOpen`,c,{type:`SahPoolFull`,capacity:p.length}),14;let{handle:t}=u,n=qe(()=>{t.getSize()>4096&&t.truncate(t_)},e=>e);if(!n.ok)return C(`xOpen`,c,n.error),__(n.error)?13:14;g.add(u);let i=O();if(!i.ok)return C(`xOpen`,c,i.error),Th;let a=d_(u.handle,c,r|n_);if(!a.ok)return C(`xOpen`,c,a.error),__(a.error)?13:14;h.set(c,u)}if(u==null)return 14;b.set(n,{path:c,slot:u,lock:0});let d=o.getHeapDataView();return d.setInt32(n+Ah.members.pMethods.offset,D,!0),i!==0&&d.setInt32(i,r,!0),0},xDelete:(e,t,n)=>{let r=M(t);if(!r.ok)return C(`xDelete`,null,r.error),Dh;let i=k(r.value);if(!i.ok)return C(`xDelete`,r.value,i.error),Dh;if(n===0)return 0;let a=O();return a.ok?0:(C(`xDelete`,r.value,a.error),1290)},xAccess:(e,t,n,r)=>{let i=M(t);return o.getHeapDataView().setInt32(r,i.ok&&h.has(i.value)?1:0,!0),0},xClose:e=>(j(e,0),b.delete(e),0),xRead:(e,t,n,r)=>{let i=S(e);return w(`xRead`,i,266,e=>{let a=o.getHeapU8().subarray(t,t+n),s=t_+Number(r),c=e.read(a,{at:s});if(c===n)return 0;a.fill(0,c);let l=e.getSize();return s+c>=l?522:(C(`xRead`,i.path,{type:`SqliteShortRead`,requested:Math.min(n,l-s),read:c}),266)})},xWrite:(e,t,n,r)=>{let i=S(e),a=g_(i.slot.handle,o.getHeapU8().subarray(t,t+n),t_+Number(r));return a.ok?0:(C(`xWrite`,i.path,a.error),__(a.error)?13:778)},xTruncate:(e,t)=>{let n=S(e),r=O();return r.ok?w(`xTruncate`,n,Eh,e=>(e.truncate(t_+Number(t)),0)):(C(`xTruncate`,n.path,r.error),Eh)},xSync:e=>w(`xSync`,S(e),Th,e=>(e.flush(),0)),xFileSize:(e,t)=>w(`xFileSize`,S(e),1802,e=>{let n=e.getSize()-t_;return o.getHeapDataView().setBigInt64(t,BigInt(n),!0),0}),xLock:(e,t)=>{let n=S(e);if(n.lock>=t)return 0;let r=ee.get(n.path)??{level:0,shared:0};return n.lock!==r.level&&(r.level>=3||t>1)?5:t===4&&r.shared>1?(n.lock===2&&(ee.set(n.path,{...r,level:3}),b.set(e,{...n,lock:3})),5):(ee.set(n.path,t===1?{level:r.level===0?t:r.level,shared:r.shared+1}:{...r,level:t}),b.set(e,{...n,lock:t}),0)},xUnlock:(e,t)=>(j(e,t),0),xCheckReservedLock:(e,t)=>{let n=ee.get(S(e).path);return o.getHeapDataView().setInt32(t,+(n!=null&&n.level>1),!0),0}}),u.defer(()=>{E.setMethods(null)});let N=ne({vfsName:c,getPaths:()=>[...h.keys()],read:(e,t,n)=>{let r=h.get(e);if(r==null)return B({type:`SahPoolFileNotFound`,path:e});let i=new Uint8Array(n),a=t_+t,o=e=>({type:`SqliteVfsIoError`,cause:e}),s=qe(()=>r.handle.read(i,{at:a}),o);if(!s.ok)return s;if(s.value===n)return z(i);let c=qe(()=>r.handle.getSize(),o);return c.ok?a+s.value>=c.value?z(i.slice(0,s.value)):B(o({type:`SqliteShortRead`,requested:Math.min(n,c.value-a),read:s.value})):c},unlink:e=>{let t=[e,`${e}-journal`,`${e}-wal`];for(let n of b.values())if(t.includes(n.path))throw Error(`Cannot unlink ${e}, which is open.`);let n=!1;for(let[e,r]of t.entries()){let t=k(r);if(!t.ok)return B({type:`SqliteVfsIoError`,cause:t.error});e===0&&(n=t.value)}return z(n)},getFailure:()=>x,clearFailure:()=>{x=null}},u);return z({...N,[Symbol.dispose]:()=>{if(b.size>0&&!o.isBroken())throw Error(`Cannot dispose a SahPool with an open file, because closing its handle would corrupt SQLite's state.`);N[Symbol.dispose]()}})}catch(e){r.error=e,r.hasError=!0}finally{$g(r)}},t_=4096,n_=128,r_=542976,i_=`.opaque`,a_=(e,t)=>{if(!(t&128))return/* @__PURE__ */ new Uint32Array(2);let n=3735928559,r=1103547991;for(let t of e)n=Math.imul(n^t,2654435761),r=Math.imul(r^t,104729);return Uint32Array.of(n>>>0,r>>>0)},o_=/*#__PURE__*/ new TextEncoder,s_=/*#__PURE__*/ new TextDecoder(`utf-8`,{ignoreBOM:!0}),c_=/*#__PURE__*/ new WeakMap,l_=/*#__PURE__*/ new WeakMap,u_=(e,t)=>{let{randomBytes:n,sqliteWasm:r,time:i}=e,a=null,o=(e,t)=>(A(a!=null,`The pool is paused.`),a[e](...t)),s=e=>(...t)=>o(e,t),{members:c}=Oh,l=[[`xOpen`,(e,t,n,i,s)=>(r.getHeapDataView().setInt32(n+Ah.members.pMethods.offset,0,!0),a==null?14:o(`xOpen`,[e,t,n,i,s]))],[`xDelete`,(...e)=>a==null?Dh:o(`xDelete`,e)],[`xAccess`,(e,t,n,i)=>a==null?(r.getHeapDataView().setInt32(i,0,!0),0):o(`xAccess`,[e,t,n,i])],[`xFullPathname`,(e,t,n,i)=>{let a=r.getHeapU8(),o=a.indexOf(0,t)-t+1;return o>n?14:(a.copyWithin(i,t,t+o),0)}],[`xRandomness`,(e,t,i)=>{for(let e=0;e<t;e+=65536){let a=n.create(Math.min(65536,t-e));r.getHeapU8().set(a,i+e)}return t}],[`xSleep`,()=>0],[`xCurrentTime`,(e,t)=>(r.getHeapDataView().setFloat64(t,i.now()/864e5+2440587.5,!0),0)],[`xGetLastError`,()=>0],[`xCurrentTimeInt64`,(e,t)=>(r.getHeapDataView().setBigInt64(t,BigInt(i.now())+210866760000000n,!0),0)]],u=kh.members,d=[[`xClose`,s(`xClose`)],[`xRead`,s(`xRead`)],[`xWrite`,s(`xWrite`)],[`xTruncate`,s(`xTruncate`)],[`xSync`,s(`xSync`)],[`xFileSize`,s(`xFileSize`)],[`xLock`,s(`xLock`)],[`xUnlock`,s(`xUnlock`)],[`xCheckReservedLock`,s(`xCheckReservedLock`)],[`xFileControl`,()=>12],[`xSectorSize`,()=>4096],[`xDeviceCharacteristics`,()=>0]],f=o_.encode(`evolu-raw:${t}\0`),p=r.call(()=>bg(e)(Oh.sizeof+kh.sizeof+f.length));if(!p.ok)return p;let m=r.call(()=>xg(e)(t));if(!m.ok)return r.call(()=>{r.exports.sqlite3_free(p.value)}),m;let h=p.value,g=h+Oh.sizeof,_=g+kh.sizeof,v=Bg(e)([...ue(l,([e,t])=>({signature:c[e].signature,fn:t})),...ue(d,([e,t])=>({signature:u[e].signature,fn:t}))]);return r.call(()=>{let t=r.getHeapU8();t.fill(0,h,_),t.set(f,_);let n=r.getHeapDataView();for(let[e,t]of[[`iVersion`,2],[`szOsFile`,Ah.sizeof],[`mxPathname`,512],[`zName`,_]])n.setInt32(h+c[e].offset,t,!0);for(let[[e],t]of de([l,v.pointers.slice(0,l.length)]))n.setInt32(h+c[e].offset,t,!0);n.setInt32(g+u.iVersion.offset,1,!0);for(let[[e],t]of de([d,v.pointers.slice(l.length)]))n.setInt32(g+u[e].offset,t,!0);let i=r.exports.sqlite3_vfs_register(h,0),o=i===0?dg(e)(m.value,_):i;return i===0&&r.exports.sqlite3_vfs_unregister(h),r.exports.sqlite3_free(m.value),o===0?z({ioMethods:g,setMethods:e=>{a=e}}):(v[Symbol.dispose](),r.exports.sqlite3_free(p.value),B({type:`SqliteWasmInitializeError`,code:o}))})},d_=(e,t,n)=>{let r=/* @__PURE__ */ new Uint8Array(524);return o_.encodeInto(t,r.subarray(0,512)),new DataView(r.buffer).setUint32(512,n),r.set(new Uint8Array(a_(r.subarray(0,516),n).buffer),516),g_(e,r,0)},f_=e=>o_.encode(e).length<511,p_=e=>e.next().toString(36).slice(2),m_=(e,t)=>typeof e==`object`&&!!e&&`name`in e&&e.name===t,h_=e=>m_(e,`NoModificationAllowedError`)||m_(e,`InvalidStateError`),g_=(e,t,n)=>{let r=qe(()=>e.write(t,{at:n}),e=>e);return r.ok?r.value===t.length?z():B({type:`SqliteShortWrite`,requested:t.length,written:r.value}):r},__=e=>m_(e,`QuotaExceededError`)||v_(e),v_=e=>typeof e==`object`&&!!e&&`type`in e&&e.type===`SqliteShortWrite`,y_=e=>{let t=qe(()=>[new URL(e,`file://localhost/`).pathname,new URL(`${e}-journal`,`file://localhost/`).pathname],e=>e);if(!t.ok)return t;let[n,r]=t.value;return r===`${n}-journal`?z(n):B({type:`SahPoolInvalidPath`,name:e})};var b_=function(e,t,n){if(t!=null){if(typeof t!=`object`&&typeof t!=`function`)throw TypeError(`Object expected.`);var r,i;if(n){if(!Symbol.asyncDispose)throw TypeError(`Symbol.asyncDispose is not defined.`);r=t[Symbol.asyncDispose]}if(r===void 0){if(!Symbol.dispose)throw TypeError(`Symbol.dispose is not defined.`);r=t[Symbol.dispose],n&&(i=r)}if(typeof r!=`function`)throw TypeError(`Object not disposable.`);i&&(r=function(){try{i.call(this)}catch(e){return Promise.reject(e)}}),e.stack.push({value:t,dispose:r,async:n})}else n&&e.stack.push({async:!0});return t},x_=(function(e){return function(t){function n(n){t.error=t.hasError?new e(n,t.error,`An error was suppressed during disposal.`):n,t.hasError=!0}var r,i=0;function a(){for(;r=t.stack.pop();)try{if(!r.async&&i===1)return i=0,t.stack.push(r),Promise.resolve().then(a);if(r.dispose){var e=r.dispose.call(r.value);if(r.async)return i|=2,Promise.resolve(e).then(a,function(e){return n(e),a()})}else i|=1}catch(e){n(e)}if(i===1)return t.hasError?Promise.reject(t.error):Promise.resolve();if(t.hasError)throw t.error}return a()}})(typeof SuppressedError==`function`?SuppressedError:function(e,t,n){var r=Error(n);return r.name=`SuppressedError`,r.error=e,r.suppressed=t,r});const S_=e=>e&255,C_=/*#__PURE__*/ jn(`SqliteVfsPath`,gn,e=>{let t=qe(()=>new URL(e,`file://localhost/`).pathname,()=>null);return t.ok&&t.value===e&&e.length<=498?z():B({type:`SqliteVfsPath`,value:e})},e=>`The value ${V(e.value)} is not a valid SqliteVfsPath.`),w_=e=>t=>{let n={stack:[],error:void 0,hasError:!1};try{let{call:r}=e.sqliteWasm,i=t.type===`Memory`?null:t.vfs,a=0,o=e=>{a++;try{if(i==null)return r(e);let t=N_.get(i)??0;t===0&&i.clearFailure(),N_.set(i,t+1);try{return r(()=>(t===0&&F_(i),e()))}finally{N_.set(i,t)}}finally{a--}},s=b_(n,new DisposableStack,!1);return o(()=>{let n=ng(e),c=eg(e),l=Qh(e),u=$h(e),d=Zh(e),f=Xh(e),p=tg(e),m=Fh(e),g=rg(e),_=Nh(e),v=lg(e),y=ug(e),b=ig(e),ee=sg(e),x=ag(e),S=cg(e),C=og(e),w=Rh(e),T=Bh(e),E=Hh(e),D=Vh(e),O=zh(e),k=qh(e),A=jh(e),j=Ph(e),M=Wh(e),N=Kh(e),P=Lh(e),F=Uh(e),I=Gh(e),re=Jh(e),ie=Yh(e),oe=Ih(e),se=fg(e),ce=pg(e),le=mg(e),ue=hg(e),de=bg(e),fe=xg(e),pe=Tg(e),me=Cg(e),he=wg(e),ge=Eg(e),_e=Sg(e),ve=/* @__PURE__ */ new Set,ye=t=>{e.sqliteWasm.isBroken()||r(()=>A(t))},be=(e,t)=>{let n={stack:[],error:void 0,hasError:!1};try{return b_(n,new DisposableStack,!1).defer(()=>{ye(e)}),r(t)}catch(e){n.error=e,n.hasError=!0}finally{x_(n)}},xe=(e,t)=>{let n=O(e),r=S_(n)===1&&(t===`prepare`||t===`exec`||t===`step`)?E(e):-1;return{type:`SqliteError`,operation:t,extendedCode:n,message:me(T(e)),sqlOffset:r<0?null:r,cause:Oe(e)}},L=(e,t)=>({type:`SqliteError`,operation:e,extendedCode:t,message:me(D(t)),sqlOffset:null,cause:null}),Se=t=>e.sqliteWasm.getHeapDataView().getUint32(t,!0),Ce=Dg(e);if(!Ce.ok)return B(L(`open`,7));let we=Ce.value;s.defer(()=>{we[Symbol.dispose]()});let Te=we.out+4,Ee=null,De=t=>{let n=we.out+8;if(ce(t,n)!==0)return null;let r=e.sqliteWasm.getHeapDataView(),i=r.getInt32(n,!0);return i===1?{type:`SqlitePageAuthenticationError`,pageNumber:r.getUint32(n+4,!0)}:i===2?{type:`SqliteEncryptionUnsupported`}:i===3?{type:`SqliteRandomSourceError`}:null},Oe=e=>{if(i==null)return null;let t=De(e);return Ee??=t,i.getFailure()??(Ee==null?null:{type:`SqliteCodecFailure`,error:Ee})},ke=fe(t.type===`Memory`?`:memory:`:`${t.path}\0${t.vfs.vfsName}`);if(!ke.ok)return B(L(`open`,7));let Ae=ke.value,je;{let n={stack:[],error:void 0,hasError:!1};try{let i=b_(n,new DisposableStack,!1);if(t.type===`Memory`)je=be(Ae,()=>Mh(e)(Ae,we.out,33554438,0));else{i.defer(()=>{ye(Ae)});let n=0;if(t.type===`EncryptedFile`){let{key:a}=t,o=r(()=>de(a.length));if(!o.ok)return B(L(`open`,7));let s=o.value;i.defer(()=>{ye(s)}),i.defer(()=>{e.sqliteWasm.getHeapU8().fill(0,s,s+a.length)}),e.sqliteWasm.getHeapU8().set(a,s),n=s}let a=e.sqliteWasm.getHeapU8().indexOf(0,Ae)+1;je=r(()=>se(Ae,we.out,a,n,K_))}}catch(e){n.error=e,n.hasError=!0}finally{x_(n)}}let R=Se(we.out);if(je===0&&t.type===`Memory`&&(je=le(R)),je!==0){let e=R!==0&&O(R)===je?xe(R,`open`):{...L(`open`,je),cause:R===0?null:Oe(R)};return r(()=>_(R)),B(e)}if(s.defer(()=>{r(()=>{ue(R)}),r(()=>_(R))}),i!=null){let e=P_.get(i)??/* @__PURE__ */ new Set;P_.set(i,e);let t={drain:()=>{Ee=null,De(R)}};e.add(t),s.defer(()=>{e.delete(t)})}s.defer(()=>{if(!e.sqliteWasm.isBroken())for(let e of ve)e[Symbol.dispose]()});let Me=(t,n)=>{if(!M_(t))return B({type:`SqliteInvalidSqlText`});let r=t.length*3,i=de(r+1);if(!i.ok)return B(L(`prepare`,7));let a=i.value;return be(a,()=>{let i=_e(t,a,r);if(e.sqliteWasm.getHeapU8()[a+i]=0,M(R,a,i+1,n,we.out,Te)!==0)return B(xe(R,`prepare`));let o=Se(we.out);return o===0?B({type:`SqliteEmptySqlError`}):I_(e.sqliteWasm.getHeapU8(),Se(Te),a+i)?z(o):(k(o),B({type:`SqliteMultipleStatementsError`}))})},Ne=t=>{let a=f(t),o=null,s=0,_=e=>{if(e.length!==a)return B({type:`SqliteParameterCountError`,expected:a,actual:e.length});let r=!1,i=null;for(let[a,o]of e.entries()){let e=a+1,s;if(o===null)s=d(t,e);else if(typeof o==`number`)s=Og(o)?l(t,e,o):Number.isSafeInteger(o)?u(t,e,BigInt(o)):c(t,e,o);else if(typeof o==`string`&&o.length*3<=Y_){let n=we.reserve(o.length*3);if(!n.ok){i=L(`bind`,7);break}let r=_e(o,n.value,o.length*3);s=p(t,e,n.value,r,-1)}else if(typeof o==`string`){let n=qe(()=>X_.encode(o));if(!n.ok){i=L(`bind`,7);break}let a=de(n.value.length);if(!a.ok){i=L(`bind`,7);break}ge(a.value,n.value),r=!0,s=p(t,e,a.value,n.value.length,33)}else if(o.length<=Y_){let r=we.reserve(o.length);if(!r.ok){i=L(`bind`,7);break}ge(r.value,o),s=n(t,e,r.value,o.length,-1)}else{let a=de(o.length);if(!a.ok){i=L(`bind`,7);break}ge(a.value,o),r=!0,s=n(t,e,a.value,o.length,33)}if(s!==0){i=xe(R,`bind`);break}}return i?(r&&g(t),B(i)):z(r)},T=e=>{let n=0,r;steps:for(;(r=I(t))===100;){let r=n===0?ie(t,5,0):s;if(o==null||r!==s){let e=[];for(let n=0;n<b(t);n++){let r=x(t,n);if(r===0)break steps;e.push(me(r))}o=e,s=r}let i=Object.create(h);for(let[e,n]of o.entries()){let r=C(t,e);switch(r){case 1:case 2:i[n]=ee(t,e);break;case 3:{let r=S(t,e);if(r===0)break steps;let a=j_(he,r,y(t,e));if(a==null)break steps;i[n]=a;break}case 4:{let r=v(t,e);if(r!==0){let a=j_(pe,r,y(t,e));if(a==null)break steps;i[n]=a}else if(w(R)===7)break steps;else i[n]=/* @__PURE__ */ new Uint8Array;break}case 5:i[n]=null;break;default:te(r)}}if(n++,!e(i))return null}return r===101?null:r===100?L(`step`,7):xe(R,`step`)},E=e=>{let n=N(t)===0?null:xe(R,`step`);return e&&g(t),n};return{parameterCount:a,run:e=>{let n=_(e);if(!n.ok)return n;let r=oe(R),i=[],a=T(e=>(i.push(e),!0));return E(n.value),a?B(a):z({rows:i,changes:oe(R)===r||re(t)!==0?0:Number(m(R))})},iterate:(t,n)=>{let a=_(t);if(!a.ok)return{type:`Settled`,result:B(a.error)};let o=null,s=T(t=>{try{let a;if(i==null)a=n(t);else{let e=N_.get(i);N_.set(i,e-1);try{a=n(t),e===1&&(i.clearFailure(),r(()=>{F_(i)}))}finally{N_.set(i,e)}}return e.sqliteWasm.isBroken()&&e.sqliteWasm.call(ae),a}catch(t){if(e.sqliteWasm.isBroken())throw t;return o={error:t},!1}}),c=E(a.value);if(o)return{type:`Thrown`,error:o.error};let l=s??c;return{type:`Settled`,result:l?B(l):z()}}}},Pe=e=>{if(e.type===`Thrown`)throw e.error;return e.result},Fe=ne({prepare:e=>o(()=>{let t={stack:[],error:void 0,hasError:!1};try{let n=Me(e,1);if(!n.ok)return n;let i=n.value,a=Ne(i),s=!1,c=b_(t,new DisposableStack,!1);c.defer(()=>{ve.delete(l),r(()=>k(i))});let l=ne({parameterCount:a.parameterCount,run:e=>{if(s)throw Error(A_);s=!0;try{return o(()=>a.run(e))}finally{s=!1}},iterate:(e,t)=>{if(s)throw Error(A_);s=!0;try{return Pe(o(()=>a.iterate(e,t)))}finally{s=!1}}},c),u=l[Symbol.dispose];return l[Symbol.dispose]=()=>{if(s)throw Error(A_);u()},ve.add(l),z(l)}catch(e){t.error=e,t.hasError=!0}finally{x_(t)}}),run:(e,t)=>o(()=>{let n=Me(e,0);if(!n.ok)return n;let r=Ne(n.value).run(t);return k(n.value),r}),iterate:(e,t,n)=>{let r=o(()=>{let r=Me(e,0);if(!r.ok)return{type:`Settled`,result:B(r.error)};let i=Ne(r.value).iterate(t,n);return k(r.value),i});return Pe(r)},exec:t=>o(()=>{if(!M_(t))return B({type:`SqliteInvalidSqlText`});let n=qe(()=>X_.encode(t));if(!n.ok)return B(L(`exec`,7));let r=de(n.value.length+1);if(!r.ok)return B(L(`exec`,7));let i=r.value;return be(i,()=>{ge(i,n.value);let t=i+n.value.length+1;e.sqliteWasm.getHeapU8()[t-1]=0;let r=e=>{let t=xe(R,`exec`);return t.sqlOffset==null?t:{...t,sqlOffset:e-i+t.sqlOffset}};for(let e=i;e<t-1;){if(M(R,e,t-e,0,we.out,Te)!==0)return B(r(e));let n=Se(we.out),i=e;if(e=Se(Te),n===0)continue;let a=f(n);if(a!==0)return k(n),B({type:`SqliteParameterCountError`,expected:a,actual:0});let o;for(;(o=I(n))===100;);let s=o===101?null:r(i);if(k(n),s)return B(s)}return z()})}),export:()=>o(()=>{let t=de(8);if(!t.ok)return B(L(`export`,7));let n=t.value;return be(n,()=>{F(R,0,0);let t=P(R,0,n,0),r=e.sqliteWasm.getHeapDataView().getBigInt64(n,!0);if(t===0)return w(R)===0?r===0n?z(/* @__PURE__ */ new Uint8Array):B(L(`export`,7)):B(xe(R,`export`));let i=j_(pe,t,Number(r));A(t);let a=Oe(R);return a==null?i==null?B(L(`export`,7)):z(i):B({...L(`export`,a.type===`SqliteCodecFailure`&&a.error.type===`SqlitePageAuthenticationError`?11:10),cause:a})})}),isAutocommit:()=>r(()=>j(R)!==0)},s),Ie=Fe[Symbol.dispose];return Fe[Symbol.dispose]=()=>{if(a>0)throw Error(`A SqliteDatabase cannot be disposed while one of its operations runs.`);Ie()},z(Fe)})}catch(e){n.error=e,n.hasError=!0}finally{x_(n)}},T_=e=>async t=>{let{vfs:n,path:r}=e,i=w_(t.deps),a=i(e);if(a.ok)return z({database:a.value,keyDerivation:`Raw`});if(!D_(a.error,e))return B(a.error);let o=n.read(r,0,q_);if(!o.ok)return A(o.error.type===`SqliteVfsIoError`,`The pool has the file the raw key failed to open.`),B(o.error);if(o.value.length<q_)return B(a.error);let s=[o.value],c=(e,t)=>{let i=n.read(`${r}-journal`,e,t);return i.ok?z(i.value.length===t?i.value:null):i.error.type===`SahPoolFileNotFound`?z(null):B(i.error)},l=e=>new DataView(e.buffer,e.byteOffset,e.byteLength);walk:{let e=c(0,28);if(!e.ok)return e;if(e.value==null)break walk;let t=l(e.value),n=t.getUint32(20),r=t.getUint32(24);if(t.getUint32(16)===0||!O_(n,32,65536)||!O_(r,512,65536))break walk;let i=Math.floor(1073741824/r)+1,a=r+8,u=0,d=0;for(;;){for(;d===0;){u=Math.ceil(u/n)*n;let e=c(u,n);if(!e.ok)return e;if(e.value==null||!O(e.value.subarray(0,8),J_))break walk;u+=n;let t=l(e.value).getUint32(8);d=t===4294967295?1/0:t}let e=c(u,a);if(!e.ok)return e;if(e.value==null)break walk;let t=l(e.value).getUint32(0);if(u+=a,d--,t===0||t===i)break walk;if(t===1){let t=e.value.slice(4,4+q_);O(t,o.value)||s.push(t);break walk}}}for(let n of s){let r=await t.ok(E_(e.key,n)),a;try{a=i({...e,key:r})}finally{r.fill(0)}if(a.ok)return z({database:a.value,keyDerivation:`Legacy224`});if(!D_(a.error,e))return B(a.error)}return B(a.error)},E_=(e,t)=>async n=>{let{subtleCrypto:r}=n.deps,i=new Uint8Array(2*e.length+3).fill(39);i[0]=120;for(let[t,n]of e.entries())i[2+2*t]=k_(n>>4),i[3+2*t]=k_(n&15);let a;try{a=await r.importKey(`raw`,i,`PBKDF2`,!1,[`deriveBits`])}finally{i.fill(0)}let o=await r.deriveBits({name:`PBKDF2`,hash:`SHA-512`,salt:new Uint8Array(t),iterations:256e3},a,256);return z(new Uint8Array(o))},D_=(e,{vfs:t,path:n})=>e.cause?.type===`SqliteCodecFailure`&&e.cause.error.type===`SqlitePageAuthenticationError`&&(e.cause.error.pageNumber===1||t.getPaths().includes(`${n}-journal`)),O_=(e,t,n)=>e>=t&&e<=n&&!(e&e-1),k_=e=>e<10?48+e:87+e,A_=`A SqliteStatement cannot run or be disposed while it runs.`,j_=(e,t,n)=>{try{return e(t,n)}catch{return null}},M_=e=>!e.includes(`\0`)&&e.isWellFormed(),N_=/*#__PURE__*/ new WeakMap,P_=/*#__PURE__*/ new WeakMap,F_=e=>{for(let t of P_.get(e)??[])t.drain()},I_=(e,t,n)=>{let r=t;for(;r<n;)switch(e[r]){case G_:r++;break;case V_:case L_:case R_:case z_:case B_:for(r++;r<n&&(e[r]===V_||e[r]>=L_&&e[r]<=B_);)r++;break;case 239:if(r+2>=n||e[r+1]!==187||e[r+2]!==191)return!1;r+=3;break;case U_:if(r+1===n||e[r+1]!==U_)return!1;for(r+=2;r<n&&e[r]!==R_;)r++;break;case W_:{if(r+2>=n||e[r+1]!==H_)return!1;let t=r+2;for(;t+1<n&&(e[t]!==H_||e[t+1]!==W_);)t++;r=t+1<n?t+2:n;break}default:return!1}return!0},L_=9,R_=10,z_=12,B_=13,V_=32,H_=42,U_=45,W_=47,G_=59,K_=2,q_=16,J_=/*#__PURE__*/ Uint8Array.of(217,213,5,249,32,161,99,215),Y_=65536,X_=/*#__PURE__*/ new TextEncoder,Z_=/*#__PURE__*/ new URL(`./sqlite3.wasm`,import.meta.url);var Q_=function(e,t,n){if(t!=null){if(typeof t!=`object`&&typeof t!=`function`)throw TypeError(`Object expected.`);var r,i;if(n){if(!Symbol.asyncDispose)throw TypeError(`Symbol.asyncDispose is not defined.`);r=t[Symbol.asyncDispose]}if(r===void 0){if(!Symbol.dispose)throw TypeError(`Symbol.dispose is not defined.`);r=t[Symbol.dispose],n&&(i=r)}if(typeof r!=`function`)throw TypeError(`Object not disposable.`);i&&(r=function(){try{i.call(this)}catch(e){return Promise.reject(e)}}),e.stack.push({value:t,dispose:r,async:n})}else n&&e.stack.push({async:!0});return t},$_=(function(e){return function(t){function n(n){t.error=t.hasError?new e(n,t.error,`An error was suppressed during disposal.`):n,t.hasError=!0}var r,i=0;function a(){for(;r=t.stack.pop();)try{if(!r.async&&i===1)return i=0,t.stack.push(r),Promise.resolve().then(a);if(r.dispose){var e=r.dispose.call(r.value);if(r.async)return i|=2,Promise.resolve(e).then(a,function(e){return n(e),a()})}else i|=1}catch(e){n(e)}if(i===1)return t.hasError?Promise.reject(t.error):Promise.resolve();if(t.hasError)throw t.error}return a()}})(typeof SuppressedError==`function`?SuppressedError:function(e,t,n){var r=Error(n);return r.name=`SuppressedError`,r.error=e,r.suppressed=t,r});const ev=e=>e(jg(e.deps.nativeFetch(Z_)),e.deps),tv=e=>(t,n)=>async r=>{let i={stack:[],error:void 0,hasError:!1};try{let a=av(await e.sqliteWasmLoad),o={...e,sqliteWasm:a},s=!1,c=Q_(i,new DisposableStack,!1),l=async()=>{let e=c.use(av(await r(rv(t),o)));return c.defer(()=>{s&&av(e.unlink(iv))}),e},u;switch(n?.mode){case`memory`:u=c.use(av(w_(o)({type:`Memory`})));break;case`encrypted`:{let e=av(await r(T_({type:`EncryptedFile`,vfs:await l(),path:iv,key:n.encryptionKey}),o));u=c.use(e.database);break}case void 0:u=c.use(av(w_(o)({type:`File`,vfs:await l(),path:iv})));break;default:te(n)}let d=c.move();return z({exec:e=>av(u.run(e.sql,e.parameters)),prepare:e=>{let t={stack:[],error:void 0,hasError:!1};try{let n=Q_(t,new DisposableStack,!1),r=n.use(av(u.prepare(e)));return ne({exec:e=>av(r.run(e))},n)}catch(e){t.error=e,t.hasError=!0}finally{$_(t)}},iterate:(e,t)=>{av(u.iterate(e.sql,e.parameters,t))},export:()=>av(u.export()),deleteDatabase:()=>{s=!0,d.dispose()},[Symbol.dispose]:()=>{d.dispose()}})}catch(e){i.error=e,i.hasError=!0}finally{$_(i)}},nv=e=>t=>async n=>{let r={stack:[],error:void 0,hasError:!1};try{let i=av(await e.sqliteWasmLoad),a=await n(rv(t,{heldTimeout:`10s`}),{...e,sqliteWasm:i});return!a.ok&&a.error.type===`SahPoolHeldError`?B({type:`DatabaseHeldError`,name:t}):(Q_(r,av(a),!1),z())}catch(e){r.error=e,r.hasError=!0}finally{$_(r)}},rv=(e,t)=>e_({...t,directory:[`.${e}`]}),iv=/*#__PURE__*/ C_.orThrow(`/evolu1.db`),av=e=>{if(e.ok)return e.value;let{error:t}=e;throw Error(`message`in t&&typeof t.message==`string`?t.message:t.type,{cause:t})};function ov(e){let t=e=>{reportError(vo(e))};return oo(e===void 0?{reportDefect:t}:{reportDefect:t,...e})}var sv=function(e,t,n){if(t!=null){if(typeof t!=`object`&&typeof t!=`function`)throw TypeError(`Object expected.`);var r,i;if(n){if(!Symbol.asyncDispose)throw TypeError(`Symbol.asyncDispose is not defined.`);r=t[Symbol.asyncDispose]}if(r===void 0){if(!Symbol.dispose)throw TypeError(`Symbol.dispose is not defined.`);r=t[Symbol.dispose],n&&(i=r)}if(typeof r!=`function`)throw TypeError(`Object not disposable.`);i&&(r=function(){try{i.call(this)}catch(e){return Promise.reject(e)}}),e.stack.push({value:t,dispose:r,async:n})}else n&&e.stack.push({async:!0});return t},cv=(function(e){return function(t){function n(n){t.error=t.hasError?new e(n,t.error,`An error was suppressed during disposal.`):n,t.hasError=!0}var r,i=0;function a(){for(;r=t.stack.pop();)try{if(!r.async&&i===1)return i=0,t.stack.push(r),Promise.resolve().then(a);if(r.dispose){var e=r.dispose.call(r.value);if(r.async)return i|=2,Promise.resolve(e).then(a,function(e){return n(e),a()})}else i|=1}catch(e){n(e)}if(i===1)return t.hasError?Promise.reject(t.error):Promise.resolve();if(t.hasError)throw t.error}return a()}})(typeof SuppressedError==`function`?SuppressedError:function(e,t,n){var r=Error(n);return r.name=`SuppressedError`,r.error=e,r.suppressed=t,r});const lv=()=>{let e={stack:[],error:void 0,hasError:!1};try{let t=new globalThis.MessageChannel,n=sv(e,new DisposableStack,!1),r=n.use(mv(t.port1)),i=n.use(mv(t.port2)),a=n.move();return{port1:r,port2:i,[Symbol.dispose]:()=>a.dispose()}}catch(t){e.error=t,e.hasError=!0}finally{cv(e)}},uv=e=>mv(e),dv=e=>{let t={stack:[],error:void 0,hasError:!1};try{let n=new globalThis.BroadcastChannel(e),r=sv(t,new DisposableStack,!1),i=!1;r.defer(()=>{i=!0,n.onmessage=null,n.close()});let a=null;return ne({postMessage:e=>{n.postMessage(e)},get onMessage(){return i?null:a},set onMessage(e){i||(a=e,n.onmessage=e?t=>{e(t.data)}:null)}},r)}catch(e){t.error=e,t.hasError=!0}finally{cv(t)}},fv=e=>mv(e),pv=()=>{let e=Vi();return{console:Ri({output:e}),consoleStoreOutputEntry:e.entry,createBroadcastChannel:dv,createMessageChannel:lv,createMessagePort:uv}},mv=e=>{let t=null;return{postMessage:(t,n)=>{n==null?e.postMessage(t):e.postMessage(t,[...n])},get onMessage(){return t},set onMessage(n){t=n,e.onmessage=n?e=>{n(e.data)}:null},native:e,[Symbol.dispose]:()=>{e.onmessage=null,`terminate`in e?e.terminate():e.close()}}};e();const hv=ov({...pv(),lockManager:navigator.locks,randomBytes:oa()}),gv={opfsRoot:navigator.storage,sqliteWasmLoad:hv(ev),subtleCrypto:crypto.subtle};hv(lh(fv(self)),{...hv.deps,createSqliteDriver:tv(gv),waitForDatabaseRelease:nv(gv)}),self.postMessage(null);
