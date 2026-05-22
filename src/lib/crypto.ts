/**
 * Web Crypto API utilities for Barista Stock Manager.
 * All encryption uses AES-GCM 256-bit with PBKDF2-derived keys.
 * Supports multi-user key wrapping for role-based access control.
 * No external crypto libraries — only window.crypto.subtle.
 */

const PBKDF2_ITERATIONS = 600_000;
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // bytes — standard for AES-GCM

/** Convert ArrayBuffer to hex string */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Convert hex string to Uint8Array */
function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Convert ArrayBuffer to base64 string */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** Convert base64 string to Uint8Array */
function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Generate a cryptographically random 16-byte salt as hex */
export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bufferToHex(salt.buffer as ArrayBuffer);
}

/** Hash a PIN with SHA-256 for verification (not for key derivation) */
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

/**
 * Derive an AES-GCM CryptoKey from a PIN + salt using PBKDF2.
 * extractable=true allows this key to be wrapped for multi-user support.
 */
export async function deriveKey(pin: string, salt: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const saltBuffer = hexToBuffer(salt);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(saltBuffer).buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    true, // extractable=true to allow key wrapping for multi-user
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive a wrapping key from PIN + salt (for wrap/unwrap operations).
 * This key is used to protect the master encryption key per user.
 */
export async function deriveWrappingKey(pin: string, salt: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const saltBuffer = hexToBuffer(salt);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(saltBuffer).buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false, // not extractable — wrapping key stays in memory only
    ['encrypt', 'decrypt'] // used for manual encrypt/decrypt of key bytes
  );
}

/**
 * Export a CryptoKey as a hex string (key must be extractable).
 * Used to obtain raw key bytes for wrapping.
 */
export async function exportKeyAsHex(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bufferToHex(raw);
}

/**
 * Import raw hex bytes as an AES-GCM CryptoKey.
 * Used to reconstruct the master key after unwrapping.
 */
export async function importKeyFromHex(hex: string): Promise<CryptoKey> {
  const raw = hexToBuffer(hex);
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: KEY_LENGTH },
    true, // extractable so admin can wrap for new users
    ['encrypt', 'decrypt']
  );
}

/**
 * Wrap (encrypt) the master key using a user's wrapping key.
 * Stores IV prepended to ciphertext as base64.
 * @param masterKey The key to protect (must be extractable)
 * @param wrappingKey The user's PIN-derived key
 */
export async function wrapMasterKey(masterKey: CryptoKey, wrappingKey: CryptoKey): Promise<string> {
  // Export master key as raw bytes
  const rawKeyBytes = await crypto.subtle.exportKey('raw', masterKey);
  const rawHex = bufferToHex(rawKeyBytes);

  // Encrypt the hex string using the wrapping key
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    encoder.encode(rawHex)
  );

  const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.byteLength);

  return bufferToBase64(combined.buffer as ArrayBuffer);
}

/**
 * Unwrap (decrypt) a user's wrapped master key.
 * @param wrapped base64 string (IV + ciphertext)
 * @param wrappingKey The user's PIN-derived key
 * @returns The master CryptoKey for data encryption/decryption
 */
export async function unwrapMasterKey(wrapped: string, wrappingKey: CryptoKey): Promise<CryptoKey> {
  const combined = base64ToBuffer(wrapped);
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    ciphertext
  );

  const decoder = new TextDecoder();
  const rawHex = decoder.decode(decryptedBuffer);

  return importKeyFromHex(rawHex);
}

/** Encrypt a plaintext string → base64 ciphertext (iv prepended) */
export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  // Prepend IV to ciphertext for storage
  const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.byteLength);

  return bufferToBase64(combined.buffer as ArrayBuffer);
}

/** Decrypt a base64 ciphertext (iv prepended) → plaintext string */
export async function decrypt(key: CryptoKey, ciphertext: string): Promise<string> {
  const combined = base64ToBuffer(ciphertext);

  const iv = combined.slice(0, IV_LENGTH);
  const data = combined.slice(IV_LENGTH);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}
