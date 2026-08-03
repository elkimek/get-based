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

// src/tools.ts
function flattenMessageContent(content) {
  if (typeof content === "string") return content;
  if (content === null || content === void 0) return "";
  if (!Array.isArray(content)) return String(content);
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part?.type === "text" || part?.type === "input_text" || part?.type === "output_text") {
      return part.text ?? "";
    }
    if (part?.type === "refusal") return "";
    throw new Error(
      `Unsupported message content part "${part?.type}": Venice E2EE models accept text only.`
    );
  }).join("");
}
var TOOL_CALL_OPEN = "<tool_call>";
var TOOL_CALL_CLOSE = "</tool_call>";
var TOOL_RESPONSE_OPEN = "<tool_response>";
var TOOL_RESPONSE_CLOSE = "</tool_response>";
var TOOL_CALL_TAGS = [
  { open: TOOL_CALL_OPEN, close: TOOL_CALL_CLOSE },
  { open: "<function_call>", close: "</function_call>" },
  { open: "<|tool_call|>", close: "<|/tool_call|>" }
];
var UNTAGGED_HOLD_LIMIT = 64 * 1024;
function generateToolCallId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `call_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
function buildToolSystemPrompt(tools, toolChoice = "auto") {
  if (!tools || tools.length === 0) return null;
  if (toolChoice === "none") return null;
  const schemas = tools.filter((t) => t && t.function).map((t) => JSON.stringify(t.function)).join("\n");
  if (!schemas) return null;
  let instruction;
  if (typeof toolChoice === "object" && toolChoice?.function?.name) {
    instruction = `You MUST call the function \`${toolChoice.function.name}\` now. Emit only the tool call block.`;
  } else if (toolChoice === "required") {
    instruction = "You MUST call at least one of the functions above. Emit only tool call blocks.";
  } else {
    instruction = "Call a function only when it helps answer the request. Otherwise reply normally without a tool call block.";
  }
  return `# Tools

You have access to the following functions, described as JSON schemas:

<tools>
${schemas}
</tools>

To call a function, emit a block in exactly this format:

${TOOL_CALL_OPEN}
{"name": "<function-name>", "arguments": {<json-arguments>}}
${TOOL_CALL_CLOSE}

Rules:
- \`arguments\` must be a JSON object matching the function's parameter schema,
  even when the function takes a single parameter.
- Emit the block on its own, with no surrounding prose or markdown fences.
- To call several functions, emit several blocks in a row.
- Never emit the JSON payload on its own \u2014 without the surrounding tags it is
  read as an ordinary answer and the function is not called.

Results come back as:

${TOOL_RESPONSE_OPEN}
{"id": "<id-of-the-call>", "name": "<function-name>", "result": <result>}
${TOOL_RESPONSE_CLOSE}

Match \`id\` against the call it answers when several calls are outstanding.

${instruction}`;
}
function parseArgumentsToJsonString(raw, fn) {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (value === void 0 || value === null || value === "") return "{}";
  const properties = fn?.parameters?.properties;
  const keys = properties && typeof properties === "object" ? Object.keys(properties) : [];
  if (keys.length === 1) return JSON.stringify({ [keys[0]]: value });
  return JSON.stringify(value);
}
function renderToolCall(tc) {
  let args = {};
  try {
    args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
  } catch {
    args = tc.function?.arguments ?? {};
  }
  const payload = JSON.stringify({
    ...tc.id ? { id: tc.id } : {},
    name: tc.function?.name,
    arguments: args
  });
  return `${TOOL_CALL_OPEN}
${payload}
${TOOL_CALL_CLOSE}`;
}
function renderToolMessages(messages) {
  const callNames = /* @__PURE__ */ new Map();
  for (const msg of messages) {
    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc?.id && tc.function?.name) callNames.set(tc.id, tc.function.name);
      }
    }
  }
  return messages.map((msg) => {
    const text = flattenMessageContent(msg.content);
    if (msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const blocks = msg.tool_calls.map(renderToolCall).join("\n");
      return { role: "assistant", content: text ? `${text}
${blocks}` : blocks };
    }
    if (msg.role === "tool") {
      const name = msg.tool_call_id && callNames.get(msg.tool_call_id) || msg.name;
      const payload = name || msg.tool_call_id ? JSON.stringify({
        ...msg.tool_call_id ? { id: msg.tool_call_id } : {},
        ...name ? { name } : {},
        result: text
      }) : text;
      return {
        role: "tool",
        content: `${TOOL_RESPONSE_OPEN}
${payload}
${TOOL_RESPONSE_CLOSE}`,
        ...msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}
      };
    }
    return { role: msg.role, content: text };
  });
}
function partialTagSuffixLength(text, tag) {
  const max = Math.min(text.length, tag.length - 1);
  for (let n = max; n > 0; n--) {
    if (text.endsWith(tag.slice(0, n))) return n;
  }
  return 0;
}
function stripFences(block) {
  const trimmed = block.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}
function findTagOutsideJsonString(text, tag) {
  let inString = false;
  let escaped = false;
  for (let i = 0; i <= text.length - tag.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (text.startsWith(tag, i)) return i;
  }
  return -1;
}
function firstJsonValue(text) {
  const objectAt = text.indexOf("{");
  const arrayAt = text.indexOf("[");
  const start = objectAt === -1 ? arrayAt : arrayAt === -1 ? objectAt : Math.min(objectAt, arrayAt);
  if (start === -1) return null;
  const openCh = text[start];
  const closeCh = openCh === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === openCh) depth++;
    else if (ch === closeCh && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}
function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    const candidate = firstJsonValue(text);
    if (candidate === null) return void 0;
    try {
      return JSON.parse(candidate);
    } catch {
      return void 0;
    }
  }
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value) return value;
  }
  return void 0;
}
function firstDefined(...values) {
  for (const value of values) {
    if (value !== void 0) return value;
  }
  return void 0;
}
function toToolCalls(value, lookup) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => toToolCalls(entry, lookup));
  }
  if (!value || typeof value !== "object") return [];
  const obj = value;
  for (const key of ["tool_calls", "calls", "invocations"]) {
    if (Array.isArray(obj[key])) {
      return obj[key].flatMap((entry) => toToolCalls(entry, lookup));
    }
  }
  const fn = obj.function;
  const fnObj = fn && typeof fn === "object" ? fn : void 0;
  const name = firstString(
    obj.name,
    obj.tool_name,
    obj.tool,
    typeof fn === "string" ? fn : void 0,
    fnObj?.name
  );
  if (!name) return [];
  const rawArgs = firstDefined(
    obj.arguments,
    obj.parameters,
    obj.args,
    obj.input,
    fnObj?.arguments,
    fnObj?.parameters
  );
  return [
    {
      id: generateToolCallId(),
      type: "function",
      function: { name, arguments: parseArgumentsToJsonString(rawArgs, lookup?.get(name)) }
    }
  ];
}
function parseArgValue(raw) {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.length > 1 && trimmed.startsWith('"') && !trimmed.endsWith('"') ? trimmed.slice(1) : trimmed;
  }
}
var ARG_TAG = /<\/?arg_(?:key|value)>/g;
var FUNCTION_NAME = /^[A-Za-z_][\w.-]*$/;
function parseArgKeyValueBody(text, lookup) {
  ARG_TAG.lastIndex = 0;
  const firstTag = ARG_TAG.exec(text);
  if (!firstTag) return [];
  const name = text.slice(0, firstTag.index).trim();
  if (!FUNCTION_NAME.test(name)) return [];
  const args = {};
  let pendingKey = null;
  const cleanKey = (key) => key.trim().replace(/^"|"$/g, "");
  const takeKey = (segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return;
    const gap = trimmed.search(/\s/);
    if (gap !== -1) {
      args[cleanKey(trimmed.slice(0, gap))] = parseArgValue(trimmed.slice(gap + 1));
      pendingKey = null;
      return;
    }
    const colon = trimmed.indexOf(":");
    if (colon !== -1) {
      const key = cleanKey(trimmed.slice(0, colon));
      if (key) {
        args[key] = parseArgValue(trimmed.slice(colon + 1));
        pendingKey = null;
        return;
      }
    }
    pendingKey = cleanKey(trimmed);
  };
  ARG_TAG.lastIndex = firstTag.index;
  for (let tag = ARG_TAG.exec(text); tag !== null; ) {
    const start = ARG_TAG.lastIndex;
    const next = ARG_TAG.exec(text);
    const segment = text.slice(start, next ? next.index : text.length);
    if (tag[0] === "<arg_value>") {
      if (pendingKey !== null) {
        args[pendingKey] = parseArgValue(segment);
        pendingKey = null;
      }
    } else if (tag[0] === "<arg_key>" || pendingKey === null) {
      takeKey(segment);
    }
    tag = next;
  }
  if (Object.keys(args).length === 0) return [];
  return [
    {
      id: generateToolCallId(),
      type: "function",
      function: { name, arguments: parseArgumentsToJsonString(args, lookup?.get(name)) }
    }
  ];
}
function parseLineDelimitedBody(text, lookup) {
  if (!lookup || lookup.size === 0) return [];
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) return [];
  const name = lines[0];
  const fn = lookup.get(name);
  if (!fn) return [];
  const rest = lines.slice(1);
  if (rest.length % 2 !== 0) return [];
  const properties = fn.parameters?.properties;
  if (!properties || typeof properties !== "object") return [];
  const declared = new Set(Object.keys(properties));
  const args = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    if (!declared.has(key)) return [];
    args[key] = parseArgValue(rest[i + 1]);
  }
  return [
    {
      id: generateToolCallId(),
      type: "function",
      function: { name, arguments: parseArgumentsToJsonString(args, fn) }
    }
  ];
}
function looksLikeJsonStart(text) {
  const trimmed = text.trimStart();
  if (!trimmed) return true;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  return "```json".startsWith(trimmed.slice(0, 7)) && trimmed.startsWith("`");
}
var ToolCallStreamParser = class {
  buffer = "";
  /** The tag pair that opened the block being accumulated, if any. */
  openTag = null;
  calls = [];
  lookup = /* @__PURE__ */ new Map();
  /** Content withheld while it might still turn out to be an untagged call. */
  held = "";
  /** Once open, content streams straight through with no further inspection. */
  gateOpen;
  constructor(options = {}) {
    for (const tool of options.tools ?? []) {
      if (tool?.function?.name) this.lookup.set(tool.function.name, tool.function);
    }
    this.gateOpen = this.lookup.size === 0;
  }
  /** Feed the next decrypted text chunk. */
  push(chunk) {
    this.buffer += chunk;
    let raw = "";
    const toolCalls = [];
    for (; ; ) {
      if (!this.openTag) {
        const opened = findFirst(this.buffer, (tag) => this.buffer.indexOf(tag.open));
        if (!opened) {
          const hold = maxPartialTagSuffix(this.buffer);
          raw += this.buffer.slice(0, this.buffer.length - hold);
          this.buffer = hold ? this.buffer.slice(this.buffer.length - hold) : "";
          break;
        }
        raw += this.buffer.slice(0, opened.index);
        this.buffer = this.buffer.slice(opened.index + opened.tag.open.length);
        this.openTag = opened.tag;
      } else {
        const close = findTagOutsideJsonString(this.buffer, this.openTag.close);
        const chainedOpen = findFirst(
          this.buffer,
          (tag) => findTagOutsideJsonString(this.buffer, tag.open)
        );
        const nextOpen = chainedOpen ? chainedOpen.index : -1;
        const closesFirst = close !== -1 && (nextOpen === -1 || close <= nextOpen);
        if (!closesFirst && nextOpen === -1) break;
        const end = closesFirst ? close : nextOpen;
        const skip = closesFirst ? this.openTag.close.length : chainedOpen.tag.open.length;
        const block = this.buffer.slice(0, end);
        const consumed = this.openTag;
        this.buffer = this.buffer.slice(end + skip);
        this.openTag = closesFirst ? null : chainedOpen.tag;
        const calls = this.parseBlocks(block);
        if (calls.length > 0) {
          toolCalls.push(...calls);
          this.calls.push(...calls);
        } else {
          raw += consumed.open + block + (closesFirst ? consumed.close : "");
        }
      }
    }
    const gated = this.gate(raw, toolCalls.length > 0, false);
    return { content: gated.content, toolCalls: [...toolCalls, ...gated.toolCalls] };
  }
  /**
   * Finish the stream. Returns any trailing content still held back, plus tool
   * calls recovered from an unterminated block if the model omitted the closing
   * tag (some models stop right after the JSON).
   */
  flush() {
    const toolCalls = [];
    let raw = "";
    if (this.openTag) {
      let block = this.buffer;
      const plainClose = this.buffer.indexOf(this.openTag.close);
      if (plainClose !== -1) block = this.buffer.slice(0, plainClose);
      const calls = this.parseBlocks(block);
      if (calls.length > 0) {
        toolCalls.push(...calls);
        this.calls.push(...calls);
      } else {
        raw = this.openTag.open + this.buffer;
      }
    } else {
      raw = this.buffer;
    }
    this.buffer = "";
    this.openTag = null;
    const gated = this.gate(raw, toolCalls.length > 0, true);
    return { content: gated.content, toolCalls: [...toolCalls, ...gated.toolCalls] };
  }
  /** Every tool call parsed so far. */
  get toolCalls() {
    return this.calls;
  }
  /** True once any tool call has been parsed (drives `finish_reason`). */
  get sawToolCall() {
    return this.calls.length > 0;
  }
  /**
   * Decide how much plain content may be released.
   *
   * A model that ignores the tag format and answers with the raw JSON payload is
   * the most common way prompt-driven tool calling fails, so content that starts
   * like JSON is withheld until it either completes into a call to a declared
   * tool or proves to be something else. Everything else opens the gate on the
   * first chunk and streams normally from then on.
   */
  gate(text, sawTaggedCall, atEnd) {
    if (this.gateOpen) return { content: text, toolCalls: [] };
    if (sawTaggedCall) {
      this.gateOpen = true;
      const content = this.held + text;
      this.held = "";
      return { content, toolCalls: [] };
    }
    this.held += text;
    const release = () => {
      this.gateOpen = true;
      const content = this.held;
      this.held = "";
      return { content, toolCalls: [] };
    };
    if (!looksLikeJsonStart(this.held)) return release();
    if (this.held.length > UNTAGGED_HOLD_LIMIT) return release();
    const candidate = firstJsonValue(stripFences(this.held));
    if (candidate === null) return atEnd ? release() : { content: "", toolCalls: [] };
    const calls = this.parseBlocks(this.held).filter(
      (call) => this.lookup.has(call.function.name)
    );
    if (calls.length === 0) return release();
    this.gateOpen = true;
    this.held = "";
    this.calls.push(...calls);
    return { content: "", toolCalls: calls };
  }
  parseBlocks(block) {
    const text = stripFences(block);
    if (!text) return [];
    const value = parseJsonLoose(text);
    if (value !== void 0) {
      const calls = toToolCalls(value, this.lookup);
      if (calls.length > 0) return calls;
    }
    const tagged = parseArgKeyValueBody(text, this.lookup);
    if (tagged.length > 0) return tagged;
    return parseLineDelimitedBody(text, this.lookup);
  }
};
function findFirst(text, locate) {
  let best = null;
  for (const tag of TOOL_CALL_TAGS) {
    const index = locate(tag);
    if (index !== -1 && (best === null || index < best.index)) best = { index, tag };
  }
  return best;
}
function maxPartialTagSuffix(text) {
  let longest = 0;
  for (const tag of TOOL_CALL_TAGS) {
    longest = Math.max(longest, partialTagSuffixLength(text, tag.open));
  }
  return longest;
}
function parseToolCalls(text, options = {}) {
  const parser = new ToolCallStreamParser(options);
  const a = parser.push(text);
  const b = parser.flush();
  return {
    content: a.content + b.content,
    toolCalls: [...a.toolCalls, ...b.toolCalls]
  };
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
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
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
var oidNist = (suffix) => ({
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
});

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

// node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class {
  blockLen;
  outputLen;
  padOffset;
  isLE;
  // For partial updates less than block size
  buffer;
  view;
  finished = false;
  length = 0;
  pos = 0;
  destroyed = false;
  constructor(blockLen, outputLen, padOffset, isLE2) {
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE2;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    abytes2(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE: isLE2 } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    view.setBigUint64(blockLen - 8, BigInt(this.length * 8), isLE2);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen must be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE2);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to ||= new this.constructor();
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// node_modules/@noble/hashes/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA2_32B = class extends HashMD {
  constructor(outputLen) {
    super(64, outputLen, 8, false);
  }
  get() {
    const { A, B, C: C2, D, E, F, G: G2, H } = this;
    return [A, B, C2, D, E, F, G2, H];
  }
  // prettier-ignore
  set(A, B, C2, D, E, F, G2, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C2 | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G2 | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C: C2, D, E, F, G: G2, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G2) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C2) | 0;
      H = G2;
      G2 = F;
      F = E;
      E = D + T1 | 0;
      D = C2;
      C2 = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C2 = C2 + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G2 = G2 + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C2, D, E, F, G2, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var _SHA256 = class extends SHA2_32B {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  A = SHA256_IV[0] | 0;
  B = SHA256_IV[1] | 0;
  C = SHA256_IV[2] | 0;
  D = SHA256_IV[3] | 0;
  E = SHA256_IV[4] | 0;
  F = SHA256_IV[5] | 0;
  G = SHA256_IV[6] | 0;
  H = SHA256_IV[7] | 0;
  constructor() {
    super(32);
  }
};
var sha256 = /* @__PURE__ */ createHasher(
  () => new _SHA256(),
  /* @__PURE__ */ oidNist(1)
);

// src/receipt.ts
function jcsStringify(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new TypeError(`JCS: ACI restricts numbers to integers, got ${value}`);
    }
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value !== "object") {
    throw new TypeError(`JCS: unsupported type ${typeof value}`);
  }
  if (Array.isArray(value)) return `[${value.map((item) => jcsStringify(item)).join(",")}]`;
  const entries = Object.keys(value).filter((key) => value[key] !== void 0).sort().map((key) => `${JSON.stringify(key)}:${jcsStringify(value[key])}`);
  return `{${entries.join(",")}}`;
}
function sha256Prefixed(text) {
  return hashReceiptBody(text);
}
function hashReceiptBody(body) {
  if (typeof body !== "string" && !(body instanceof Uint8Array)) {
    throw new TypeError("Receipt body must be a string or Uint8Array");
  }
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  return `sha256:${toHex(sha256(bytes))}`;
}
function computeWorkloadId(publicKey) {
  return sha256Prefixed(
    jcsStringify({ algo: publicKey.algo, public_key: publicKey.public_key })
  );
}
function computeWorkloadKeysetDigest(keyset) {
  return sha256Prefixed(jcsStringify(keyset));
}
function receiptSigningBytes(receipt) {
  const { value: _omitted, ...signatureWithoutValue } = receipt.signature;
  const forSigning = {
    ...receipt,
    signature: signatureWithoutValue
  };
  return new TextEncoder().encode(jcsStringify(forSigning));
}
function fromHexBytes(hex) {
  const clean2 = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean2.length === 0 || clean2.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean2)) {
    throw new TypeError("Expected non-empty, even-length hexadecimal bytes");
  }
  const out = new Uint8Array(clean2.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean2.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
async function verifyEd25519(publicKey, signature, message) {
  const key = await crypto.subtle.importKey("raw", publicKey, "Ed25519", false, [
    "verify"
  ]);
  return crypto.subtle.verify(
    "Ed25519",
    key,
    signature,
    message
  );
}
function exactlyOneEvent(receipt, type) {
  const matches = receipt.event_log.filter(
    (event) => event && typeof event === "object" && event.type === type
  );
  return matches.length === 1 ? matches[0] : void 0;
}
function isReceiptBody(value) {
  return typeof value === "string" || value instanceof Uint8Array;
}
async function verifyReceipt(signatureResponse, attestation, options) {
  const checks = [];
  const add = (name, ok, detail) => {
    checks.push(detail === void 0 ? { name, ok } : { name, ok, detail });
  };
  const receipt = signatureResponse?.receipt;
  if (!receipt || !receipt.signature || !Array.isArray(receipt.event_log)) {
    add("receipt_present", false, "signature response carried no complete receipt");
    return { verified: false, checks };
  }
  if (!options || typeof options !== "object") {
    add("verification_context_present", false, "trust anchor and request/response context required");
    return { verified: false, checks };
  }
  const { trustAnchor, requestId, requestBody, responseBody, responseHashField } = options;
  const contextComplete = Boolean(
    trustAnchor?.workloadId && trustAnchor?.workloadKeysetDigest && requestId && isReceiptBody(requestBody) && isReceiptBody(responseBody) && (responseHashField === "wire_hash" || responseHashField === "cleartext_hash")
  );
  add(
    "verification_context_present",
    contextComplete,
    contextComplete ? void 0 : "trustAnchor, requestId, requestBody, responseBody, and responseHashField are required"
  );
  if (!contextComplete) return { verified: false, checks };
  const unsupportedVersions = [
    receipt.api_version === "aci/1" ? void 0 : `receipt "${receipt.api_version}"`,
    signatureResponse.api_version === void 0 || signatureResponse.api_version === "aci/1" ? void 0 : `signature response "${signatureResponse.api_version}"`,
    attestation?.api_version === void 0 || attestation.api_version === "aci/1" ? void 0 : `attestation "${attestation.api_version}"`
  ].filter((value) => value !== void 0);
  add(
    "api_version_supported",
    unsupportedVersions.length === 0,
    unsupportedVersions.length === 0 ? void 0 : `unsupported api_version: ${unsupportedVersions.join(", ")}`
  );
  const keyset = attestation?.attestation?.workload_keyset;
  if (!keyset) {
    add("keyset_present", false, "attestation carried no workload_keyset");
    return { verified: false, checks };
  }
  const identityKey = keyset.workload_identity?.public_key;
  const signingKeys = keyset.receipt_signing_keys;
  const keysetShapeValid = Boolean(
    identityKey && typeof identityKey.algo === "string" && typeof identityKey.public_key === "string" && Array.isArray(signingKeys) && signingKeys.every(
      (key) => key && typeof key === "object" && typeof key.key_id === "string" && typeof key.algo === "string" && typeof key.public_key === "string"
    )
  );
  if (!keysetShapeValid) {
    add("keyset_well_formed", false, "workload identity or receipt signing keys are malformed");
    return { verified: false, checks };
  }
  let keysetDigest;
  let workloadId;
  try {
    keysetDigest = computeWorkloadKeysetDigest(keyset);
    workloadId = computeWorkloadId(identityKey);
  } catch (error) {
    add(
      "keyset_well_formed",
      false,
      `invalid workload keyset: ${error instanceof Error ? error.message : String(error)}`
    );
    return { verified: false, checks };
  }
  add("keyset_well_formed", true);
  add(
    "keyset_digest_matches_trust_anchor",
    keysetDigest === trustAnchor.workloadKeysetDigest,
    keysetDigest === trustAnchor.workloadKeysetDigest ? void 0 : `computed ${keysetDigest}, trusted ${trustAnchor.workloadKeysetDigest}`
  );
  add(
    "attestation_keyset_digest_matches_trust_anchor",
    attestation.workload_keyset_digest === trustAnchor.workloadKeysetDigest,
    attestation.workload_keyset_digest === trustAnchor.workloadKeysetDigest ? void 0 : `attestation says ${attestation.workload_keyset_digest ?? "missing"}`
  );
  add(
    "receipt_keyset_digest_matches_trust_anchor",
    receipt.workload_keyset_digest === trustAnchor.workloadKeysetDigest,
    receipt.workload_keyset_digest === trustAnchor.workloadKeysetDigest ? void 0 : `receipt says ${receipt.workload_keyset_digest}`
  );
  add(
    "workload_id_matches_trust_anchor",
    workloadId === trustAnchor.workloadId && attestation.workload_id === trustAnchor.workloadId && receipt.workload_id === trustAnchor.workloadId,
    workloadId === trustAnchor.workloadId && attestation.workload_id === trustAnchor.workloadId && receipt.workload_id === trustAnchor.workloadId ? void 0 : `computed ${workloadId}, attestation ${attestation.workload_id ?? "missing"}, receipt ${receipt.workload_id ?? "missing"}, trusted ${trustAnchor.workloadId}`
  );
  const entry = signingKeys.find(
    (key) => key.key_id === receipt.signature.key_id
  );
  add(
    "key_in_trusted_keyset",
    Boolean(entry),
    entry ? void 0 : `key_id "${receipt.signature.key_id}" is not in receipt_signing_keys`
  );
  if (entry) {
    const algoMatches = entry.algo === receipt.signature.algo;
    add(
      "key_algo_matches",
      algoMatches,
      algoMatches ? void 0 : `receipt says ${receipt.signature.algo}, keyset says ${entry.algo}`
    );
    if (algoMatches && entry.algo === "ed25519") {
      try {
        const ok = await verifyEd25519(
          fromHexBytes(entry.public_key),
          fromHexBytes(receipt.signature.value),
          receiptSigningBytes(receipt)
        );
        add("receipt_signature", ok, ok ? void 0 : "Ed25519 verification failed");
      } catch (error) {
        add(
          "receipt_signature",
          false,
          `Ed25519 unavailable or input rejected: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else if (algoMatches) {
      add("receipt_signature", false, `unsupported receipt signing algorithm "${entry.algo}"`);
    }
  }
  add(
    "chat_id_matches_request",
    receipt.chat_id === requestId,
    receipt.chat_id === requestId ? void 0 : `receipt is for ${receipt.chat_id}, expected ${requestId}`
  );
  const requestEvent = exactlyOneEvent(receipt, "request.received");
  const requestHash = hashReceiptBody(requestBody);
  add(
    "request_body_hash_matches",
    requestEvent?.body_hash === requestHash,
    requestEvent?.body_hash === requestHash ? void 0 : `computed ${requestHash}, receipt says ${requestEvent?.body_hash ?? "missing or ambiguous event"}`
  );
  const responseEvent = exactlyOneEvent(receipt, "response.returned");
  const responseHash = hashReceiptBody(responseBody);
  const receiptResponseHash = responseEvent?.[responseHashField];
  add(
    "response_body_hash_matches",
    receiptResponseHash === responseHash,
    receiptResponseHash === responseHash ? void 0 : `computed ${responseHash}, receipt ${responseHashField} says ${typeof receiptResponseHash === "string" ? receiptResponseHash : "missing or ambiguous event"}`
  );
  const rawAttestationAddress = attestation.signing_address;
  const rawSignatureAddress = signatureResponse.signing_address;
  const attestationAddress = typeof rawAttestationAddress === "string" ? rawAttestationAddress.toLowerCase() : void 0;
  const signatureAddress = typeof rawSignatureAddress === "string" ? rawSignatureAddress.toLowerCase() : void 0;
  if (rawAttestationAddress !== void 0 || rawSignatureAddress !== void 0) {
    add(
      "signing_address_cross_check",
      Boolean(attestationAddress && signatureAddress && attestationAddress === signatureAddress),
      attestationAddress && signatureAddress && attestationAddress === signatureAddress ? void 0 : `${signatureAddress ?? "missing"} vs attestation ${attestationAddress ?? "missing"}`
    );
  }
  return { verified: checks.length > 0 && checks.every((check) => check.ok), checks };
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
      messages.map(async ({ role, content, tool_call_id }) => {
        const encrypted = {
          role,
          content: await encryptMessage(
            session.aesKey,
            session.publicKey,
            flattenMessageContent(content)
          )
        };
        if (role === "tool" && tool_call_id !== void 0) {
          encrypted.tool_call_id = tool_call_id;
        }
        return encrypted;
      })
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
  async function fetchResponseSignature(modelId, requestId) {
    const url = `${baseUrl}/api/v1/tee/signature?model=${encodeURIComponent(modelId)}&request_id=${encodeURIComponent(requestId)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      throw new Error(`TEE signature fetch failed (${res.status}): ${await res.text()}`);
    }
    return res.json();
  }
  async function attest(modelId) {
    const { response } = await fetchAttestation(modelId);
    return response;
  }
  function clearSession() {
    if (_session) {
      _session.privateKey.fill(0);
      _session = null;
    }
  }
  return {
    createSession,
    attest,
    encrypt,
    decryptChunk: decrypt,
    decryptStream,
    fetchResponseSignature,
    clearSession
  };
}
function isE2EEModel(modelId) {
  return modelId.startsWith("e2ee-");
}
export {
  TOOL_CALL_CLOSE,
  TOOL_CALL_OPEN,
  TOOL_RESPONSE_CLOSE,
  TOOL_RESPONSE_OPEN,
  ToolCallStreamParser,
  buildToolSystemPrompt,
  computeWorkloadId,
  computeWorkloadKeysetDigest,
  createVeniceE2EE,
  decryptChunk,
  decryptSSEStream,
  deriveAESKey,
  deriveEthAddress,
  encryptMessage,
  flattenMessageContent,
  fromHex,
  generateKeypair,
  generateToolCallId,
  hashReceiptBody,
  isE2EEModel,
  jcsStringify,
  parseToolCalls,
  receiptSigningBytes,
  renderToolMessages,
  sha256Prefixed,
  toHex,
  verifyAttestation,
  verifyReceipt
};
/*! Bundled license information:

@noble/secp256k1/index.js:
  (*! noble-secp256k1 - MIT License (c) 2019 Paul Miller (paulmillr.com) *)

@noble/hashes/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
