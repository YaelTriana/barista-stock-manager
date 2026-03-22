import { useState, useCallback, useRef, useEffect } from 'react';
import { deriveKey } from '../lib/crypto';
import { setEncryptionKey, clearEncryptionKey } from '../lib/encryptedStorage';

/** Session duration: 8 hours in milliseconds */
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

interface SessionState {
  isAuthenticated: boolean;
  sessionExpiresAt: number | null;
}

export function useSession() {
  const [session, setSession] = useState<SessionState>({
    isAuthenticated: false,
    sessionExpiresAt: null,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Unlock the session after successful PIN verification */
  const unlock = useCallback(async (pin: string, salt: string) => {
    try {
      const key = await deriveKey(pin, salt);
      setEncryptionKey(key);

      const expiresAt = Date.now() + SESSION_DURATION_MS;
      setSession({ isAuthenticated: true, sessionExpiresAt: expiresAt });

      // Auto-logout when session expires
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        logout();
      }, SESSION_DURATION_MS);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error unlocking session:', error.message);
      }
      throw error;
    }
  }, []);

  /** Log out: clear crypto key from memory, reset session */
  const logout = useCallback(() => {
    clearEncryptionKey();
    setSession({ isAuthenticated: false, sessionExpiresAt: null });
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    isAuthenticated: session.isAuthenticated,
    sessionExpiresAt: session.sessionExpiresAt,
    unlock,
    logout,
  };
}
