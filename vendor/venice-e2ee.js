// @ts-nocheck

// node_modules/@noble/secp256k1/index.js
var secp256k1_CURVE = {
  p: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn,
  n: 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,
  h: 1n,
  a: 0n,
  b: 7n,
  Gx: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  Gy: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n
};
var { p: P, n: N, Gx, Gy, b: _b } = secp256k1_CURVE;
var L = 32;
var L2 = 64;
var err = (m = "") => {
  throw new Error(m);
};
var isBig = (n) => typeof n === "bigint";
var isStr = (s) => typeof s === "string";
var isBytes = (a) => a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
var abytes = (a, l) => !isBytes(a) || typeof l === "number" && l > 0 && a.length !== l ? err("Uint8Array expected") : a;
var u8n = (len) => new Uint8Array(len);
var u8fr = (buf) => Uint8Array.from(buf);
var padh = (n, pad) => n.toString(16).padStart(pad, "0");
var bytesToHex = (b) => Array.from(abytes(b)).map((e) => padh(e, 2)).join("");
var C = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
var _ch = (ch) => {
  if (ch >= C._0 && ch <= C._9)
    return ch - C._0;
  if (ch >= C.A && ch <= C.F)
    return ch - (C.A - 10);
  if (ch >= C.a && ch <= C.f)
    return ch - (C.a - 10);
  return;
};
var hexToBytes = (hex) => {
  const e = "hex invalid";
  if (!isStr(hex))
    return err(e);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    return err(e);
  const array = u8n(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = _ch(hex.charCodeAt(hi));
    const n2 = _ch(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0)
      return err(e);
    array[ai] = n1 * 16 + n2;
  }
  return array;
};
var toU8 = (a, len) => abytes(isStr(a) ? hexToBytes(a) : u8fr(abytes(a)), len);
var cr = () => globalThis?.crypto;
var concatBytes = (...arrs) => {
  const r = u8n(arrs.reduce((sum, a) => sum + abytes(a).length, 0));
  let pad = 0;
  arrs.forEach((a) => {
    r.set(a, pad);
    pad += a.length;
  });
  return r;
};
var randomBytes = (len = L) => {
  const c = cr();
  return c.getRandomValues(u8n(len));
};
var big = BigInt;
var arange = (n, min, max, msg = "bad number: out of range") => isBig(n) && min <= n && n < max ? n : err(msg);
var M = (a, b = P) => {
  const r = a % b;
  return r >= 0n ? r : b + r;
};
var invert = (num, md) => {
  if (num === 0n || md <= 0n)
    err("no inverse n=" + num + " mod=" + md);
  let a = M(num, md), b = md, x = 0n, y = 1n, u = 1n, v = 0n;
  while (a !== 0n) {
    const q = b / a, r = b % a;
    const m = x - u * q, n = y - v * q;
    b = a, a = r, x = u, y = v, u = m, v = n;
  }
  return b === 1n ? M(x, md) : err("no inverse");
};
var apoint = (p) => p instanceof Point ? p : err("Point expected");
var koblitz = (x) => M(M(x * x) * x + _b);
var afield0 = (n) => arange(n, 0n, P);
var afield = (n) => arange(n, 1n, P);
var agroup = (n) => arange(n, 1n, N);
var isEven = (y) => (y & 1n) === 0n;
var u8of = (n) => Uint8Array.of(n);
var getPrefix = (y) => u8of(isEven(y) ? 2 : 3);
var lift_x = (x) => {
  const c = koblitz(afield(x));
  let r = 1n;
  for (let num = c, e = (P + 1n) / 4n; e > 0n; e >>= 1n) {
    if (e & 1n)
      r = r * num % P;
    num = num * num % P;
  }
  return M(r * r) === c ? r : err("sqrt invalid");
};
var Point = class _Point {
  static BASE;
  static ZERO;
  px;
  py;
  pz;
  constructor(px, py, pz) {
    this.px = afield0(px);
    this.py = afield(py);
    this.pz = afield0(pz);
    Object.freeze(this);
  }
  /** Convert Uint8Array or hex string to Point. */
  static fromBytes(bytes) {
    abytes(bytes);
    let p = void 0;
    const head = bytes[0];
    const tail = bytes.subarray(1);
    const x = sliceBytesNumBE(tail, 0, L);
    const len = bytes.length;
    if (len === L + 1 && [2, 3].includes(head)) {
      let y = lift_x(x);
      const evenY = isEven(y);
      const evenH = isEven(big(head));
      if (evenH !== evenY)
        y = M(-y);
      p = new _Point(x, y, 1n);
    }
    if (len === L2 + 1 && head === 4)
      p = new _Point(x, sliceBytesNumBE(tail, L, L2), 1n);
    return p ? p.assertValidity() : err("bad point: not on curve");
  }
  /** Equality check: compare points P&Q. */
  equals(other) {
    const { px: X1, py: Y1, pz: Z1 } = this;
    const { px: X2, py: Y2, pz: Z2 } = apoint(other);
    const X1Z2 = M(X1 * Z2);
    const X2Z1 = M(X2 * Z1);
    const Y1Z2 = M(Y1 * Z2);
    const Y2Z1 = M(Y2 * Z1);
    return X1Z2 === X2Z1 && Y1Z2 === Y2Z1;
  }
  is0() {
    return this.equals(I);
  }
  /** Flip point over y coordinate. */
  negate() {
    return new _Point(this.px, M(-this.py), this.pz);
  }
  /** Point doubling: P+P, complete formula. */
  double() {
    return this.add(this);
  }
  /**
   * Point addition: P+Q, complete, exception-free formula
   * (Renes-Costello-Batina, algo 1 of [2015/1060](https://eprint.iacr.org/2015/1060)).
   * Cost: `12M + 0S + 3*a + 3*b3 + 23add`.
   */
  // prettier-ignore
  add(other) {
    const { px: X1, py: Y1, pz: Z1 } = this;
    const { px: X2, py: Y2, pz: Z2 } = apoint(other);
    const a = 0n;
    const b = _b;
    let X3 = 0n, Y3 = 0n, Z3 = 0n;
    const b3 = M(b * 3n);
    let t0 = M(X1 * X2), t1 = M(Y1 * Y2), t2 = M(Z1 * Z2), t3 = M(X1 + Y1);
    let t4 = M(X2 + Y2);
    t3 = M(t3 * t4);
    t4 = M(t0 + t1);
    t3 = M(t3 - t4);
    t4 = M(X1 + Z1);
    let t5 = M(X2 + Z2);
    t4 = M(t4 * t5);
    t5 = M(t0 + t2);
    t4 = M(t4 - t5);
    t5 = M(Y1 + Z1);
    X3 = M(Y2 + Z2);
    t5 = M(t5 * X3);
    X3 = M(t1 + t2);
    t5 = M(t5 - X3);
    Z3 = M(a * t4);
    X3 = M(b3 * t2);
    Z3 = M(X3 + Z3);
    X3 = M(t1 - Z3);
    Z3 = M(t1 + Z3);
    Y3 = M(X3 * Z3);
    t1 = M(t0 + t0);
    t1 = M(t1 + t0);
    t2 = M(a * t2);
    t4 = M(b3 * t4);
    t1 = M(t1 + t2);
    t2 = M(t0 - t2);
    t2 = M(a * t2);
    t4 = M(t4 + t2);
    t0 = M(t1 * t4);
    Y3 = M(Y3 + t0);
    t0 = M(t5 * t4);
    X3 = M(t3 * X3);
    X3 = M(X3 - t0);
    t0 = M(t3 * t1);
    Z3 = M(t5 * Z3);
    Z3 = M(Z3 + t0);
    return new _Point(X3, Y3, Z3);
  }
  /**
   * Point-by-scalar multiplication. Scalar must be in range 1 <= n < CURVE.n.
   * Uses {@link wNAF} for base point.
   * Uses fake point to mitigate side-channel leakage.
   * @param n scalar by which point is multiplied
   * @param safe safe mode guards against timing attacks; unsafe mode is faster
   */
  multiply(n, safe = true) {
    if (!safe && n === 0n)
      return I;
    agroup(n);
    if (n === 1n)
      return this;
    if (this.equals(G))
      return wNAF(n).p;
    let p = I;
    let f = G;
    for (let d = this; n > 0n; d = d.double(), n >>= 1n) {
      if (n & 1n)
        p = p.add(d);
      else if (safe)
        f = f.add(d);
    }
    return p;
  }
  /** Convert point to 2d xy affine point. (X, Y, Z) ∋ (x=X/Z, y=Y/Z) */
  toAffine() {
    const { px: x, py: y, pz: z } = this;
    if (this.equals(I))
      return { x: 0n, y: 0n };
    if (z === 1n)
      return { x, y };
    const iz = invert(z, P);
    if (M(z * iz) !== 1n)
      err("inverse invalid");
    return { x: M(x * iz), y: M(y * iz) };
  }
  /** Checks if the point is valid and on-curve. */
  assertValidity() {
    const { x, y } = this.toAffine();
    afield(x);
    afield(y);
    return M(y * y) === koblitz(x) ? this : err("bad point: not on curve");
  }
  /** Converts point to 33/65-byte Uint8Array. */
  toBytes(isCompressed = true) {
    const { x, y } = this.assertValidity().toAffine();
    const x32b = numTo32b(x);
    if (isCompressed)
      return concatBytes(getPrefix(y), x32b);
    return concatBytes(u8of(4), x32b, numTo32b(y));
  }
  /** Create 3d xyz point from 2d xy. (0, 0) => (0, 1, 0), not (0, 0, 1) */
  static fromAffine(ap) {
    const { x, y } = ap;
    return x === 0n && y === 0n ? I : new _Point(x, y, 1n);
  }
  toHex(isCompressed) {
    return bytesToHex(this.toBytes(isCompressed));
  }
  static fromPrivateKey(k) {
    return G.multiply(toPrivScalar(k));
  }
  static fromHex(hex) {
    return _Point.fromBytes(toU8(hex));
  }
  get x() {
    return this.toAffine().x;
  }
  get y() {
    return this.toAffine().y;
  }
  toRawBytes(isCompressed) {
    return this.toBytes(isCompressed);
  }
};
var G = new Point(Gx, Gy, 1n);
var I = new Point(0n, 1n, 0n);
Point.BASE = G;
Point.ZERO = I;
var bytesToNumBE = (b) => big("0x" + (bytesToHex(b) || "0"));
var sliceBytesNumBE = (b, from, to) => bytesToNumBE(b.subarray(from, to));
var B256 = 2n ** 256n;
var numTo32b = (num) => hexToBytes(padh(arange(num, 0n, B256), L2));
var toPrivScalar = (pr) => {
  const num = isBig(pr) ? pr : bytesToNumBE(toU8(pr, L));
  return arange(num, 1n, N, "private key invalid 3");
};
var getPublicKey = (privKey, isCompressed = true) => {
  return G.multiply(toPrivScalar(privKey)).toBytes(isCompressed);
};
var getSharedSecret = (privA, pubB, isCompressed = true) => {
  return Point.fromBytes(toU8(pubB)).multiply(toPrivScalar(privA)).toBytes(isCompressed);
};
var hashToPrivateKey = (hash) => {
  hash = toU8(hash);
  if (hash.length < L + 8 || hash.length > 1024)
    err("expected 40-1024b");
  const num = M(bytesToNumBE(hash), N - 1n);
  return numTo32b(num + 1n);
};
var randomPrivateKey = () => hashToPrivateKey(randomBytes(L + 16));
var utils = {
  normPrivateKeyToScalar: toPrivScalar,
  isValidPrivateKey: (key) => {
    try {
      return !!toPrivScalar(key);
    } catch (e) {
      return false;
    }
  },
  randomPrivateKey,
  precompute: (w = 8, p = G) => {
    p.multiply(3n);
    w;
    return p;
  }
};
var W = 8;
var scalarBits = 256;
var pwindows = Math.ceil(scalarBits / W) + 1;
var pwindowSize = 2 ** (W - 1);
var precompute = () => {
  const points = [];
  let p = G;
  let b = p;
  for (let w = 0; w < pwindows; w++) {
    b = p;
    points.push(b);
    for (let i = 1; i < pwindowSize; i++) {
      b = b.add(p);
      points.push(b);
    }
    p = b.double();
  }
  return points;
};
var Gpows = void 0;
var ctneg = (cnd, p) => {
  const n = p.negate();
  return cnd ? n : p;
};
var wNAF = (n) => {
  const comp = Gpows || (Gpows = precompute());
  let p = I;
  let f = G;
  const pow_2_w = 2 ** W;
  const maxNum = pow_2_w;
  const mask = big(pow_2_w - 1);
  const shiftBy = big(W);
  for (let w = 0; w < pwindows; w++) {
    let wbits = Number(n & mask);
    n >>= shiftBy;
    if (wbits > pwindowSize) {
      wbits -= maxNum;
      n += 1n;
    }
    const off = w * pwindowSize;
    const offF = off;
    const offP = off + Math.abs(wbits) - 1;
    const isEven2 = w % 2 !== 0;
    const isNeg = wbits < 0;
    if (wbits === 0) {
      f = f.add(ctneg(isEven2, comp[offF]));
    } else {
      p = p.add(ctneg(isNeg, comp[offP]));
    }
  }
  return { p, f };
};

// src/crypto.ts
function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex: odd length");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`Invalid hex character at position ${i}`);
    bytes[i / 2] = byte;
  }
  return bytes;
}
function generateKeypair() {
  const privateKey = utils.randomPrivateKey();
  const publicKey = getPublicKey(privateKey, false);
  const pubKeyHex = toHex(publicKey);
  return { privateKey, publicKey, pubKeyHex };
}
async function deriveAESKey(myPrivateKey, theirPublicKeyHex) {
  const sharedPoint = getSharedSecret(myPrivateKey, theirPublicKeyHex, false);
  const xCoord = sharedPoint.slice(1, 33);
  try {
    const hkdfKey = await crypto.subtle.importKey(
      "raw",
      xCoord,
      "HKDF",
      false,
      ["deriveKey"]
    );
    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(0),
        info: new TextEncoder().encode("ecdsa_encryption")
      },
      hkdfKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  } finally {
    sharedPoint.fill(0);
    xCoord.fill(0);
  }
}
async function encryptMessage(aesKey, clientPubKeyBytes, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );
  const out = new Uint8Array(65 + 12 + ct.byteLength);
  out.set(clientPubKeyBytes, 0);
  out.set(iv, 65);
  out.set(new Uint8Array(ct), 77);
  return toHex(out);
}
async function decryptChunk(clientPrivateKey, hexString, allowPlaintext = false) {
  if (typeof hexString !== "string") {
    throw new TypeError("Encrypted response content must be a string");
  }
  if (!hexString || /^\s+$/.test(hexString)) {
    return hexString;
  }
  const encrypted = hexString.length >= 186 && /^[0-9a-f]+$/i.test(hexString);
  if (!encrypted) {
    if (allowPlaintext) return hexString;
    throw new Error("Venice E2EE response contained unencrypted content");
  }
  const raw = fromHex(hexString);
  if (raw[0] !== 4) {
    if (allowPlaintext) return hexString;
    throw new Error("Venice E2EE response has an invalid ephemeral public key");
  }
  const serverEphemeralPubKey = toHex(raw.slice(0, 65));
  const iv = raw.slice(65, 77);
  const ciphertext = raw.slice(77);
  const chunkKey = await deriveAESKey(clientPrivateKey, serverEphemeralPubKey);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    chunkKey,
    ciphertext
  );
  return new TextDecoder().decode(pt);
}

// src/stream.ts
async function* decryptSSEStream(body, privateKey, allowPlaintextResponses = false) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        let event;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }
        const content = event.choices?.[0]?.delta?.content;
        if (content === void 0 || content === null) continue;
        try {
          yield await decryptChunk(privateKey, content, allowPlaintextResponses);
        } catch (e) {
          if (e instanceof DOMException && e.name === "OperationError") {
            throw new Error(
              "E2EE decryption failed \u2014 session may be stale. Clear the session and retry."
            );
          }
          throw e;
        }
      }
    }
    if (buffer.trim()) {
      if (buffer.startsWith("data: ")) {
        const data = buffer.slice(6).trim();
        if (data !== "[DONE]") {
          let event;
          try {
            event = JSON.parse(data);
          } catch {
            event = {};
          }
          const content = event.choices?.[0]?.delta?.content;
          if (content !== void 0 && content !== null) {
            try {
              yield await decryptChunk(privateKey, content, allowPlaintextResponses);
            } catch (e) {
              if (e instanceof DOMException && e.name === "OperationError") {
                throw new Error(
                  "E2EE decryption failed \u2014 session may be stale. Clear the session and retry."
                );
              }
              throw e;
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// node_modules/@noble/hashes/_u64.js
var U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
var _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
var rotlSH = (h, l, s) => h << s | l >>> 32 - s;
var rotlSL = (h, l, s) => l << s | h >>> 32 - s;
var rotlBH = (h, l, s) => l << s - 32 | h >>> 64 - s;
var rotlBL = (h, l, s) => h << s - 32 | l >>> 64 - s;

// node_modules/@noble/hashes/utils.js
function isBytes2(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n, title = "") {
  if (!Number.isSafeInteger(n) || n < 0) {
    const prefix = title && `"${title}" `;
    throw new Error(`${prefix}expected integer >= 0, got ${n}`);
  }
}
function abytes2(value, length, title = "") {
  const bytes = isBytes2(value);
  const len = value?.length;
  const needsLen = length !== void 0;
  if (!bytes || needsLen && len !== length) {
    const prefix = title && `"${title}" `;
    const ofLen = needsLen ? ` of length ${length}` : "";
    const got = bytes ? `length=${len}` : `type=${typeof value}`;
    throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
  }
  return value;
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes2(out, void 0, "digestInto() output");
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error('"digestInto() output" expected to be of length >=' + min);
  }
}
function u32(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
function byteSwap(word) {
  return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
}
function byteSwap32(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = byteSwap(arr[i]);
  }
  return arr;
}
var swap32IfBE = isLE ? (u) => u : byteSwap32;
function createHasher(hashCons, info = {}) {
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(void 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}

// node_modules/@noble/hashes/sha3.js
var _0n = BigInt(0);
var _1n = BigInt(1);
var _2n = BigInt(2);
var _7n = BigInt(7);
var _256n = BigInt(256);
var _0x71n = BigInt(113);
var SHA3_PI = [];
var SHA3_ROTL = [];
var _SHA3_IOTA = [];
for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
  [x, y] = [y, (2 * x + 3 * y) % 5];
  SHA3_PI.push(2 * (5 * y + x));
  SHA3_ROTL.push((round + 1) * (round + 2) / 2 % 64);
  let t = _0n;
  for (let j = 0; j < 7; j++) {
    R = (R << _1n ^ (R >> _7n) * _0x71n) % _256n;
    if (R & _2n)
      t ^= _1n << (_1n << BigInt(j)) - _1n;
  }
  _SHA3_IOTA.push(t);
}
var IOTAS = split(_SHA3_IOTA, true);
var SHA3_IOTA_H = IOTAS[0];
var SHA3_IOTA_L = IOTAS[1];
var rotlH = (h, l, s) => s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s);
var rotlL = (h, l, s) => s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s);
function keccakP(s, rounds = 24) {
  const B = new Uint32Array(5 * 2);
  for (let round = 24 - rounds; round < 24; round++) {
    for (let x = 0; x < 10; x++)
      B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
    for (let x = 0; x < 10; x += 2) {
      const idx1 = (x + 8) % 10;
      const idx0 = (x + 2) % 10;
      const B0 = B[idx0];
      const B1 = B[idx0 + 1];
      const Th = rotlH(B0, B1, 1) ^ B[idx1];
      const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
      for (let y = 0; y < 50; y += 10) {
        s[x + y] ^= Th;
        s[x + y + 1] ^= Tl;
      }
    }
    let curH = s[2];
    let curL = s[3];
    for (let t = 0; t < 24; t++) {
      const shift = SHA3_ROTL[t];
      const Th = rotlH(curH, curL, shift);
      const Tl = rotlL(curH, curL, shift);
      const PI = SHA3_PI[t];
      curH = s[PI];
      curL = s[PI + 1];
      s[PI] = Th;
      s[PI + 1] = Tl;
    }
    for (let y = 0; y < 50; y += 10) {
      for (let x = 0; x < 10; x++)
        B[x] = s[y + x];
      for (let x = 0; x < 10; x++)
        s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
    }
    s[0] ^= SHA3_IOTA_H[round];
    s[1] ^= SHA3_IOTA_L[round];
  }
  clean(B);
}
var Keccak = class _Keccak {
  state;
  pos = 0;
  posOut = 0;
  finished = false;
  state32;
  destroyed = false;
  blockLen;
  suffix;
  outputLen;
  enableXOF = false;
  rounds;
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
    this.blockLen = blockLen;
    this.suffix = suffix;
    this.outputLen = outputLen;
    this.enableXOF = enableXOF;
    this.rounds = rounds;
    anumber(outputLen, "outputLen");
    if (!(0 < blockLen && blockLen < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200);
    this.state32 = u32(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    swap32IfBE(this.state32);
    keccakP(this.state32, this.rounds);
    swap32IfBE(this.state32);
    this.posOut = 0;
    this.pos = 0;
  }
  update(data) {
    aexists(this);
    abytes2(data);
    const { blockLen, state } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      for (let i = 0; i < take; i++)
        state[this.pos++] ^= data[pos++];
      if (this.pos === blockLen)
        this.keccak();
    }
    return this;
  }
  finish() {
    if (this.finished)
      return;
    this.finished = true;
    const { state, suffix, pos, blockLen } = this;
    state[pos] ^= suffix;
    if ((suffix & 128) !== 0 && pos === blockLen - 1)
      this.keccak();
    state[blockLen - 1] ^= 128;
    this.keccak();
  }
  writeInto(out) {
    aexists(this, false);
    abytes2(out);
    this.finish();
    const bufferOut = this.state;
    const { blockLen } = this;
    for (let pos = 0, len = out.length; pos < len; ) {
      if (this.posOut >= blockLen)
        this.keccak();
      const take = Math.min(blockLen - this.posOut, len - pos);
      out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
      this.posOut += take;
      pos += take;
    }
    return out;
  }
  xofInto(out) {
    if (!this.enableXOF)
      throw new Error("XOF is not possible for this instance");
    return this.writeInto(out);
  }
  xof(bytes) {
    anumber(bytes);
    return this.xofInto(new Uint8Array(bytes));
  }
  digestInto(out) {
    aoutput(out, this);
    if (this.finished)
      throw new Error("digest() was already called");
    this.writeInto(out);
    this.destroy();
    return out;
  }
  digest() {
    return this.digestInto(new Uint8Array(this.outputLen));
  }
  destroy() {
    this.destroyed = true;
    clean(this.state);
  }
  _cloneInto(to) {
    const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
    to ||= new _Keccak(blockLen, suffix, outputLen, enableXOF, rounds);
    to.state32.set(this.state32);
    to.pos = this.pos;
    to.posOut = this.posOut;
    to.finished = this.finished;
    to.rounds = rounds;
    to.suffix = suffix;
    to.outputLen = outputLen;
    to.enableXOF = enableXOF;
    to.destroyed = this.destroyed;
    return to;
  }
};
var genKeccak = (suffix, blockLen, outputLen, info = {}) => createHasher(() => new Keccak(blockLen, suffix, outputLen), info);
var keccak_256 = /* @__PURE__ */ genKeccak(1, 136, 32);

// src/attestation.ts
var TDX_BODY_OFFSET = 48;
var TD_ATTRIBUTES_OFFSET = TDX_BODY_OFFSET + 120;
var TD_ATTRIBUTES_LEN = 8;
var REPORT_DATA_OFFSET = TDX_BODY_OFFSET + 520;
var REPORT_DATA_LEN = 64;
var MIN_QUOTE_LEN = REPORT_DATA_OFFSET + REPORT_DATA_LEN;
var MEASUREMENT_LAYOUT = [
  ["mrSeam", 16],
  ["mrSignerSeam", 64],
  ["mrTd", 136],
  ["mrConfigId", 184],
  ["mrOwner", 232],
  ["mrOwnerConfig", 280],
  ["rtMr0", 328],
  ["rtMr1", 376],
  ["rtMr2", 424],
  ["rtMr3", 472]
];
var TDX_TEE_TYPE = 129;
function deriveEthAddress(pubKeyHex) {
  let hex = pubKeyHex.startsWith("0x") ? pubKeyHex.slice(2) : pubKeyHex;
  if (hex.length === 128) hex = "04" + hex;
  if (hex.length !== 130 || !hex.startsWith("04")) {
    throw new Error(
      `Invalid uncompressed secp256k1 public key (got ${hex.length} hex chars)`
    );
  }
  const keyBytes = fromHex(hex.slice(2));
  const hash = keccak_256(keyBytes);
  return hash.slice(12);
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
function decodeQuote(quote) {
  const value = quote.startsWith("0x") ? quote.slice(2) : quote;
  if (value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value)) return fromHex(value);
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw new Error("TDX quote is neither valid hex nor base64");
  }
}
function parseTdxQuote(quote) {
  const bytes = decodeQuote(quote);
  if (bytes.length < MIN_QUOTE_LEN) {
    throw new Error(
      `TDX quote too short: ${bytes.length} bytes (need >= ${MIN_QUOTE_LEN})`
    );
  }
  const teeType = bytes[4] | bytes[5] << 8 | bytes[6] << 16 | bytes[7] << 24;
  if (teeType !== TDX_TEE_TYPE) {
    throw new Error(
      `Not a TDX quote: teeType=0x${teeType.toString(16)} (expected 0x81)`
    );
  }
  return {
    bytes,
    tdAttributes: bytes.slice(TD_ATTRIBUTES_OFFSET, TD_ATTRIBUTES_OFFSET + TD_ATTRIBUTES_LEN),
    reportData: bytes.slice(REPORT_DATA_OFFSET, REPORT_DATA_OFFSET + REPORT_DATA_LEN),
    measurements: Object.fromEntries(
      MEASUREMENT_LAYOUT.map(([name, offset]) => [
        name,
        toHex(bytes.slice(TDX_BODY_OFFSET + offset, TDX_BODY_OFFSET + offset + 48))
      ])
    )
  };
}
function normalizeMeasurement(value) {
  return value.toLowerCase().replace(/^0x/, "");
}
function verifyMeasurements(actual, expected, errors) {
  let checked = 0;
  let matched = true;
  for (const [name, allowedValue] of Object.entries(expected)) {
    const allowed = (Array.isArray(allowedValue) ? allowedValue : [allowedValue]).map(normalizeMeasurement);
    checked += 1;
    if (!actual[name] || !allowed.includes(normalizeMeasurement(actual[name]))) {
      matched = false;
      errors.push(`TDX measurement mismatch: ${name}`);
    }
  }
  if (checked === 0) {
    errors.push("Expected measurement policy is empty");
    return false;
  }
  return matched;
}
async function verifyAttestation(response, clientNonce, verifierOrOptions) {
  const options = typeof verifierOrOptions === "function" ? { dcapVerifier: verifierOrOptions } : verifierOrOptions ?? {};
  const { dcapVerifier, requireDcap = false, expectedMeasurements, expectedModelId } = options;
  const errors = [];
  let nonceVerified = false;
  let signingKeyBound = false;
  let debugMode = false;
  let serverTdxValid = null;
  let serverVerified = response.verified ?? null;
  let dcap;
  let dcapVerified = false;
  let measurements;
  let measurementsVerified = null;
  const result = () => ({
    nonceVerified,
    signingKeyBound,
    debugMode,
    serverTdxValid,
    serverVerified,
    dcap,
    dcapVerified,
    measurements,
    measurementsVerified,
    verificationLevel: dcapVerified ? measurementsVerified === true ? "measured" : "dcap" : nonceVerified && signingKeyBound && !debugMode ? "binding" : "none",
    errors
  });
  if (clientNonce.length !== 32) {
    errors.push(`Invalid client nonce length: ${clientNonce.length} (expected 32)`);
    return result();
  }
  const clientNonceHex = toHex(clientNonce);
  if (response.nonce && normalizeMeasurement(response.nonce) !== clientNonceHex) {
    errors.push("Attestation response nonce does not match the requested nonce");
  }
  if (expectedModelId && response.model !== expectedModelId) {
    errors.push(`Attestation model mismatch: expected ${expectedModelId}, received ${response.model || "missing"}`);
  }
  if (response.verified === false) {
    errors.push("Venice reported that server-side attestation verification failed");
  }
  const signingKey = response.signing_key || response.signing_public_key;
  if (!signingKey) {
    errors.push("No signing key in attestation response");
    return result();
  }
  if (response.server_verification) {
    const sv = response.server_verification;
    serverTdxValid = sv.tdx?.valid ?? null;
    if (sv.tdx && !sv.tdx.valid) {
      errors.push(
        `Server TDX verification failed: ${sv.tdx.error || "unknown reason"}`
      );
    }
    if (sv.tdx?.signatureValid === false) {
      errors.push("Venice reported an invalid TDX quote signature");
    }
    if (sv.tdx?.certificateChainValid === false) {
      errors.push("Venice reported an invalid TDX certificate chain");
    }
    if (sv.tdx?.attestationKeyMatch === false) {
      errors.push("Venice reported a TDX attestation-key mismatch");
    }
    if (sv.nvidia && !sv.nvidia.valid) {
      errors.push(`Venice reported failed NVIDIA attestation: ${sv.nvidia.error || "unknown reason"}`);
    }
  }
  if (!response.intel_quote) {
    errors.push("No intel_quote in attestation response \u2014 cannot verify client-side");
    return result();
  }
  let reportData;
  let tdAttributes;
  let quoteBytes;
  try {
    ({ bytes: quoteBytes, reportData, tdAttributes, measurements } = parseTdxQuote(response.intel_quote));
  } catch (e) {
    errors.push(`Failed to parse TDX quote: ${e.message}`);
    return result();
  }
  debugMode = (tdAttributes[0] & 1) !== 0;
  if (debugMode) {
    errors.push("TEE is running in DEBUG mode \u2014 attestation cannot be trusted");
  }
  const nonceInReport = reportData.slice(32, 64);
  if (constantTimeEqual(nonceInReport, clientNonce)) {
    nonceVerified = true;
  } else {
    const hashInput = new ArrayBuffer(clientNonce.byteLength);
    new Uint8Array(hashInput).set(clientNonce);
    const hashedNonce = new Uint8Array(
      await crypto.subtle.digest("SHA-256", hashInput)
    );
    if (constantTimeEqual(nonceInReport, hashedNonce)) {
      nonceVerified = true;
    } else {
      errors.push(
        "Nonce verification failed: client nonce not found in REPORTDATA"
      );
    }
  }
  try {
    const expectedAddress = deriveEthAddress(signingKey);
    const addressInReport = reportData.slice(0, 20);
    signingKeyBound = constantTimeEqual(addressInReport, expectedAddress);
    if (!signingKeyBound) {
      errors.push(
        "Signing key not bound to TEE: Ethereum address mismatch in REPORTDATA"
      );
    }
  } catch (e) {
    errors.push(
      `Failed to verify signing key binding: ${e.message}`
    );
  }
  if (response.server_verification?.signingAddressBinding) {
    const sab = response.server_verification.signingAddressBinding;
    if (signingKeyBound !== sab.bound) {
      errors.push(
        `Signing key binding inconsistency: client=${signingKeyBound}, server=${sab.bound}`
      );
    }
  }
  if (response.server_verification?.nonceBinding) {
    const nb = response.server_verification.nonceBinding;
    if (nonceVerified !== nb.bound) {
      errors.push(
        `Nonce binding inconsistency: client=${nonceVerified}, server=${nb.bound}`
      );
    }
  }
  if (expectedMeasurements) {
    measurementsVerified = verifyMeasurements(measurements, expectedMeasurements, errors);
  }
  if (dcapVerifier) {
    try {
      dcap = await dcapVerifier(quoteBytes);
      const status = dcap.status;
      const acceptedStatuses = /* @__PURE__ */ new Set([
        "UpToDate",
        "SWHardeningNeeded",
        "ConfigurationNeeded",
        "ConfigurationAndSWHardeningNeeded"
      ]);
      if (acceptedStatuses.has(status)) {
        dcapVerified = true;
      } else {
        errors.push(`DCAP verification: unacceptable TCB status ${status || "Unknown"}`);
      }
    } catch (e) {
      errors.push(`DCAP verification failed: ${e.message}`);
    }
  }
  if (requireDcap && !dcapVerified) {
    errors.push(dcapVerifier ? "Full DCAP verification did not complete successfully" : "Full DCAP verification is required but no dcapVerifier was provided");
  }
  if (measurementsVerified === true && !dcapVerified) {
    errors.push("Measurement allowlist requires successful DCAP verification of the quote");
  }
  return result();
}

// src/index.ts
var DEFAULT_BASE_URL = "https://api.venice.ai";
var DEFAULT_SESSION_TTL = 30 * 60 * 1e3;
function createVeniceE2EE(options) {
  const {
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    sessionTTL = DEFAULT_SESSION_TTL,
    verifyAttestation: shouldVerify = true,
    dcapVerifier,
    requireDcap = false,
    expectedMeasurements,
    allowPlaintextResponses = false
  } = options;
  if (!shouldVerify && (requireDcap || expectedMeasurements)) {
    throw new Error("Attestation policy cannot be required when verifyAttestation is false");
  }
  let _session = null;
  let _pendingSession = null;
  async function fetchAttestation(modelId) {
    const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = toHex(nonceBytes);
    const url = `${baseUrl}/api/v1/tee/attestation?model=${encodeURIComponent(modelId)}&nonce=${nonce}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) throw new Error(`TEE attestation failed (${res.status})`);
    const response = await res.json();
    return { response, nonceBytes };
  }
  async function createSession(modelId) {
    if (_session && _session.modelId === modelId && Date.now() - _session.created < sessionTTL) {
      return _session;
    }
    if (_pendingSession) return _pendingSession;
    _pendingSession = _createSessionInner(modelId);
    try {
      return await _pendingSession;
    } finally {
      _pendingSession = null;
    }
  }
  async function _createSessionInner(modelId) {
    const keypair = generateKeypair();
    const { response, nonceBytes } = await fetchAttestation(modelId);
    const modelPubKeyHex = response.signing_key || response.signing_public_key;
    if (!modelPubKeyHex) {
      throw new Error("No signing key in attestation response");
    }
    let attestation;
    if (shouldVerify) {
      attestation = await verifyAttestation(response, nonceBytes, {
        dcapVerifier,
        requireDcap,
        expectedMeasurements,
        expectedModelId: modelId
      });
      if (attestation.errors.length > 0) {
        throw new Error(
          `TEE attestation verification failed:
  - ${attestation.errors.join("\n  - ")}`
        );
      }
    }
    const aesKey = await deriveAESKey(keypair.privateKey, modelPubKeyHex);
    if (_session) _session.privateKey.fill(0);
    _session = {
      ...keypair,
      modelPubKeyHex,
      aesKey,
      modelId,
      created: Date.now(),
      attestation
    };
    return _session;
  }
  async function encrypt(messages, session) {
    const encryptedMessages = await Promise.all(
      messages.map(async (msg) => ({
        role: msg.role,
        content: await encryptMessage(
          session.aesKey,
          session.publicKey,
          msg.content
        )
      }))
    );
    return {
      encryptedMessages,
      headers: {
        "X-Venice-TEE-Client-Pub-Key": session.pubKeyHex,
        "X-Venice-TEE-Model-Pub-Key": session.modelPubKeyHex,
        "X-Venice-TEE-Signing-Algo": "ecdsa"
      },
      veniceParameters: { enable_e2ee: true }
    };
  }
  async function decrypt(hexChunk, session) {
    return decryptChunk(session.privateKey, hexChunk, allowPlaintextResponses);
  }
  async function* decryptStream(body, session) {
    yield* decryptSSEStream(body, session.privateKey, allowPlaintextResponses);
  }
  function clearSession() {
    if (_session) {
      _session.privateKey.fill(0);
      _session = null;
    }
  }
  return {
    createSession,
    encrypt,
    decryptChunk: decrypt,
    decryptStream,
    clearSession
  };
}
function isE2EEModel(modelId) {
  return modelId.startsWith("e2ee-");
}
export {
  createVeniceE2EE,
  decryptChunk,
  decryptSSEStream,
  deriveAESKey,
  deriveEthAddress,
  encryptMessage,
  fromHex,
  generateKeypair,
  isE2EEModel,
  toHex,
  verifyAttestation
};
/*! Bundled license information:

@noble/secp256k1/index.js:
  (*! noble-secp256k1 - MIT License (c) 2019 Paul Miller (paulmillr.com) *)

@noble/hashes/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
