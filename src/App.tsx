import { useEffect, useCallback } from 'react';
import { SecurityGate } from './components/auth/SecurityGate';
import { MainLayout } from './components/layout/MainLayout';
import { InventoryList } from './components/inventory/InventoryList';
import { StockEntry } from './components/inventory/StockEntry';
import { DailyOutputs } from './components/inventory/DailyOutputs';
import { ReportsList } from './components/reports/ReportsList';
import { useSession } from './hooks/useSession';
import { useIdleTimer } from './hooks/useIdleTimer';
import { useInventoryStore } from './store/useInventoryStore';
import { UserProvider } from './contexts/UserContext';
import { setSyncKey, clearSyncKey } from './lib/sync';
import { clearEncryptionKey } from './lib/encryptedStorage';
import type { AppUser } from './schemas/user';

function App() {
  const { isAuthenticated, currentUser, masterKey, unlock, logout } = useSession();
  const activeTab = useInventoryStore((s) => s.activeTab);
  const setOnline = useInventoryStore((s) => s.setOnline);
  const syncFromRemote = useInventoryStore((s) => s.syncFromRemote);
  const flushPending = useInventoryStore((s) => s.flushPending);
  const startRealtime = useInventoryStore((s) => s.startRealtime);

  /** Called by SecurityGate after successful login */
  const handleUnlock = useCallback(async (mk: CryptoKey, user: AppUser) => {
    setSyncKey(mk);
    await unlock(mk, user);

    // Initial sync from Supabase after unlock
    setTimeout(() => {
      syncFromRemote();
    }, 100);
  }, [unlock, syncFromRemote]);

  /** Clear all keys and session on logout */
  const handleLogout = useCallback(() => {
    clearSyncKey();
    clearEncryptionKey();
    logout();
  }, [logout]);

  // Idle timer → auto-logout after 30 min inactivity
  useIdleTimer(handleLogout, isAuthenticated);

  // Online/offline tracking + flush pending on reconnect
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      flushPending();
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline, flushPending]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsubscribe = startRealtime();
    return () => unsubscribe();
  }, [isAuthenticated, startRealtime]);

  return (
    <SecurityGate
      onUnlock={handleUnlock}
      isAuthenticated={isAuthenticated}
    >
      {/* Provide user context to all child components */}
      <UserProvider
        username={currentUser?.username ?? ''}
        role={currentUser?.role ?? 'viewer'}
        userId={currentUser?.id ?? ''}
        masterKey={masterKey}
      >
        <MainLayout onLogout={handleLogout}>
          {activeTab === 'inventory' && <InventoryList />}
          {activeTab === 'entry' && <StockEntry />}
          {activeTab === 'outputs' && <DailyOutputs />}
          {activeTab === 'reports' && <ReportsList />}
        </MainLayout>
      </UserProvider>
    </SecurityGate>
  );
}

export default App;
