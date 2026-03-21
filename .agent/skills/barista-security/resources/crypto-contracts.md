# Referencia rápida: contratos de tipos y flujos

## Flujo completo de autenticación

```
PRIMER USO:
generateSalt() → localforage('bsm_salt')
hashPin(pin)   → localforage('bsm_pin_hash')
deriveKey(pin, salt) → CryptoKey en memoria
→ estado: 'unlocked'

UNLOCK:
localforage('bsm_salt') → salt
localforage('bsm_pin_hash') → storedHash
hashPin(inputPin) → computedHash
computedHash === storedHash ?
  → deriveKey(inputPin, salt) → CryptoKey en memoria → 'unlocked'
  : incrementar contador → 'locked' o 'locked_out'

LOGOUT / IDLE:
CryptoKey = null  ← limpiar referencia de memoria
→ estado: 'locked'
```

## Claves en localforage

| Key | Contenido | Cuándo se escribe |
|-----|-----------|-------------------|
| `bsm_salt` | Uint8Array (16 bytes) como base64 | Setup inicial, una vez |
| `bsm_pin_hash` | hex string SHA-256 | Setup inicial + cambio de PIN |
| `bsm_lockout_level` | number (índice en LOCKOUT_DELAYS) | Cada intento fallido |
| `bsm_store` | JSON cifrado AES-GCM | Cada cambio de estado del store |

## Errores esperados y cómo manejarlos

```typescript
// En SecurityGate — al desbloquear:
try {
  const key = await deriveKey(pin, salt)
  setCryptoKey(key)
  setAuthState('unlocked')
} catch (error) {
  if (error instanceof Error && error.message === 'DECRYPT_FAILED') {
    // PIN incorrecto o datos corruptos
    incrementFailedAttempts()
  }
}

// En encryptedStorage.getItem — al arrancar la app:
try {
  return await decryptData(rawValue, cryptoKey)
} catch {
  // Datos corruptos o clave incorrecta → forzar re-auth
  throw new Error('STORE_DECRYPT_FAILED')
}
```
