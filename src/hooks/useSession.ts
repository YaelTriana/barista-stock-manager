import { useState, useCallback, useRef, useEffect } from 'react';
import { setEncryptionKey, clearEncryptionKey } from '../lib/encryptedStorage';
import type { AppUser } from '../schemas/user';

/** Session duration: 8 hours in milliseconds */
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

interface SessionState {
  isAuthenticated: boolean;
  currentUser: AppUser | null;
  masterKey: CryptoKey | null;
  sessionExpiresAt: number | null;
}

export function useSession() {
  const [session, setSession] = useState<SessionState>({
    isAuthenticated: false,
    currentUser: null,
    masterKey: null,
    sessionExpiresAt: null,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Unlock the session with the master key and user info */
  const unlock = useCallback(async (masterKey: CryptoKey, user: AppUser) => {
    try {
      setEncryptionKey(masterKey);

      const expiresAt = Date.now() + SESSION_DURATION_MS;
      setSession({
        isAuthenticated: true,
        currentUser: user,
        masterKey,
        sessionExpiresAt: expiresAt,
      });

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Log out: clear crypto key from memory, reset session */
  const logout = useCallback(() => {
    clearEncryptionKey();
    setSession({
      isAuthenticated: false,
      currentUser: null,
      masterKey: null,
      sessionExpiresAt: null,
    });
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
    currentUser: session.currentUser,
    masterKey: session.masterKey,
    sessionExpiresAt: session.sessionExpiresAt,
    unlock,
    logout,
  };
}
