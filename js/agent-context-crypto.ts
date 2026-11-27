export interface MessengerOwner { id?: unknown; writeKey?: unknown }

const AGENT_CONTEXT_CRYPTO_VERSION = 2;
const AGENT_CONTEXT_AAD_PREFIX = 'getbased-agent-context-v2';

function bytesToBase64(bytes: Iterable<number>) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToBase64Url(bytes: Iterable<number>) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesToHex(bytes: Iterable<number>) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function ownerIdString(owner: MessengerOwner | null) {
  if (!owner?.id) return null;
  return String(owner.id);
}

export function ownerWriteKeyBytes(owner: MessengerOwner | null) {
  if (!owner?.writeKey) return null;
  return owner.writeKey instanceof Uint8Array ? owner.writeKey : new Uint8Array(owner.writeKey as ArrayBuffer);
}

export async function sha256Hex(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return bytesToHex(new Uint8Array(digest));
}

export async function signAgentContextRequest({ owner, token, profileId, relayContext, timestamp }: {
  owner: MessengerOwner | null; token: string; profileId: string; relayContext: string; timestamp: number;
}) {
  if (!crypto?.subtle) throw new Error('Agent Access owner signing requires WebCrypto');
  const ownerId = ownerIdString(owner);
  const writeKey = ownerWriteKeyBytes(owner);
  if (!ownerId || !writeKey) throw new Error('Agent Access requires Sync identity — enable or restore Cross-device Sync first');
  const tokenHash = await sha256Hex(token);
  const contextHash = await sha256Hex(relayContext);
  const key = await crypto.subtle.importKey('raw', writeKey as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const message = `agent-context:${ownerId}:${timestamp}:${tokenHash}:${profileId || 'default'}:${contextHash}`;
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return { ownerId, tokenHash, contextHash, signature: bytesToHex(new Uint8Array(signature)) };
}

function base64UrlToBytes(value: unknown) {
  const raw = String(value || '').trim();
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=');
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function generateAgentContextKeyValue() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `gbctx_v1_${bytesToBase64Url(bytes)}`;
}

function decodeAgentContextKey(keyValue: unknown) {
  const trimmed = String(keyValue || '').trim();
  const encoded = trimmed.startsWith('gbctx_v1_') ? trimmed.slice('gbctx_v1_'.length) : trimmed;
  const bytes = base64UrlToBytes(encoded);
  if (bytes.length !== 32) throw new Error('Agent Context key must decode to 32 bytes');
  return bytes;
}

async function agentContextKeyId(rawKeyBytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest('SHA-256', rawKeyBytes);
  return bytesToBase64Url(new Uint8Array(digest).slice(0, 12));
}

async function importAgentContextCryptoKey(rawKeyBytes: Uint8Array<ArrayBuffer>) {
  if (!crypto?.subtle) throw new Error('Agent Access encryption requires WebCrypto');
  return crypto.subtle.importKey('raw', rawKeyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
}

export async function encryptAgentContextForRelay(context: unknown, contextKey: unknown, profileId: string | null | undefined) {
  const rawKey = decodeAgentContextKey(contextKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAgentContextCryptoKey(rawKey);
  const aad = new TextEncoder().encode(`${AGENT_CONTEXT_AAD_PREFIX}:${profileId || 'default'}`);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    new TextEncoder().encode(String(context || '')),
  );
  return {
    version: AGENT_CONTEXT_CRYPTO_VERSION,
    alg: 'AES-256-GCM',
    keyDerivation: 'raw-256-bit-key',
    keyId: await agentContextKeyId(rawKey),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}
