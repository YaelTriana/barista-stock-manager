import { describe, expect, it } from 'vitest'
import {
  decrypt,
  deriveKey,
  deriveWrappingKey,
  encrypt,
  exportKeyAsHex,
  generateSalt,
  hashPin,
  unwrapMasterKey,
  wrapMasterKey,
} from './crypto'

describe('generateSalt', () => {
  it('returns 16 random bytes as hex', () => {
    const a = generateSalt()
    const b = generateSalt()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(a).not.toBe(b)
  })
})

describe('hashPin', () => {
  it('is a stable SHA-256 hex digest', async () => {
    // Known SHA-256 of "1234"
    expect(await hashPin('1234')).toBe('03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4')
  })
})

describe('encrypt / decrypt', () => {
  const salt = generateSalt()

  it('round-trips text, including accents and emoji', async () => {
    const key = await deriveKey('2468', salt)
    const text = JSON.stringify({ producto: 'Café de olla ☕', cantidad: 3 })
    expect(await decrypt(key, await encrypt(key, text))).toBe(text)
  })

  it('uses a fresh IV, so the same text never encrypts the same way twice', async () => {
    const key = await deriveKey('2468', salt)
    expect(await encrypt(key, 'leche')).not.toBe(await encrypt(key, 'leche'))
  })

  it('cannot be decrypted with a key from another PIN', async () => {
    const right = await deriveKey('2468', salt)
    const wrong = await deriveKey('1357', salt)
    const ciphertext = await encrypt(right, 'secreto')
    await expect(decrypt(wrong, ciphertext)).rejects.toThrow()
  })

  it('rejects tampered ciphertext (AES-GCM authentication)', async () => {
    const key = await deriveKey('2468', salt)
    const ciphertext = await encrypt(key, 'inventario')
    const bytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
    const last = bytes.length - 1
    bytes[last] = (bytes[last] ?? 0) ^ 0xff
    const tampered = btoa(String.fromCharCode(...bytes))
    await expect(decrypt(key, tampered)).rejects.toThrow()
  })
})

describe('master key wrapping (multi-user)', () => {
  it('lets a second user unwrap the same master key with their own PIN', async () => {
    const salt = generateSalt()
    const master = await deriveKey('admin-pin', salt)
    const wrapped = await wrapMasterKey(master, await deriveWrappingKey('barista-pin', salt))

    const unwrapped = await unwrapMasterKey(wrapped, await deriveWrappingKey('barista-pin', salt))

    expect(await exportKeyAsHex(unwrapped)).toBe(await exportKeyAsHex(master))
    const ciphertext = await encrypt(master, 'datos compartidos')
    expect(await decrypt(unwrapped, ciphertext)).toBe('datos compartidos')
  })

  it('fails to unwrap with the wrong PIN', async () => {
    const salt = generateSalt()
    const master = await deriveKey('admin-pin', salt)
    const wrapped = await wrapMasterKey(master, await deriveWrappingKey('barista-pin', salt))
    await expect(unwrapMasterKey(wrapped, await deriveWrappingKey('otro-pin', salt))).rejects.toThrow()
  })
})
