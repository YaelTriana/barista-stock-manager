/**
 * Encrypted storage adapter for Zustand persist middleware.
 * Data is AES-GCM encrypted before writing to localforage (IndexedDB).
 * The CryptoKey is held in memory only — never persisted.
 */

import type { StateStorage } from 'zustand/middleware';
import localforage from 'localforage';
import { encrypt, decrypt } from './crypto';

localforage.config({
  name: 'cafe-inventory',
  storeName: 'encrypted_store',
});

let _cryptoKey: CryptoKey | null = null;

/** Set the CryptoKey after successful PIN verification */
export function setEncryptionKey(key: CryptoKey): void {
  _cryptoKey = key;
}

/** Clear the CryptoKey on logout */
export function clearEncryptionKey(): void {
  _cryptoKey = null;
}

/** Check if a CryptoKey is currently available */
export function hasEncryptionKey(): boolean {
  return _cryptoKey !== null;
}

/**
 * Zustand-compatible StateStorage that encrypts/decrypts transparently.
 * Falls back to returning null if no CryptoKey is set (pre-auth state).
 */
export const encryptedStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const ciphertext = await localforage.getItem<string>(name);
      if (!ciphertext || !_cryptoKey) return null;
      return await decrypt(_cryptoKey, ciphertext);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error decrypting storage:', error.message);
      }
      return null;
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      if (!_cryptoKey) {
        console.warn('No CryptoKey set — skipping encrypted write.');
        return;
      }
      const ciphertext = await encrypt(_cryptoKey, value);
      await localforage.setItem(name, ciphertext);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error encrypting storage:', error.message);
      }
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      await localforage.removeItem(name);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error removing from storage:', error.message);
      }
    }
  },
};
